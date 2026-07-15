import { randomUUID } from "node:crypto";
import {
  ConfigurationError,
  NotFoundError,
  ProviderError,
  toSafeError,
} from "@/lib/core/errors";
import { logger } from "@/lib/core/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugify } from "@/lib/validation";
import {
  configuredSportsAdapters,
  getSportsAdapterDescriptors,
  getSportsSyncAdapters,
  type SportsSyncAdapter,
} from "./adapters";
import type {
  NormalizedCompetition,
  NormalizedMatch,
  NormalizedMatchDetails,
  NormalizedPlayer,
  NormalizedStanding,
  NormalizedTeam,
  NormalizedTransfer,
  SportsCapability,
  SportsProviderName,
} from "./models";

export type SportsSyncCommand =
  "competitions" | "teams" | "fixtures" | "results" | "matches" | "daily" | "standings" | "live" | "details" | "transfers";
export type SportsSyncSummary = {
  jobId: string;
  provider: SportsProviderName;
  command: SportsSyncCommand;
  dryRun: boolean;
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  competitions: string[];
  errors: string[];
};

export function sportsMatchQueryOptions(
  command: "fixtures" | "results" | "matches" | "live",
  season: string | null,
  now = Date.now(),
): { dateFrom?: string; dateTo?: string; season?: string } {
  const seasonOption = season ?? undefined;
  if (command !== "live") return { season: seasonOption };
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(now);
  to.setUTCDate(to.getUTCDate() + 1);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
    season: seasonOption,
  };
}

type Mapping = { internal_id: string; external_id: string; season: string };
type CompetitionRecord = {
  id: string;
  name: string;
  slug: string;
  current_season: string | null;
};

function admin() {
  const client = createAdminClient();
  if (!client)
    throw new ConfigurationError(
      "Thiếu Supabase service role cho sports sync.",
      "supabase",
    );
  return client;
}

function selectAdapter(provider: SportsProviderName): SportsSyncAdapter {
  const adapter = getSportsSyncAdapters().find(
    (item) => item.name === provider,
  );
  if (!adapter || !adapter.isConfigured())
    throw new ConfigurationError(`${provider} chưa được cấu hình.`, provider);
  return adapter;
}

async function footballSportId(): Promise<string> {
  const client = admin();
  const { data: existing, error } = await client
    .from("sports")
    .select("id")
    .eq("slug", "football")
    .maybeSingle();
  if (error) throw new ProviderError("Không thể đọc môn thể thao.", "supabase");
  if (existing) return existing.id;
  const { data, error: insertError } = await client
    .from("sports")
    .insert({
      name: "Bóng đá",
      slug: "football",
      icon: "football",
      is_active: true,
    })
    .select("id")
    .single();
  if (insertError || !data)
    throw new ProviderError("Không thể tạo môn bóng đá.", "supabase");
  return data.id;
}

async function mappings(
  provider: SportsProviderName,
  entityType: "competition" | "team" | "player" | "match",
): Promise<Map<string, Mapping>> {
  const { data, error } = await admin()
    .from("provider_entity_mappings")
    .select("internal_id,external_id,season")
    .eq("provider", provider)
    .eq("entity_type", entityType);
  if (error)
    throw new ProviderError("Không thể đọc provider mapping.", "supabase");
  return new Map(
    ((data ?? []) as Mapping[]).map((item) => [
      `${item.external_id}:${item.season}`,
      item,
    ]),
  );
}

async function upsertMappings(
  provider: SportsProviderName,
  entityType: "competition" | "team" | "player" | "match",
  rows: Array<{
    internalId: string;
    externalId: string;
    season: string;
    metadata: Record<string, unknown>;
  }>,
) {
  if (!rows.length) return;
  const client = admin();
  const deduped = rows.filter((row, index, all) => {
    const externalKey = `${row.externalId}:${row.season}`;
    const internalKey = `${row.internalId}:${row.season}`;
    return (
      all.findIndex(
        (candidate) =>
          `${candidate.externalId}:${candidate.season}` === externalKey,
      ) === index &&
      all.findIndex(
        (candidate) =>
          `${candidate.internalId}:${candidate.season}` === internalKey,
      ) === index
    );
  });
  const { data: existing, error: readError } = await client
    .from("provider_entity_mappings")
    .select("id,internal_id,external_id,season")
    .eq("provider", provider)
    .eq("entity_type", entityType);
  if (readError)
    throw new ProviderError(
      "Không thể đối chiếu provider mapping.",
      "supabase",
    );
  const staleIds = new Set<string>();
  for (const row of deduped) {
    for (const current of (existing ?? []) as Array<{
      id: string;
      internal_id: string;
      external_id: string;
      season: string;
    }>) {
      const sameSeason = current.season === row.season;
      if (
        sameSeason &&
        ((current.external_id === row.externalId &&
          current.internal_id !== row.internalId) ||
          (current.internal_id === row.internalId &&
            current.external_id !== row.externalId))
      )
        staleIds.add(current.id);
    }
  }
  if (staleIds.size) {
    const { error: deleteError } = await client
      .from("provider_entity_mappings")
      .delete()
      .in("id", [...staleIds]);
    if (deleteError)
      throw new ProviderError(
        "Không thể dọn provider mapping xung đột.",
        "supabase",
      );
  }
  const { error } = await client.from("provider_entity_mappings").upsert(
    deduped.map((row) => ({
      provider,
      entity_type: entityType,
      internal_id: row.internalId,
      external_id: row.externalId,
      season: row.season,
      metadata: row.metadata,
      confidence: 1,
    })),
    { onConflict: "provider,entity_type,external_id,season" },
  );
  if (error)
    throw new ProviderError(
      `Không thể lưu provider mapping (${error.code ?? "database_error"}: ${error.message}).`,
      "supabase",
      false,
    );
}

export function competitionRecordIsActive(
  record: NormalizedCompetition,
  now = Date.now(),
): boolean {
  const rawSeason = record.rawMetadata.currentSeason;
  if (!rawSeason || typeof rawSeason !== "object" || Array.isArray(rawSeason))
    return true;
  const endDate = (rawSeason as Record<string, unknown>).endDate;
  if (typeof endDate !== "string") return true;
  const parsed = Date.parse(`${endDate}T23:59:59.999Z`);
  if (!Number.isFinite(parsed)) return true;
  return parsed >= now - 365 * 24 * 60 * 60_000;
}

async function writeCapabilities(adapter: SportsSyncAdapter) {
  const rows = adapter.capabilities.map((capability) => ({
    provider: adapter.name,
    capability,
    supported: true,
    verified_at: new Date().toISOString(),
    limits: {},
    notes: "Verified by successful provider response",
  }));
  if (!rows.length) return;
  const { error } = await admin()
    .from("provider_capabilities")
    .upsert(rows, { onConflict: "provider,capability" });
  if (error)
    throw new ProviderError(
      "Không thể cập nhật provider capability.",
      "supabase",
    );
}

async function persistCompetitions(
  adapter: SportsSyncAdapter,
  records: NormalizedCompetition[],
  summary: SportsSyncSummary,
) {
  const client = admin();
  const sportId = await footballSportId();
  const existingMappings = await mappings(adapter.name, "competition");
  const mapped = records.filter((record) =>
    existingMappings.has(`${record.externalId}:`),
  );
  const unmapped = records.filter(
    (record) => !existingMappings.has(`${record.externalId}:`),
  );
  const mappedRows = mapped.map((record) => ({
    id: existingMappings.get(`${record.externalId}:`)!.internal_id,
    sport_id: sportId,
    name: record.name,
    slug: record.slug,
    country: record.country,
    logo_url: record.logoUrl,
    current_season: record.season,
    is_active: competitionRecordIsActive(record),
  }));
  if (mappedRows.length) {
    const { error } = await client
      .from("competitions")
      .upsert(mappedRows, { onConflict: "id" });
    if (error)
      throw new ProviderError(
        "Không thể cập nhật hàng loạt giải đấu.",
        "supabase",
        false,
      );
  }

  const existingSlugs = new Set<string>();
  if (unmapped.length) {
    const { data, error } = await client
      .from("competitions")
      .select("slug")
      .in(
        "slug",
        unmapped.map((record) => record.slug),
      );
    if (error)
      throw new ProviderError(
        "Không thể đối chiếu slug giải đấu.",
        "supabase",
        false,
      );
    for (const row of (data ?? []) as Array<{ slug: string }>)
      existingSlugs.add(row.slug);
  }
  const { data: upserted, error: upsertError } = unmapped.length
    ? await client
        .from("competitions")
        .upsert(
          unmapped.map((record) => ({
            sport_id: sportId,
            name: record.name,
            slug: record.slug,
            country: record.country,
            logo_url: record.logoUrl,
            current_season: record.season,
            is_active: competitionRecordIsActive(record),
          })),
          { onConflict: "slug" },
        )
        .select("id,slug")
    : { data: [], error: null };
  if (upsertError)
    throw new ProviderError(
      `Không thể lưu hàng loạt giải đấu (${upsertError.code ?? "database_error"}: ${upsertError.message}).`,
      "supabase",
      false,
    );

  const idsBySlug = new Map(
    ((upserted ?? []) as Array<{ id: string; slug: string }>).map((row) => [
      row.slug,
      row.id,
    ]),
  );
  const competitionId = (record: NormalizedCompetition) =>
    existingMappings.get(`${record.externalId}:`)?.internal_id ??
    idsBySlug.get(record.slug);
  summary.updated +=
    mapped.length +
    unmapped.filter((record) => existingSlugs.has(record.slug)).length;
  summary.inserted += unmapped.filter(
    (record) => !existingSlugs.has(record.slug),
  ).length;

  const mappingRows = records.flatMap((record) => {
    const internalId = competitionId(record);
    if (!internalId) {
      summary.skipped += 1;
      return [];
    }
    return [
      {
        internalId,
        externalId: record.externalId,
        season: "",
        metadata: record.rawMetadata,
      },
    ];
  });
  await upsertMappings(adapter.name, "competition", mappingRows);

  const configRows = records.flatMap((record) => {
    const internalId = competitionId(record);
    if (!internalId || !competitionRecordIsActive(record)) return [];
    return record.capabilities.map((capability) => ({
      competition_id: internalId,
      capability,
      primary_provider: adapter.name,
      fallback_providers: [],
      season: "",
      active: true,
      cache_ttl_seconds:
        capability === "live_score"
          ? 60
          : capability === "standings"
            ? 21_600
            : 3_600,
      metadata: {},
    }));
  });
  if (configRows.length) {
    const { error } = await client
      .from("competition_provider_config")
      .upsert(configRows, {
        onConflict: "competition_id,capability,season",
      });
    if (error)
      summary.errors.push("competition provider config: bulk upsert failed");
  }

  const desiredCapabilities = new Map<string, Set<string>>();
  for (const record of records) {
    const internalId = competitionId(record);
    if (!internalId) continue;
    desiredCapabilities.set(
      internalId,
      new Set(competitionRecordIsActive(record) ? record.capabilities : []),
    );
  }
  const competitionIds = [...desiredCapabilities.keys()];
  if (competitionIds.length) {
    const { data: existingConfig, error: configReadError } = await client
      .from("competition_provider_config")
      .select("id,competition_id,capability")
      .eq("primary_provider", adapter.name)
      .in("competition_id", competitionIds);
    if (configReadError) {
      summary.errors.push("competition provider config: reconcile failed");
    } else {
      const staleConfigIds = (
        (existingConfig ?? []) as Array<{
          id: string;
          competition_id: string;
          capability: string;
        }>
      )
        .filter(
          (row) =>
            !desiredCapabilities.get(row.competition_id)?.has(row.capability),
        )
        .map((row) => row.id);
      if (staleConfigIds.length) {
        const { error } = await client
          .from("competition_provider_config")
          .delete()
          .in("id", staleConfigIds);
        if (error)
          summary.errors.push(
            "competition provider config: stale cleanup failed",
          );
      }
    }

    const withoutStandings = competitionIds.filter(
      (id) => !desiredCapabilities.get(id)?.has("standings"),
    );
    if (withoutStandings.length) {
      const { error } = await client
        .from("standings")
        .delete()
        .eq("provider", adapter.name)
        .in("competition_id", withoutStandings);
      if (error)
        summary.errors.push("stale unsupported standings cleanup failed");
    }
  }
  await writeCapabilities(adapter);
}

async function providerCompetitions(
  provider: SportsProviderName,
): Promise<Array<CompetitionRecord & { externalId: string }>> {
  const map = await mappings(provider, "competition");
  const values = [...map.values()];
  if (!values.length)
    throw new NotFoundError(
      `Chưa có competition mapping cho ${provider}; chạy sync:competitions trước.`,
    );
  const { data, error } = await admin()
    .from("competitions")
    .select("id,name,slug,current_season")
    .in(
      "id",
      values.map((item) => item.internal_id),
    );
  if (error) throw new ProviderError("Không thể đọc giải đã map.", "supabase");
  const records = (data ?? []) as CompetitionRecord[];
  const byId = new Map(records.map((item) => [item.id, item]));
  return values.flatMap((item) => {
    const record = byId.get(item.internal_id);
    return record ? [{ ...record, externalId: item.external_id }] : [];
  });
}

function configuredCompetitionIds(provider: SportsProviderName): Set<string> {
  const value =
    provider === "football-data"
      ? (process.env.FOOTBALL_DATA_COMPETITIONS ??
        "PL,CL,PD,SA,BL1,FL1,DED,PPL,BSA,ELC,WC,CLI")
      : provider === "openligadb"
        ? (process.env.OPENLIGADB_COMPETITIONS ??
          "bl2,bl3,dfb,ffb1,regio-bayern,BLSupercup,unl")
        : (process.env.API_FOOTBALL_LEAGUE_IDS ?? "");
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

async function selectedCompetitions(
  provider: SportsProviderName,
  requested?: string[],
): Promise<Array<CompetitionRecord & { externalId: string }>> {
  const records = await providerCompetitions(provider);
  const wanted = new Set(
    (requested?.length
      ? requested
      : [...configuredCompetitionIds(provider)]
    ).map((item) => item.toLowerCase()),
  );
  if (!wanted.size) return records.slice(0, 1);
  return records.filter(
    (item) =>
      wanted.has(item.externalId.toLowerCase()) ||
      wanted.has(item.slug.toLowerCase()),
  );
}

async function persistTeams(
  adapter: SportsSyncAdapter,
  competition: CompetitionRecord & { externalId: string },
  records: NormalizedTeam[],
  summary: SportsSyncSummary,
) {
  const client = admin();
  const sportId = await footballSportId();
  const map = await mappings(adapter.name, "team");
  const mappedTeam = (record: NormalizedTeam) =>
    map.get(`${record.externalId}:${competition.externalId}`) ??
    map.get(`${record.externalId}:`);
  const mapped = records.filter((record) => Boolean(mappedTeam(record)));
  const unmapped = records.filter((record) => !mappedTeam(record));
  const mappedRows = mapped.map((record) => ({
    id: mappedTeam(record)!.internal_id,
    sport_id: sportId,
    name: record.name,
    short_name: record.shortName,
    slug: record.slug,
    country: record.country,
    logo_url: record.logoUrl,
    stadium: record.venue,
  }));
  if (mappedRows.length) {
    const { error } = await client
      .from("teams")
      .upsert(mappedRows, { onConflict: "id" });
    if (error)
      throw new ProviderError(
        "Không thể cập nhật hàng loạt đội bóng.",
        "supabase",
        false,
      );
  }

  const existingSlugs = new Set<string>();
  if (unmapped.length) {
    const { data, error } = await client
      .from("teams")
      .select("slug")
      .in(
        "slug",
        unmapped.map((record) => record.slug),
      );
    if (error)
      throw new ProviderError(
        "Không thể đối chiếu slug đội bóng.",
        "supabase",
        false,
      );
    for (const row of (data ?? []) as Array<{ slug: string }>)
      existingSlugs.add(row.slug);
  }
  const { data: upserted, error: upsertError } = unmapped.length
    ? await client
        .from("teams")
        .upsert(
          unmapped.map((record) => ({
            sport_id: sportId,
            name: record.name,
            short_name: record.shortName,
            slug: record.slug,
            country: record.country,
            logo_url: record.logoUrl,
            stadium: record.venue,
          })),
          { onConflict: "slug" },
        )
        .select("id,slug")
    : { data: [], error: null };
  if (upsertError)
    throw new ProviderError(
      "Không thể lưu hàng loạt đội bóng.",
      "supabase",
      false,
    );

  const idsBySlug = new Map(
    ((upserted ?? []) as Array<{ id: string; slug: string }>).map((row) => [
      row.slug,
      row.id,
    ]),
  );
  const teamId = (record: NormalizedTeam) =>
    mappedTeam(record)?.internal_id ?? idsBySlug.get(record.slug);
  summary.updated +=
    mapped.length +
    unmapped.filter((record) => existingSlugs.has(record.slug)).length;
  summary.inserted += unmapped.filter(
    (record) => !existingSlugs.has(record.slug),
  ).length;

  const mappingRows = records.flatMap((record) => {
    const internalId = teamId(record);
    if (!internalId) {
      summary.skipped += 1;
      return [];
    }
    return [
      {
        internalId,
        externalId: record.externalId,
        season: competition.externalId,
        metadata: record.rawMetadata,
      },
    ];
  });
  await upsertMappings(adapter.name, "team", mappingRows);

  const season =
    competition.current_season ?? String(new Date().getUTCFullYear());
  const links = records.flatMap((record) => {
    const internalId = teamId(record);
    return internalId
      ? [{ competition_id: competition.id, team_id: internalId, season }]
      : [];
  });
  if (links.length) {
    const { error } = await client
      .from("competition_teams")
      .upsert(links, { onConflict: "competition_id,team_id,season" });
    if (error)
      summary.errors.push(
        `${competition.externalId}: competition links failed`,
      );
  }
}

async function persistMatches(
  adapter: SportsSyncAdapter,
  competition: CompetitionRecord & { externalId: string },
  records: NormalizedMatch[],
  summary: SportsSyncSummary,
) {
  const client = admin();
  const teamMappings = await mappings(adapter.name, "team");
  const matchMappings = await mappings(adapter.name, "match");
  const { data: existingMatches, error: existingMatchesError } = await client
    .from("matches")
    .select("id,home_team_id,away_team_id,start_time")
    .eq("competition_id", competition.id)
    .limit(2_000);
  if (existingMatchesError)
    throw new ProviderError(
      "Không thể đối chiếu trận giữa các provider.",
      "supabase",
      false,
    );
  const resolved: Array<{
    record: NormalizedMatch;
    payload: Record<string, unknown>;
    mappedId?: string;
  }> = [];
  const conflicts: Array<Record<string, unknown>> = [];
  for (const record of records) {
    const home =
      teamMappings.get(
        `${record.homeTeamExternalId}:${competition.externalId}`,
      ) ?? teamMappings.get(`${record.homeTeamExternalId}:`);
    const away =
      teamMappings.get(
        `${record.awayTeamExternalId}:${competition.externalId}`,
      ) ?? teamMappings.get(`${record.awayTeamExternalId}:`);
    if (!home || !away) {
      summary.skipped += 1;
      conflicts.push({
        entity_type: "match",
        internal_id: null,
        capability: "fixtures",
        providers: [adapter.name],
        values: {
          competitionId: competition.id,
          providerMatchId: record.externalId,
          homeTeamExternalId: record.homeTeamExternalId,
          awayTeamExternalId: record.awayTeamExternalId,
          kickoffAt: record.kickoffAt,
        },
        status: "open",
      });
      continue;
    }
    const payload = {
      competition_id: competition.id,
      season: record.season,
      home_team_id: home.internal_id,
      away_team_id: away.internal_id,
      start_time: record.kickoffAt,
      status: record.status,
      minute: record.minute,
      home_score: record.homeScore ?? 0,
      away_score: record.awayScore ?? 0,
      venue: record.venue,
      referee: record.referee,
      external_id: record.externalId,
      provider: adapter.name,
      provider_external_id: record.externalId,
      source_timestamp: record.sourceTimestamp,
      data_freshness: record.dataFreshness,
      raw_metadata: record.rawMetadata,
    };
    const mapped =
      matchMappings.get(`${record.externalId}:${record.season}`) ??
      matchMappings.get(`${record.externalId}:`);
    const equivalent = (
      (existingMatches ?? []) as Array<{
        id: string;
        home_team_id: string;
        away_team_id: string;
        start_time: string;
      }>
    ).find(
      (item) =>
        item.home_team_id === home.internal_id &&
        item.away_team_id === away.internal_id &&
        Math.abs(Date.parse(item.start_time) - Date.parse(record.kickoffAt)) <=
          30 * 60_000,
    );
    resolved.push({
      record,
      payload,
      mappedId: mapped?.internal_id ?? equivalent?.id,
    });
  }
  if (conflicts.length) {
    const { error } = await client.from("provider_conflicts").insert(conflicts);
    if (error)
      summary.errors.push("unresolved match mappings could not be recorded");
  }

  const mappedRows = resolved
    .filter((item) => item.mappedId)
    .map((item) => ({ id: item.mappedId!, ...item.payload }));
  if (mappedRows.length) {
    const { error } = await client
      .from("matches")
      .upsert(mappedRows, { onConflict: "id" });
    if (error)
      throw new ProviderError(
        "Không thể cập nhật hàng loạt trận đấu.",
        "supabase",
        false,
      );
  }
  const unmapped = resolved.filter((item) => !item.mappedId);
  const { data: upserted, error: upsertError } = unmapped.length
    ? await client
        .from("matches")
        .upsert(
          unmapped.map((item) => item.payload),
          { onConflict: "competition_id,external_id" },
        )
        .select("id,external_id,season")
    : { data: [], error: null };
  if (upsertError)
    throw new ProviderError(
      "Không thể lưu hàng loạt trận đấu.",
      "supabase",
      false,
    );

  const idsByExternal = new Map(
    (
      (upserted ?? []) as Array<{
        id: string;
        external_id: string;
        season: string;
      }>
    ).map((row) => [`${row.external_id}:${row.season}`, row.id]),
  );
  summary.updated += mappedRows.length;
  summary.inserted += unmapped.length;
  const mappingRows = resolved.flatMap((item) => {
    const internalId =
      item.mappedId ??
      idsByExternal.get(`${item.record.externalId}:${item.record.season}`);
    if (!internalId) {
      summary.skipped += 1;
      return [];
    }
    return [
      {
        internalId,
        externalId: item.record.externalId,
        season: item.record.season,
        metadata: item.record.rawMetadata,
      },
    ];
  });
  await upsertMappings(adapter.name, "match", mappingRows);
}

async function persistStandings(
  adapter: SportsSyncAdapter,
  competition: CompetitionRecord & { externalId: string },
  records: NormalizedStanding[],
  summary: SportsSyncSummary,
) {
  const client = admin();
  if (!records.length) {
    let cleanup = client
      .from("standings")
      .delete()
      .eq("competition_id", competition.id)
      .eq("provider", adapter.name);
    if (competition.current_season)
      cleanup = cleanup.eq("season", competition.current_season);
    const { error } = await cleanup;
    if (error)
      throw new ProviderError(
        "Không thể dọn bảng xếp hạng không còn hợp lệ.",
        "supabase",
        false,
      );
    return;
  }
  const teamMappings = await mappings(adapter.name, "team");
  const now = new Date().toISOString();
  const rows = records.flatMap((record) => {
    const team =
      teamMappings.get(`${record.teamExternalId}:${competition.externalId}`) ??
      teamMappings.get(`${record.teamExternalId}:`);
    if (!team) {
      summary.skipped += 1;
      return [];
    }
    return [
      {
        competition_id: competition.id,
        team_id: team.internal_id,
        season: record.season,
        position: record.position,
        played: record.played,
        won: record.won,
        drawn: record.drawn,
        lost: record.lost,
        goals_for: record.goalsFor,
        goals_against: record.goalsAgainst,
        points: record.points,
        form: record.form,
        provider: adapter.name,
        source_timestamp: record.sourceTimestamp,
        data_freshness: record.dataFreshness,
        raw_metadata: record.rawMetadata,
        updated_at: now,
      },
    ];
  });
  if (!rows.length) return;
  const { error } = await client
    .from("standings")
    .upsert(rows, { onConflict: "competition_id,team_id,season" });
  if (error)
    throw new ProviderError(
      `Không thể lưu bảng xếp hạng (${error.code ?? "database_error"}: ${error.message}).`,
      "supabase",
      false,
    );
  summary.updated += rows.length;
}

async function persistPlayers(
  adapter: SportsSyncAdapter,
  records: NormalizedPlayer[],
  summary: SportsSyncSummary,
) {
  if (!records.length) return;
  const client = admin();
  const unique = [
    ...new Map(records.map((record) => [record.externalId, record])).values(),
  ];
  const playerMappings = await mappings(adapter.name, "player");
  const teamMappings = await mappings(adapter.name, "team");
  const teamsByExternal = new Map(
    [...teamMappings.values()].map((mapping) => [
      mapping.external_id,
      mapping.internal_id,
    ]),
  );
  const mapped = unique.filter((record) =>
    playerMappings.has(`${record.externalId}:`),
  );
  if (mapped.length) {
    const mappedIds = mapped.map(
      (record) => playerMappings.get(`${record.externalId}:`)!.internal_id,
    );
    const { data: mappedPlayers, error: mappedPlayersError } = await client
      .from("players")
      .select("id,slug")
      .in("id", mappedIds);
    if (mappedPlayersError)
      throw new ProviderError(
        "Không thể đọc slug cầu thủ đã map.",
        "supabase",
        false,
      );
    const mappedSlugById = new Map(
      ((mappedPlayers ?? []) as Array<{ id: string; slug: string }>).map(
        (row) => [row.id, row.slug],
      ),
    );
    const { error } = await client.from("players").upsert(
      mapped.map((record) => {
        const internalId =
          playerMappings.get(`${record.externalId}:`)!.internal_id;
        return {
          id: internalId,
          team_id: record.teamExternalId
            ? (teamsByExternal.get(record.teamExternalId) ?? null)
            : null,
          name: record.name,
          slug: mappedSlugById.get(internalId) ?? record.slug,
          image_url: record.imageUrl,
          nationality: record.nationality,
          date_of_birth: record.dateOfBirth,
          position: record.position,
        };
      }),
      { onConflict: "id" },
    );
    if (error)
      throw new ProviderError(
        "Không thể cập nhật cầu thủ API-Football.",
        "supabase",
        false,
      );
  }

  const unmapped = unique.filter(
    (record) => !playerMappings.has(`${record.externalId}:`),
  );
  const { data: existingPlayers, error: existingError } = unmapped.length
    ? await client
        .from("players")
        .select("id,slug")
        .in(
          "slug",
          [...new Set(unmapped.map((record) => record.slug))],
        )
    : { data: [], error: null };
  if (existingError)
    throw new ProviderError(
      "Không thể đối chiếu cầu thủ hiện có.",
      "supabase",
      false,
    );
  const existingBySlug = new Map(
    ((existingPlayers ?? []) as Array<{ id: string; slug: string }>).map(
      (row) => [row.slug, row.id],
    ),
  );
  const existingRecords = unmapped.filter((record) =>
    existingBySlug.has(record.slug),
  );
  if (existingRecords.length) {
    const { error } = await client.from("players").upsert(
      existingRecords.map((record) => ({
        id: existingBySlug.get(record.slug)!,
        team_id: record.teamExternalId
          ? (teamsByExternal.get(record.teamExternalId) ?? null)
          : null,
        name: record.name,
        slug: record.slug,
        image_url: record.imageUrl,
        nationality: record.nationality,
        date_of_birth: record.dateOfBirth,
        position: record.position,
      })),
      { onConflict: "id" },
    );
    if (error)
      throw new ProviderError(
        "Không thể hợp nhất hồ sơ cầu thủ.",
        "supabase",
        false,
      );
  }

  const newRecords = unmapped.filter(
    (record) => !existingBySlug.has(record.slug),
  );
  const duplicateSlugs = new Map<string, number>();
  const rowsToInsert = newRecords.map((record) => {
    const count = duplicateSlugs.get(record.slug) ?? 0;
    duplicateSlugs.set(record.slug, count + 1);
    return {
      record,
      slug: count ? `${record.slug}-${record.externalId}` : record.slug,
    };
  });
  const { data: insertedPlayers, error: insertError } = rowsToInsert.length
    ? await client
        .from("players")
        .insert(
          rowsToInsert.map(({ record, slug }) => ({
            team_id: record.teamExternalId
              ? (teamsByExternal.get(record.teamExternalId) ?? null)
              : null,
            name: record.name,
            slug,
            image_url: record.imageUrl,
            nationality: record.nationality,
            date_of_birth: record.dateOfBirth,
            position: record.position,
          })),
        )
        .select("id,slug")
    : { data: [], error: null };
  if (insertError)
    throw new ProviderError(
      "Không thể lưu cầu thủ API-Football.",
      "supabase",
      false,
    );
  const insertedBySlug = new Map(
    ((insertedPlayers ?? []) as Array<{ id: string; slug: string }>).map(
      (row) => [row.slug, row.id],
    ),
  );
  const mappingRows = unique.flatMap((record) => {
    const rowWithSlug = rowsToInsert.find(
      (item) => item.record.externalId === record.externalId,
    );
    const internalId =
      playerMappings.get(`${record.externalId}:`)?.internal_id ??
      existingBySlug.get(record.slug) ??
      insertedBySlug.get(rowWithSlug?.slug ?? record.slug);
    return internalId
      ? [
          {
            internalId,
            externalId: record.externalId,
            season: "",
            metadata: record.rawMetadata,
          },
        ]
      : [];
  });
  await upsertMappings(adapter.name, "player", mappingRows);
  summary.updated += mapped.length + existingRecords.length;
  summary.inserted += rowsToInsert.length;
}

async function persistMatchDetails(
  adapter: SportsSyncAdapter,
  matchId: string,
  details: NormalizedMatchDetails,
  summary: SportsSyncSummary,
) {
  const client = admin();
  await persistPlayers(adapter, details.players, summary);
  const [teamMappings, playerMappings] = await Promise.all([
    mappings(adapter.name, "team"),
    mappings(adapter.name, "player"),
  ]);
  const teamsByExternal = new Map(
    [...teamMappings.values()].map((mapping) => [
      mapping.external_id,
      mapping.internal_id,
    ]),
  );
  const playersByExternal = new Map(
    [...playerMappings.values()].map((mapping) => [
      mapping.external_id,
      mapping.internal_id,
    ]),
  );

  const { error: deleteEventsError } = await client
    .from("match_events")
    .delete()
    .eq("match_id", matchId);
  if (deleteEventsError)
    throw new ProviderError(
      "Không thể làm mới sự kiện trận đấu.",
      "supabase",
      false,
    );
  const eventRows = details.events.flatMap((event) =>
    event.minute === null
      ? []
      : [
          {
            match_id: matchId,
            team_id: event.teamExternalId
              ? (teamsByExternal.get(event.teamExternalId) ?? null)
              : null,
            player_id: event.playerExternalId
              ? (playersByExternal.get(event.playerExternalId) ?? null)
              : null,
            related_player_id: event.relatedPlayerExternalId
              ? (playersByExternal.get(event.relatedPlayerExternalId) ?? null)
              : null,
            event_type: event.type,
            minute: event.minute,
            extra_minute: event.extraMinute,
            metadata: event.rawMetadata,
          },
        ],
  );
  if (eventRows.length) {
    const { error } = await client.from("match_events").insert(eventRows);
    if (error)
      throw new ProviderError(
        "Không thể lưu sự kiện trận đấu.",
        "supabase",
        false,
      );
  }

  const statisticRows = details.statistics.flatMap((statistic) => {
    const teamId = teamsByExternal.get(statistic.teamExternalId);
    if (!teamId) return [];
    return [
      {
        match_id: matchId,
        team_id: teamId,
        possession: statistic.values.possession,
        shots: statistic.values.shots,
        shots_on_target: statistic.values.shotsOnTarget,
        corners: statistic.values.corners,
        fouls: statistic.values.fouls,
        yellow_cards: statistic.values.yellowCards,
        red_cards: statistic.values.redCards,
        expected_goals: statistic.values.expectedGoals,
        metadata: statistic.rawMetadata,
      },
    ];
  });
  if (statisticRows.length) {
    const { error } = await client
      .from("match_statistics")
      .upsert(statisticRows, { onConflict: "match_id,team_id" });
    if (error)
      throw new ProviderError(
        "Không thể lưu thống kê trận đấu.",
        "supabase",
        false,
      );
  }

  const { error: detailsError } = await client
    .from("match_provider_details")
    .upsert(
      {
        match_id: matchId,
        provider: adapter.name,
        lineups: details.lineups,
        injuries: details.injuries,
        player_statistics: details.players,
        prediction: details.prediction,
        head_to_head: details.headToHead,
        source_timestamp: details.fetchedAt,
        updated_at: details.fetchedAt,
      },
      { onConflict: "match_id,provider" },
    );
  if (detailsError)
    throw new ProviderError(
      "Không thể lưu dữ liệu mở rộng trận đấu.",
      "supabase",
      false,
    );
  summary.updated += eventRows.length + statisticRows.length + 1;
}

async function syncOneMatchDetails(
  adapter: SportsSyncAdapter,
  summary: SportsSyncSummary,
) {
  if (!adapter.getMatchDetails)
    throw new ConfigurationError(
      `${adapter.name} không hỗ trợ dữ liệu chi tiết trận đấu.`,
      adapter.name,
    );
  const client = admin();
  const [matchMappings, teamMappings] = await Promise.all([
    mappings(adapter.name, "match"),
    mappings(adapter.name, "team"),
  ]);
  const externalMatchByInternal = new Map(
    [...matchMappings.values()].map((mapping) => [
      mapping.internal_id,
      mapping.external_id,
    ]),
  );
  const externalTeamByInternal = new Map(
    [...teamMappings.values()].map((mapping) => [
      mapping.internal_id,
      mapping.external_id,
    ]),
  );
  const { data: candidates, error: candidateError } = await client
    .from("matches")
    .select(
      "id,competition_id,home_team_id,away_team_id,start_time,status",
    )
    .eq("provider", adapter.name)
    .in("status", ["live", "paused", "finished"])
    .gte("start_time", new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString())
    .order("start_time", { ascending: false })
    .limit(150);
  if (candidateError)
    throw new ProviderError(
      "Không thể chọn trận cần làm giàu.",
      "supabase",
      false,
    );
  const candidateIds = (candidates ?? []).map((row) => row.id);
  const { data: existingDetails, error: detailsError } = candidateIds.length
    ? await client
        .from("match_provider_details")
        .select("match_id,updated_at")
        .eq("provider", adapter.name)
        .in("match_id", candidateIds)
    : { data: [], error: null };
  if (detailsError)
    throw new ProviderError(
      "Không thể đọc trạng thái dữ liệu chi tiết.",
      "supabase",
      false,
    );
  const updatedByMatch = new Map(
    ((existingDetails ?? []) as Array<{ match_id: string; updated_at: string }>).map(
      (row) => [row.match_id, Date.parse(row.updated_at)],
    ),
  );
  const sorted = [...(candidates ?? [])].sort((a, b) => {
    const liveA = ["live", "paused"].includes(a.status) ? 1 : 0;
    const liveB = ["live", "paused"].includes(b.status) ? 1 : 0;
    if (liveA !== liveB) return liveB - liveA;
    return (updatedByMatch.get(a.id) ?? 0) - (updatedByMatch.get(b.id) ?? 0);
  });
  const candidate = sorted.find(
    (row) =>
      externalMatchByInternal.has(row.id) &&
      externalTeamByInternal.has(row.home_team_id) &&
      externalTeamByInternal.has(row.away_team_id) &&
      (Date.now() - (updatedByMatch.get(row.id) ?? 0) >=
        (["live", "paused"].includes(row.status)
          ? 5 * 60_000
          : 12 * 60 * 60_000)),
  );
  if (!candidate) return;
  const matchExternalId = externalMatchByInternal.get(candidate.id)!;
  const details = await adapter.getMatchDetails(
    matchExternalId,
    externalTeamByInternal.get(candidate.home_team_id)!,
    externalTeamByInternal.get(candidate.away_team_id)!,
  );
  summary.fetched +=
    details.events.length +
    details.statistics.length +
    details.lineups.length +
    details.players.length +
    details.injuries.length +
    details.headToHead.length +
    (details.prediction ? 1 : 0);
  if (!summary.dryRun)
    await persistMatchDetails(adapter, candidate.id, details, summary);
  summary.competitions.push(candidate.competition_id);
}

async function persistTransfers(
  adapter: SportsSyncAdapter,
  records: NormalizedTransfer[],
  summary: SportsSyncSummary,
) {
  const recentCutoff = new Date(Date.now() - 2 * 365 * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);
  const recent = records.filter(
    (record) => record.transferDate >= recentCutoff,
  );
  if (!recent.length) return;
  const fetchedAt = new Date().toISOString();
  await persistPlayers(
    adapter,
    recent.map((record) => ({
      provider: adapter.name,
      externalId: record.playerExternalId,
      fetchedAt,
      sourceTimestamp: fetchedAt,
      dataFreshness: "fresh",
      rawMetadata: record.rawMetadata,
      teamExternalId: record.toTeamExternalId,
      name: record.playerName,
      slug: slugify(record.playerName),
      nationality: null,
      position: null,
      imageUrl: null,
      dateOfBirth: null,
    })),
    summary,
  );
  const [playerMappings, teamMappings] = await Promise.all([
    mappings(adapter.name, "player"),
    mappings(adapter.name, "team"),
  ]);
  const playersByExternal = new Map(
    [...playerMappings.values()].map((mapping) => [
      mapping.external_id,
      mapping.internal_id,
    ]),
  );
  const teamsByExternal = new Map(
    [...teamMappings.values()].map((mapping) => [
      mapping.external_id,
      mapping.internal_id,
    ]),
  );
  const rows = recent.flatMap((record) => {
    const playerId = playersByExternal.get(record.playerExternalId);
    if (!playerId) return [];
    const type = record.transferType.toLowerCase();
    return [
      {
        player_id: playerId,
        from_team_id: record.fromTeamExternalId
          ? (teamsByExternal.get(record.fromTeamExternalId) ?? null)
          : null,
        to_team_id: record.toTeamExternalId
          ? (teamsByExternal.get(record.toTeamExternalId) ?? null)
          : null,
        transfer_type: type.includes("loan")
          ? "loan"
          : type.includes("free")
            ? "free"
            : "permanent",
        fee_text: record.transferType,
        status: "confirmed",
        reliability_score: 85,
        transfer_date: record.transferDate,
        provider: adapter.name,
        provider_external_id: record.externalId,
        raw_metadata: record.rawMetadata,
      },
    ];
  });
  if (!rows.length) return;
  const { error } = await admin()
    .from("transfers")
    .upsert(rows, { onConflict: "provider,provider_external_id" });
  if (error)
    throw new ProviderError(
      `Không thể lưu chuyển nhượng API-Football (${error.code ?? "database_error"}: ${error.message}).`,
      "supabase",
      false,
    );
  summary.updated += rows.length;
}

async function syncOneTeamTransfers(
  adapter: SportsSyncAdapter,
  competitionIds: string[] | undefined,
  summary: SportsSyncSummary,
) {
  if (!adapter.getTransfers)
    throw new ConfigurationError(
      `${adapter.name} không hỗ trợ chuyển nhượng.`,
      adapter.name,
    );
  const competitions = await selectedCompetitions(
    adapter.name,
    competitionIds,
  );
  const competition = competitions[0];
  if (!competition) return;
  const teamMappings = await mappings(adapter.name, "team");
  const candidates = [...teamMappings.values()]
    .filter((mapping) => mapping.season === competition.externalId)
    .sort((a, b) => a.external_id.localeCompare(b.external_id));
  if (!candidates.length) return;
  const dayBucket = Math.floor(Date.now() / (24 * 60 * 60_000));
  const team = candidates[dayBucket % candidates.length];
  const records = await adapter.getTransfers(team.external_id);
  summary.fetched = records.length;
  summary.competitions.push(competition.externalId);
  if (!summary.dryRun) await persistTransfers(adapter, records, summary);
}

async function writeSyncState(
  provider: SportsProviderName,
  capability: SportsCapability,
  competitionId: string | null,
  success: boolean,
  message?: string,
) {
  const now = new Date().toISOString();
  const { error } = await admin()
    .from("provider_sync_state")
    .upsert(
      {
        provider,
        capability,
        competition_id: competitionId,
        season: "",
        last_attempt_at: now,
        last_success_at: success ? now : null,
        last_error_code: success ? null : "SYNC_FAILED",
        last_error_message: success ? null : message?.slice(0, 500),
        next_sync_at: new Date(
          Date.now() +
            (capability === "live_score" ? 5 * 60_000 : 6 * 60 * 60_000),
        ).toISOString(),
        cursor: {},
      },
      { onConflict: "provider,capability,competition_id,season" },
    );
  if (error)
    logger.warn("sports_sync_state_failed", {
      provider,
      capability,
      code: "SUPABASE_WRITE",
    });
}

export async function syncSports(
  command: SportsSyncCommand,
  options: {
    provider?: SportsProviderName;
    competitionIds?: string[];
    date?: string;
    dryRun?: boolean;
  } = {},
): Promise<SportsSyncSummary> {
  const provider = options.provider ?? configuredSportsAdapters()[0]?.name;
  if (!provider)
    throw new ConfigurationError(
      "Chưa có sports provider nào được cấu hình.",
      "sports",
    );
  const adapter = selectAdapter(provider);
  const jobId = randomUUID();
  const summary: SportsSyncSummary = {
    jobId,
    provider,
    command,
    dryRun: Boolean(options.dryRun),
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    competitions: [],
    errors: [],
  };
  let jobRowCreated = false;
  if (!summary.dryRun) {
    const { error } = await admin()
      .from("ingestion_jobs")
      .insert({
        id: jobId,
        job_type: `sports:${command}`,
        provider,
        status: "processing",
        metadata: { competitionIds: options.competitionIds ?? [] },
      });
    if (error)
      throw new ProviderError("Không thể tạo sports sync job.", "supabase");
    jobRowCreated = true;
  }
  try {
    if (command === "competitions") {
      const records = await adapter.discoverCompetitions();
      summary.fetched = records.length;
      summary.competitions = records.map((item) => item.externalId);
      if (!summary.dryRun) await persistCompetitions(adapter, records, summary);
    } else if (command === "details") {
      await syncOneMatchDetails(adapter, summary);
    } else if (command === "transfers") {
      await syncOneTeamTransfers(adapter, options.competitionIds, summary);
    } else if (command === "daily") {
      if (!adapter.getDailyMatches)
        throw new ConfigurationError(
          `${adapter.name} không hỗ trợ đồng bộ theo ngày.`,
          adapter.name,
        );
      const date = options.date ?? new Date().toISOString().slice(0, 10);
      const bundle = await adapter.getDailyMatches(date);
      const competitions = await selectedCompetitions(provider);
      summary.fetched = bundle.matches.length + bundle.teams.length;
      for (const competition of competitions) {
        const teams = bundle.teams.filter(
          (team) => team.competitionExternalId === competition.externalId,
        );
        const matches = bundle.matches.filter(
          (match) =>
            match.competitionExternalId === competition.externalId,
        );
        if (!teams.length && !matches.length) continue;
        summary.competitions.push(competition.externalId);
        if (!summary.dryRun) {
          await persistTeams(adapter, competition, teams, summary);
          await persistMatches(adapter, competition, matches, summary);
          await writeSyncState(
            provider,
            "fixtures",
            competition.id,
            true,
          );
          await writeSyncState(
            provider,
            "results",
            competition.id,
            true,
          );
        }
      }
    } else if (
      command === "live" &&
      adapter.getLiveMatches &&
      !options.competitionIds?.length
    ) {
      const competitions = await selectedCompetitions(provider);
      const records = await adapter.getLiveMatches();
      summary.fetched = records.length;
      for (const competition of competitions) {
        const competitionRecords = records.filter(
          (record) =>
            record.competitionExternalId === competition.externalId,
        );
        if (!competitionRecords.length) continue;
        summary.competitions.push(competition.externalId);
        if (!summary.dryRun)
          await persistMatches(
            adapter,
            competition,
            competitionRecords,
            summary,
          );
        if (!summary.dryRun)
          await writeSyncState(
            provider,
            "live_score",
            competition.id,
            true,
          );
      }
    } else {
      const competitions = await selectedCompetitions(
        provider,
        options.competitionIds,
      );
      if (!competitions.length)
        throw new NotFoundError(
          "Không tìm thấy giải đã map khớp cấu hình hiện tại.",
        );
      for (const competition of competitions) {
        summary.competitions.push(competition.externalId);
        try {
          if (command === "teams") {
            const records = await adapter.getTeams(
              competition.externalId,
              competition.current_season ?? undefined,
            );
            summary.fetched += records.length;
            if (!summary.dryRun)
              await persistTeams(adapter, competition, records, summary);
          } else if (command === "standings") {
            const records = await adapter.getStandings(
              competition.externalId,
              competition.current_season ?? undefined,
            );
            summary.fetched += records.length;
            if (!summary.dryRun)
              await persistStandings(adapter, competition, records, summary);
          } else {
            const records = await adapter.getMatches(
              competition.externalId,
              sportsMatchQueryOptions(command, competition.current_season),
            );
            const filtered =
              command === "live"
                ? records.filter(
                    (item) =>
                      item.status === "live" ||
                      item.status === "paused" ||
                      (item.status === "finished" &&
                        Date.now() - Date.parse(item.kickoffAt) <=
                          6 * 60 * 60_000),
                  )
                : command === "results"
                  ? records.filter((item) => item.status === "finished")
                  : command === "matches"
                    ? records
                  : records.filter((item) =>
                      ["scheduled", "postponed", "cancelled"].includes(
                        item.status,
                      ),
                    );
            summary.fetched += records.length;
            summary.skipped += records.length - filtered.length;
            if (!summary.dryRun)
              await persistMatches(adapter, competition, filtered, summary);
          }
          const capabilities: SportsCapability[] =
            command === "live"
              ? ["live_score"]
              : command === "teams"
                ? ["logos"]
                : command === "matches"
                  ? ["fixtures", "results"]
                  : [command];
          if (!summary.dryRun) {
            for (const capability of capabilities)
              await writeSyncState(
                provider,
                capability,
                competition.id,
                true,
              );
          }
        } catch (error) {
          const safe = toSafeError(error);
          const capabilities: SportsCapability[] =
            command === "live"
              ? ["live_score"]
              : command === "teams"
                ? ["logos"]
                : command === "matches"
                  ? ["fixtures", "results"]
                  : [command];
          summary.errors.push(`${competition.externalId}: ${safe.message}`);
          if (!summary.dryRun) {
            for (const capability of capabilities)
              await writeSyncState(
                provider,
                capability,
                competition.id,
                false,
                safe.message,
              );
          }
        }
      }
    }
    if (jobRowCreated)
      await admin()
        .from("ingestion_jobs")
        .update({
          status: summary.errors.length ? "failed" : "completed",
          fetched_count: summary.fetched,
          inserted_count: summary.inserted,
          updated_count: summary.updated,
          skipped_count: summary.skipped,
          error_code: summary.errors.length ? "PARTIAL_FAILURE" : null,
          error_message: summary.errors.join("; ").slice(0, 1000) || null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    return summary;
  } catch (error) {
    const safe = toSafeError(error);
    if (jobRowCreated)
      await admin()
        .from("ingestion_jobs")
        .update({
          status: "failed",
          error_code: safe.code,
          error_message: safe.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    throw error;
  }
}

export async function sportsCoverage() {
  const client = admin();
  const [capabilities, configs, syncStates, competitions] = await Promise.all([
    client
      .from("provider_capabilities")
      .select("provider,capability,supported,verified_at,notes")
      .order("provider"),
    client
      .from("competition_provider_config")
      .select(
        "competition_id,capability,primary_provider,fallback_providers,active",
      ),
    client
      .from("provider_sync_state")
      .select(
        "provider,capability,competition_id,last_success_at,last_error_code,next_sync_at",
      ),
    client
      .from("competitions")
      .select("id,name,slug,country,current_season,is_active")
      .order("name"),
  ]);
  const error =
    capabilities.error ??
    configs.error ??
    syncStates.error ??
    competitions.error;
  if (error)
    throw new ProviderError(
      "Không thể tạo báo cáo sports coverage.",
      "supabase",
    );
  return {
    generatedAt: new Date().toISOString(),
    configuredAdapters: getSportsAdapterDescriptors(),
    capabilities: capabilities.data ?? [],
    competitionConfigs: configs.data ?? [],
    syncStates: syncStates.data ?? [],
    competitions: competitions.data ?? [],
  };
}
