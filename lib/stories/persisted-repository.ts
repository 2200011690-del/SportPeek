import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { logger } from "@/lib/core/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NewsAIStatus } from "@/lib/ingestion/official-feed";
import { storyClusterSchema, type RawArticle, type StoryCluster, type StoryDetailPayload } from "./schema";
import type { StoryRepositoryResult } from "./repository";

export type PersistedStorySnapshot = { stories: StoryCluster[]; lastSyncAt: string | null; sources: string[]; aiStatus: NewsAIStatus };
export type PersistedStoryLoader = () => Promise<PersistedStorySnapshot>;

function relatedStories(stories: StoryCluster[], current: StoryCluster, limit = 4): StoryCluster[] {
  const terms = new Set([...current.teams, ...current.players, current.competition ?? ""].map((value) => value.toLowerCase()).filter(Boolean));
  return stories.filter((story) => story.id !== current.id).map((story) => ({ story, score: [...terms].filter((term) => `${story.title} ${story.summary} ${story.teams.join(" ")} ${story.players.join(" ")}`.toLowerCase().includes(term)).length })).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || (right.story.hotnessScore ?? 0) - (left.story.hotnessScore ?? 0)).slice(0, limit).map((item) => item.story);
}

export const loadPersistedStories: PersistedStoryLoader = async () => {
  const client = createAdminClient();
  if (!client) throw new ConfigurationError("Supabase story cache chưa được cấu hình.", "supabase");
  const [clusters, job] = await Promise.all([
    client.from("story_clusters").select("id,payload,last_updated_at").order("last_updated_at", { ascending: false }).limit(100),
    client.from("ingestion_jobs").select("completed_at").in("job_type", ["rss:sync", "stories:process"]).eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (clusters.error || job.error) throw new ProviderError("Không thể đọc story cache.", "supabase");
  const stories = (clusters.data ?? []).flatMap((row): StoryCluster[] => {
    const parsed = storyClusterSchema.safeParse(row.payload);
    if (!parsed.success) { logger.warn("persisted_story_schema_rejected", { code: "VALIDATION_ERROR", storyId: row.id }); return []; }
    return [parsed.data];
  });
  return { stories, lastSyncAt: job.data?.completed_at ?? null, sources: [...new Set(stories.flatMap((story) => story.sourceNames))], aiStatus: { provider: "off", state: "off", translatedCount: 0 } };
};

export function createPersistedStoryRepository(loader: PersistedStoryLoader = loadPersistedStories) {
  const load = async (): Promise<StoryRepositoryResult<StoryCluster[]>> => {
    try {
      const snapshot = await loader(); const stale = Boolean(snapshot.lastSyncAt && Date.now() - Date.parse(snapshot.lastSyncAt) > 60 * 60_000);
      return { status: snapshot.stories.length ? stale ? "stale" : "success" : "empty", data: snapshot.stories, meta: { source: "supabase", cached: true, stale, lastUpdatedAt: snapshot.lastSyncAt }, diagnostics: { sources: snapshot.sources, aiTranslation: snapshot.stories.some((story) => story.aiGenerated), aiStatus: snapshot.aiStatus } };
    } catch (error) {
      if (error instanceof ConfigurationError) return { status: "configuration_required", data: null, meta: { source: "supabase", cached: false, stale: false, lastUpdatedAt: null }, error: { code: error.code, message: error.message } };
      return { status: "error", data: null, meta: { source: "supabase", cached: false, stale: false, lastUpdatedAt: null }, error: { code: "STORY_CACHE_UNAVAILABLE", message: "Không thể đọc kho tin đã xử lý." } };
    }
  };
  const getStoryFeed = () => load();
  const getLatestStories = async (limit = 60) => { const result = await load(); return { ...result, data: result.data?.slice(0, Math.max(0, limit)) ?? result.data }; };
  const getStoryBySlug = async (slug: string): Promise<StoryRepositoryResult<StoryDetailPayload>> => { const result = await load(); if (!result.data) return { ...result, data: null }; const story = result.data.find((item) => item.slug === slug || item.legacySlugs.includes(slug)); return story ? { status: result.status === "stale" ? "stale" : "success", data: { story, relatedStories: relatedStories(result.data, story) }, meta: { ...result.meta, canonicalSlug: story.slug } } : { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }; };
  const getStoryById = async (id: string): Promise<StoryRepositoryResult<StoryCluster>> => { const result = await load(); if (!result.data) return { ...result, data: null }; const story = result.data.find((item) => item.id === id); return story ? { ...result, data: story } : { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }; };
  const getStorySources = async (id: string): Promise<StoryRepositoryResult<RawArticle[]>> => { const result = await getStoryById(id); return { ...result, data: result.data?.articles ?? null }; };
  const getRelatedStories = async (id: string, limit = 4): Promise<StoryRepositoryResult<StoryCluster[]>> => { const result = await load(); if (!result.data) return { ...result, data: null }; const story = result.data.find((item) => item.id === id); return story ? { ...result, data: relatedStories(result.data, story, limit) } : { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }; };
  return { getStoryFeed, getLatestStories, getStoryBySlug, getStoryById, getStorySources, getRelatedStories };
}
