import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveMatchCapabilities } from "./capabilities";
import type {
  Competition, CompetitionDetailData, Match, MatchCapability, MatchDetailData, MatchEvent,
  MatchStatistic, Player, PlayerDetailData, Standing, Team, TeamDetailData,
} from "@/lib/types";

type Joined<T> = T | T[] | null;
type NamedRow = { id?: string; name: string; slug?: string; short_name?: string; country?: string | null; stadium?: string | null; logo_url?: string | null; current_season?: string | null };
type MatchRow = {
  id: string; competition_id: string; season: string; home_team_id: string; away_team_id: string;
  start_time: string; status: string; minute: number | null; home_score: number; away_score: number;
  venue: string | null; referee: string | null; provider: string | null; source_timestamp: string | null;
  data_freshness: string; updated_at: string; competitions: Joined<NamedRow>; home_team: Joined<NamedRow>; away_team: Joined<NamedRow>;
};
type StandingRow = {
  position: number; played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number;
  points: number; form: string[]; provider: string | null; source_timestamp: string | null; data_freshness: string;
  updated_at: string; competition_id?: string; season?: string; teams: Joined<NamedRow>; competitions?: Joined<NamedRow>;
};
type TeamRow = { id: string; name: string; short_name: string; slug: string; country: string | null; stadium: string | null; logo_url: string | null; updated_at: string };
type CompetitionRow = { id: string; name: string; slug: string; country: string | null; current_season: string | null; logo_url: string | null; updated_at: string };
type PlayerRow = { id: string; name: string; slug: string; nationality: string | null; position: string | null; image_url: string | null; date_of_birth: string | null; updated_at: string; teams: Joined<NamedRow> };

const one = <T>(value: Joined<T>): T | null => Array.isArray(value) ? value[0] ?? null : value;
const timeLabel = (value: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh", hour12: false }).format(new Date(value));
const freshness = (value: string): "fresh" | "delayed" | "stale" | "unknown" => value === "fresh" || value === "delayed" || value === "stale" ? value : "unknown";
const maxTimestamp = (values: Array<string | null | undefined>) => {
  const timestamps = values.map((value) => value ? Date.parse(value) : Number.NaN).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
};
const mapTeam = (row: TeamRow): Team => ({ id: row.id, name: row.name, shortName: row.short_name, slug: row.slug, country: row.country ?? "", accent: "#8cff4e", stadium: row.stadium ?? "", logoUrl: row.logo_url ?? undefined });
const mapCompetition = (row: CompetitionRow): Competition => ({ id: row.id, name: row.name, slug: row.slug, country: row.country ?? "", season: row.current_season ?? "Chưa xác định", logoUrl: row.logo_url ?? undefined });

function mapMatch(row: MatchRow): Match {
  const competition = one(row.competitions); const home = one(row.home_team); const away = one(row.away_team);
  const status: Match["status"] = row.status === "live" || row.status === "paused" ? "live" : row.status === "finished" ? "finished" : row.status === "postponed" ? "postponed" : row.status === "cancelled" ? "cancelled" : "scheduled";
  return {
    id: row.id, competition: competition?.name ?? "Chưa xác định", home: home?.name ?? "Chưa xác định", away: away?.name ?? "Chưa xác định",
    homeScore: status === "scheduled" || status === "postponed" || status === "cancelled" ? null : row.home_score,
    awayScore: status === "scheduled" || status === "postponed" || status === "cancelled" ? null : row.away_score,
    startTime: timeLabel(row.start_time), startTimestamp: row.start_time, status, minute: row.minute ?? undefined,
    venue: row.venue ?? "Chưa công bố", provider: row.provider ?? "unknown", sourceTimestamp: row.source_timestamp ?? undefined,
    dataFreshness: freshness(row.data_freshness),
  };
}

function mapStanding(row: StandingRow, stale = false): Standing {
  return { position: row.position, team: one(row.teams)?.name ?? "Chưa xác định", played: row.played, won: row.won, drawn: row.drawn, lost: row.lost, goalDifference: row.goals_for - row.goals_against, points: row.points, form: (row.form ?? []).filter((value): value is "W" | "D" | "L" => ["W", "D", "L"].includes(value)), provider: row.provider ?? "unknown", sourceTimestamp: row.source_timestamp ?? undefined, dataFreshness: stale ? "stale" : freshness(row.data_freshness), competitionId: row.competition_id, competition: one(row.competitions ?? null)?.name, season: row.season };
}

export type CachedSportsRead<T> = { data: T[]; updatedAt: string | null; stale: boolean; provider: string; source: "supabase" };

export class SportsCacheRepository {
  private client() {
    const client = createAdminClient();
    if (!client) throw new ConfigurationError("Supabase service role chưa được cấu hình cho sports cache.", "supabase");
    return client;
  }

  private matchSelect() {
    return "id,competition_id,season,home_team_id,away_team_id,start_time,status,minute,home_score,away_score,venue,referee,provider,source_timestamp,data_freshness,updated_at,competitions(id,name,slug,current_season),home_team:teams!matches_home_team_id_fkey(id,name,slug,logo_url),away_team:teams!matches_away_team_id_fkey(id,name,slug,logo_url)";
  }

  async readMatches(kind: "live" | "fixtures" | "results"): Promise<CachedSportsRead<Match>> {
    let query = this.client().from("matches").select(this.matchSelect());
    if (kind === "live") query = query.in("status", ["live", "paused"]).order("start_time", { ascending: true }).limit(100);
    if (kind === "fixtures") query = query.in("status", ["scheduled", "postponed", "cancelled"]).gte("start_time", new Date(Date.now() - 6 * 60 * 60_000).toISOString()).order("start_time", { ascending: true }).limit(200);
    if (kind === "results") query = query.eq("status", "finished").order("start_time", { ascending: false }).limit(200);
    const { data, error } = await query;
    if (error) throw new ProviderError("Không thể đọc sports cache.", "supabase");
    const rows = (data ?? []) as unknown as MatchRow[];
    const updatedAt = maxTimestamp(rows.map((row) => row.updated_at));
    const stale = Boolean(updatedAt && Date.now() - Date.parse(updatedAt) > (kind === "live" ? 5 * 60_000 : 6 * 60 * 60_000));
    return { data: rows.map((row) => ({ ...mapMatch(row), dataFreshness: stale ? "stale" : mapMatch(row).dataFreshness })), updatedAt, stale, provider: [...new Set(rows.map((row) => row.provider).filter(Boolean))].join(", ") || "cache", source: "supabase" };
  }

  async readStandings(): Promise<CachedSportsRead<Standing>> {
    const { data, error } = await this.client().from("standings").select("competition_id,season,position,played,won,drawn,lost,goals_for,goals_against,points,form,provider,source_timestamp,data_freshness,updated_at,competitions(id,name,slug),teams(id,name,slug)").order("position").limit(500);
    if (error) throw new ProviderError("Không thể đọc bảng xếp hạng cache.", "supabase");
    const rows = (data ?? []) as unknown as StandingRow[];
    const updatedAt = maxTimestamp(rows.map((row) => row.updated_at));
    const stale = Boolean(updatedAt && Date.now() - Date.parse(updatedAt) > 24 * 60 * 60_000);
    return { data: rows.map((row) => mapStanding(row, stale)), updatedAt, stale, provider: [...new Set(rows.map((row) => row.provider).filter(Boolean))].join(", ") || "cache", source: "supabase" };
  }

  async readTeams(): Promise<CachedSportsRead<Team>> {
    const { data, error } = await this.client().from("teams").select("id,name,short_name,slug,country,stadium,logo_url,updated_at").order("name").limit(500);
    if (error) throw new ProviderError("Không thể đọc danh sách đội cache.", "supabase");
    const rows = (data ?? []) as unknown as TeamRow[]; const updatedAt = maxTimestamp(rows.map((row) => row.updated_at));
    return { data: rows.map(mapTeam), updatedAt, stale: Boolean(updatedAt && Date.now() - Date.parse(updatedAt) > 7 * 24 * 60 * 60_000), provider: "cache", source: "supabase" };
  }

  async readCompetitions(): Promise<CachedSportsRead<Competition>> {
    const { data, error } = await this.client().from("competitions").select("id,name,slug,country,current_season,logo_url,updated_at").eq("is_active", true).order("name").limit(200);
    if (error) throw new ProviderError("Không thể đọc danh sách giải cache.", "supabase");
    const rows = (data ?? []) as CompetitionRow[]; const updatedAt = maxTimestamp(rows.map((row) => row.updated_at));
    return { data: rows.map(mapCompetition), updatedAt, stale: Boolean(updatedAt && Date.now() - Date.parse(updatedAt) > 30 * 24 * 60 * 60_000), provider: "cache", source: "supabase" };
  }

  async readPlayers(): Promise<CachedSportsRead<Player>> {
    const { data, error } = await this.client().from("players").select("id,name,slug,nationality,position,image_url,date_of_birth,updated_at,teams(id,name,slug)").order("name").limit(500);
    if (error) throw new ProviderError("Không thể đọc danh sách cầu thủ cache.", "supabase");
    const rows = (data ?? []) as unknown as PlayerRow[]; const updatedAt = maxTimestamp(rows.map((row) => row.updated_at));
    return { data: rows.map((row) => { const team = one(row.teams); return { id: row.id, name: row.name, slug: row.slug, nationality: row.nationality ?? "", position: row.position ?? "", teamId: team?.id, teamName: team?.name, teamSlug: team?.slug, imageUrl: row.image_url ?? undefined, dateOfBirth: row.date_of_birth ?? undefined }; }), updatedAt, stale: Boolean(updatedAt && Date.now() - Date.parse(updatedAt) > 30 * 24 * 60 * 60_000), provider: "cache", source: "supabase" };
  }

  async readMatch(id: string): Promise<MatchDetailData | null> {
    const client = this.client();
    const { data, error } = await client.from("matches").select(this.matchSelect()).eq("id", id).maybeSingle();
    if (error) throw new ProviderError("Không thể đọc chi tiết trận đấu.", "supabase");
    if (!data) return null;
    const row = data as unknown as MatchRow; const base = mapMatch(row); const competition = one(row.competitions); const home = one(row.home_team); const away = one(row.away_team);
    const [eventsResult, statisticsResult, standingsResult, coverageResult] = await Promise.all([
      client.from("match_events").select("id,event_type,minute,extra_minute,teams(name),player:players!match_events_player_id_fkey(name),related_player:players!match_events_related_player_id_fkey(name)").eq("match_id", id).order("minute"),
      client.from("match_statistics").select("possession,shots,shots_on_target,corners,fouls,yellow_cards,red_cards,expected_goals,teams(name)").eq("match_id", id),
      client.from("standings").select("position,played,won,drawn,lost,goals_for,goals_against,points,form,provider,source_timestamp,data_freshness,updated_at,teams(id,name,slug)").eq("competition_id", row.competition_id).eq("season", row.season).order("position"),
      client.from("competition_provider_config").select("capability,primary_provider").eq("competition_id", row.competition_id).eq("active", true),
    ]);
    const readError = eventsResult.error ?? statisticsResult.error ?? standingsResult.error ?? coverageResult.error;
    if (readError) throw new ProviderError("Không thể đọc các phần dữ liệu trận đấu.", "supabase");
    const events = ((eventsResult.data ?? []) as unknown as Array<{ id: string; event_type: string; minute: number; extra_minute: number | null; teams: Joined<NamedRow>; player: Joined<NamedRow>; related_player: Joined<NamedRow> }>).map<MatchEvent>((event) => ({ id: event.id, type: event.event_type, minute: event.minute, extraMinute: event.extra_minute ?? undefined, team: one(event.teams)?.name, player: one(event.player)?.name, relatedPlayer: one(event.related_player)?.name }));
    const statistics = ((statisticsResult.data ?? []) as unknown as Array<{ possession: number | null; shots: number | null; shots_on_target: number | null; corners: number | null; fouls: number | null; yellow_cards: number | null; red_cards: number | null; expected_goals: number | null; teams: Joined<NamedRow> }>).map<MatchStatistic>((stat) => ({ team: one(stat.teams)?.name ?? "Chưa xác định", possession: stat.possession ?? undefined, shots: stat.shots ?? undefined, shotsOnTarget: stat.shots_on_target ?? undefined, corners: stat.corners ?? undefined, fouls: stat.fouls ?? undefined, yellowCards: stat.yellow_cards ?? undefined, redCards: stat.red_cards ?? undefined, expectedGoals: stat.expected_goals ?? undefined }));
    const standingsRows = (standingsResult.data ?? []) as unknown as StandingRow[]; const standings = standingsRows.map((standing) => mapStanding(standing));
    const providerCoverage = ((coverageResult.data ?? []) as Array<{ capability: string; primary_provider: string }>).map((item) => ({ capability: item.capability, provider: item.primary_provider }));
    const capabilities: Record<MatchCapability, boolean> = deriveMatchCapabilities({ status: base.status, venue: row.venue, referee: row.referee, eventCount: events.length, statisticCount: statistics.length, standings });
    const stale = Date.now() - Date.parse(row.updated_at) > (base.status === "live" ? 5 * 60_000 : 6 * 60 * 60_000);
    return { match: { ...base, competitionId: row.competition_id, competitionSlug: competition?.slug ?? "", season: row.season, referee: row.referee ?? undefined, homeTeamId: row.home_team_id, homeTeamSlug: home?.slug ?? "", awayTeamId: row.away_team_id, awayTeamSlug: away?.slug ?? "", dataFreshness: stale ? "stale" : base.dataFreshness }, events, statistics, standings: standings.map((standing) => ({ ...standing, dataFreshness: stale ? "stale" : standing.dataFreshness })), capabilities, providerCoverage, updatedAt: row.updated_at, stale };
  }

  async readCompetition(slug: string): Promise<CompetitionDetailData | null> {
    const client = this.client(); const { data, error } = await client.from("competitions").select("id,name,slug,country,current_season,logo_url,updated_at").eq("slug", slug).maybeSingle();
    if (error) throw new ProviderError("Không thể đọc hồ sơ giải đấu.", "supabase"); if (!data) return null;
    const competition = data as CompetitionRow;
    const [teamsResult, matchesResult, standingsResult, coverageResult] = await Promise.all([
      client.from("competition_teams").select("teams(id,name,short_name,slug,country,stadium,logo_url,updated_at)").eq("competition_id", competition.id),
      client.from("matches").select(this.matchSelect()).eq("competition_id", competition.id).order("start_time", { ascending: false }).limit(250),
      client.from("standings").select("position,played,won,drawn,lost,goals_for,goals_against,points,form,provider,source_timestamp,data_freshness,updated_at,teams(id,name,slug)").eq("competition_id", competition.id).order("position"),
      client.from("competition_provider_config").select("capability,primary_provider").eq("competition_id", competition.id).eq("active", true),
    ]);
    const readError = teamsResult.error ?? matchesResult.error ?? standingsResult.error ?? coverageResult.error; if (readError) throw new ProviderError("Không thể đọc dữ liệu giải đấu.", "supabase");
    const teams = ((teamsResult.data ?? []) as unknown as Array<{ teams: Joined<TeamRow> }>).flatMap((item) => { const team = one(item.teams); return team ? [mapTeam(team)] : []; });
    const matches = ((matchesResult.data ?? []) as unknown as MatchRow[]).map(mapMatch); const standings = ((standingsResult.data ?? []) as unknown as StandingRow[]).map((row) => mapStanding(row));
    return { competition: mapCompetition(competition), teams, fixtures: matches.filter((match) => ["scheduled", "postponed", "cancelled"].includes(match.status)).sort((a, b) => Date.parse(a.startTimestamp ?? "") - Date.parse(b.startTimestamp ?? "")), results: matches.filter((match) => match.status === "finished").sort((a, b) => Date.parse(b.startTimestamp ?? "") - Date.parse(a.startTimestamp ?? "")), standings, providerCoverage: ((coverageResult.data ?? []) as Array<{ capability: string; primary_provider: string }>).map((item) => ({ capability: item.capability, provider: item.primary_provider })), updatedAt: maxTimestamp([competition.updated_at, ...((matchesResult.data ?? []) as unknown as MatchRow[]).map((row) => row.updated_at), ...((standingsResult.data ?? []) as unknown as StandingRow[]).map((row) => row.updated_at)]) };
  }

  async readTeam(slug: string): Promise<TeamDetailData | null> {
    const client = this.client(); const { data, error } = await client.from("teams").select("id,name,short_name,slug,country,stadium,logo_url,updated_at").eq("slug", slug).maybeSingle();
    if (error) throw new ProviderError("Không thể đọc hồ sơ đội bóng.", "supabase"); if (!data) return null;
    const team = data as TeamRow;
    const [competitionsResult, matchesResult, standingsResult] = await Promise.all([
      client.from("competition_teams").select("competitions(id,name,slug,country,current_season,logo_url,updated_at)").eq("team_id", team.id),
      client.from("matches").select(this.matchSelect()).or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`).order("start_time", { ascending: false }).limit(100),
      client.from("standings").select("position,played,won,drawn,lost,goals_for,goals_against,points,form,provider,source_timestamp,data_freshness,updated_at,teams(id,name,slug)").eq("team_id", team.id).order("updated_at", { ascending: false }),
    ]);
    const readError = competitionsResult.error ?? matchesResult.error ?? standingsResult.error; if (readError) throw new ProviderError("Không thể đọc dữ liệu đội bóng.", "supabase");
    const competitions = ((competitionsResult.data ?? []) as unknown as Array<{ competitions: Joined<CompetitionRow> }>).flatMap((item) => { const competition = one(item.competitions); return competition ? [mapCompetition(competition)] : []; });
    const matches = ((matchesResult.data ?? []) as unknown as MatchRow[]).map(mapMatch);
    return { team: mapTeam(team), competitions, fixtures: matches.filter((match) => ["scheduled", "postponed", "cancelled"].includes(match.status)).sort((a, b) => Date.parse(a.startTimestamp ?? "") - Date.parse(b.startTimestamp ?? "")), results: matches.filter((match) => match.status === "finished").sort((a, b) => Date.parse(b.startTimestamp ?? "") - Date.parse(a.startTimestamp ?? "")), standings: ((standingsResult.data ?? []) as unknown as StandingRow[]).map((row) => mapStanding(row)), updatedAt: maxTimestamp([team.updated_at, ...((matchesResult.data ?? []) as unknown as MatchRow[]).map((row) => row.updated_at)]) };
  }

  async readPlayer(slug: string): Promise<PlayerDetailData | null> {
    const client = this.client(); const { data, error } = await client.from("players").select("id,name,slug,nationality,position,image_url,date_of_birth,updated_at,teams(id,name,slug)").eq("slug", slug).maybeSingle();
    if (error) throw new ProviderError("Không thể đọc hồ sơ cầu thủ.", "supabase"); if (!data) return null;
    const row = data as unknown as PlayerRow; const team = one(row.teams);
    return { player: { id: row.id, name: row.name, slug: row.slug, nationality: row.nationality ?? "", position: row.position ?? "", teamId: team?.id, teamName: team?.name, teamSlug: team?.slug, imageUrl: row.image_url ?? undefined, dateOfBirth: row.date_of_birth ?? undefined }, updatedAt: row.updated_at };
  }
}

export const sportsCacheRepository = new SportsCacheRepository();
