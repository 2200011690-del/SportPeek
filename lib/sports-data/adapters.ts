import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { slugify } from "@/lib/validation";
import {
  dataFreshness,
  normalizedCompetitionSchema,
  normalizedMatchSchema,
  normalizedStandingSchema,
  normalizedTeamSchema,
  type NormalizedCompetition,
  type NormalizedMatch,
  type NormalizedStanding,
  type NormalizedTeam,
  type SportsCapability,
  type SportsProviderName,
} from "./models";
import { providerFetch } from "./rate-limiter";

export interface SportsSyncAdapter {
  readonly name: SportsProviderName;
  readonly capabilities: SportsCapability[];
  isConfigured(): boolean;
  discoverCompetitions(): Promise<NormalizedCompetition[]>;
  getTeams(
    competitionExternalId: string,
    season?: string,
  ): Promise<NormalizedTeam[]>;
  getMatches(
    competitionExternalId: string,
    options?: { dateFrom?: string; dateTo?: string; season?: string },
  ): Promise<NormalizedMatch[]>;
  getStandings(
    competitionExternalId: string,
    season?: string,
  ): Promise<NormalizedStanding[]>;
}

const nowIso = () => new Date().toISOString();
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

type FdArea = { name?: string | null };
type FdTeam = {
  id: number;
  name?: string | null;
  shortName?: string | null;
  tla?: string | null;
  area?: FdArea;
  crest?: string | null;
  venue?: string | null;
};
type FdCompetition = {
  id: number;
  code?: string | null;
  name: string;
  area?: FdArea;
  emblem?: string | null;
  currentSeason?: {
    id?: number;
    startDate?: string | null;
    endDate?: string | null;
    currentMatchday?: number | null;
  } | null;
};
type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  minute?: number | null;
  venue?: string | null;
  matchday?: number | null;
  stage?: string | null;
  group?: string | null;
  lastUpdated?: string | null;
  competition: FdCompetition;
  season?: { id?: number; startDate?: string | null };
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score?: {
    fullTime?: {
      home?: number | null;
      away?: number | null;
      homeTeam?: number | null;
      awayTeam?: number | null;
    };
  };
};
type FdStanding = {
  position: number;
  team: FdTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  form?: string | null;
};

function fdStatus(value: string): NormalizedMatch["status"] {
  if (["LIVE", "IN_PLAY"].includes(value)) return "live";
  if (value === "PAUSED") return "paused";
  if (value === "FINISHED") return "finished";
  if (value === "POSTPONED") return "postponed";
  if (["CANCELLED", "SUSPENDED"].includes(value)) return "cancelled";
  return "scheduled";
}

export class FootballDataSyncAdapter implements SportsSyncAdapter {
  readonly name = "football-data" as const;
  readonly capabilities: SportsCapability[] = [
    "fixtures",
    "results",
    "standings",
    "logos",
  ];
  private readonly baseUrl =
    process.env.FOOTBALL_DATA_BASE_URL ?? "https://api.football-data.org/v4";
  private key() {
    return (
      process.env.FOOTBALL_DATA_API_KEY ??
      (process.env.SPORTS_DATA_PROVIDER === "football-data"
        ? process.env.SPORTS_DATA_API_KEY
        : "") ??
      ""
    ).trim();
  }
  isConfigured() {
    return Boolean(this.key());
  }
  private async request<T>(path: string): Promise<T> {
    if (!this.key())
      throw new ConfigurationError("Thiếu FOOTBALL_DATA_API_KEY.", this.name);
    const response = await providerFetch(
      this.name,
      `${this.baseUrl}${path}`,
      { headers: { "X-Auth-Token": this.key(), accept: "application/json" } },
      { minimumIntervalMs: 6_100, retries: 1 },
    );
    const payload = (await response.json()) as T & { message?: string };
    if (!payload)
      throw new ProviderError("football-data.org trả dữ liệu rỗng.", this.name);
    return payload;
  }
  async discoverCompetitions(): Promise<NormalizedCompetition[]> {
    const payload = await this.request<{ competitions?: FdCompetition[] }>(
      "/competitions",
    );
    const fetchedAt = nowIso();
    return (payload.competitions ?? []).map((item) =>
      normalizedCompetitionSchema.parse({
        provider: this.name,
        externalId: item.code || String(item.id),
        fetchedAt,
        sourceTimestamp: item.currentSeason?.startDate
          ? new Date(item.currentSeason.startDate).toISOString()
          : null,
        dataFreshness: "unknown",
        rawMetadata: asRecord(item),
        name: item.name,
        slug: slugify(item.name),
        country: item.area?.name ?? null,
        season: item.currentSeason?.startDate?.slice(0, 4) ?? null,
        logoUrl: item.emblem ?? null,
        capabilities: this.capabilities,
      }),
    );
  }
  async getTeams(competitionExternalId: string): Promise<NormalizedTeam[]> {
    const payload = await this.request<{ teams?: FdTeam[] }>(
      `/competitions/${encodeURIComponent(competitionExternalId)}/teams`,
    );
    const fetchedAt = nowIso();
    return (payload.teams ?? []).map((team) =>
      normalizedTeamSchema.parse({
        provider: this.name,
        externalId: String(team.id),
        fetchedAt,
        sourceTimestamp: null,
        dataFreshness: "unknown",
        rawMetadata: asRecord(team),
        competitionExternalId,
        name: team.name || team.shortName || team.tla || `Team ${team.id}`,
        shortName: team.tla || team.shortName || team.name || String(team.id),
        slug: slugify(team.name || team.shortName || String(team.id)),
        country: team.area?.name ?? null,
        logoUrl: team.crest ?? null,
        venue: team.venue ?? null,
      }),
    );
  }
  async getMatches(
    competitionExternalId: string,
    options: { dateFrom?: string; dateTo?: string; season?: string } = {},
  ): Promise<NormalizedMatch[]> {
    const params = new URLSearchParams();
    if (options.dateFrom) params.set("dateFrom", options.dateFrom);
    if (options.dateTo) params.set("dateTo", options.dateTo);
    const payload = await this.request<{ matches?: FdMatch[] }>(
      `/competitions/${encodeURIComponent(competitionExternalId)}/matches${params.size ? `?${params}` : ""}`,
    );
    const fetchedAt = nowIso();
    return (payload.matches ?? []).map((match) => {
      const sourceTimestamp = match.lastUpdated
        ? new Date(match.lastUpdated).toISOString()
        : match.utcDate;
      const score = match.score?.fullTime ?? {};
      return normalizedMatchSchema.parse({
        provider: this.name,
        externalId: String(match.id),
        fetchedAt,
        sourceTimestamp,
        dataFreshness: dataFreshness(sourceTimestamp),
        rawMetadata: asRecord(match),
        competitionExternalId,
        season:
          options.season ?? match.season?.startDate?.slice(0, 4) ?? "unknown",
        homeTeamExternalId: String(match.homeTeam.id),
        awayTeamExternalId: String(match.awayTeam.id),
        kickoffAt: new Date(match.utcDate).toISOString(),
        status: fdStatus(match.status),
        minute: match.minute ?? null,
        homeScore: score.home ?? score.homeTeam ?? null,
        awayScore: score.away ?? score.awayTeam ?? null,
        venue: match.venue ?? null,
        referee: null,
        round: match.group ?? null,
        stage: match.stage ?? null,
        matchday: match.matchday ?? null,
      });
    });
  }
  async getStandings(
    competitionExternalId: string,
    season = "unknown",
  ): Promise<NormalizedStanding[]> {
    const payload = await this.request<{
      standings?: Array<{ type?: string; table?: FdStanding[] }>;
    }>(`/competitions/${encodeURIComponent(competitionExternalId)}/standings`);
    const table =
      payload.standings?.find((item) => item.type === "TOTAL")?.table ??
      payload.standings?.[0]?.table ??
      [];
    const fetchedAt = nowIso();
    return table.map((row) =>
      normalizedStandingSchema.parse({
        provider: this.name,
        externalId: `${competitionExternalId}:${row.team.id}:${season}`,
        fetchedAt,
        sourceTimestamp: fetchedAt,
        dataFreshness: "fresh",
        rawMetadata: asRecord(row),
        competitionExternalId,
        teamExternalId: String(row.team.id),
        season,
        position: row.position,
        played: row.playedGames,
        won: row.won,
        drawn: row.draw,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        points: row.points,
        form: (row.form?.split(",") ?? []).filter(
          (value): value is "W" | "D" | "L" => ["W", "D", "L"].includes(value),
        ),
      }),
    );
  }
}

type AfLeague = {
  league: { id: number; name: string; type?: string; logo?: string | null };
  country: { name?: string; code?: string | null };
  seasons?: Array<{ year: number; current?: boolean }>;
};
type AfTeam = {
  team: {
    id: number;
    name: string;
    code?: string | null;
    country?: string | null;
    logo?: string | null;
  };
  venue?: { name?: string | null };
};
type AfFixture = {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed?: number | null };
    venue?: { name?: string | null };
    referee?: string | null;
  };
  league: { id: number; season: number; round?: string | null };
  teams: { home: { id: number }; away: { id: number } };
  goals: { home: number | null; away: number | null };
};
type AfStanding = {
  rank: number;
  team: { id: number };
  points: number;
  goalsDiff: number;
  form?: string;
  all: {
    played: number;
    win: number;
    draw: number;
    lose: number;
    goals: { for: number; against: number };
  };
};

function afStatus(value: string): NormalizedMatch["status"] {
  if (["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE"].includes(value))
    return value === "HT" ? "paused" : "live";
  if (["FT", "AET", "PEN"].includes(value)) return "finished";
  if (value === "PST") return "postponed";
  if (["CANC", "ABD", "AWD", "WO"].includes(value)) return "cancelled";
  return "scheduled";
}

export class ApiFootballSyncAdapter implements SportsSyncAdapter {
  readonly name = "api-football" as const;
  readonly capabilities: SportsCapability[] = [
    "fixtures",
    "results",
    "standings",
    "live_score",
    "events",
    "lineups",
    "statistics",
    "players",
    "injuries",
    "logos",
  ];
  private readonly baseUrl =
    process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
  private key() {
    return (
      process.env.API_FOOTBALL_KEY ??
      (process.env.SPORTS_DATA_PROVIDER === "api-football"
        ? process.env.SPORTS_DATA_API_KEY
        : "") ??
      ""
    ).trim();
  }
  isConfigured() {
    return Boolean(this.key());
  }
  private async request<T>(path: string): Promise<T> {
    if (!this.key())
      throw new ConfigurationError("Thiếu API_FOOTBALL_KEY.", this.name);
    const response = await providerFetch(
      this.name,
      `${this.baseUrl}${path}`,
      {
        headers: { "x-apisports-key": this.key(), accept: "application/json" },
      },
      { minimumIntervalMs: 350, retries: 1 },
    );
    const payload = (await response.json()) as {
      response?: T;
      errors?: unknown[] | Record<string, unknown>;
    };
    const hasErrors = Array.isArray(payload.errors)
      ? payload.errors.length > 0
      : Boolean(payload.errors && Object.keys(payload.errors).length);
    if (hasErrors)
      throw new ProviderError(
        "API-Football từ chối yêu cầu hoặc capability không thuộc gói hiện tại.",
        this.name,
        false,
      );
    return payload.response ?? ([] as T);
  }
  async discoverCompetitions(): Promise<NormalizedCompetition[]> {
    const records = await this.request<AfLeague[]>("/leagues?current=true");
    const fetchedAt = nowIso();
    return records.map((item) =>
      normalizedCompetitionSchema.parse({
        provider: this.name,
        externalId: String(item.league.id),
        fetchedAt,
        sourceTimestamp: null,
        dataFreshness: "unknown",
        rawMetadata: asRecord(item),
        name: item.league.name,
        slug: slugify(item.league.name),
        country: item.country.name ?? null,
        season: String(
          item.seasons?.find((season) => season.current)?.year ?? "",
        ),
        logoUrl: item.league.logo ?? null,
        capabilities: this.capabilities,
      }),
    );
  }
  async getTeams(
    competitionExternalId: string,
    season = process.env.API_FOOTBALL_SEASON ??
      String(new Date().getUTCFullYear()),
  ): Promise<NormalizedTeam[]> {
    const records = await this.request<AfTeam[]>(
      `/teams?league=${encodeURIComponent(competitionExternalId)}&season=${encodeURIComponent(season)}`,
    );
    const fetchedAt = nowIso();
    return records.map((item) =>
      normalizedTeamSchema.parse({
        provider: this.name,
        externalId: String(item.team.id),
        fetchedAt,
        sourceTimestamp: null,
        dataFreshness: "unknown",
        rawMetadata: asRecord(item),
        competitionExternalId,
        name: item.team.name,
        shortName: item.team.code || item.team.name,
        slug: slugify(item.team.name),
        country: item.team.country ?? null,
        logoUrl: item.team.logo ?? null,
        venue: item.venue?.name ?? null,
      }),
    );
  }
  async getMatches(
    competitionExternalId: string,
    options: { dateFrom?: string; dateTo?: string; season?: string } = {},
  ): Promise<NormalizedMatch[]> {
    const season =
      options.season ??
      process.env.API_FOOTBALL_SEASON ??
      String(new Date().getUTCFullYear());
    const params = new URLSearchParams({
      league: competitionExternalId,
      season,
    });
    if (options.dateFrom) params.set("from", options.dateFrom);
    if (options.dateTo) params.set("to", options.dateTo);
    const records = await this.request<AfFixture[]>(`/fixtures?${params}`);
    const fetchedAt = nowIso();
    return records.map((item) =>
      normalizedMatchSchema.parse({
        provider: this.name,
        externalId: String(item.fixture.id),
        fetchedAt,
        sourceTimestamp: item.fixture.date,
        dataFreshness: dataFreshness(item.fixture.date),
        rawMetadata: asRecord(item),
        competitionExternalId,
        season: String(item.league.season),
        homeTeamExternalId: String(item.teams.home.id),
        awayTeamExternalId: String(item.teams.away.id),
        kickoffAt: new Date(item.fixture.date).toISOString(),
        status: afStatus(item.fixture.status.short),
        minute: item.fixture.status.elapsed ?? null,
        homeScore: item.goals.home,
        awayScore: item.goals.away,
        venue: item.fixture.venue?.name ?? null,
        referee: item.fixture.referee ?? null,
        round: item.league.round ?? null,
        stage: null,
        matchday: null,
      }),
    );
  }
  async getStandings(
    competitionExternalId: string,
    season = process.env.API_FOOTBALL_SEASON ??
      String(new Date().getUTCFullYear()),
  ): Promise<NormalizedStanding[]> {
    const records = await this.request<
      Array<{ league: { standings: AfStanding[][] } }>
    >(
      `/standings?league=${encodeURIComponent(competitionExternalId)}&season=${encodeURIComponent(season)}`,
    );
    const fetchedAt = nowIso();
    const table = records[0]?.league.standings[0] ?? [];
    return table.map((row) =>
      normalizedStandingSchema.parse({
        provider: this.name,
        externalId: `${competitionExternalId}:${row.team.id}:${season}`,
        fetchedAt,
        sourceTimestamp: fetchedAt,
        dataFreshness: "fresh",
        rawMetadata: asRecord(row),
        competitionExternalId,
        teamExternalId: String(row.team.id),
        season,
        position: row.rank,
        played: row.all.played,
        won: row.all.win,
        drawn: row.all.draw,
        lost: row.all.lose,
        goalsFor: row.all.goals.for,
        goalsAgainst: row.all.goals.against,
        points: row.points,
        form: (row.form?.split("") ?? []).filter(
          (value): value is "W" | "D" | "L" => ["W", "D", "L"].includes(value),
        ),
      }),
    );
  }
}

export class TheSportsDbMetadataAdapter {
  readonly name = "thesportsdb" as const;
  readonly capabilities: SportsCapability[] = ["logos", "players"];
  private key() {
    return (process.env.THESPORTSDB_API_KEY ?? "").trim();
  }
  isConfigured() {
    return Boolean(this.key());
  }
  async searchTeam(name: string): Promise<Record<string, unknown> | null> {
    if (!this.key())
      throw new ConfigurationError("Thiếu THESPORTSDB_API_KEY.", this.name);
    const response = await providerFetch(
      this.name,
      `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(this.key())}/searchteams.php?t=${encodeURIComponent(name)}`,
      { headers: { accept: "application/json" } },
      { retries: 1, minimumIntervalMs: 250 },
    );
    const payload = (await response.json()) as {
      teams?: Array<Record<string, unknown>> | null;
    };
    return payload.teams?.[0] ?? null;
  }
}

type OlLeague = {
  leagueId: number;
  leagueName: string;
  leagueSeason: number | string;
  leagueShortcut: string;
  sport?: { sportId?: number; sportName?: string } | null;
};
type OlTeam = {
  teamId: number;
  teamName: string;
  shortName?: string | null;
  teamIconUrl?: string | null;
  teamGroupName?: string | null;
};
type OlMatchResult = {
  pointsTeam1?: number | null;
  pointsTeam2?: number | null;
  resultOrderID?: number | null;
  resultTypeID?: number | null;
};
type OlMatch = {
  matchID: number;
  matchDateTimeUTC: string;
  leagueSeason: number | string;
  team1: OlTeam;
  team2: OlTeam;
  lastUpdateDateTime?: string | null;
  matchIsFinished: boolean;
  matchResults?: OlMatchResult[] | null;
  group?: { groupName?: string | null; groupOrderID?: number | null } | null;
  location?: {
    locationStadium?: string | null;
    locationCity?: string | null;
  } | null;
};
type OlStanding = {
  teamInfoId: number;
  teamName: string;
  shortName?: string | null;
  teamIconUrl?: string | null;
  points?: number | null;
  opponentGoals?: number | null;
  goals?: number | null;
  matches?: number | null;
  won?: number | null;
  lost?: number | null;
  draw?: number | null;
};

const OPENLIGA_DEFAULT_COMPETITIONS =
  "bl2,bl3,dfb,ffb1,regio-bayern,BLSupercup,unl";
const OPENLIGA_METADATA: Record<string, { name: string; country: string }> = {
  bl2: { name: "2. Bundesliga", country: "Germany" },
  bl3: { name: "3. Liga", country: "Germany" },
  dfb: { name: "DFB-Pokal", country: "Germany" },
  ffb1: { name: "Frauen-Bundesliga", country: "Germany" },
  "regio-bayern": { name: "Regionalliga Bayern", country: "Germany" },
  blsupercup: { name: "Franz-Beckenbauer-Supercup", country: "Germany" },
  unl: { name: "UEFA Nations League", country: "Europe" },
};

function openLigaSeason(): string {
  const configured = (process.env.OPENLIGADB_SEASON ?? "").trim();
  if (configured) return configured;
  const now = new Date();
  return String(
    now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1,
  );
}

function openLigaCompetitionIds(): Set<string> {
  return new Set(
    (process.env.OPENLIGADB_COMPETITIONS ?? OPENLIGA_DEFAULT_COMPETITIONS)
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

function openLigaTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function openLigaLogoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/");
    const thumbIndex = parts.indexOf("thumb");
    if (url.hostname === "upload.wikimedia.org" && thumbIndex >= 0 && parts.length > thumbIndex + 4) {
      parts.splice(thumbIndex, 1);
      parts.pop();
      url.pathname = parts.join("/");
      return url.toString();
    }
    return url.toString();
  } catch {
    return null;
  }
}

function openLigaStatus(
  match: OlMatch,
  now = Date.now(),
): NormalizedMatch["status"] {
  if (match.matchIsFinished) return "finished";
  const kickoff = Date.parse(match.matchDateTimeUTC);
  if (!Number.isFinite(kickoff) || kickoff > now) return "scheduled";
  return now - kickoff <= 4 * 60 * 60_000 ? "live" : "postponed";
}

function openLigaScore(match: OlMatch): {
  home: number | null;
  away: number | null;
} {
  const results = [...(match.matchResults ?? [])].sort(
    (left, right) => (right.resultOrderID ?? 0) - (left.resultOrderID ?? 0),
  );
  const final =
    results.find((result) => result.resultTypeID === 2) ?? results[0];
  return { home: final?.pointsTeam1 ?? null, away: final?.pointsTeam2 ?? null };
}

export class OpenLigaDbAdapter implements SportsSyncAdapter {
  readonly name = "openligadb" as const;
  readonly capabilities: SportsCapability[] = [
    "fixtures",
    "results",
    "standings",
    "live_score",
    "logos",
  ];
  private readonly baseUrl =
    process.env.OPENLIGADB_BASE_URL ?? "https://api.openligadb.de";
  isConfigured() {
    return process.env.OPENLIGADB_ENABLED === "true";
  }
  private async request<T>(path: string): Promise<T> {
    if (!this.isConfigured())
      throw new ConfigurationError("OpenLigaDB chưa được bật.", this.name);
    const response = await providerFetch(
      this.name,
      `${this.baseUrl}${path}`,
      { headers: { accept: "application/json" } },
      { retries: 2, minimumIntervalMs: 500, timeoutMs: 30_000 },
    );
    const payload = (await response.json()) as T;
    if (!payload)
      throw new ProviderError("OpenLigaDB trả dữ liệu rỗng.", this.name);
    return payload;
  }
  async discoverCompetitions(): Promise<NormalizedCompetition[]> {
    const records = await this.request<OlLeague[]>("/getavailableleagues");
    const wanted = openLigaCompetitionIds();
    const season = openLigaSeason();
    const byShortcut = new Map<string, OlLeague>();
    for (const item of records) {
      const shortcut = item.leagueShortcut?.toLowerCase();
      if (
        !shortcut ||
        !wanted.has(shortcut) ||
        (item.sport?.sportId && item.sport.sportId !== 1)
      )
        continue;
      const existing = byShortcut.get(shortcut);
      const itemSeason = String(item.leagueSeason);
      const existingSeason = existing ? String(existing.leagueSeason) : "";
      if (
        !existing ||
        itemSeason === season ||
        (existingSeason !== season &&
          itemSeason.localeCompare(existingSeason) > 0)
      )
        byShortcut.set(shortcut, item);
    }
    const fetchedAt = nowIso();
    return [...byShortcut.values()].map((item) => {
      const shortcut = item.leagueShortcut.toLowerCase();
      const metadata = OPENLIGA_METADATA[shortcut] ?? {
        name: item.leagueName,
        country: "Germany",
      };
      return normalizedCompetitionSchema.parse({
        provider: this.name,
        externalId: item.leagueShortcut,
        fetchedAt,
        sourceTimestamp: null,
        dataFreshness: "unknown",
        rawMetadata: asRecord(item),
        name: metadata.name,
        slug: slugify(metadata.name),
        country: metadata.country,
        season: String(item.leagueSeason),
        logoUrl: null,
        capabilities: this.capabilities,
      });
    });
  }
  async getTeams(
    competitionExternalId: string,
    season = openLigaSeason(),
  ): Promise<NormalizedTeam[]> {
    const records = await this.request<OlTeam[]>(
      `/getavailableteams/${encodeURIComponent(competitionExternalId)}/${encodeURIComponent(season)}`,
    );
    const fetchedAt = nowIso();
    const country =
      OPENLIGA_METADATA[competitionExternalId.toLowerCase()]?.country ??
      "Germany";
    return records.map((team) =>
      normalizedTeamSchema.parse({
        provider: this.name,
        externalId: String(team.teamId),
        fetchedAt,
        sourceTimestamp: null,
        dataFreshness: "unknown",
        rawMetadata: asRecord(team),
        competitionExternalId,
        name: team.teamName,
        shortName: team.shortName || team.teamName,
        slug: slugify(team.teamName),
        country,
          logoUrl: openLigaLogoUrl(team.teamIconUrl),
        venue: null,
      }),
    );
  }
  async getMatches(
    competitionExternalId: string,
    options: { dateFrom?: string; dateTo?: string; season?: string } = {},
  ): Promise<NormalizedMatch[]> {
    const season = options.season ?? openLigaSeason();
    const records = await this.request<OlMatch[]>(
      `/getmatchdata/${encodeURIComponent(competitionExternalId)}/${encodeURIComponent(season)}`,
    );
    const fetchedAt = nowIso();
    const from = options.dateFrom
      ? Date.parse(`${options.dateFrom}T00:00:00.000Z`)
      : Number.NEGATIVE_INFINITY;
    const to = options.dateTo
      ? Date.parse(`${options.dateTo}T23:59:59.999Z`)
      : Number.POSITIVE_INFINITY;
    return records
      .filter((match) => {
        const kickoff = Date.parse(match.matchDateTimeUTC);
        return Number.isFinite(kickoff) && kickoff >= from && kickoff <= to;
      })
      .map((match) => {
        const score = openLigaScore(match);
        const sourceTimestamp = openLigaTimestamp(match.lastUpdateDateTime);
        const status = openLigaStatus(match);
        return normalizedMatchSchema.parse({
          provider: this.name,
          externalId: String(match.matchID),
          fetchedAt,
          sourceTimestamp,
          dataFreshness: dataFreshness(sourceTimestamp),
          rawMetadata: asRecord(match),
          competitionExternalId,
          season: String(match.leagueSeason || season),
          homeTeamExternalId: String(match.team1.teamId),
          awayTeamExternalId: String(match.team2.teamId),
          kickoffAt: new Date(match.matchDateTimeUTC).toISOString(),
          status,
          minute: null,
          homeScore: score.home,
          awayScore: score.away,
          venue:
            match.location?.locationStadium ||
            match.location?.locationCity ||
            null,
          referee: null,
          round: match.group?.groupName ?? null,
          stage: null,
          matchday: match.group?.groupOrderID ?? null,
        });
      });
  }
  async getStandings(
    competitionExternalId: string,
    season = openLigaSeason(),
  ): Promise<NormalizedStanding[]> {
    const records = await this.request<OlStanding[]>(
      `/getbltable/${encodeURIComponent(competitionExternalId)}/${encodeURIComponent(season)}`,
    );
    const fetchedAt = nowIso();
    return records.map((row, index) =>
      normalizedStandingSchema.parse({
        provider: this.name,
        externalId: `${competitionExternalId}:${row.teamInfoId}:${season}`,
        fetchedAt,
        sourceTimestamp: fetchedAt,
        dataFreshness: "fresh",
        rawMetadata: asRecord(row),
        competitionExternalId,
        teamExternalId: String(row.teamInfoId),
        season,
        position: index + 1,
        played: row.matches ?? 0,
        won: row.won ?? 0,
        drawn: row.draw ?? 0,
        lost: row.lost ?? 0,
        goalsFor: row.goals ?? 0,
        goalsAgainst: row.opponentGoals ?? 0,
        points: row.points ?? 0,
        form: [],
      }),
    );
  }
}

export class StatsBombOpenDataAdapter {
  readonly name = "statsbomb" as const;
  readonly capabilities: SportsCapability[] = ["historical_analytics"];
  isConfigured() {
    return process.env.STATSBOMB_ENABLED === "true";
  }
  async discoverCompetitions(): Promise<Array<Record<string, unknown>>> {
    if (!this.isConfigured())
      throw new ConfigurationError(
        "StatsBomb Open Data chưa được bật.",
        this.name,
      );
    const response = await providerFetch(
      this.name,
      "https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json",
      { headers: { accept: "application/json" } },
      { retries: 1, minimumIntervalMs: 250 },
    );
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? payload.map(asRecord) : [];
  }
}

export function getSportsSyncAdapters(): SportsSyncAdapter[] {
  return [
    new FootballDataSyncAdapter(),
    new ApiFootballSyncAdapter(),
    new OpenLigaDbAdapter(),
  ];
}
export function configuredSportsAdapters(): SportsSyncAdapter[] {
  return getSportsSyncAdapters().filter((adapter) => adapter.isConfigured());
}
export function getSportsAdapterDescriptors() {
  const adapters = [
    ...getSportsSyncAdapters(),
    new TheSportsDbMetadataAdapter(),
    new StatsBombOpenDataAdapter(),
  ];
  return adapters.map((adapter) => ({
    provider: adapter.name,
    configured: adapter.isConfigured(),
    capabilities: adapter.capabilities,
  }));
}
