import { getAggregatedNews, type AggregatedNews } from "@/lib/ingestion/official-feed";
import type { NewsItem } from "@/lib/types";
import { normalizeSearchText } from "@/lib/ui-logic";
import { createStorySlug } from "./slug";
import {
  storyClusterSchema,
  type RawArticle,
  type StoryCluster,
  type StoryDetailPayload,
  type StoryResponseMeta,
} from "./schema";

export type StoryRepositoryStatus = "success" | "empty" | "not_found" | "stale" | "configuration_required" | "error";
export type StoryRepositoryResult<T> = {
  status: StoryRepositoryStatus;
  data: T | null;
  meta: StoryResponseMeta;
  error?: { code: string; message: string } | null;
  diagnostics?: Pick<AggregatedNews, "sources" | "aiTranslation" | "aiStatus">;
};

export type StoryNewsLoader = () => Promise<AggregatedNews>;

type RepositoryOptions = {
  provider?: string;
  source?: StoryResponseMeta["source"];
};

function sourceId(name: string): string {
  return normalizeSearchText(name).replace(/\s+/g, "-") || "unknown-source";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function inferStatus(item: NewsItem, articles: RawArticle[]): StoryCluster["status"] {
  const text = normalizeSearchText(`${item.title} ${item.summary}`);
  const independentSources = new Set(articles.map((article) => article.sourceId)).size;
  if (articles.some((article) => article.isOfficialSource)) return "official";
  if (/(tranh cai|phu nhan|mau thuan|disput|denied)/.test(text)) return "disputed";
  if (independentSources >= 2) return "corroborated";
  if (/(tin don|co the|duoc cho la|reportedly|rumou?r|could|may)/.test(text)) return "rumor";
  const ageHours = Math.max(0, (Date.now() - Date.parse(item.publishedTimestamp ?? "")) / 3_600_000);
  return ageHours <= 12 ? "developing" : "unverified";
}

function itemToStory(item: NewsItem): StoryCluster {
  const fetchedAt = new Date().toISOString();
  const publishedAt = !Number.isNaN(Date.parse(item.publishedTimestamp ?? ""))
    ? new Date(item.publishedTimestamp as string).toISOString()
    : fetchedAt;
  const details = item.sourceDetails?.length
    ? item.sourceDetails
    : item.originalUrl
      ? [{
          name: item.sources[0] ?? "Nguồn chưa xác định",
          url: item.originalUrl,
          reliability: item.reliability,
          language: item.originalLanguage ?? "vi" as const,
          excerpt: item.summary,
        }]
      : [];
  const seenUrls = new Set<string>();
  const articles = details.flatMap((detail, index): RawArticle[] => {
    if (seenUrls.has(detail.url)) return [];
    seenUrls.add(detail.url);
    const articlePublishedAt = !Number.isNaN(Date.parse(detail.publishedAt ?? ""))
      ? new Date(detail.publishedAt as string).toISOString()
      : publishedAt;
    return [{
      id: detail.articleId ?? `${item.id}-source-${index + 1}`,
      sourceId: sourceId(detail.name),
      sourceName: detail.name,
      sourceLogoUrl: detail.sourceLogoUrl ?? null,
      originalUrl: detail.url,
      canonicalUrl: detail.canonicalUrl ?? detail.url,
      title: detail.title ?? item.title,
      excerpt: detail.excerpt?.trim() || null,
      imageUrl: detail.imageUrl ?? (index === 0 ? item.imageUrl : undefined) ?? null,
      author: detail.author ?? null,
      publishedAt: articlePublishedAt,
      fetchedAt: !Number.isNaN(Date.parse(detail.fetchedAt ?? "")) ? new Date(detail.fetchedAt as string).toISOString() : fetchedAt,
      isOfficialSource: Boolean(detail.isOfficialSource),
      language: detail.language,
      processingStatus: "completed",
    }];
  });
  const canonicalSlug = createStorySlug(item.title, item.id);
  const sourceNames = unique(articles.map((article) => article.sourceName));
  const summaryParagraphs = unique([
    ...(item.readingBody ?? []),
    ...articles.map((article) => article.excerpt),
    item.summary,
  ]).map((value) => value.trim()).filter(Boolean);
  const summaryLong = (summaryParagraphs.length ? summaryParagraphs : [item.summary]).join("\n\n").slice(0, 12_000);
  const sourceArticleIds = articles.map((article) => article.id);
  const latestArticleTime = Math.max(...articles.map((article) => Date.parse(article.publishedAt)), Date.parse(publishedAt));
  const teams = unique([item.team]).filter((value) => !/^(bóng đá quốc tế|thể thao việt nam|thể thao)$/i.test(value));
  const competition = /^(bóng đá quốc tế|thể thao việt nam|thể thao)$/i.test(item.competition) ? null : item.competition;
  return storyClusterSchema.parse({
    id: item.id,
    slug: canonicalSlug,
    legacySlugs: unique([item.slug, item.id]).filter((value) => value !== canonicalSlug),
    title: item.title,
    summary: item.summary.trim() || summaryParagraphs[0] || item.title,
    summaryLong,
    category: item.category,
    language: item.originalLanguage ?? "vi",
    status: inferStatus(item, articles),
    sourceCount: sourceNames.length,
    sourceNames,
    officialSources: articles.filter((article) => article.isOfficialSource),
    hasOfficialSource: articles.some((article) => article.isOfficialSource),
    hotnessScore: Number.isFinite(item.hotness) ? item.hotness : null,
    reliabilityScore: Number.isFinite(item.reliability) ? item.reliability : null,
    publishedAt,
    updatedAt: new Date(latestArticleTime).toISOString(),
    imageUrl: item.imageUrl ?? articles.find((article) => article.imageUrl)?.imageUrl ?? null,
    agreedFacts: sourceNames.length >= 2
      ? item.keyPoints.filter(Boolean).map((text) => ({ text, sourceArticleIds })).slice(0, 6)
      : [],
    disputedPoints: [],
    timeline: articles
      .map((article) => ({ id: `timeline-${article.id}`, occurredAt: article.publishedAt, description: `${article.sourceName} đăng: ${article.title}`, sourceArticleIds: [article.id] }))
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt)),
    linkedMatch: null,
    competition,
    teams,
    players: [],
    articles,
    aiGenerated: Boolean(item.translatedByAI),
    reviewStatus: item.translatedByAI ? "auto" : "reviewed",
  });
}

function relatedStories(stories: StoryCluster[], current: StoryCluster, limit = 4): StoryCluster[] {
  const terms = unique([
    ...current.teams,
    ...current.players,
    current.competition,
    ...current.title.split(/[:\-–—]/).slice(0, 2),
  ]).map(normalizeSearchText).filter((term) => term.length >= 3);
  const currentArticleIds = new Set(current.articles.map((article) => article.id));
  return stories
    .filter((story) => story.id !== current.id && !story.articles.some((article) => currentArticleIds.has(article.id)))
    .map((story) => {
      const haystack = normalizeSearchText(`${story.title} ${story.summary} ${story.competition ?? ""} ${story.teams.join(" ")} ${story.players.join(" ")}`);
      return { story, score: terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0) };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || (right.story.hotnessScore ?? 0) - (left.story.hotnessScore ?? 0))
    .slice(0, limit)
    .map(({ story }) => story);
}

export function createStoryRepository(loader: StoryNewsLoader = getAggregatedNews, options: RepositoryOptions = {}) {
  const provider = options.provider ?? process.env.NEWS_PROVIDER?.trim().toLowerCase() ?? "aggregated-rss";
  const source = options.source ?? "aggregated-rss";
  const baseMeta = (): StoryResponseMeta => ({ source, cached: false, stale: false, lastUpdatedAt: null });

  const load = async (): Promise<StoryRepositoryResult<StoryCluster[]>> => {
    if (provider !== "aggregated-rss") {
      return {
        status: "configuration_required",
        data: null,
        meta: baseMeta(),
        error: { code: "NEWS_PROVIDER_NOT_CONFIGURED", message: "Nguồn tin thật chưa được cấu hình." },
      };
    }
    try {
      const aggregated = await loader();
      const meta: StoryResponseMeta = {
        source,
        cached: aggregated.cached,
        stale: aggregated.stale,
        lastUpdatedAt: aggregated.lastUpdatedAt,
      };
      const diagnostics = {
        sources: aggregated.sources,
        aiTranslation: aggregated.aiTranslation,
        aiStatus: aggregated.aiStatus,
      };
      const stories = aggregated.data.flatMap((item): StoryCluster[] => {
        try { return [itemToStory(item)]; }
        catch (error) {
          console.warn("story_schema_rejected", { id: item.id, error: error instanceof Error ? error.message : "invalid story" });
          return [];
        }
      });
      if (!stories.length) return { status: "empty", data: [], meta, diagnostics };
      return { status: aggregated.stale ? "stale" : "success", data: stories, meta, diagnostics };
    } catch (error) {
      console.error("story_repository_unavailable", error instanceof Error ? error.message : "unknown error");
      return {
        status: "error",
        data: null,
        meta: baseMeta(),
        error: { code: "STORY_SOURCE_UNAVAILABLE", message: "Không thể tải nguồn tin lúc này." },
      };
    }
  };

  const getStoryFeed = async (): Promise<StoryRepositoryResult<StoryCluster[]>> => load();
  const getLatestStories = async (limit = 60): Promise<StoryRepositoryResult<StoryCluster[]>> => {
    const result = await load();
    return { ...result, data: result.data?.slice(0, Math.max(0, limit)) ?? result.data };
  };
  const getStoryBySlug = async (slug: string): Promise<StoryRepositoryResult<StoryDetailPayload>> => {
    const result = await load();
    if (!result.data) return { ...result, data: null };
    const story = result.data.find((entry) => entry.slug === slug || entry.legacySlugs.includes(slug));
    if (!story) {
      return { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } };
    }
    return {
      status: result.status === "stale" ? "stale" : "success",
      data: { story, relatedStories: relatedStories(result.data, story) },
      meta: { ...result.meta, canonicalSlug: story.slug },
    };
  };
  const getStoryById = async (id: string): Promise<StoryRepositoryResult<StoryCluster>> => {
    const result = await load();
    if (!result.data) return { ...result, data: null };
    const story = result.data.find((entry) => entry.id === id);
    return story
      ? { ...result, data: story }
      : { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } };
  };
  const getStorySources = async (id: string): Promise<StoryRepositoryResult<RawArticle[]>> => {
    const result = await getStoryById(id);
    return { ...result, data: result.data?.articles ?? null };
  };
  const getRelatedStories = async (id: string, limit = 4): Promise<StoryRepositoryResult<StoryCluster[]>> => {
    const result = await load();
    if (!result.data) return { ...result, data: null };
    const story = result.data.find((entry) => entry.id === id);
    if (!story) return { status: "not_found", data: null, meta: result.meta, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } };
    return { ...result, data: relatedStories(result.data, story, limit) };
  };

  return { getStoryFeed, getLatestStories, getStoryBySlug, getStoryById, getStorySources, getRelatedStories };
}

export const storyRepository = createStoryRepository();
