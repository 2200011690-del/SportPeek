import { createHash, randomUUID } from "node:crypto";
import { getAIProvider } from "@/lib/ai";
import { HeuristicAIProvider } from "@/lib/ai/heuristic";
import {
  dedupeClaims,
  evidenceFingerprint,
  needsClusterSummary,
  sanitizeClusterSummary,
  selectClusterSummary,
} from "@/lib/ai/grounding";
import { isAIQuotaExceeded, safeAIErrorMessage } from "@/lib/ai/quota";
import type { AIProvider, ClusterArticleInput } from "@/lib/ai/types";
import {
  ConfigurationError,
  ProviderError,
  toSafeError,
} from "@/lib/core/errors";
import { configuredRssSources } from "@/lib/rss/sources";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSearchText } from "@/lib/ui-logic";
import {
  calculateHotness,
  calculateReliability,
  deriveEventImportance,
  eventHalfLifeHours,
} from "@/lib/scoring";
import { createLegacyStorySlug, createStorySlug } from "./slug";
import {
  analyzeSourceIndependence,
  CLUSTER_THRESHOLDS,
  clusterSimilarity,
  storyEventType,
  type ClusterableArticle,
} from "./clustering";
import { storyClusterSchema, type StoryCluster } from "./schema";
import { buildLongSummary, prioritizeAISummaryCandidates } from "./summary";

const GEOGRAPHY_KEYWORDS: Record<string, string[]> = {
  "Việt Nam": ["viet nam", "việt nam", "trong nước", "tuyển việt nam", "hà nội", "hồ chí minh", "tp.hcm", "hải phòng", "thanh hóa", "nam định", "đà nẵng", "sông lam nghệ an", "bình định", "bình dương", "cần thơ"],
  "Anh": ["anh quốc", "nước anh", "london", "manchester", "united kingdom", "england"],
  "Tây Ban Nha": ["tây ban nha", "spain", "madrid", "barcelona"],
  "Ý": ["nước ý", "italy", "italia", "rome"],
  "Đức": ["nước đức", "germany", "berlin", "munich"],
  "Pháp": ["nước pháp", "france", "paris"],
  "Mỹ": ["nước mỹ", "usa", "america", "united states", "hoa kỳ", "los angeles", "new york", "washington"],
  "Ả Rập Xê Út": ["saudi", "saudi arabia", "ả rập xê út", "riyadh"],
  "Trung Quốc": ["trung quốc", "china", "bắc kinh", "thượng hải"],
  "Nhật Bản": ["nhật bản", "japan", "tokyo"],
  "Hàn Quốc": ["hàn quốc", "south korea", "seoul"],
  "Nga": ["nước nga", "russia", "moscow", "kremlin"],
  "Ukraine": ["ukraine", "kyiv", "kiev"],
  "Iran": ["iran", "tehran"],
  "Israel": ["israel", "tel aviv", "jerusalem"],
  "Palestine": ["palestine", "gaza"],
  "Thái Lan": ["thái lan", "thailand", "bangkok"],
};

function detectGeography(title: string, excerpt: string, sourceName: string): string | null {
  const text = `${title} ${excerpt} ${sourceName}`.toLowerCase();
  for (const [country, keywords] of Object.entries(GEOGRAPHY_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        return country;
      }
    }
  }
  return null;
}

type SourceJoin =
  | {
      name: string;
      logo_url: string | null;
      country: string | null;
      is_official: boolean;
      reliability_score: number;
    }
  | Array<{
      name: string;
      logo_url: string | null;
      country: string | null;
      is_official: boolean;
      reliability_score: number;
    }>
  | null;
type RawRow = {
  id: string;
  source_id: string;
  external_id: string | null;
  original_url: string;
  canonical_url: string | null;
  title: string;
  normalized_title: string | null;
  excerpt: string | null;
  author: string | null;
  image_url: string | null;
  published_at: string;
  fetched_at: string;
  content_hash: string;
  full_content: string | null;
  content_word_count: number | null;
  language: "vi" | "en";
  processing_status: string;
  raw_metadata: Record<string, unknown>;
  news_sources: SourceJoin;
};
type ArticleRecord = ClusterableArticle & {
  sourceName: string;
  sourceLogoUrl: string | null;
  reliability: number;
  isOfficial: boolean;
  originalUrl: string;
  canonicalUrl: string | null;
  author: string | null;
  imageUrl: string | null;
  fetchedAt: string;
  language: "vi" | "en";
  contentHash: string;
  fullContent: string | null;
  contentWordCount: number;
  rawMetadata: Record<string, unknown>;
  publisherCountry?: string;
};
type SummaryArticle = ClusterableArticle & {
  fullContent?: string | null;
  contentWordCount?: number | null;
};
type Draft = {
  id: string;
  clusterKey: string;
  articles: ArticleRecord[];
  existing: boolean;
  touched: boolean;
  previousStory: StoryCluster | null;
};
type RemoteAIExecution = {
  remaining: number;
  attempts: number;
  generated: number;
  errors: string[];
  provider: string | null;
};
export type StoryProcessingSummary = {
  jobId: string;
  dryRun: boolean;
  inputArticles: number;
  createdClusters: number;
  updatedClusters: number;
  mergedArticles: number;
  failedArticles: number;
  aiProvider: string;
  aiAttempts: number;
  aiGenerated: number;
  aiErrors: string[];
  errors: string[];
};
export type StoryProcessingOptions = {
  dryRun?: boolean;
  includeFailed?: boolean;
  recluster?: boolean;
  useAi?: boolean;
  aiLimit?: number;
  matchAiLimit?: number;
  limit?: number;
  candidateLimit?: number;
  leaseSeconds?: number;
  oldestFirst?: boolean;
};

const DEFAULT_STORY_BATCH_SIZE = 8;
const DEFAULT_CANDIDATE_LIMIT = 96;
const CANDIDATE_WINDOW_HOURS = 72;
const RAW_ARTICLE_SELECT =
  "id,source_id,external_id,original_url,canonical_url,title,normalized_title,excerpt,author,image_url,published_at,fetched_at,content_hash,full_content,content_word_count,language,processing_status,raw_metadata,news_sources!inner(name,logo_url,country,is_official,reliability_score,is_active)";

const PUBLISHER_COUNTRY_LABELS: Readonly<Record<string, string>> = {
  AU: "Úc",
  DE: "Đức",
  EU: "Liên minh châu Âu",
  FR: "Pháp",
  GB: "Vương quốc Anh",
  INT: "Quốc tế",
  QA: "Qatar",
  UN: "Liên Hợp Quốc",
  US: "Hoa Kỳ",
  VN: "Việt Nam",
};

export function derivePublisherCountry(
  sourceCountry: string | null | undefined,
  language: "vi" | "en",
): string {
  const value = sourceCountry?.trim();
  if (!value) return language === "vi" ? "Việt Nam" : "Quốc tế";
  const code = value.toUpperCase();
  return PUBLISHER_COUNTRY_LABELS[code] ?? (code.length === 2 ? code : value);
}
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [
    /\b(the thao|bong da|doi bong|doi tuyen|cau thu|huan luyen vien|tran dau|giai dau|thi dau|ty so|ghi ban|ban thang|vo dich|asean cup|world cup|sports?|football|soccer|tennis|olympic)\b/,
    "Thể thao",
  ],
  [
    /\b(ai|cong nghe|so hoa|ban dan|chip|phan mem|dien thoai thong minh|technology|tech|artificial intelligence|tri tue nhan tao|internet|cyber)\b/,
    "Công nghệ",
  ],
  [
    /\b(suc khoe|y te|hien mau|ung thu|phau thuat|soc tim|nhoi mau|van tim|vaccine|vac xin|health|medical|medicine|hospital|benh|benh vien|dich benh)\b/,
    "Sức khỏe",
  ],
  [
    /\b(khoa hoc|moi truong|thoi tiet|nang nong|mua lon|lu quet|sat lo|he sinh thai|rung|ve tinh|nghien cuu khoa hoc|science|environment|climate|weather|satellite|space|vu tru)\b/,
    "Khoa học",
  ],
  [
    /\b(kinh te|kinh doanh|tai chinh|thi truong|thuong mai(?: dien tu)?|xuat khau|nhap khau|thue|ngan hang|lai suat|chung khoan|co phieu|doanh nghiep|nha may|cong nghiep|nang luong|logistics|loi nhuan|tang truong|von dau tu|dong von|gia dien|viec lam|business|economy|finance|market|trade|commerce|tariffs?|banks?)\b/,
    "Kinh tế",
  ],
  [
    /\b(van hoa|giai tri|am nhac|dien anh|du lich|bao tang|di san|nghe si|culture|entertainment|film|music|tourism|museum|arts?)\b/,
    "Văn hóa & Giải trí",
  ],
  [
    /\b(chinh tri|trung uong|lanh dao|thu tuong|quoc hoi|chinh phu|bo cong an|quoc phong|phong thu|chien dau|ngoai giao|politics|government|parliament|bau cu|election)\b/,
    "Chính trị",
  ],
  [/\b(the gioi|quoc te|world|global)\b/, "Thế giới"],
  [/\b(viet nam|thoi su|xa hoi|doi song|phap luat|giao duc)\b/, "Việt Nam"],
];

const CONFIGURED_CATEGORY_BY_SOURCE = new Map(
  configuredRssSources().flatMap((source) =>
    source.defaultCategory
      ? [[normalizeSearchText(source.name), source.defaultCategory] as const]
      : [],
  ),
);

/**
 * Mixed homepage feeds can publish one incorrect category on every item. Only
 * feed-level categories explicitly configured for a topical source are safe
 * enough to use as a fallback when the article text has no category signal.
 */
export function trustedStoryCategoryCandidates(
  articles: Array<{ sourceName?: string; rawMetadata?: Record<string, unknown> }>,
): string[] {
  return unique(
    articles.flatMap((article) => {
      const configured = CONFIGURED_CATEGORY_BY_SOURCE.get(
        normalizeSearchText(article.sourceName ?? ""),
      );
      if (configured) return [configured];
      if (article.rawMetadata?.publisherCategoriesDiscarded) return [];
      return Array.isArray(article.rawMetadata?.categories)
        ? article.rawMetadata.categories.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
    }),
  );
}

function admin() {
  const client = createAdminClient();
  if (!client)
    throw new ConfigurationError(
      "Thiếu Supabase service role cho story processor.",
      "supabase",
    );
  return client;
}
function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function storyCandidateWindow(
  articles: Array<{ publishedAt: string }>,
  windowHours = CANDIDATE_WINDOW_HOURS,
) {
  const timestamps = articles
    .map((article) => Date.parse(article.publishedAt))
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  const padding = Math.max(1, windowHours) * 3_600_000;
  return {
    from: new Date(Math.min(...timestamps) - padding).toISOString(),
    to: new Date(Math.max(...timestamps) + padding).toISOString(),
  };
}

export function selectStoryCategory(
  content: string,
  declaredCategories: string[],
  language: "vi" | "en",
  fallbackCategory?: string,
): string {
  const inferredText = normalizeSearchText(content);
  const declaredText = normalizeSearchText(declaredCategories.join(" "));
  const inferred = CATEGORY_RULES.find(([pattern]) =>
    pattern.test(inferredText),
  )?.[1];
  const declared = CATEGORY_RULES.find(([pattern]) =>
    pattern.test(declaredText),
  )?.[1];
  return inferred
    ?? declared
    ?? fallbackCategory
    ?? (language === "en" ? "Thế giới" : "Việt Nam");
}

/** Keep prompts small, source-diverse and free of syndicated copies. */
export function selectIndependentSummaryInput(
  articles: SummaryArticle[],
  limit = 8,
): ClusterArticleInput[] {
  const independence = analyzeSourceIndependence(articles);
  const selected: ClusterableArticle[] = [];
  const groups = new Set<string>();
  for (const article of articles) {
    if (independence.syndicatedArticleIds.has(article.id)) continue;
    const group =
      independence.groupByArticleId.get(article.id) ?? article.sourceId;
    if (groups.has(group)) continue;
    groups.add(group);
    selected.push(article);
    if (selected.length >= Math.max(1, limit)) break;
  }
  if (!selected.length && articles[0]) selected.push(articles[0]);
  return selected.map((article) => ({
    id: article.id,
    title: article.title,
    excerpt: summaryEvidenceText(article),
    publishedAt: article.publishedAt,
    sourceName: article.sourceName,
  }));
}

export function aiRetryDelayMs(consecutiveFailures: number): number {
  const schedule = [
    5 * 60_000,
    30 * 60_000,
    2 * 3_600_000,
    12 * 3_600_000,
    24 * 3_600_000,
  ];
  return schedule[
    Math.min(
      schedule.length - 1,
      Math.max(0, Math.floor(consecutiveFailures) - 1),
    )
  ];
}

function metadataMetric(articles: ArticleRecord[], keys: string[]): number {
  const values = articles
    .flatMap((article) => keys.map((key) => article.rawMetadata[key]))
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
  return values.length
    ? Math.max(
        0,
        Math.min(
          100,
          values.reduce((sum, value) => sum + value, 0) / values.length,
        ),
      )
    : 0;
}

function cleanEvidenceText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summaryEvidenceText(article: SummaryArticle): string {
  const excerpt = cleanEvidenceText(article.excerpt);
  const fullContent = cleanEvidenceText(article.fullContent);
  if (!fullContent || (article.contentWordCount ?? 0) < 120) return excerpt;
  const combined = excerpt && !fullContent.toLowerCase().includes(excerpt.toLowerCase())
    ? `${excerpt} ${fullContent}`
    : fullContent;
  return combined.split(/\s+/).slice(0, 700).join(" ");
}

function toArticle(row: RawRow): ArticleRecord {
  const source = one(row.news_sources);
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: source?.name ?? "Nguồn chưa xác định",
    sourceLogoUrl: source?.logo_url ?? null,
    reliability: source?.reliability_score ?? 50,
    isOfficial: Boolean(source?.is_official),
    title: row.title,
    excerpt: row.excerpt ?? "",
    originalUrl: row.original_url,
    canonicalUrl: row.canonical_url,
    author: row.author,
    imageUrl: row.image_url,
    publishedAt: new Date(row.published_at).toISOString(),
    fetchedAt: new Date(row.fetched_at).toISOString(),
    language: row.language,
    contentHash: row.content_hash,
    fullContent: row.full_content,
    contentWordCount: row.content_word_count ?? 0,
    rawMetadata: row.raw_metadata ?? {},
    publisherCountry: derivePublisherCountry(source?.country, row.language),
  };
}

function articleFromStory(
  article: StoryCluster["articles"][number],
  reliability: number,
): ArticleRecord {
  return {
    id: article.id,
    sourceId: article.sourceId,
    sourceName: article.sourceName,
    sourceLogoUrl: article.sourceLogoUrl,
    reliability,
    isOfficial: article.isOfficialSource,
    isSyndicated: article.isSyndicated,
    title: article.title,
    excerpt: article.excerpt ?? "",
    originalUrl: article.originalUrl,
    canonicalUrl: article.canonicalUrl,
    author: article.author,
    imageUrl: article.imageUrl,
    publishedAt: article.publishedAt,
    fetchedAt: article.fetchedAt,
    language: article.language,
    contentHash: article.id,
    fullContent: null,
    contentWordCount: 0,
    rawMetadata: {},
  };
}

function stableClusterKey(article: ArticleRecord) {
  return createHash("sha256")
    .update(
      `${article.contentHash}\0${storyEventType(`${article.title} ${article.excerpt}`)}`,
    )
    .digest("hex");
}

async function buildStory(
  draft: Draft,
  provider: AIProvider,
  remoteAI: RemoteAIExecution,
): Promise<{
  story: StoryCluster;
  materialFingerprint: string;
  lastSourceSeenAt: string;
}> {
  const articles = [...draft.articles].sort(
    (a, b) =>
      Number(b.isOfficial) - Number(a.isOfficial) ||
      b.reliability - a.reliability ||
      Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
  const lead = articles[0];
  const independence = analyzeSourceIndependence(articles);
  const representativeByGroup = new Map<string, ArticleRecord>();
  for (const article of articles) {
    if (independence.syndicatedArticleIds.has(article.id)) continue;
    const group =
      independence.groupByArticleId.get(article.id) ?? article.sourceId;
    if (!representativeByGroup.has(group))
      representativeByGroup.set(group, article);
  }
  if (!representativeByGroup.size)
    representativeByGroup.set(lead.sourceId, lead);
  const representatives = [...representativeByGroup.values()];
  const currentEvidenceHash = evidenceFingerprint(
    representatives.map((article) => ({
      id: article.id,
      title: article.title,
      excerpt: summaryEvidenceText(article),
      publishedAt: article.publishedAt,
      sourceName: article.sourceName,
    })),
  );
  const lastSourceSeenAt = new Date(
    Math.max(...articles.map((article) => Date.parse(article.fetchedAt))),
  ).toISOString();
  const input: ClusterArticleInput[] = articles.map((article) => ({
    id: article.id,
    title: article.title,
    excerpt: summaryEvidenceText(article),
    publishedAt: article.publishedAt,
    sourceName: article.sourceName,
  }));
  const remoteInput = selectIndependentSummaryInput(articles);
  const heuristic = new HeuristicAIProvider();
  let remoteSummary: Awaited<
    ReturnType<AIProvider["summarizeCluster"]>
  > | null = null;
  const heuristicSummary = await heuristic.summarizeCluster({
    articles: input,
  });
  if (
    remoteAI.remaining > 0 &&
    !["heuristic", "disabled", "mock"].includes(provider.name)
  ) {
    remoteAI.remaining -= 1;
    remoteAI.attempts += 1;
    try {
      remoteSummary = sanitizeClusterSummary(
        await provider.summarizeCluster({ articles: remoteInput }),
        remoteInput,
      );
      remoteAI.generated += 1;
      remoteAI.provider =
        "lastProviderName" in provider &&
        typeof provider.lastProviderName === "string"
          ? provider.lastProviderName
          : provider.name;
    } catch (error) {
      // AI must enhance the feed, never hold fresh source metadata hostage.
      const message = safeAIErrorMessage(error);
      remoteAI.errors.push(message);
      if (isAIQuotaExceeded(error)) remoteAI.remaining = 0;
      console.warn(
        `[Story AI] Falling back to heuristic for ${draft.id}: ${message}`,
      );
    }
  }
  // A transient provider failure must never replace an already published,
  // source-backed AI summary with a lower-quality heuristic placeholder.
  const selection = selectClusterSummary({
    remote: remoteSummary,
    heuristic: heuristicSummary,
    previous: draft.previousStory
      ? {
          aiGenerated: draft.previousStory.aiGenerated,
          title: draft.previousStory.title,
          summary: draft.previousStory.summary,
          keyPoints: draft.previousStory.agreedFacts.map((fact) => fact.text),
          sourceIds: draft.previousStory.articles.map((article) => article.id),
        }
      : null,
    articles: input,
  });
  const generatedSummary = selection.summary;
  const remoteGenerated = selection.origin === "remote";
  const preservedAI = selection.origin === "previous";
  const generated = remoteGenerated || preservedAI;
  const heuristicAgreements = await heuristic.identifyAgreements({
    articles: input,
  });
  const agreementCandidates = remoteGenerated
    ? generatedSummary.keyPoints.map((text) => ({
        text,
        sourceArticleIds: generatedSummary.sourceIds,
      }))
    : preservedAI
      ? [...(draft.previousStory?.agreedFacts ?? []), ...heuristicAgreements]
      : heuristicAgreements;
  const agreements = dedupeClaims(
    agreementCandidates.map((item) => item.text),
    0.74,
  )
    .map((text) => {
      const matches = agreementCandidates.filter(
        (item) =>
          item.text === text ||
          dedupeClaims([text, item.text], 0.74).length === 1,
      );
      return {
        text,
        sourceArticleIds: unique(
          matches.flatMap((item) => item.sourceArticleIds),
        ),
      };
    })
    .filter((item) => item.sourceArticleIds.length);
  const disputes = await heuristic.identifyDisputes({ articles: input });
  const timeline = await heuristic.generateTimeline({ articles: input });
  const previousIndependent = draft.previousStory
    ? analyzeSourceIndependence(
        draft.previousStory.articles.map((article) => ({
          ...article,
          excerpt: article.excerpt ?? "",
        })),
      )
    : null;
  const previousEvidenceHash =
    draft.previousStory && previousIndependent
      ? evidenceFingerprint(
          draft.previousStory.articles
            .filter(
              (article) =>
                !previousIndependent.syndicatedArticleIds.has(article.id),
            )
            .map((article) => ({
              id: article.id,
              title: article.title,
              excerpt: article.excerpt ?? "",
              publishedAt: article.publishedAt,
              sourceName: article.sourceName,
            })),
        )
      : null;
  const preservedSummaryIsStale =
    preservedAI &&
    previousEvidenceHash !== null &&
    currentEvidenceHash !== previousEvidenceHash;
  const sourceNames = unique(
    representatives.map((article) => article.sourceName),
  );
  const official = articles.some((article) => article.isOfficial);
  const type = storyEventType(`${lead.title} ${lead.excerpt}`);
  const speculative =
    type === "transfer" &&
    /tin đồn|có thể|được cho là|reportedly|rumou?r|could|may\b/i.test(
      articles
        .map((article) => `${article.title} ${article.excerpt}`)
        .join(" "),
    );
  const reliability = calculateReliability({
    sourceScores: representatives.map((article) => article.reliability),
    independentSources: independence.independentSourceCount,
    official,
    speculativeLanguage: speculative,
    contradictionPenalty: disputes.length ? 8 : 0,
  });
  const newestMaterialTimestamp = Math.max(
    ...representatives.map((article) => Date.parse(article.publishedAt)),
  );
  const ageHours = Math.max(
    0,
    (Date.now() - newestMaterialTimestamp) / 3_600_000,
  );
  const averageSourceReliability =
    representatives.reduce((sum, article) => sum + article.reliability, 0) /
    Math.max(1, representatives.length);
  const eventImportance = deriveEventImportance(
    articles.map((article) => article.title).join(" "),
    type,
    official,
  );
  const hotness = calculateHotness({
    ageHours,
    halfLifeHours: eventHalfLifeHours(type),
    sourceCount: independence.independentSourceCount,
    averageSourceReliability,
    entityPopularity: metadataMetric(articles, [
      "entityPopularity",
      "entity_popularity",
    ]),
    readVelocity: metadataMetric(articles, ["readVelocity", "read_velocity"]),
    eventImportance,
    verified: official || independence.independentSourceCount >= 2,
  });
  const title = generated ? generatedSummary.title : lead.title;
  const publishedAt = new Date(
    Math.min(...articles.map((article) => Date.parse(article.publishedAt))),
  ).toISOString();
  const updatedAt = new Date(newestMaterialTimestamp).toISOString();
  const rawArticles = articles.map((article) => ({
    id: article.id,
    sourceId: article.sourceId,
    sourceName: article.sourceName,
    sourceLogoUrl: article.sourceLogoUrl,
    originalUrl: article.originalUrl,
    canonicalUrl: article.canonicalUrl,
    title: article.title,
    excerpt: article.excerpt || null,
    imageUrl: article.imageUrl,
    author: article.author,
    publishedAt: article.publishedAt,
    fetchedAt: article.fetchedAt,
    isOfficialSource: article.isOfficial,
    isSyndicated: independence.syndicatedArticleIds.has(article.id),
    language: article.language,
    processingStatus: "completed" as const,
  }));
  const fullSummary = buildLongSummary(generatedSummary.summary);
  const summary = fullSummary.slice(0, 2_000);
  const generatedSlug = createStorySlug(title, draft.id);
  const previousSlug = draft.previousStory?.slug;
  const promoteLegacySlug = Boolean(
    previousSlug &&
      previousSlug === createLegacyStorySlug(draft.id) &&
      previousSlug !== generatedSlug,
  );
  const nextSlug = promoteLegacySlug
    ? generatedSlug
    : previousSlug ?? generatedSlug;
  const legacySlugs = unique([
    ...(draft.previousStory?.legacySlugs ?? []),
    ...(promoteLegacySlug && previousSlug ? [previousSlug] : []),
  ]);

  const geoCounts: Record<string, number> = {};
  for (const article of rawArticles) {
    const geo = detectGeography(article.title ?? "", article.excerpt ?? "", article.sourceName ?? "");
    if (geo) {
      geoCounts[geo] = (geoCounts[geo] || 0) + 1;
    }
  }
  let geography: string | null = null;
  let maxCount = 0;
  for (const [geo, count] of Object.entries(geoCounts)) {
    if (count > maxCount) {
      maxCount = count;
      geography = geo;
    }
  }
  const publisherCountry = derivePublisherCountry(
    lead.publisherCountry,
    lead.language,
  );
  const region = geography === "Việt Nam"
    ? "Việt Nam"
    : geography
      ? "Thế giới"
      : publisherCountry === "Việt Nam"
        ? "Việt Nam"
        : "Thế giới";
  const categoryCandidates = trustedStoryCategoryCandidates(articles);
  const categoryValue = selectStoryCategory(
    [title, ...articles.map((article) => article.title)].join(" "),
    categoryCandidates,
    lead.language,
    region === "Thế giới" ? "Thế giới" : undefined,
  );

  const story = storyClusterSchema.parse({
    id: draft.id,
    slug: nextSlug,
    legacySlugs,
    title,
    summary,
    summaryLong:
      preservedAI && draft.previousStory
        ? draft.previousStory.summaryLong
        : fullSummary.slice(0, 12_000),
    category: String(categoryValue).slice(0, 160),
    language: lead.language,
    region,
    geography,
    articleLanguage: lead.language,
    publisherCountry,
    status:
      type === "correction"
        ? "correction"
        : official
          ? "official"
          : disputes.length
            ? "disputed"
            : speculative
              ? "rumor"
              : independence.independentSourceCount >= 2
                ? "reported"
                : ageHours <= 12
                  ? "developing"
                  : "unverified",
    sourceCount: independence.independentSourceCount,
    sourceNames,
    officialSources: rawArticles.filter((article) => article.isOfficialSource),
    hasOfficialSource: official,
    hotnessScore: hotness,
    reliabilityScore: reliability,
    publishedAt,
    updatedAt,
    imageUrl: articles.find((article) => article.imageUrl)?.imageUrl ?? null,
    agreedFacts: agreements.map((item) => ({
      text: item.text,
      sourceArticleIds: item.sourceArticleIds,
    })),
    disputedPoints: disputes,
    timeline: timeline.map((item, index) => ({
      id: `timeline-${draft.id}-${index}`,
      occurredAt: item.occurredAt,
      description: item.content,
      sourceArticleIds: item.supportingArticleIds,
    })),
    linkedMatch: null,
    competition: null,
    teams: [],
    players: [],
    articles: rawArticles,
    aiGenerated: generated,
    reviewStatus: remoteGenerated
      ? "auto"
      : preservedSummaryIsStale
        ? independence.independentSourceCount >= 2
          ? "pending"
          : "reviewed"
        : preservedAI && draft.previousStory
          ? draft.previousStory.reviewStatus
          : independence.independentSourceCount >= 2
            ? "pending"
            : "reviewed",
  });
  return { story, materialFingerprint: currentEvidenceHash, lastSourceSeenAt };
}

async function loadExistingDrafts(
  incoming: ArticleRecord[],
  limit = DEFAULT_CANDIDATE_LIMIT,
): Promise<Draft[]> {
  const window = storyCandidateWindow(incoming);
  if (!window) return [];
  const boundedLimit = Math.min(160, Math.max(24, Math.floor(limit)));
  const { data, error } = await admin()
    .from("story_clusters")
    .select("id,cluster_key,payload")
    .gte("last_material_update_at", window.from)
    .lte("first_published_at", window.to)
    .order("last_material_update_at", { ascending: false })
    .limit(boundedLimit);
  if (error)
    throw new ProviderError(
      "Không thể đọc cluster ứng viên gần đây.",
      "supabase",
    );
  return (data ?? []).flatMap((row): Draft[] => {
    const parsed = storyClusterSchema.safeParse(row.payload);
    return parsed.success
      ? [
          {
            id: row.id,
            clusterKey: row.cluster_key,
            articles: parsed.data.articles.map((article) =>
              articleFromStory(article, parsed.data.reliabilityScore ?? 70),
            ),
            existing: true,
            touched: false,
            previousStory: parsed.data,
          },
        ]
      : [];
  });
}

async function persistDrafts(
  drafts: Array<{
    draft: Draft;
    story: StoryCluster;
    materialFingerprint: string;
    lastSourceSeenAt: string;
  }>,
  summary: StoryProcessingSummary,
) {
  const client = admin();
  for (let index = 0; index < drafts.length; index += 50) {
    const batch = drafts.slice(index, index + 50);
    const rows = batch.map(
      ({ draft, story, materialFingerprint, lastSourceSeenAt }) => ({
        id: draft.id,
        cluster_key: draft.clusterKey,
        slug: story.slug,
        title: story.title,
        summary: story.summary,
        key_points: story.agreedFacts.map((item) => item.text).slice(0, 5),
        agreed_facts: story.agreedFacts,
        disputed_points: story.disputedPoints,
        status: story.status,
        hotness_score: story.hotnessScore,
        reliability_score: story.reliabilityScore,
        competition_id: null,
        primary_team_id: null,
        first_published_at: story.publishedAt,
        last_updated_at: story.updatedAt,
        last_source_seen_at: lastSourceSeenAt,
        material_fingerprint: materialFingerprint,
        ai_generated: story.aiGenerated,
        ai_provider: story.aiGenerated ? summary.aiProvider : null,
        review_status: story.reviewStatus,
        category: story.category,
        language: story.articleLanguage ?? "vi",
        geography: story.geography ?? null,
        region: story.region ?? "Việt Nam",
        source_names: story.sourceNames,
        search_text: normalizeSearchText(`${story.title} ${story.summary} ${story.category} ${story.sourceNames.join(" ")}`),
        payload: story,
      }),
    );
    const { error } = await client
      .from("story_clusters")
      .upsert(rows, { onConflict: "cluster_key" });
    if (error)
      throw new ProviderError(
        `Không thể lưu story cluster (${error.code ?? ""}).`,
        "supabase",
      );
  }
  const clusterIds = drafts.map(({ draft }) => draft.id);
  const links = drafts.flatMap(({ draft }) => {
    const independence = analyzeSourceIndependence(draft.articles);
    return draft.articles.map((article, index) => ({
      cluster_id: draft.id,
      raw_article_id: article.id,
      similarity_score:
        index === 0
          ? 1
          : clusterSimilarity(article, { articles: [draft.articles[0]] }).score,
      is_primary_source: index === 0,
      is_syndicated: independence.syndicatedArticleIds.has(article.id),
    }));
  });
  for (let index = 0; index < links.length; index += 200) {
    const { error } = await client
      .from("story_cluster_articles")
      .upsert(links.slice(index, index + 200), {
        onConflict: "cluster_id,raw_article_id",
      });
    if (error)
      throw new ProviderError(
        "Không thể lưu cluster article links.",
        "supabase",
      );
  }
  if (clusterIds.length) {
    await client.from("story_timeline").delete().in("cluster_id", clusterIds);
    await client.from("story_entities").delete().in("cluster_id", clusterIds);
  }
  const timeline = drafts.flatMap(({ draft, story }) =>
    story.timeline.map((item) => ({
      cluster_id: draft.id,
      occurred_at: item.occurredAt,
      update_type: "source_update",
      content: item.description,
      supporting_article_ids: item.sourceArticleIds,
    })),
  );
  for (let index = 0; index < timeline.length; index += 200) {
    const { error } = await client
      .from("story_timeline")
      .insert(timeline.slice(index, index + 200));
    if (error)
      throw new ProviderError("Không thể lưu story timeline.", "supabase");
  }
}

async function claimStoryBatch(
  jobId: string,
  options: Required<
    Pick<
      StoryProcessingOptions,
      "limit" | "oldestFirst" | "includeFailed" | "leaseSeconds"
    >
  >,
): Promise<string[]> {
  const { data, error } = await admin().rpc("claim_story_processing_batch", {
    p_job_id: jobId,
    p_limit: options.limit,
    p_oldest_first: options.oldestFirst,
    p_include_failed: options.includeFailed,
    p_lease_seconds: options.leaseSeconds,
  });
  if (error)
    throw new ProviderError(
      `Không thể claim story queue (${error.code ?? "RPC_ERROR"}).`,
      "supabase",
    );
  return (data ?? []).flatMap((row: unknown) => {
    if (typeof row === "string") return [row];
    if (
      row &&
      typeof row === "object" &&
      "id" in row &&
      typeof row.id === "string"
    )
      return [row.id];
    return [];
  });
}

async function finishStoryJob(
  jobId: string,
  succeededIds: string[],
  failedIds: string[],
  summary: StoryProcessingSummary,
  metadata: Record<string, unknown>,
  error?: { code: string; message: string },
) {
  const result = await admin().rpc("finish_story_processing_job", {
    p_job_id: jobId,
    p_succeeded_ids: succeededIds,
    p_failed_ids: failedIds,
    p_summary: { ...summary, ...metadata },
    p_error_code:
      error?.code ?? (summary.errors.length ? "PARTIAL_FAILURE" : null),
    p_error_message:
      error?.message ?? (summary.errors.join("; ").slice(0, 1000) || null),
  });
  if (result.error)
    throw new ProviderError(
      `Không thể hoàn tất story job (${result.error.code ?? "RPC_ERROR"}).`,
      "supabase",
    );
}

export async function processStories(
  options: StoryProcessingOptions = {},
): Promise<StoryProcessingSummary> {
  const client = admin();
  const jobId = randomUUID();
  const provider = getAIProvider();
  const batchLimit = Math.min(
    options.recluster ? 1000 : 20,
    Math.max(1, Math.floor(options.limit ?? DEFAULT_STORY_BATCH_SIZE)),
  );
  const candidateLimit = Math.min(
    160,
    Math.max(24, Math.floor(options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT)),
  );
  const leaseSeconds = Math.min(
    3600,
    Math.max(
      60,
      Math.floor(options.leaseSeconds ?? (options.recluster ? 3600 : 240)),
    ),
  );
  const oldestFirst = Boolean(options.oldestFirst);
  const includeFailed = Boolean(options.includeFailed);
  const remoteAI: RemoteAIExecution = {
    remaining: options.useAi ? Math.max(0, options.aiLimit ?? 1) : 0,
    attempts: 0,
    generated: 0,
    errors: [],
    provider: null,
  };
  let matchAIRemaining = Math.max(
    0,
    Math.floor(options.matchAiLimit ?? (options.useAi ? 1 : 0)),
  );
  const summary: StoryProcessingSummary = {
    jobId,
    dryRun: Boolean(options.dryRun),
    inputArticles: 0,
    createdClusters: 0,
    updatedClusters: 0,
    mergedArticles: 0,
    failedArticles: 0,
    aiProvider: provider.name,
    aiAttempts: 0,
    aiGenerated: 0,
    aiErrors: [],
    errors: [],
  };
  const baseMetadata = {
    phase: "claiming",
    useAi: Boolean(options.useAi),
    aiLimit: options.aiLimit ?? 1,
    matchAiLimit: matchAIRemaining,
    recluster: Boolean(options.recluster),
    includeFailed,
    oldestFirst,
    batchLimit,
    candidateLimit,
    leaseSeconds,
  };
  let claimedIds: string[] = [];

  if (!summary.dryRun) {
    const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();
    const staleJobs = await client
      .from("ingestion_jobs")
      .update({
        status: "failed",
        error_code: "LEASE_EXPIRED",
        error_message: "Story processing exceeded its execution lease.",
        completed_at: new Date().toISOString(),
      })
      .eq("job_type", "stories:process")
      .eq("status", "processing")
      .lt("started_at", staleBefore);
    if (staleJobs.error)
      throw new ProviderError("Không thể giải phóng story job quá hạn.", "supabase");
    const { data: activeJobs, error: activeCheckError } = await client
      .from("ingestion_jobs")
      .select("id")
      .eq("job_type", "stories:process")
      .eq("status", "processing")
      .gt("started_at", staleBefore)
      .limit(1);
    if (activeCheckError)
      throw new ProviderError("Không thể kiểm tra trạng thái job.", "supabase");
    if (activeJobs && activeJobs.length > 0) {
      console.log(
        "[Story Processing] Another story processing job is already running. Skipping execution.",
      );
      return summary;
    }

    const inserted = await client.from("ingestion_jobs").insert({
      id: jobId,
      job_type: "stories:process",
      provider: provider.name,
      status: "processing",
      fetched_count: 0,
      metadata: baseMetadata,
    });
    if (inserted.error)
      throw new ProviderError(
        "Không thể tạo story processing job.",
        "supabase",
      );
  }

  try {
    if (options.recluster && !summary.dryRun) {
      const links = await client
        .from("story_cluster_articles")
        .delete()
        .not("cluster_id", "is", null);
      if (links.error)
        throw new ProviderError(
          "Không thể xóa story links để recluster.",
          "supabase",
        );
      const clusters = await client
        .from("story_clusters")
        .delete()
        .not("id", "is", null);
      if (clusters.error)
        throw new ProviderError(
          "Không thể xóa story clusters để recluster.",
          "supabase",
        );
      const reset = await client
        .from("raw_articles")
        .update({
          processing_status: "pending",
          processing_job_id: null,
          processing_claimed_at: null,
          processing_lease_expires_at: null,
          processing_error: null,
        })
        .neq("processing_status", "pending");
      if (reset.error)
        throw new ProviderError(
          "Không thể đưa raw articles về queue.",
          "supabase",
        );
    }

    let rows: RawRow[] = [];
    if (summary.dryRun) {
      let query = client
        .from("raw_articles")
        .select(RAW_ARTICLE_SELECT)
        .eq("news_sources.is_active", true)
        .order("published_at", { ascending: oldestFirst })
        .limit(batchLimit);
      if (!options.recluster)
        query = query.in(
          "processing_status",
          includeFailed ? ["pending", "failed"] : ["pending"],
        );
      const result = await query;
      if (result.error)
        throw new ProviderError(
          "Không thể đọc raw articles đang chờ.",
          "supabase",
        );
      rows = (result.data ?? []) as unknown as RawRow[];
    } else {
      claimedIds = await claimStoryBatch(jobId, {
        limit: batchLimit,
        oldestFirst,
        includeFailed,
        leaseSeconds,
      });
      if (claimedIds.length) {
        const result = await client
          .from("raw_articles")
          .select(RAW_ARTICLE_SELECT)
          .in("id", claimedIds)
          .eq("news_sources.is_active", true);
        if (result.error)
          throw new ProviderError(
            "Không thể đọc raw articles đã claim.",
            "supabase",
          );
        rows = (result.data ?? []) as unknown as RawRow[];
      }
      const claimed = await client
        .from("ingestion_jobs")
        .update({
          fetched_count: claimedIds.length,
          metadata: {
            ...baseMetadata,
            phase: "building",
            claimedArticles: claimedIds.length,
          },
        })
        .eq("id", jobId);
      if (claimed.error)
        throw new ProviderError(
          "Không thể cập nhật story job sau khi claim.",
          "supabase",
        );
    }

    const incoming = rows
      .map(toArticle)
      .sort(
        (a, b) =>
          (oldestFirst ? 1 : -1) *
          (Date.parse(a.publishedAt) - Date.parse(b.publishedAt)),
      );
    summary.inputArticles = incoming.length;
    const incomingIds = new Set(incoming.map((article) => article.id));
    const drafts = options.recluster
      ? []
      : await loadExistingDrafts(incoming, candidateLimit);

    for (const article of incoming) {
      let best: { draft: Draft; score: number } | null = null;
      for (const draft of drafts) {
        const result = clusterSimilarity(article, draft);
        if (result.compatible && result.score > (best?.score ?? 0))
          best = { draft, score: result.score };
      }
      let merge = Boolean(best && best.score >= CLUSTER_THRESHOLDS.autoMerge);
      if (
        best &&
        best.score >= CLUSTER_THRESHOLDS.aiReview &&
        best.score < CLUSTER_THRESHOLDS.autoMerge &&
        matchAIRemaining > 0 &&
        !["heuristic", "disabled", "mock"].includes(provider.name)
      ) {
        matchAIRemaining -= 1;
        try {
          const evaluation = await provider.evaluateClusterMatch({
            article,
            candidate: best.draft.articles,
          });
          merge = evaluation.sameEvent && evaluation.confidence >= 0.78;
        } catch {
          merge = false;
        }
      }
      if (merge && best) {
        if (!best.draft.articles.some((item) => item.id === article.id)) {
          best.draft.articles.push(article);
          best.draft.touched = true;
          summary.mergedArticles += 1;
        }
      } else {
        drafts.push({
          id: randomUUID(),
          clusterKey: stableClusterKey(article),
          articles: [article],
          existing: false,
          touched: true,
          previousStory: null,
        });
      }
    }

    const touched = drafts.filter((draft) => draft.touched);
    const built: Array<{
      draft: Draft;
      story: StoryCluster;
      materialFingerprint: string;
      lastSourceSeenAt: string;
    }> = [];
    const failedIds = new Set<string>();
    for (const draft of touched) {
      try {
        built.push({ draft, ...(await buildStory(draft, provider, remoteAI)) });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message.slice(0, 600)
            : toSafeError(error).message;
        summary.errors.push(`${draft.id}: ${message}`);
        for (const article of draft.articles)
          if (incomingIds.has(article.id)) failedIds.add(article.id);
      }
    }

    summary.createdClusters = built.filter(
      ({ draft }) => !draft.existing,
    ).length;
    summary.updatedClusters = built.filter(
      ({ draft }) => draft.existing,
    ).length;
    summary.failedArticles = failedIds.size;
    summary.aiAttempts = remoteAI.attempts;
    summary.aiGenerated = remoteAI.generated;
    summary.aiErrors = remoteAI.errors;
    summary.aiProvider = remoteAI.provider ?? provider.name;

    if (summary.dryRun) return summary;
    if (built.length) await persistDrafts(built, summary);
    const succeededIds = unique(
      built.flatMap(({ draft }) => draft.articles.map((article) => article.id)),
    ).filter((id) => incomingIds.has(id) && !failedIds.has(id));
    const finalMetadata = {
      ...baseMetadata,
      phase: summary.errors.length ? "partial_failure" : "completed",
      aiAttempts: summary.aiAttempts,
      aiGenerated: summary.aiGenerated,
      aiErrors: summary.aiErrors,
      candidateClusters: drafts.length - summary.createdClusters,
    };
    await finishStoryJob(
      jobId,
      succeededIds,
      [...failedIds],
      summary,
      finalMetadata,
    );
    return summary;
  } catch (error) {
    if (!summary.dryRun) {
      const safe = toSafeError(error);
      try {
        await finishStoryJob(
          jobId,
          [],
          claimedIds,
          summary,
          { ...baseMetadata, phase: "failed" },
          { code: safe.code, message: safe.message },
        );
      } catch {
        await client
          .from("raw_articles")
          .update({
            processing_status: "failed",
            processing_lease_expires_at: null,
            processing_error: safe.message.slice(0, 1000),
          })
          .eq("processing_job_id", jobId)
          .eq("processing_status", "processing");
        await client
          .from("ingestion_jobs")
          .update({
            status: "failed",
            error_code: safe.code,
            error_message: safe.message,
            completed_at: new Date().toISOString(),
            metadata: {
              ...baseMetadata,
              phase: "failed",
              finalizer: "fallback",
            },
          })
          .eq("id", jobId);
      }
    }
    throw error;
  }
}

export async function summarizePersistedStoryById(
  id: string,
): Promise<StoryCluster | null> {
  const provider = getAIProvider();
  if (["disabled", "heuristic", "mock"].includes(provider.name))
    throw new ConfigurationError(
      "Chưa có remote AI provider để chạy AI summary.",
      "ai",
    );
  const client = admin();
  const { data, error } = await client
    .from("story_clusters")
    .select("id,payload,ai_generated")
    .eq("id", id)
    .limit(1);
  if (error)
    throw new ProviderError("Không thể đọc story cần tóm tắt.", "supabase");
  const row = data?.[0];
  if (!row) return null;
  const parsed = storyClusterSchema.safeParse(row.payload);
  if (!parsed.success)
    throw new ProviderError("Dữ liệu story không hợp lệ.", "supabase");
  const story = parsed.data;
  if (
    (row.ai_generated || story.aiGenerated) &&
    story.reviewStatus !== "pending"
  )
    return story;

  const selectedInput = selectIndependentSummaryInput(
    story.articles.map((article) => ({
      id: article.id,
      sourceId: article.sourceId,
      title: article.title,
      excerpt: article.excerpt ?? "",
      publishedAt: article.publishedAt,
      sourceName: article.sourceName,
      originalUrl: article.originalUrl,
      canonicalUrl: article.canonicalUrl,
      isOfficial: article.isOfficialSource,
      isSyndicated: article.isSyndicated,
    })),
  );
  const contentRows = await client
    .from("raw_articles")
    .select("id,full_content,content_status")
    .in("id", selectedInput.map((article) => article.id));
  const fullContentById = new Map<string, string>();
  if (!contentRows.error) {
    for (const row of contentRows.data ?? []) {
      if (row.content_status !== "available" || typeof row.full_content !== "string") continue;
      const content = row.full_content.replace(/\s+/g, " ").trim();
      if (content) fullContentById.set(String(row.id), content);
    }
  }
  const perArticleCharacterBudget = Math.max(
    3_500,
    Math.floor(28_000 / Math.max(1, selectedInput.length)),
  );
  const input = selectedInput.map((article) => ({
    ...article,
    excerpt: (fullContentById.get(article.id) ?? article.excerpt).slice(
      0,
      perArticleCharacterBudget,
    ),
  }));
  const jobId = randomUUID();
  const model =
    process.env.OPENAI_MODEL ??
    process.env.GEMINI_MODEL ??
    process.env.GROQ_MODEL ??
    process.env.CLOUDFLARE_AI_MODEL ??
    null;
  const inserted = await client.from("ai_jobs").insert({
    id: jobId,
    job_type: "summarize_cluster",
    input_reference: story.id,
    provider: provider.name,
    model,
    status: "processing",
  });
  if (inserted.error)
    throw new ProviderError("Không thể tạo tác vụ AI.", "supabase");

  try {
    const output = sanitizeClusterSummary(
      await provider.summarizeCluster({ articles: input }),
      input,
    );
    const nextSummary = buildLongSummary(output.summary);
    const next = storyClusterSchema.parse({
      ...story,
      title: output.title,
      summary: nextSummary,
      summaryLong: nextSummary,
      language: story.articles[0]?.language ?? story.language,
      agreedFacts: output.keyPoints.map((text) => ({
        text,
        sourceArticleIds: output.sourceIds,
      })),
      aiGenerated: true,
      reviewStatus: "auto",
    });
    const selectedProvider =
      "lastProviderName" in provider &&
      typeof provider.lastProviderName === "string"
        ? provider.lastProviderName
        : provider.name;
    const updated = await client
      .from("story_clusters")
      .update({
        title: next.title,
        summary: next.summary,
        key_points: output.keyPoints,
        ai_generated: true,
        ai_provider: selectedProvider,
        review_status: "auto",
        payload: next,
      })
      .eq("id", row.id);
    if (updated.error)
      throw new ProviderError("Không thể lưu bản tóm tắt AI.", "supabase");
    const completed = await client
      .from("ai_jobs")
      .update({
        status: "completed",
        provider: selectedProvider,
        result: output,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (completed.error)
      throw new ProviderError("Không thể hoàn tất tác vụ AI.", "supabase");
    return next;
  } catch (error) {
    const safe = toSafeError(error);
    await client
      .from("ai_jobs")
      .update({
        status: "failed",
        error_message: safe.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    throw error;
  }
}

export async function summarizePersistedStories(
  options: { dryRun?: boolean; limit?: number } = {},
) {
  const provider = getAIProvider();
  if (["disabled", "heuristic", "mock"].includes(provider.name))
    throw new ConfigurationError(
      "Chưa có remote AI provider để chạy AI summary.",
      "ai",
    );
  const client = admin();
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const backfillJobId = randomUUID();
  if (!options.dryRun) {
    const { data: activeJobs, error: activeCheckError } = await client
      .from("ingestion_jobs")
      .select("id")
      .eq("job_type", "ai:backfill")
      .eq("status", "processing")
      .gt("started_at", new Date(Date.now() - 10 * 60_000).toISOString())
      .limit(1);
    if (activeCheckError)
      throw new ProviderError("Không thể kiểm tra trạng thái job.", "supabase");
    if (activeJobs && activeJobs.length > 0) {
      console.log(
        "[AI Backfill] Another AI backfill job is already processing. Skipping execution.",
      );
      return { provider: provider.name, dryRun: false, queued: 0, updated: 0, errors: [] };
    }

    const started = await client.from("ingestion_jobs").insert({
      id: backfillJobId,
      job_type: "ai:backfill",
      provider: provider.name,
      status: "processing",
      fetched_count: 0,
      metadata: { limit },
    });
    if (started.error)
      throw new ProviderError("Không thể tạo AI backfill job.", "supabase");

    const leaseCutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    const released = await client
      .from("ai_jobs")
      .update({
        status: "failed",
        error_message: "AI job lease expired before completion.",
        completed_at: new Date().toISOString(),
      })
      .eq("job_type", "summarize_cluster")
      .in("status", ["pending", "processing"])
      .lt("created_at", leaseCutoff);
    if (released.error)
      throw new ProviderError(
        "Không thể giải phóng tác vụ AI quá hạn.",
        "supabase",
      );
  }
  const { data, error } = await client
    .from("story_clusters")
    .select("id,payload,ai_generated,review_status,last_material_update_at")
    .or("ai_generated.eq.false,review_status.eq.pending")
    .order("last_material_update_at", { ascending: false })
    .limit(1000);
  if (error)
    throw new ProviderError("Không thể đọc story cần tóm tắt.", "supabase");
  let updated = 0;
  const errors: string[] = [];
  const parsedRows = (data ?? []).flatMap((row) => {
    const parsed = storyClusterSchema.safeParse(row.payload);
    if (!parsed.success) {
      errors.push(`${row.id}: invalid payload`);
      return [];
    }
    return [{ id: row.id, story: parsed.data }];
  });
  const candidateIds = parsedRows.map((row) => row.story.id);
  const recentJobs: Array<{
    input_reference: string | null;
    status: string;
    created_at: string;
  }> = [];
  for (let index = 0; index < candidateIds.length; index += 200) {
    const ids = candidateIds.slice(index, index + 200);
    if (!ids.length) continue;
    const response = await client
      .from("ai_jobs")
      .select("input_reference,status,created_at")
      .eq("job_type", "summarize_cluster")
      .in("input_reference", ids)
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 3_600_000).toISOString(),
      )
      .order("created_at", { ascending: false })
      .limit(2000);
    if (response.error)
      throw new ProviderError("Không thể đọc lịch sử thử lại AI.", "supabase");
    recentJobs.push(...(response.data ?? []));
  }
  const retryState = new Map<
    string,
    {
      active: boolean;
      failures: number;
      lastFailureAt: number;
      closed: boolean;
    }
  >();
  for (const job of recentJobs.sort(
    (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
  )) {
    if (!job.input_reference) continue;
    const state = retryState.get(job.input_reference) ?? {
      active: false,
      failures: 0,
      lastFailureAt: 0,
      closed: false,
    };
    if (state.closed) continue;
    if (job.status === "pending" || job.status === "processing") {
      state.active = true;
      state.closed = true;
    } else if (job.status === "completed") state.closed = true;
    else if (job.status === "failed") {
      state.failures += 1;
      state.lastFailureAt ||= Date.parse(job.created_at);
    }
    retryState.set(job.input_reference, state);
  }
  const now = Date.now();
  const needsSummary = parsedRows.filter((row) => {
    if (!needsClusterSummary(row.story)) return false;
    const state = retryState.get(row.story.id);
    if (!state) return true;
    if (state.active) return false;
    return (
      !state.failures ||
      now - state.lastFailureAt >= aiRetryDelayMs(state.failures)
    );
  });
  // The prioritizer historically accepted only never-generated stories. A
  // pending clone lets stale last-good summaries re-enter the queue without
  // discarding the published AI content before a replacement succeeds.
  const queue = prioritizeAISummaryCandidates(
    needsSummary.map((row) =>
      row.story.aiGenerated ? { ...row.story, aiGenerated: false } : row.story,
    ),
    limit,
  );
  const rowIdByStoryId = new Map(
    parsedRows.map((row) => [row.story.id, row.id]),
  );

  for (const story of queue) {
    const input = selectIndependentSummaryInput(
      story.articles.map((article) => ({
        id: article.id,
        sourceId: article.sourceId,
        title: article.title,
        excerpt: article.excerpt ?? "",
        publishedAt: article.publishedAt,
        sourceName: article.sourceName,
        originalUrl: article.originalUrl,
        canonicalUrl: article.canonicalUrl,
        isOfficial: article.isOfficialSource,
        isSyndicated: article.isSyndicated,
      })),
    );
    const jobId = randomUUID();
    if (!options.dryRun) {
      const inserted = await client.from("ai_jobs").insert({
        id: jobId,
        job_type: "summarize_cluster",
        input_reference: story.id,
        provider: provider.name,
        model:
          process.env.OPENAI_MODEL ??
          process.env.GEMINI_MODEL ??
          process.env.GROQ_MODEL ??
          process.env.CLOUDFLARE_AI_MODEL ??
          null,
        status: "processing",
      });
      // The partial unique index treats an existing active job as the lease.
      // Skip the provider call instead of paying twice for the same story.
      if (inserted.error) {
        if (inserted.error.code === "23505") continue;
        errors.push(
          `${story.id}: Không thể giữ khóa tác vụ AI (${inserted.error.code ?? "unknown"})`,
        );
        continue;
      }
    }
    try {
      const output = sanitizeClusterSummary(
        await provider.summarizeCluster({ articles: input }),
        input,
      );
      const nextSummary = buildLongSummary(output.summary);
      const next = storyClusterSchema.parse({
        ...story,
        title: output.title,
        summary: nextSummary,
        summaryLong: nextSummary,
        language: story.articles[0]?.language ?? story.language,
        agreedFacts: output.keyPoints.map((text) => ({
          text,
          sourceArticleIds: output.sourceIds,
        })),
        aiGenerated: true,
        reviewStatus: "auto",
        citations: (output.citations ?? []).map((c) => ({
          text: c.fact,
          sourceArticleIds: c.sourceArticleIds,
        })),
      });
      const selectedProvider =
        "lastProviderName" in provider &&
        typeof provider.lastProviderName === "string"
          ? provider.lastProviderName
          : provider.name;
      if (!options.dryRun) {
        const storyUpdate = await client
          .from("story_clusters")
          .update({
            title: next.title,
            summary: next.summary,
            key_points: output.keyPoints,
            ai_generated: true,
            ai_provider: selectedProvider,
            review_status: "auto",
            payload: next,
          })
          .eq("id", rowIdByStoryId.get(story.id) ?? story.id);
        if (storyUpdate.error)
          throw new ProviderError("Không thể lưu bản tóm tắt AI.", "supabase");
        const jobUpdate = await client
          .from("ai_jobs")
          .update({
            status: "completed",
            provider: selectedProvider,
            result: output,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        if (jobUpdate.error)
          throw new ProviderError("Không thể hoàn tất tác vụ AI.", "supabase");
      }
      updated += 1;
    } catch (error) {
      const safe = toSafeError(error);
      errors.push(`${story.id}: ${safe.message}`);
      if (!options.dryRun)
        await client
          .from("ai_jobs")
          .update({
            status: "failed",
            error_message: safe.message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobId);
    }
  }
  if (!options.dryRun) {
    await client
      .from("ingestion_jobs")
      .update({
        status: errors.length && updated === 0 ? "failed" : "completed",
        updated_count: updated,
        error_code: errors.length ? "PARTIAL_FAILURE" : null,
        error_message: errors.join("; ").slice(0, 1000) || null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", backfillJobId);
  }
  return {
    provider: provider.name,
    dryRun: Boolean(options.dryRun),
    queued: queue.length,
    updated,
    errors,
  };
}

export async function storyProcessingReport() {
  const client = admin();
  const [raw, clusters, links, aiJobs, jobs] = await Promise.all([
    client.from("raw_articles").select("processing_status"),
    client
      .from("story_clusters")
      .select("id,status,ai_generated,ai_provider,last_updated_at"),
    client.from("story_cluster_articles").select("cluster_id,raw_article_id"),
    client
      .from("ai_jobs")
      .select("id,status,provider,error_message,created_at,completed_at")
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("ingestion_jobs")
      .select(
        "id,status,fetched_count,inserted_count,updated_count,skipped_count,error_code,metadata,started_at,completed_at",
      )
      .eq("job_type", "stories:process")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);
  const error =
    raw.error ?? clusters.error ?? links.error ?? aiJobs.error ?? jobs.error;
  if (error)
    throw new ProviderError("Không thể tạo stories report.", "supabase");
  const rawCounts = Object.groupBy(
    raw.data ?? [],
    (item) => item.processing_status,
  );
  return {
    generatedAt: new Date().toISOString(),
    rawArticles: Object.fromEntries(
      Object.entries(rawCounts).map(([key, values]) => [
        key,
        values?.length ?? 0,
      ]),
    ),
    clusters: clusters.data?.length ?? 0,
    clusteredArticleLinks: links.data?.length ?? 0,
    aiGeneratedClusters:
      clusters.data?.filter((item) => item.ai_generated).length ?? 0,
    recentAiJobs: aiJobs.data ?? [],
    recentJobs: jobs.data ?? [],
  };
}
