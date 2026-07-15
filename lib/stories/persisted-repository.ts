import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { logger } from "@/lib/core/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NewsAIStatus } from "@/lib/ingestion/official-feed";
import { storyClusterSchema, type RawArticle, type StoryCluster, type StoryDetailPayload } from "./schema";
import type { StoryRepositoryResult } from "./repository";

export type PersistedStorySnapshot = { stories: StoryCluster[]; lastSyncAt: string | null; sources: string[]; aiStatus: NewsAIStatus };
export type PersistedStoryLoader = () => Promise<PersistedStorySnapshot>;
export type StoryArchivePage = { stories: StoryCluster[]; page: number; pageSize: number; total: number; totalPages: number };
type PersistedStoryAccess = {
  findBySlug?: (slug: string) => Promise<StoryCluster | null>;
  findById?: (id: string) => Promise<StoryCluster | null>;
  readArchive?: (page: number, pageSize: number) => Promise<StoryArchivePage>;
};
type PersistedAIProvider = Exclude<NewsAIStatus["provider"], "off">;

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
  const terms = new Set([...current.teams, ...current.players, current.competition ?? ""].map((value) => value.toLowerCase()).filter(Boolean));
  return stories.filter((story) => story.id !== current.id).map((story) => ({ story, score: [...terms].filter((term) => `${story.title} ${story.summary} ${story.teams.join(" ")} ${story.players.join(" ")}`.toLowerCase().includes(term)).length })).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || (right.story.hotnessScore ?? 0) - (left.story.hotnessScore ?? 0)).slice(0, limit).map((item) => item.story);
}

export const loadPersistedStories: PersistedStoryLoader = async () => {
  const client = createAdminClient();
  if (!client) throw new ConfigurationError("Supabase story cache chưa được cấu hình.", "supabase");
  const [clusters, job] = await Promise.all([
    client.from("story_clusters").select("id,payload,last_updated_at,ai_generated,ai_provider").order("last_updated_at", { ascending: false }).limit(100),
    client.from("ingestion_jobs").select("completed_at").eq("job_type", "stories:process").eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (clusters.error || job.error) throw new ProviderError("Không thể đọc story cache.", "supabase");
  const stories = (clusters.data ?? []).flatMap((row): StoryCluster[] => {
    const parsed = storyClusterSchema.safeParse(row.payload);
    if (!parsed.success) { logger.warn("persisted_story_schema_rejected", { code: "VALIDATION_ERROR", storyId: row.id }); return []; }
    return [parsed.data];
  });
  return {
    stories,
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

function storyFromPayload(payload: unknown): StoryCluster | null {
  const parsed = storyClusterSchema.safeParse(payload);
  return parsed.success ? restoreOriginalStoryLanguage(parsed.data) : null;
}

async function findPersistedStory(column: "slug" | "id", value: string): Promise<StoryCluster | null> {
  const { data, error } = await persistedClient().from("story_clusters").select("payload").eq(column, value).limit(1);
  if (error) throw new ProviderError("Không thể đọc bài viết trong kho lưu trữ.", "supabase");
  return data?.[0] ? storyFromPayload(data[0].payload) : null;
}

export const loadPersistedStoryBySlug = (slug: string) => findPersistedStory("slug", slug);
export const loadPersistedStoryById = (id: string) => findPersistedStory("id", id);

export async function loadPersistedStoryArchive(page: number, pageSize: number): Promise<StoryArchivePage> {
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(48, Math.max(1, Math.floor(pageSize)));
  const from = (safePage - 1) * safePageSize;
  const { data, error, count } = await persistedClient().from("story_clusters")
    .select("payload", { count: "exact" })
    .order("last_updated_at", { ascending: false })
    .range(from, from + safePageSize - 1);
  if (error) throw new ProviderError("Không thể đọc kho tin cũ.", "supabase");
  const stories = (data ?? []).flatMap((row): StoryCluster[] => {
    const story = storyFromPayload(row.payload);
    return story ? [story] : [];
  });
  const total = count ?? from + stories.length;
  return { stories, page: safePage, pageSize: safePageSize, total, totalPages: Math.max(1, Math.ceil(total / safePageSize)) };
}

export function createPersistedStoryRepository(loader: PersistedStoryLoader = loadPersistedStories, access: PersistedStoryAccess = {}) {
  const findBySlug = access.findBySlug ?? (async (slug: string) => (await loader()).stories.find((story) => story.slug === slug || story.legacySlugs.includes(slug)) ?? null);
  const findById = access.findById ?? (async (id: string) => (await loader()).stories.find((story) => story.id === id) ?? null);
  const readArchive = access.readArchive ?? (async (page: number, pageSize: number) => {
    const stories = (await loader()).stories.map(restoreOriginalStoryLanguage);
    const safePage = Math.max(1, Math.floor(page)); const safePageSize = Math.max(1, Math.floor(pageSize)); const from = (safePage - 1) * safePageSize;
    return { stories: stories.slice(from, from + safePageSize), page: safePage, pageSize: safePageSize, total: stories.length, totalPages: Math.max(1, Math.ceil(stories.length / safePageSize)) };
  });
  const load = async (): Promise<StoryRepositoryResult<StoryCluster[]>> => {
    try {
      const snapshot = await loader(); const stale = Boolean(snapshot.lastSyncAt && Date.now() - Date.parse(snapshot.lastSyncAt) > 60 * 60_000);
      const stories = snapshot.stories.map(restoreOriginalStoryLanguage);
      return { status: stories.length ? stale ? "stale" : "success" : "empty", data: stories, meta: { source: "supabase", cached: true, stale, lastUpdatedAt: snapshot.lastSyncAt }, diagnostics: { sources: snapshot.sources, aiTranslation: stories.some((story) => story.aiGenerated), aiStatus: snapshot.aiStatus } };
    } catch (error) {
      if (error instanceof ConfigurationError) return { status: "configuration_required", data: null, meta: { source: "supabase", cached: false, stale: false, lastUpdatedAt: null }, error: { code: error.code, message: error.message } };
      return { status: "error", data: null, meta: { source: "supabase", cached: false, stale: false, lastUpdatedAt: null }, error: { code: "STORY_CACHE_UNAVAILABLE", message: "Không thể đọc kho tin đã xử lý." } };
    }
  };
  const getStoryFeed = () => load();
  const getLatestStories = async (limit = 60) => { const result = await load(); return { ...result, data: result.data?.slice(0, Math.max(0, limit)) ?? result.data }; };
  const getStoryBySlug = async (slug: string): Promise<StoryRepositoryResult<StoryDetailPayload>> => { const result = await load(); if (!result.data) return { ...result, data: null }; const recent = result.data.find((item) => item.slug === slug || item.legacySlugs.includes(slug)); const story = recent ?? await findBySlug(slug); return story ? { status: result.status === "stale" ? "stale" : "success", data: { story, relatedStories: relatedStories(result.data, story) }, meta: { ...result.meta, canonicalSlug: story.slug } } : { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }; };
  const getStoryById = async (id: string): Promise<StoryRepositoryResult<StoryCluster>> => { const result = await load(); if (!result.data) return { ...result, data: null }; const recent = result.data.find((item) => item.id === id); const story = recent ?? await findById(id); return story ? { ...result, data: story } : { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }; };
  const getStorySources = async (id: string): Promise<StoryRepositoryResult<RawArticle[]>> => { const result = await getStoryById(id); return { ...result, data: result.data?.articles ?? null }; };
  const getRelatedStories = async (id: string, limit = 4): Promise<StoryRepositoryResult<StoryCluster[]>> => { const result = await load(); if (!result.data) return { ...result, data: null }; const story = result.data.find((item) => item.id === id); return story ? { ...result, data: relatedStories(result.data, story, limit) } : { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }; };
  const getStoryArchive = async (page = 1, pageSize = 12): Promise<StoryRepositoryResult<StoryArchivePage>> => {
    try {
      const archive = await readArchive(page, pageSize);
      return { status: archive.stories.length ? "success" : "empty", data: archive, meta: { source: "supabase", cached: true, stale: false, lastUpdatedAt: archive.stories[0]?.updatedAt ?? null } };
    } catch (error) {
      if (error instanceof ConfigurationError) return { status: "configuration_required", data: null, meta: { source: "supabase", cached: false, stale: false, lastUpdatedAt: null }, error: { code: error.code, message: error.message } };
      return { status: "error", data: null, meta: { source: "supabase", cached: false, stale: false, lastUpdatedAt: null }, error: { code: "STORY_ARCHIVE_UNAVAILABLE", message: "Không thể đọc kho tin cũ." } };
    }
  };
  return { getStoryFeed, getLatestStories, getStoryBySlug, getStoryById, getStorySources, getRelatedStories, getStoryArchive };
}
