import { createAdminClient } from "@/lib/supabase/admin";
import type { StoryArticleContent, StoryCluster } from "@/lib/stories/schema";
import { fetchPublisherArticleContent } from "./publisher";

type SourceJoin =
  | { name?: string | null }
  | Array<{ name?: string | null }>
  | null;

type ArticleContentRow = {
  id: string;
  title: string;
  original_url: string;
  language: "vi" | "en";
  full_content: string | null;
  content_status: StoryArticleContent["status"] | null;
  content_source: StoryArticleContent["source"] | null;
  content_fetched_at: string | null;
  content_word_count: number | null;
  content_error: string | null;
  content_lease_expires_at?: string | null;
  news_sources: SourceJoin;
};

type LoadStoryArticleContentsOptions = {
  fetchMissing?: boolean;
  maxFetches?: number;
};

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const ARTICLE_CONTENT_COLUMNS =
  "id,title,original_url,language,full_content,content_status,content_source,content_fetched_at,content_word_count,content_error,content_lease_expires_at,news_sources(name)";
const PUBLISHER_RETRY_MS = 12 * 60 * 60_000;
const CONTENT_LEASE_MS = 2 * 60_000;

function sourceName(value: SourceJoin, fallback: string): string {
  const source = Array.isArray(value) ? value[0] : value;
  return source?.name?.trim() || fallback;
}

function cleanContent(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 100_000);
  return cleaned || null;
}

/** Turn publisher-provided RSS text into readable blocks without injecting HTML. */
export function articleContentParagraphs(value: string | null): string[] {
  const content = cleanContent(value);
  if (!content) return [];
  const explicit = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (explicit.length > 1) return explicit.slice(0, 240);

  const sentences = content.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/g)
    ?.map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean) ?? [content];
  const paragraphs: string[] = [];
  let current = "";
  let words = 0;
  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).filter(Boolean).length;
    if (current && words + sentenceWords > 95) {
      paragraphs.push(current);
      current = "";
      words = 0;
    }
    current = `${current} ${sentence}`.trim();
    words += sentenceWords;
  }
  if (current) paragraphs.push(current);
  return paragraphs.slice(0, 240);
}

function fallbackContents(story: StoryCluster): StoryArticleContent[] {
  return story.articles.map((article) => ({
    articleId: article.id,
    sourceName: article.sourceName,
    title: article.title,
    originalUrl: article.originalUrl,
    language: article.language,
    status: "source_only",
    source: null,
    content: null,
    paragraphs: [],
    wordCount: 0,
    fetchedAt: null,
    error: null,
  }));
}

function contentSchemaUnavailable(error: { code?: string; message?: string; details?: string } | null): boolean {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return ["full_content", "content_status", "content_source", "content_fetched_at", "content_word_count", "content_error", "content_lease_expires_at"]
    .some((column) => text.includes(column));
}

function toArticleContent(row: ArticleContentRow, article: StoryCluster["articles"][number]): StoryArticleContent {
  const content = cleanContent(row.full_content);
  const status = content ? "available" : row.content_status ?? "pending";
  return {
    articleId: row.id,
    sourceName: sourceName(row.news_sources, article.sourceName),
    title: row.title || article.title,
    originalUrl: row.original_url || article.originalUrl,
    language: row.language ?? article.language,
    status,
    source: content ? row.content_source ?? "rss" : row.content_source,
    content,
    paragraphs: articleContentParagraphs(content),
    wordCount: content
      ? row.content_word_count ?? content.split(/\s+/).filter(Boolean).length
      : 0,
    fetchedAt: row.content_fetched_at,
    error: row.content_error?.slice(0, 500) ?? null,
  };
}

function shouldFetchPublisherContent(row: ArticleContentRow): boolean {
  if (cleanContent(row.full_content)) return false;
  if (!/^https?:\/\//i.test(row.original_url)) return false;
  const leaseExpiresAt = row.content_lease_expires_at ? Date.parse(row.content_lease_expires_at) : 0;
  if (Number.isFinite(leaseExpiresAt) && leaseExpiresAt > Date.now()) return false;
  const fetchedAt = row.content_fetched_at ? Date.parse(row.content_fetched_at) : 0;
  if (row.content_status === "failed")
    return !Number.isFinite(fetchedAt) || Date.now() - fetchedAt >= PUBLISHER_RETRY_MS;
  if (row.content_status === "source_only")
    return !Number.isFinite(fetchedAt) || Date.now() - fetchedAt >= PUBLISHER_RETRY_MS;
  return row.content_status === "pending" || row.content_status === "processing" || !row.content_status;
}

function safeContentError(error: unknown): string {
  return (error instanceof Error ? error.message : "Không thể lấy toàn văn từ trang nguồn.")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

async function fetchAndPersistPublisherContent(
  client: AdminClient,
  row: ArticleContentRow,
): Promise<ArticleContentRow> {
  const leaseUntil = new Date(Date.now() + CONTENT_LEASE_MS).toISOString();
  await client
    .from("raw_articles")
    .update({
      content_status: "processing",
      content_error: null,
      content_lease_expires_at: leaseUntil,
    })
    .eq("id", row.id);

  try {
    const extracted = await fetchPublisherArticleContent(row.original_url);
    const fetchedAt = new Date().toISOString();
    const patch = extracted && !extracted.error
      ? {
          full_content: extracted.content,
          content_status: "available",
          content_source: "publisher",
          content_fetched_at: fetchedAt,
          content_word_count: extracted.wordCount,
          content_error: null,
          content_lease_expires_at: null,
        }
      : {
          full_content: null,
          content_status: extracted?.error ? "failed" as const : "source_only" as const,
          content_source: null,
          content_fetched_at: fetchedAt,
          content_word_count: 0,
          content_error: extracted?.error ?? "Không tìm thấy toàn văn công khai trên trang nguồn.",
          content_lease_expires_at: null,
        };
    const { data, error } = await client
      .from("raw_articles")
      .update(patch)
      .eq("id", row.id)
      .select(ARTICLE_CONTENT_COLUMNS)
      .maybeSingle();
    if (error || !data) return { ...row, ...patch, news_sources: row.news_sources } as ArticleContentRow;
    return data as unknown as ArticleContentRow;
  } catch (error) {
    const fetchedAt = new Date().toISOString();
    const patch = {
      content_status: "failed" as const,
      content_fetched_at: fetchedAt,
      content_error: safeContentError(error),
      content_lease_expires_at: null,
    };
    const { data } = await client
      .from("raw_articles")
      .update(patch)
      .eq("id", row.id)
      .select(ARTICLE_CONTENT_COLUMNS)
      .maybeSingle();
    return (data as unknown as ArticleContentRow | null) ?? {
      ...row,
      ...patch,
    };
  }
}

/**
 * Load cached article text and opportunistically hydrate public publisher pages
 * when RSS only provided metadata. A publisher fetch failure never blocks the
 * story page: the reader falls back to source links and tries again later.
 */
export async function loadStoryArticleContents(
  story: StoryCluster,
  options: LoadStoryArticleContentsOptions = {},
): Promise<StoryArticleContent[]> {
  const client = createAdminClient();
  if (!client || !story.articles.length) return fallbackContents(story);
  const ids = story.articles.map((article) => article.id);
  const { data, error } = await client
    .from("raw_articles")
    .select(ARTICLE_CONTENT_COLUMNS)
    .in("id", ids);
  if (error) {
    if (contentSchemaUnavailable(error)) return fallbackContents(story);
    throw new Error("Không thể đọc nội dung đầy đủ của bài nguồn.");
  }

  const rows = data as unknown as ArticleContentRow[];
  const fetchMissing = options.fetchMissing ?? true;
  const maxFetches = Math.min(4, Math.max(0, Math.floor(options.maxFetches ?? 2)));
  const hydrated = fetchMissing && maxFetches
    ? await Promise.all(
        rows
          .filter(shouldFetchPublisherContent)
          .slice(0, maxFetches)
          .map((row) => fetchAndPersistPublisherContent(client, row)),
      )
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of hydrated) byId.set(row.id, row);
  return story.articles.map((article) => {
    const row = byId.get(article.id);
    if (!row) return fallbackContents({ ...story, articles: [article] })[0];
    return toArticleContent(row, article);
  });
}
