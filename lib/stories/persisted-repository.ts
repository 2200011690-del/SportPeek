import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { logger } from "@/lib/core/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSearchText } from "@/lib/ui-logic";
import type { NewsAIStatus } from "@/lib/ingestion/official-feed";
import { deriveEventImportance, dynamicStoryHotness, eventHalfLifeHours } from "@/lib/scoring";
import { storyEventType } from "./clustering";
import { storyClusterSchema, type RawArticle, type StoryCluster, type StoryDetailPayload } from "./schema";
import type { StoryRepositoryResult } from "./repository-types";

export type PersistedStorySnapshot = { stories: StoryCluster[]; lastSyncAt: string | null; sources: string[]; aiStatus: NewsAIStatus };
export type PersistedStoryLoader = () => Promise<PersistedStorySnapshot>;
export type StoryArchivePage = { stories: StoryCluster[]; page: number; pageSize: number; total: number; totalPages: number };
export type StoryArchiveFilters = { query?: string; category?: string; source?: string; minHotness?: number };
export type StorySitemapEntry = { slug: string; publishedAt: string; lastMaterialUpdateAt: string };
type PersistedStoryAccess = {
  findBySlug?: (slug: string) => Promise<StoryCluster | null>;
  findById?: (id: string) => Promise<StoryCluster | null>;
  readArchive?: (page: number, pageSize: number, filters?: StoryArchiveFilters) => Promise<StoryArchivePage>;
};
type PersistedAIProvider = Exclude<NewsAIStatus["provider"], "off">;
type PersistedStoryRow = {
  id?: string;
  slug?: string;
  payload: unknown;
  first_published_at?: string | null;
  last_material_update_at?: string | null;
  last_source_seen_at?: string | null;
  last_updated_at?: string | null;
  lifecycle_status?: StoryCluster["lifecycleStatus"] | null;
  summary_version?: number | null;
  summary_generated_at?: string | null;
  ai_generated?: boolean;
  ai_provider?: string | null;
};

const FRESH_STORY_COLUMNS = "id,slug,payload,first_published_at,last_material_update_at,last_source_seen_at,last_updated_at,lifecycle_status,summary_version,summary_generated_at,ai_generated,ai_provider";
const LEGACY_STORY_COLUMNS = "id,slug,payload,first_published_at,last_updated_at,ai_generated,ai_provider";

function validTimestamp(value: string | null | undefined, fallback: string): string {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

/** Public so feed policies can be tested without coupling them to Supabase. */
export function storyMaterialTimestamp(story: StoryCluster): string {
  const firstPublishedAt = story.firstPublishedAt ?? story.publishedAt;
  const materialUpdateAt = story.lastMaterialUpdateAt ?? firstPublishedAt;
  return Date.parse(materialUpdateAt) >= Date.parse(firstPublishedAt) ? materialUpdateAt : firstPublishedAt;
}

export function sortStoriesByMaterialFreshness(stories: StoryCluster[]): StoryCluster[] {
  return stories.slice().sort((left, right) =>
    Date.parse(storyMaterialTimestamp(right)) - Date.parse(storyMaterialTimestamp(left))
    || Date.parse(right.publishedAt) - Date.parse(left.publishedAt)
    || left.id.localeCompare(right.id),
  );
}

/** Stored scores are snapshots. Re-apply time decay whenever a feed is read. */
export function refreshStoryHotness(story: StoryCluster, now = Date.now()): StoryCluster {
  const eventType = storyEventType(`${story.title} ${story.summary}`);
  const hotnessScore = dynamicStoryHotness({
    publishedAt: story.firstPublishedAt ?? story.publishedAt,
    lastMaterialUpdateAt: storyMaterialTimestamp(story),
    now,
    sourceCount: story.sourceCount,
    averageSourceReliability: story.reliabilityScore ?? 50,
    eventImportance: deriveEventImportance(story.title, eventType, story.hasOfficialSource),
    halfLifeHours: eventHalfLifeHours(eventType),
    verified: story.hasOfficialSource || story.sourceCount >= 2,
  });
  return hotnessScore === story.hotnessScore ? story : { ...story, hotnessScore };
}

function hydratePersistenceMetadata(story: StoryCluster, row: PersistedStoryRow): StoryCluster {
  const firstPublishedAt = validTimestamp(row.first_published_at, story.publishedAt);
  // Legacy deployments deliberately fall back to first publication, not
  // last_updated_at: the latter is also advanced by repeated source coverage.
  const lastMaterialUpdateAt = validTimestamp(row.last_material_update_at, firstPublishedAt);
  const lastSourceSeenAt = validTimestamp(row.last_source_seen_at ?? row.last_updated_at, story.updatedAt);
  const persistedSummaryGeneratedAt = row.summary_generated_at ?? story.summaryGeneratedAt;
  return {
    ...story,
    firstPublishedAt,
    lastMaterialUpdateAt,
    lastSourceSeenAt,
    lifecycleStatus: row.lifecycle_status ?? story.lifecycleStatus,
    summaryVersion: row.summary_version ?? story.summaryVersion,
    summaryGeneratedAt: persistedSummaryGeneratedAt
      ? validTimestamp(persistedSummaryGeneratedAt, firstPublishedAt)
      : persistedSummaryGeneratedAt,
  };
}

function isFreshnessSchemaMissing(error: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return ["last_material_update_at", "last_source_seen_at", "lifecycle_status", "summary_version", "summary_generated_at"]
    .some((column) => text.includes(column))
    || ((error.code === "42703" || error.code === "PGRST204") && text.includes("story_clusters"));
}

async function readLatestStoryRows(limit: number): Promise<{ data: PersistedStoryRow[] | null; error: { code?: string; message?: string; details?: string } | null }> {
  const client = persistedClient();
  const fresh = await client.from("story_clusters").select(FRESH_STORY_COLUMNS)
    .order("last_material_update_at", { ascending: false })
    .order("first_published_at", { ascending: false })
    .limit(limit);
  if (!fresh.error) return fresh as unknown as { data: PersistedStoryRow[]; error: null };
  if (!isFreshnessSchemaMissing(fresh.error)) return fresh as unknown as { data: null; error: typeof fresh.error };
  const legacy = await client.from("story_clusters").select(LEGACY_STORY_COLUMNS)
    .order("first_published_at", { ascending: false })
    .limit(limit);
  return legacy as unknown as { data: PersistedStoryRow[] | null; error: typeof legacy.error };
}

export function restoreOriginalStoryLanguage(story: StoryCluster): StoryCluster {
  const originalLanguage = story.articles[0]?.language ?? story.language;
  return originalLanguage === story.language ? story : { ...story, language: originalLanguage };
}

function isPersistedAIProvider(provider: string | null | undefined): provider is PersistedAIProvider {
  return provider === "cloudflare" || provider === "openai" || provider === "gemini" || provider === "groq";
}

export function derivePersistedAIStatus(
  stories: Array<Pick<StoryCluster, "aiGenerated">>,
  recordedProviders: Array<string | null | undefined>,
  configuredProvider = process.env.AI_PROVIDER,
): NewsAIStatus {
  const translatedCount = stories.filter((story) => story.aiGenerated).length;
  const actual = recordedProviders.find(isPersistedAIProvider);
  const chainProvider = process.env.AI_PROVIDER_CHAIN?.split(",").map((provider) => provider.trim().toLowerCase()).find(isPersistedAIProvider);
  const configured = configuredProvider === "failover" ? chainProvider ?? null : isPersistedAIProvider(configuredProvider) ? configuredProvider : null;
  const provider = actual ?? configured ?? "off";
  return { provider, state: provider === "off" ? "off" : translatedCount > 0 ? "ok" : "error", translatedCount };
}

function relatedStories(stories: StoryCluster[], current: StoryCluster, limit = 4): StoryCluster[] {
  const terms = new Set([current.category, ...current.sourceNames, ...current.title.split(/[:\-–—]/).slice(0, 2)].map((value) => value.toLowerCase()).filter(Boolean));
  return stories.filter((story) => story.id !== current.id).map((story) => ({ story, score: [...terms].filter((term) => `${story.title} ${story.summary} ${story.category} ${story.sourceNames.join(" ")}`.toLowerCase().includes(term)).length })).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || (right.story.hotnessScore ?? 0) - (left.story.hotnessScore ?? 0)).slice(0, limit).map((item) => item.story);
}

export const loadPersistedStories: PersistedStoryLoader = async () => {
  const client = createAdminClient();
  if (!client) throw new ConfigurationError("Supabase story cache chưa được cấu hình.", "supabase");
  const [clusters, job] = await Promise.all([
    readLatestStoryRows(100),
    client.from("ingestion_jobs").select("completed_at").eq("job_type", "stories:process").eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (clusters.error || job.error) throw new ProviderError("Không thể đọc story cache.", "supabase");
  const stories = (clusters.data ?? []).flatMap((row): StoryCluster[] => {
    const parsed = storyClusterSchema.safeParse(row.payload);
    if (!parsed.success) { logger.warn("persisted_story_schema_rejected", { code: "VALIDATION_ERROR", storyId: row.id }); return []; }
    return [refreshStoryHotness(hydratePersistenceMetadata(parsed.data, row))];
  });
  return {
    stories: sortStoriesByMaterialFreshness(stories),
    lastSyncAt: job.data?.completed_at ?? null,
    sources: [...new Set(stories.flatMap((story) => story.sourceNames))],
    aiStatus: derivePersistedAIStatus(stories, (clusters.data ?? []).map((row) => row.ai_provider)),
  };
};

function persistedClient() {
  const client = createAdminClient();
  if (!client) throw new ConfigurationError("Supabase story cache chưa được cấu hình.", "supabase");
  return client;
}

function storyFromRow(row: PersistedStoryRow): StoryCluster | null {
  const parsed = storyClusterSchema.safeParse(row.payload);
  return parsed.success ? refreshStoryHotness(restoreOriginalStoryLanguage(hydratePersistenceMetadata(parsed.data, row))) : null;
}

async function findPersistedStory(column: "slug" | "id", value: string): Promise<StoryCluster | null> {
  const client = persistedClient();
  const fresh = await client.from("story_clusters").select(FRESH_STORY_COLUMNS).eq(column, value).limit(1);
  const result = fresh.error && isFreshnessSchemaMissing(fresh.error)
    ? await client.from("story_clusters").select(LEGACY_STORY_COLUMNS).eq(column, value).limit(1)
    : fresh;
  if (result.error) throw new ProviderError("Không thể đọc bài viết trong kho lưu trữ.", "supabase");
  const row = result.data?.[0] as unknown as PersistedStoryRow | undefined;
  return row ? storyFromRow(row) : null;
}

export const loadPersistedStoryBySlug = (slug: string) => findPersistedStory("slug", slug);
export const loadPersistedStoryById = (id: string) => findPersistedStory("id", id);

export async function loadPersistedStoryArchive(page: number, pageSize: number, filters: StoryArchiveFilters = {}): Promise<StoryArchivePage> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(48, Math.max(1, Math.floor(pageSize)));
  const from = (safePage - 1) * safePageSize;
  const client = persistedClient();
  const queryTerm = filters.query?.trim().slice(0, 120);
  const normalizedQueryTerm = queryTerm ? normalizeSearchText(queryTerm) : "";
  const category = filters.category?.trim().slice(0, 160);
  const source = filters.source?.trim().slice(0, 160);
  const minHotness = Math.min(100, Math.max(0, Math.floor(filters.minHotness ?? 0)));
  
  let freshQuery = client.from("story_clusters").select(FRESH_STORY_COLUMNS, { count: "exact" });
  if (normalizedQueryTerm) freshQuery = freshQuery.ilike("search_text", `%${normalizedQueryTerm}%`);
  if (category) freshQuery = freshQuery.eq("category", category);
  if (source) freshQuery = freshQuery.contains("source_names", [source]);
  if (minHotness > 0) freshQuery = freshQuery.gte("hotness_score", minHotness);
  
  const fresh = await freshQuery
    .order("last_material_update_at", { ascending: false })
    .order("first_published_at", { ascending: false })
    .range(from, from + safePageSize - 1);
  let result = fresh as unknown as {
    data: unknown[] | null;
    error: { code?: string; message?: string; details?: string } | null;
    count: number | null;
  };
  if (fresh.error && isFreshnessSchemaMissing(fresh.error)) {
    const rawQueryTerm = queryTerm ? queryTerm.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim() : "";
    let legacyQuery = client.from("story_clusters").select(LEGACY_STORY_COLUMNS, { count: "exact" });
    if (rawQueryTerm) legacyQuery = legacyQuery.or(`title.ilike.%${rawQueryTerm}%,summary.ilike.%${rawQueryTerm}%`);
    if (category) legacyQuery = legacyQuery.eq("payload->>category", category);
    if (source) legacyQuery = legacyQuery.contains("payload->sourceNames", [source]);
    if (minHotness > 0) legacyQuery = legacyQuery.gte("hotness_score", minHotness);
    result = await legacyQuery
      .order("first_published_at", { ascending: false })
      .range(from, from + safePageSize - 1) as unknown as typeof result;
  }
  if (result.error) throw new ProviderError("Không thể đọc kho tin cũ.", "supabase");
  const stories = (result.data ?? []).flatMap((rawRow): StoryCluster[] => {
    const story = storyFromRow(rawRow as unknown as PersistedStoryRow);
    return story ? [story] : [];
  });
  const total = result.count ?? from + stories.length;
  return { stories: sortStoriesByMaterialFreshness(stories), page: safePage, pageSize: safePageSize, total, totalPages: Math.max(1, Math.ceil(total / safePageSize)) };
}

export async function loadPersistedStorySitemapEntries(limit = 1_000): Promise<StorySitemapEntry[]> {
  const client = persistedClient();
  const safeLimit = Math.min(10_000, Math.max(1, Math.floor(limit)));
  const fresh = await client.from("story_clusters")
    .select("slug,first_published_at,last_material_update_at")
    .order("last_material_update_at", { ascending: false })
    .limit(safeLimit);
  const result = fresh.error && isFreshnessSchemaMissing(fresh.error)
    ? await client.from("story_clusters")
      .select("slug,first_published_at")
      .order("first_published_at", { ascending: false })
      .limit(safeLimit)
    : fresh;
  if (result.error) throw new ProviderError("Không thể đọc danh sách tin cho sitemap.", "supabase");
  return (result.data ?? []).flatMap((raw): StorySitemapEntry[] => {
    const row = raw as unknown as { slug?: string; first_published_at?: string | null; last_material_update_at?: string | null };
    if (!row.slug || !row.first_published_at || Number.isNaN(Date.parse(row.first_published_at))) return [];
    return [{
      slug: row.slug,
      publishedAt: new Date(row.first_published_at).toISOString(),
      lastMaterialUpdateAt: validTimestamp(row.last_material_update_at, new Date(row.first_published_at).toISOString()),
    }];
  });
}

export function createPersistedStoryRepository(loader: PersistedStoryLoader = loadPersistedStories, access: PersistedStoryAccess = {}) {
  const findBySlug = access.findBySlug ?? (async (slug: string) => (await loader()).stories.find((story) => story.slug === slug || story.legacySlugs.includes(slug)) ?? null);
  const findById = access.findById ?? (async (id: string) => (await loader()).stories.find((story) => story.id === id) ?? null);
  const readArchive = access.readArchive ?? (async (page: number, pageSize: number, filters: StoryArchiveFilters = {}) => {
    const query = filters.query?.trim().toLocaleLowerCase("vi") ?? "";
    const category = filters.category?.trim().toLocaleLowerCase("vi") ?? "";
    const source = filters.source?.trim().toLocaleLowerCase("vi") ?? "";
    const stories = sortStoriesByMaterialFreshness((await loader()).stories.map(restoreOriginalStoryLanguage)).filter((story) =>
      (!query || `${story.title} ${story.summary} ${story.summaryLong}`.toLocaleLowerCase("vi").includes(query))
      && (!category || story.category.toLocaleLowerCase("vi") === category)
      && (!source || story.sourceNames.some((name) => name.toLocaleLowerCase("vi") === source))
      && (story.hotnessScore ?? 0) >= (filters.minHotness ?? 0),
    );
    const safePage = Math.max(1, Math.floor(page)); const safePageSize = Math.max(1, Math.floor(pageSize)); const from = (safePage - 1) * safePageSize;
    return { stories: stories.slice(from, from + safePageSize), page: safePage, pageSize: safePageSize, total: stories.length, totalPages: Math.max(1, Math.ceil(stories.length / safePageSize)) };
  });
  const load = async (): Promise<StoryRepositoryResult<StoryCluster[]>> => {
    try {
      const snapshot = await loader(); const stale = Boolean(snapshot.lastSyncAt && Date.now() - Date.parse(snapshot.lastSyncAt) > 60 * 60_000);
      const now = Date.now();
      const stories = sortStoriesByMaterialFreshness(snapshot.stories.map(restoreOriginalStoryLanguage).map((story) => refreshStoryHotness(story, now)));
      return { status: stories.length ? stale ? "stale" : "success" : "empty", data: stories, meta: { source: "supabase", cached: true, stale, lastUpdatedAt: snapshot.lastSyncAt }, diagnostics: { sources: snapshot.sources, aiTranslation: stories.some((story) => story.aiGenerated), aiStatus: snapshot.aiStatus } };
    } catch (error) {
      if (error instanceof ConfigurationError) return { status: "configuration_required", data: null, meta: { source: "supabase", cached: false, stale: false, lastUpdatedAt: null }, error: { code: error.code, message: error.message } };
      return { status: "error", data: null, meta: { source: "supabase", cached: false, stale: false, lastUpdatedAt: null }, error: { code: "STORY_CACHE_UNAVAILABLE", message: "Không thể đọc kho tin đã xử lý." } };
    }
  };
  const getStoryFeed = () => load();
  const getLatestStories = async (limit = 60) => { const result = await load(); return { ...result, data: result.data?.slice(0, Math.max(0, limit)) ?? result.data }; };
  const getStoryBySlug = async (slug: string): Promise<StoryRepositoryResult<StoryDetailPayload>> => { const result = await load(); if (!result.data) return { ...result, data: null }; const recent = result.data.find((item) => item.slug === slug || item.legacySlugs.includes(slug)); const story = recent ?? await findBySlug(slug); return story ? { status: result.status === "stale" ? "stale" : "success", data: { story, relatedStories: relatedStories(result.data, story), articleContents: [] }, meta: { ...result.meta, canonicalSlug: story.slug } } : { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }; };
  const getStoryById = async (id: string): Promise<StoryRepositoryResult<StoryCluster>> => { const result = await load(); if (!result.data) return { ...result, data: null }; const recent = result.data.find((item) => item.id === id); const story = recent ?? await findById(id); return story ? { ...result, data: story } : { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }; };
  const getStorySources = async (id: string): Promise<StoryRepositoryResult<RawArticle[]>> => { const result = await getStoryById(id); return { ...result, data: result.data?.articles ?? null }; };
  const getRelatedStories = async (id: string, limit = 4): Promise<StoryRepositoryResult<StoryCluster[]>> => { const result = await load(); if (!result.data) return { ...result, data: null }; const story = result.data.find((item) => item.id === id); return story ? { ...result, data: relatedStories(result.data, story, limit) } : { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }; };
  const getStoryArchive = async (page = 1, pageSize = 12, filters: StoryArchiveFilters = {}): Promise<StoryRepositoryResult<StoryArchivePage>> => {
    try {
      const archive = await readArchive(page, pageSize, filters);
      return { status: archive.stories.length ? "success" : "empty", data: archive, meta: { source: "supabase", cached: true, stale: false, lastUpdatedAt: archive.stories[0]?.updatedAt ?? null } };
    } catch (error) {
      if (error instanceof ConfigurationError) return { status: "configuration_required", data: null, meta: { source: "supabase", cached: false, stale: false, lastUpdatedAt: null }, error: { code: error.code, message: error.message } };
      return { status: "error", data: null, meta: { source: "supabase", cached: false, stale: false, lastUpdatedAt: null }, error: { code: "STORY_ARCHIVE_UNAVAILABLE", message: "Không thể đọc kho tin cũ." } };
    }
  };
  return { getStoryFeed, getLatestStories, getStoryBySlug, getStoryById, getStorySources, getRelatedStories, getStoryArchive };
}
