import { randomUUID } from "node:crypto";
import { ConfigurationError, NotFoundError, ProviderError, toSafeError } from "@/lib/core/errors";
import { logger } from "@/lib/core/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { configuredSportsAdapters, getSportsAdapterDescriptors, getSportsSyncAdapters, type SportsSyncAdapter } from "./adapters";
import type { NormalizedCompetition, NormalizedMatch, NormalizedStanding, NormalizedTeam, SportsCapability, SportsProviderName } from "./models";

export type SportsSyncCommand = "competitions" | "teams" | "fixtures" | "results" | "standings" | "live";
export type SportsSyncSummary = { jobId: string; provider: SportsProviderName; command: SportsSyncCommand; dryRun: boolean; fetched: number; inserted: number; updated: number; skipped: number; competitions: string[]; errors: string[] };

type Mapping = { internal_id: string; external_id: string; season: string };
type CompetitionRecord = { id: string; name: string; slug: string; current_season: string | null };

function admin() {
  const client = createAdminClient();
  if (!client) throw new ConfigurationError("Thiếu Supabase service role cho sports sync.", "supabase");
  return client;
}

function selectAdapter(provider: SportsProviderName): SportsSyncAdapter {
  const adapter = getSportsSyncAdapters().find((item) => item.name === provider);
  if (!adapter || !adapter.isConfigured()) throw new ConfigurationError(`${provider} chưa được cấu hình.`, provider);
  return adapter;
}

async function footballSportId(): Promise<string> {
  const client = admin();
  const { data: existing, error } = await client.from("sports").select("id").eq("slug", "football").maybeSingle();
  if (error) throw new ProviderError("Không thể đọc môn thể thao.", "supabase");
  if (existing) return existing.id;
  const { data, error: insertError } = await client.from("sports").insert({ name: "Bóng đá", slug: "football", icon: "football", is_active: true }).select("id").single();
  if (insertError || !data) throw new ProviderError("Không thể tạo môn bóng đá.", "supabase");
  return data.id;
}

async function mappings(provider: SportsProviderName, entityType: "competition" | "team" | "match"): Promise<Map<string, Mapping>> {
  const { data, error } = await admin().from("provider_entity_mappings").select("internal_id,external_id,season").eq("provider", provider).eq("entity_type", entityType);
  if (error) throw new ProviderError("Không thể đọc provider mapping.", "supabase");
  return new Map(((data ?? []) as Mapping[]).map((item) => [`${item.external_id}:${item.season}`, item]));
}

async function upsertMapping(provider: SportsProviderName, entityType: "competition" | "team" | "match", internalId: string, externalId: string, season: string, metadata: Record<string, unknown>) {
  const { error } = await admin().from("provider_entity_mappings").upsert({ provider, entity_type: entityType, internal_id: internalId, external_id: externalId, season, metadata, confidence: 1 }, { onConflict: "provider,entity_type,external_id,season" });
  if (error) throw new ProviderError("Không thể lưu provider mapping.", "supabase");
}

async function writeCapabilities(adapter: SportsSyncAdapter) {
  const rows = adapter.capabilities.map((capability) => ({ provider: adapter.name, capability, supported: true, verified_at: new Date().toISOString(), limits: {}, notes: "Verified by successful provider response" }));
  if (!rows.length) return;
  const { error } = await admin().from("provider_capabilities").upsert(rows, { onConflict: "provider,capability" });
  if (error) throw new ProviderError("Không thể cập nhật provider capability.", "supabase");
}

async function persistCompetitions(adapter: SportsSyncAdapter, records: NormalizedCompetition[], summary: SportsSyncSummary) {
  const client = admin(); const sportId = await footballSportId(); const existingMappings = await mappings(adapter.name, "competition");
  for (const record of records) {
    const mapped = existingMappings.get(`${record.externalId}:`);
    let competitionId = mapped?.internal_id;
    if (competitionId) {
      const { error } = await client.from("competitions").update({ name: record.name, country: record.country, logo_url: record.logoUrl, current_season: record.season, is_active: true }).eq("id", competitionId);
      if (error) { summary.errors.push(`${record.externalId}: update failed`); continue; }
      summary.updated += 1;
    } else {
      const { data: bySlug } = await client.from("competitions").select("id").eq("slug", record.slug).maybeSingle();
      if (bySlug) { competitionId = bySlug.id; summary.updated += 1; }
      else {
        const { data, error } = await client.from("competitions").insert({ sport_id: sportId, name: record.name, slug: record.slug, country: record.country, logo_url: record.logoUrl, current_season: record.season, is_active: true }).select("id").single();
        if (error || !data) { summary.errors.push(`${record.externalId}: insert failed`); continue; }
        competitionId = data.id; summary.inserted += 1;
      }
    }
    if (!competitionId) { summary.skipped += 1; continue; }
    await upsertMapping(adapter.name, "competition", competitionId, record.externalId, "", record.rawMetadata);
    for (const capability of record.capabilities) {
      const { error } = await client.from("competition_provider_config").upsert({ competition_id: competitionId, capability, primary_provider: adapter.name, fallback_providers: [], season: "", active: true, cache_ttl_seconds: capability === "live_score" ? 60 : capability === "standings" ? 21_600 : 3_600, metadata: {} }, { onConflict: "competition_id,capability,season", ignoreDuplicates: true });
      if (error) summary.errors.push(`${record.externalId}:${capability}: config failed`);
    }
  }
  await writeCapabilities(adapter);
}

async function providerCompetitions(provider: SportsProviderName): Promise<Array<CompetitionRecord & { externalId: string }>> {
  const map = await mappings(provider, "competition");
  const values = [...map.values()];
  if (!values.length) throw new NotFoundError(`Chưa có competition mapping cho ${provider}; chạy sync:competitions trước.`);
  const { data, error } = await admin().from("competitions").select("id,name,slug,current_season").in("id", values.map((item) => item.internal_id));
  if (error) throw new ProviderError("Không thể đọc giải đã map.", "supabase");
  const records = (data ?? []) as CompetitionRecord[];
  const byId = new Map(records.map((item) => [item.id, item]));
  return values.flatMap((item) => { const record = byId.get(item.internal_id); return record ? [{ ...record, externalId: item.external_id }] : []; });
}

function configuredCompetitionIds(provider: SportsProviderName): Set<string> {
  const value = provider === "football-data" ? process.env.FOOTBALL_DATA_COMPETITIONS ?? "PL,CL,PD,SA,BL1" : process.env.API_FOOTBALL_LEAGUE_IDS ?? "";
  return new Set(value.split(",").map((item) => item.trim()).filter(Boolean));
}

async function selectedCompetitions(provider: SportsProviderName, requested?: string[]): Promise<Array<CompetitionRecord & { externalId: string }>> {
  const records = await providerCompetitions(provider);
  const wanted = new Set((requested?.length ? requested : [...configuredCompetitionIds(provider)]).map((item) => item.toLowerCase()));
  if (!wanted.size) return records.slice(0, 1);
  return records.filter((item) => wanted.has(item.externalId.toLowerCase()) || wanted.has(item.slug.toLowerCase()));
}

async function persistTeams(adapter: SportsSyncAdapter, competition: CompetitionRecord & { externalId: string }, records: NormalizedTeam[], summary: SportsSyncSummary) {
  const client = admin(); const sportId = await footballSportId(); const map = await mappings(adapter.name, "team");
  for (const record of records) {
    const mapped = map.get(`${record.externalId}:`); let teamId = mapped?.internal_id;
    if (teamId) {
      const { error } = await client.from("teams").update({ name: record.name, short_name: record.shortName, country: record.country, logo_url: record.logoUrl, stadium: record.venue }).eq("id", teamId);
      if (error) { summary.errors.push(`${record.name}: update failed`); continue; } summary.updated += 1;
    } else {
      const { data: sameSlug } = await client.from("teams").select("id").eq("slug", record.slug).maybeSingle();
      if (sameSlug) { teamId = sameSlug.id; summary.updated += 1; }
      else {
        const { data, error } = await client.from("teams").insert({ sport_id: sportId, name: record.name, short_name: record.shortName, slug: record.slug, country: record.country, logo_url: record.logoUrl, stadium: record.venue }).select("id").single();
        if (error || !data) { summary.errors.push(`${record.name}: insert failed`); continue; } teamId = data.id; summary.inserted += 1;
      }
    }
    if (!teamId) { summary.skipped += 1; continue; }
    await upsertMapping(adapter.name, "team", teamId, record.externalId, "", record.rawMetadata);
    const season = competition.current_season ?? String(new Date().getUTCFullYear());
    const { error } = await client.from("competition_teams").upsert({ competition_id: competition.id, team_id: teamId, season }, { onConflict: "competition_id,team_id,season" });
    if (error) summary.errors.push(`${record.name}: competition link failed`);
  }
}

async function persistMatches(adapter: SportsSyncAdapter, competition: CompetitionRecord & { externalId: string }, records: NormalizedMatch[], summary: SportsSyncSummary) {
  const client = admin(); const teamMappings = await mappings(adapter.name, "team"); const matchMappings = await mappings(adapter.name, "match");
  for (const record of records) {
    const home = teamMappings.get(`${record.homeTeamExternalId}:`); const away = teamMappings.get(`${record.awayTeamExternalId}:`);
    if (!home || !away) {
      summary.skipped += 1;
      const { error } = await client.from("provider_conflicts").insert({ entity_type: "match", internal_id: null, capability: "fixtures", providers: [adapter.name], values: { competitionId: competition.id, providerMatchId: record.externalId, homeTeamExternalId: record.homeTeamExternalId, awayTeamExternalId: record.awayTeamExternalId, kickoffAt: record.kickoffAt }, status: "open" });
      if (error) summary.errors.push(`${record.externalId}: unresolved mapping conflict could not be recorded`);
      continue;
    }
    const payload = { competition_id: competition.id, season: record.season, home_team_id: home.internal_id, away_team_id: away.internal_id, start_time: record.kickoffAt, status: record.status, minute: record.minute, home_score: record.homeScore ?? 0, away_score: record.awayScore ?? 0, venue: record.venue, referee: record.referee, external_id: record.externalId, provider: adapter.name, provider_external_id: record.externalId, source_timestamp: record.sourceTimestamp, data_freshness: record.dataFreshness, raw_metadata: record.rawMetadata };
    const mapped = matchMappings.get(`${record.externalId}:${record.season}`) ?? matchMappings.get(`${record.externalId}:`); let matchId = mapped?.internal_id;
    if (matchId) {
      const { error } = await client.from("matches").update(payload).eq("id", matchId);
      if (error) { summary.errors.push(`${record.externalId}: match update failed`); continue; } summary.updated += 1;
    } else {
      const { data, error } = await client.from("matches").insert(payload).select("id").single();
      if (error || !data) { summary.errors.push(`${record.externalId}: match insert failed`); continue; } matchId = data.id; summary.inserted += 1;
    }
    if (!matchId) { summary.skipped += 1; continue; }
    await upsertMapping(adapter.name, "match", matchId, record.externalId, record.season, record.rawMetadata);
  }
}

async function persistStandings(adapter: SportsSyncAdapter, competition: CompetitionRecord & { externalId: string }, records: NormalizedStanding[], summary: SportsSyncSummary) {
  const client = admin(); const teamMappings = await mappings(adapter.name, "team"); const now = new Date().toISOString();
  const rows = records.flatMap((record) => { const team = teamMappings.get(`${record.teamExternalId}:`); if (!team) { summary.skipped += 1; return []; } return [{ competition_id: competition.id, team_id: team.internal_id, season: record.season, position: record.position, played: record.played, won: record.won, drawn: record.drawn, lost: record.lost, goals_for: record.goalsFor, goals_against: record.goalsAgainst, points: record.points, form: record.form, provider: adapter.name, source_timestamp: record.sourceTimestamp, data_freshness: record.dataFreshness, raw_metadata: record.rawMetadata, updated_at: now }]; });
  if (!rows.length) return;
  const { error } = await client.from("standings").upsert(rows, { onConflict: "competition_id,team_id,season" });
  if (error) throw new ProviderError(`Không thể lưu bảng xếp hạng (${error.code ?? "database_error"}: ${error.message}).`, "supabase", false);
  summary.updated += rows.length;
}

async function writeSyncState(provider: SportsProviderName, capability: SportsCapability, competitionId: string | null, success: boolean, message?: string) {
  const now = new Date().toISOString(); const { error } = await admin().from("provider_sync_state").upsert({ provider, capability, competition_id: competitionId, season: "", last_attempt_at: now, last_success_at: success ? now : null, last_error_code: success ? null : "SYNC_FAILED", last_error_message: success ? null : message?.slice(0, 500), next_sync_at: new Date(Date.now() + (capability === "live_score" ? 5 * 60_000 : 6 * 60 * 60_000)).toISOString(), cursor: {} }, { onConflict: "provider,capability,competition_id,season" });
  if (error) logger.warn("sports_sync_state_failed", { provider, capability, code: "SUPABASE_WRITE" });
}

export async function syncSports(command: SportsSyncCommand, options: { provider?: SportsProviderName; competitionIds?: string[]; dryRun?: boolean } = {}): Promise<SportsSyncSummary> {
  const provider = options.provider ?? configuredSportsAdapters()[0]?.name;
  if (!provider) throw new ConfigurationError("Chưa có sports provider nào được cấu hình.", "sports");
  const adapter = selectAdapter(provider); const jobId = randomUUID();
  const summary: SportsSyncSummary = { jobId, provider, command, dryRun: Boolean(options.dryRun), fetched: 0, inserted: 0, updated: 0, skipped: 0, competitions: [], errors: [] };
  let jobRowCreated = false;
  if (!summary.dryRun) {
    const { error } = await admin().from("ingestion_jobs").insert({ id: jobId, job_type: `sports:${command}`, provider, status: "processing", metadata: { competitionIds: options.competitionIds ?? [] } });
    if (error) throw new ProviderError("Không thể tạo sports sync job.", "supabase"); jobRowCreated = true;
  }
  try {
    if (command === "competitions") {
      const records = await adapter.discoverCompetitions(); summary.fetched = records.length; summary.competitions = records.map((item) => item.externalId);
      if (!summary.dryRun) await persistCompetitions(adapter, records, summary);
    } else {
      const competitions = await selectedCompetitions(provider, options.competitionIds);
      if (!competitions.length) throw new NotFoundError("Không tìm thấy giải đã map khớp cấu hình hiện tại.");
      for (const competition of competitions) {
        summary.competitions.push(competition.externalId);
        try {
          if (command === "teams") {
            const records = await adapter.getTeams(competition.externalId, competition.current_season ?? undefined); summary.fetched += records.length; if (!summary.dryRun) await persistTeams(adapter, competition, records, summary);
          } else if (command === "standings") {
            const records = await adapter.getStandings(competition.externalId, competition.current_season ?? undefined); summary.fetched += records.length; if (!summary.dryRun) await persistStandings(adapter, competition, records, summary);
          } else {
            const from = new Date(); from.setUTCDate(from.getUTCDate() - (command === "results" ? 14 : 1)); const to = new Date(); to.setUTCDate(to.getUTCDate() + (command === "fixtures" ? 30 : 1));
            const records = await adapter.getMatches(competition.externalId, { dateFrom: from.toISOString().slice(0, 10), dateTo: to.toISOString().slice(0, 10), season: competition.current_season ?? undefined });
            const filtered = command === "live" ? records.filter((item) => item.status === "live" || item.status === "paused") : command === "results" ? records.filter((item) => item.status === "finished") : records.filter((item) => ["scheduled", "postponed", "cancelled"].includes(item.status));
            summary.fetched += records.length; summary.skipped += records.length - filtered.length; if (!summary.dryRun) await persistMatches(adapter, competition, filtered, summary);
          }
          const capability: SportsCapability = command === "live" ? "live_score" : command === "teams" ? "logos" : command;
          if (!summary.dryRun) await writeSyncState(provider, capability, competition.id, true);
        } catch (error) {
          const safe = toSafeError(error); const capability: SportsCapability = command === "live" ? "live_score" : command === "teams" ? "logos" : command; summary.errors.push(`${competition.externalId}: ${safe.message}`); if (!summary.dryRun) await writeSyncState(provider, capability, competition.id, false, safe.message);
        }
      }
    }
    if (jobRowCreated) await admin().from("ingestion_jobs").update({ status: summary.errors.length ? "failed" : "completed", fetched_count: summary.fetched, inserted_count: summary.inserted, updated_count: summary.updated, skipped_count: summary.skipped, error_code: summary.errors.length ? "PARTIAL_FAILURE" : null, error_message: summary.errors.join("; ").slice(0, 1000) || null, completed_at: new Date().toISOString() }).eq("id", jobId);
    return summary;
  } catch (error) {
    const safe = toSafeError(error);
    if (jobRowCreated) await admin().from("ingestion_jobs").update({ status: "failed", error_code: safe.code, error_message: safe.message, completed_at: new Date().toISOString() }).eq("id", jobId);
    throw error;
  }
}

export async function sportsCoverage() {
  const client = admin();
  const [capabilities, configs, syncStates, competitions] = await Promise.all([
    client.from("provider_capabilities").select("provider,capability,supported,verified_at,notes").order("provider"),
    client.from("competition_provider_config").select("competition_id,capability,primary_provider,fallback_providers,active"),
    client.from("provider_sync_state").select("provider,capability,competition_id,last_success_at,last_error_code,next_sync_at"),
    client.from("competitions").select("id,name,slug,country,current_season,is_active").order("name"),
  ]);
  const error = capabilities.error ?? configs.error ?? syncStates.error ?? competitions.error;
  if (error) throw new ProviderError("Không thể tạo báo cáo sports coverage.", "supabase");
  return { generatedAt: new Date().toISOString(), configuredAdapters: getSportsAdapterDescriptors(), capabilities: capabilities.data ?? [], competitionConfigs: configs.data ?? [], syncStates: syncStates.data ?? [], competitions: competitions.data ?? [] };
}
