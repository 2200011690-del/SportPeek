import { randomUUID } from "node:crypto";
import {
  ConfigurationError,
  NotFoundError,
  ProviderError,
  toSafeError,
} from "@/lib/core/errors";
import { logger } from "@/lib/core/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  configuredSportsAdapters,
  getSportsAdapterDescriptors,
  getSportsSyncAdapters,
  type SportsSyncAdapter,
} from "./adapters";
import type {
  NormalizedCompetition,
  NormalizedMatch,
  NormalizedStanding,
  NormalizedTeam,
  SportsCapability,
  SportsProviderName,
} from "./models";

export type SportsSyncCommand =
  "competitions" | "teams" | "fixtures" | "results" | "standings" | "live";
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
  entityType: "competition" | "team" | "match",
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
  entityType: "competition" | "team" | "match",
  rows: Array<{
    internalId: string;
    externalId: string;
    season: string;
    metadata: Record<string, unknown>;
  }>,
) {
  if (!rows.length) return;
  const { error } = await admin()
    .from("provider_entity_mappings")
    .upsert(
      rows.map((row) => ({
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
    is_active: true,
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
            is_active: true,
          })),
          { onConflict: "slug" },
        )
        .select("id,slug")
    : { data: [], error: null };
  if (upsertError)
    throw new ProviderError(
      "Không thể lưu hàng loạt giải đấu.",
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
    if (!internalId) return [];
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
        ignoreDuplicates: true,
      });
    if (error)
      summary.errors.push("competition provider config: bulk upsert failed");
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
      ? (process.env.FOOTBALL_DATA_COMPETITIONS ?? "PL,CL,PD,SA,BL1")
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
    resolved.push({ record, payload, mappedId: mapped?.internal_id });
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
            const from = new Date();
            from.setUTCDate(
              from.getUTCDate() - (command === "results" ? 14 : 1),
            );
            const to = new Date();
            to.setUTCDate(to.getUTCDate() + (command === "fixtures" ? 30 : 1));
            const records = await adapter.getMatches(competition.externalId, {
              dateFrom: from.toISOString().slice(0, 10),
              dateTo: to.toISOString().slice(0, 10),
              season: competition.current_season ?? undefined,
            });
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
          const capability: SportsCapability =
            command === "live"
              ? "live_score"
              : command === "teams"
                ? "logos"
                : command;
          if (!summary.dryRun)
            await writeSyncState(provider, capability, competition.id, true);
        } catch (error) {
          const safe = toSafeError(error);
          const capability: SportsCapability =
            command === "live"
              ? "live_score"
              : command === "teams"
                ? "logos"
                : command;
          summary.errors.push(`${competition.externalId}: ${safe.message}`);
          if (!summary.dryRun)
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
