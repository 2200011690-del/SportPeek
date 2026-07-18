import { duplicateSimilarity, normalizeTitle } from "@/lib/ingestion/utils";

export type StoryEventType =
  | "announcement"
  | "award"
  | "breaking"
  | "conflict"
  | "decision"
  | "developing"
  | "disaster"
  | "economy"
  | "election"
  | "investigation"
  | "legal"
  | "transfer"
  | "injury"
  | "recovery"
  | "preview"
  | "result"
  | "lineup"
  | "quote"
  | "correction"
  | "news";

export type ClusterableArticle = {
  id: string;
  sourceId: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  sourceName?: string;
  author?: string | null;
  originalUrl?: string;
  canonicalUrl?: string | null;
  isOfficial?: boolean;
  isSyndicated?: boolean;
  rawMetadata?: Record<string, unknown>;
};

export type ClusterCandidate = { articles: ClusterableArticle[] };

/**
 * Scores at or above `autoMerge` are deterministic merges. Scores in the
 * review band may be sent to an AI matcher, but only after all hard gates pass.
 */
export const CLUSTER_THRESHOLDS = Object.freeze({
  autoMerge: 0.68,
  aiReview: 0.5,
  nearDuplicate: 0.86,
});

const STOP_WORDS = new Set([
  "after",
  "against",
  "and",
  "are",
  "amid",
  "before",
  "been",
  "being",
  "breaking",
  "but",
  "could",
  "for",
  "from",
  "had",
  "has",
  "have",
  "her",
  "here",
  "him",
  "his",
  "how",
  "into",
  "its",
  "latest",
  "live",
  "more",
  "new",
  "news",
  "not",
  "now",
  "official",
  "officials",
  "over",
  "president",
  "report",
  "reported",
  "reportedly",
  "says",
  "said",
  "she",
  "that",
  "the",
  "their",
  "them",
  "there",
  "these",
  "they",
  "those",
  "this",
  "update",
  "updates",
  "was",
  "were",
  "what",
  "when",
  "where",
  "who",
  "why",
  "will",
  "with",
  "you",
  "your",
  "ba",
  "bong",
  "cac",
  "cau",
  "chuyen",
  "cho",
  "choi",
  "cua",
  "cung",
  "dang",
  "danh",
  "den",
  "duoc",
  "giua",
  "hom",
  "khien",
  "la",
  "moi",
  "mot",
  "nay",
  "nhan",
  "nhung",
  "noi",
  "ong",
  "phat",
  "quan",
  "sau",
  "se",
  "tai",
  "theo",
  "thang",
  "thua",
  "tien",
  "tran",
  "tren",
  "trong",
  "truoc",
  "tu",
  "tuyen",
  "va",
  "ve",
  "viec",
  "voi",
]);

const EVENT_WORDS = new Set([
  "ai",
  "announce",
  "approve",
  "arrest",
  "attack",
  "award",
  "bid",
  "beat",
  "breaking",
  "champion",
  "conflict",
  "contract",
  "decision",
  "developing",
  "draw",
  "election",
  "final",
  "full",
  "injury",
  "investigation",
  "launch",
  "legal",
  "lineup",
  "match",
  "preview",
  "result",
  "return",
  "sign",
  "signing",
  "transfer",
  "vote",
  "win",
  "chien",
  "chung",
  "dich",
  "dinh",
  "doi",
  "dong",
  "gap",
  "gia",
  "hop",
  "ket",
  "hoi",
  "phuc",
  "qua",
  "thang",
  "thuong",
  "tro",
  "vo",
]);

const SIGNIFICANT_SHORT_TOKENS = new Set(["ai", "eu", "g7", "g20", "uk", "un"]);
const GENERIC_EVENT_PHASES = new Set<StoryEventType>([
  "news",
  "breaking",
  "developing",
]);
const GEO_TOKENS = new Set([
  "china",
  "eu",
  "gaza",
  "hanoi",
  "hochiminh",
  "india",
  "iran",
  "iraq",
  "israel",
  "japan",
  "northkorea",
  "palestine",
  "russia",
  "southkorea",
  "taiwan",
  "uk",
  "ukraine",
  "usa",
  "vietnam",
]);

const CANONICAL_PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:donald j trump|donald trump)\b/g, "trump"],
  [/\b(?:joseph r biden|joe biden)\b/g, "biden"],
  [
    /\b(?:united states of america|united states|u s a|u s|hoa ky|nuoc my)\b/g,
    "usa",
  ],
  [/\b(?:viet nam|vietnamese)\b/g, "vietnam"],
  [/\b(?:people s republic of china|trung quoc|chinese)\b/g, "china"],
  [/\b(?:nhat ban|japanese)\b/g, "japan"],
  [/\b(?:south korea|han quoc)\b/g, "southkorea"],
  [/\b(?:north korea|trieu tien)\b/g, "northkorea"],
  [/\b(?:united kingdom|great britain|vuong quoc anh)\b/g, "uk"],
  [/\b(?:european union|lien minh chau au)\b/g, "eu"],
  [/\b(?:united nations|lien hop quoc)\b/g, "un"],
  [/\b(?:world health organization|to chuc y te the gioi)\b/g, "who"],
  [/\b(?:federal reserve|cuc du tru lien bang)\b/g, "fed"],
  [/\b(?:ho chi minh city|thanh pho ho chi minh|tp hcm)\b/g, "hochiminh"],
  [/\b(?:ha noi|hanoi)\b/g, "hanoi"],
  [/\b(?:artificial intelligence|tri tue nhan tao)\b/g, "ai"],
  [
    /\b(?:announc(?:e|es|ed|ement|ements|ing)|unveil(?:s|ed|ing)?|cong bo|thong bao)\b/g,
    "announce",
  ],
  [/\b(?:launch(?:es|ed|ing)?|ra mat)\b/g, "launch"],
  [/\b(?:approv(?:e|es|ed|al)|thong qua|phe duyet)\b/g, "approve"],
  [/\b(?:tariffs?|thue quan|muc thue|thue)\b/g, "tariff"],
  [/\b(?:goods|hang hoa)\b/g, "goods"],
  [/\b(?:earthquakes?|dong dat)\b/g, "earthquake"],
  [/\b(?:tsunamis?|song than)\b/g, "tsunami"],
  [/\b(?:floods?|flooding|lu lut)\b/g, "flood"],
  [/\b(?:wildfires?|chay rung)\b/g, "wildfire"],
  [/\b(?:cease[ -]?fire|ngung ban)\b/g, "ceasefire"],
  [/\b(?:attacks?|attacked|attacking|tan cong)\b/g, "attack"],
  [/\b(?:elections?|bau cu)\b/g, "election"],
  [/\b(?:vot(?:e|es|ed|ing)|bo phieu)\b/g, "vote"],
  [/\b(?:investigat(?:e|es|ed|ing|ion)|probes?|dieu tra)\b/g, "investigation"],
  [/\b(?:lawsuits?|khoi kien)\b/g, "lawsuit"],
  [/\b(?:courts?|toa an)\b/g, "court"],
  [/\b(?:arrest(?:s|ed|ing)?|bat giu)\b/g, "arrest"],
  [/\b(?:interest rates?|lai suat)\b/g, "interestrate"],
  [/\b(?:inflation|lam phat)\b/g, "inflation"],
  [/\b(?:layoffs?|job cuts?|sa thai)\b/g, "layoff"],
  [/\b(?:issues? (?:a )?warning|ban canh bao|canh bao)\b/g, "warning"],
];
const CANONICAL_CACHE_LIMIT = 2_048;
const canonicalTextCache = new Map<string, string>();

const AGENCY_PATTERN =
  /\b(reuters|associated press|\bap\b|agence france presse|\bafp\b|ttxvn|thong tan xa viet nam|vietnam news agency|\bvna\b)\b/i;

function normalized(value: string): string {
  // `normalizeTitle` strips non-ASCII letters but does not decompose đ/Đ.
  // Preserve Vietnamese words such as "động đất" and "đội hình" first.
  return normalizeTitle(value.replace(/[đĐ]/g, "d"));
}

function canonicalized(value: string): string {
  const cached = canonicalTextCache.get(value);
  if (cached !== undefined) return cached;
  let text = normalized(value);
  for (const [pattern, replacement] of CANONICAL_PHRASES)
    text = text.replace(pattern, replacement);
  text = text.replace(/\s+/g, " ").trim();
  if (canonicalTextCache.size >= CANONICAL_CACHE_LIMIT) {
    const oldest = canonicalTextCache.keys().next().value;
    if (oldest !== undefined) canonicalTextCache.delete(oldest);
  }
  canonicalTextCache.set(value, text);
  return text;
}

function normalizedEventText(value: string): string {
  // `normalizeTitle` intentionally removes Vietnamese accents. Mask the month
  // word first so `tháng` cannot collapse to `thang` and be mistaken for the
  // result verb `thắng`.
  return canonicalized(value.normalize("NFC").replace(/\btháng\b/giu, " "));
}

export function storyEventType(value: string): StoryEventType {
  const text = normalizedEventText(value);
  if (/\b(dinh chinh|correction|corrects?|clarification)\b/.test(text))
    return "correction";
  if (
    /\b(earthquake|tsunami|flood|wildfire|bao lon|sieu bao|storm|hurricane|typhoon|tornado|landslide|sat lo|volcan(?:o|ic)|phun trao|tham hoa|disaster)\b/.test(
      text,
    )
  )
    return "disaster";
  if (
    /\b(attack|ceasefire|war|chien tranh|chien su|xung dot|giao tranh|missiles?|ten lua|airstrikes?|khong kich|invasion|xam luoc)\b/.test(
      text,
    )
  )
    return "conflict";
  if (
    /\b(election|vote|elected|presidential race|wins? (?:the )?presidency|dac cu)\b/.test(
      text,
    )
  )
    return "election";
  if (
    /\b(court|lawsuit|arrest|charged?|convict(?:s|ed|ion)?|sentenc(?:e|es|ed|ing)|trial|indict(?:s|ed|ment)?|phien toa|truy to|ket an|linh an)\b/.test(
      text,
    )
  )
    return "legal";
  if (/\b(investigation|thanh tra|kiem tra|xem xet sai pham)\b/.test(text))
    return "investigation";
  if (
    /\b(approve|ban hanh|sac lenh|nghi dinh|dao luat|du luat|chinh sach moi|policy decision|new policy|regulation)\b/.test(
      text,
    )
  )
    return "decision";
  if (
    /\b(interestrate|inflation|gdp|central bank|ngan hang trung uong|unemployment|that nghiep|jobs report|bao cao viec lam|economic data|so lieu kinh te)\b/.test(
      text,
    )
  )
    return "economy";
  if (
    /\b(award|awards|prize|oscar|grammy|nobel|gianh giai|trao giai)\b/.test(
      text,
    )
  )
    return "award";
  if (
    /\b(tro lai|hoi phuc|tai xuat|return(?:s|ed)?|fit again|back in training)\b/.test(
      text,
    )
  )
    return "recovery";
  if (
    /\b(chan thuong|injur(?:y|ed)|vang mat|ruled out|miss(?:es|ing)? the match)\b/.test(
      text,
    )
  )
    return "injury";
  if (
    /\b(chuyen nhuong|transfer|ky hop dong|sign(?:s|ed|ing)?|gia nhap|bid for|deal for|medical)\b/.test(
      text,
    )
  )
    return "transfer";
  if (
    /\b(ket qua|danh bai|chien thang|thang|thua|hoa|draw|wins?|won|beats?|full time|vo dich|champion)\b/.test(
      text,
    )
  )
    return "result";
  if (/\b(doi hinh|lineup|line up|starting xi|xuat phat)\b/.test(text))
    return "lineup";
  if (/\b(truoc tran|preview|nhan dinh|du doan)\b/.test(text)) return "preview";
  if (/\b(announce|launch)\b/.test(text)) return "announcement";
  if (/\b(phat bieu|noi gi|says?|said|quote|tuyen bo)\b/.test(text))
    return "quote";
  if (/\b(dang cap nhat|developing story|developing)\b/.test(text))
    return "developing";
  if (/\b(tin nong|khan cap|breaking)\b/.test(text)) return "breaking";
  return "news";
}

function tokens(value: string, includeEventWords = false): Set<string> {
  return new Set(
    canonicalized(value)
      .split(" ")
      .filter(
        (token) =>
          token.length >= 3 ||
          SIGNIFICANT_SHORT_TOKENS.has(token) ||
          (includeEventWords && /^\d+$/.test(token)),
      )
      .filter((token) => !STOP_WORDS.has(token))
      .filter((token) => includeEventWords || !EVENT_WORDS.has(token)),
  );
}

function overlapCoefficient(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  const common = [...left].filter((token) => right.has(token)).length;
  return common / Math.min(left.size, right.size);
}

function commonTokenCount(left: Set<string>, right: Set<string>): number {
  return [...left].filter((token) => right.has(token)).length;
}

function eventTypesCompatible(
  left: StoryEventType,
  right: StoryEventType,
): boolean {
  if (left === right) return true;
  if (GENERIC_EVENT_PHASES.has(left) || GENERIC_EVENT_PHASES.has(right))
    return true;
  const pair = [left, right].sort().join(":");
  // Publishers often describe the same official act as an announcement,
  // decision or quotation. Other typed events stay isolated by default.
  return pair === "announcement:decision" || pair === "announcement:quote";
}

function validTime(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function timeWindowHours(type: StoryEventType): number {
  switch (type) {
    case "transfer":
      return 14 * 24;
    case "correction":
      return 7 * 24;
    case "investigation":
    case "legal":
      return 5 * 24;
    case "injury":
    case "recovery":
      return 4 * 24;
    case "announcement":
    case "award":
    case "decision":
    case "disaster":
    case "election":
      return 72;
    case "conflict":
      return 36;
    case "economy":
      return 30;
    case "preview":
    case "lineup":
    case "result":
      return 36;
    case "quote":
      return 36;
    case "breaking":
      return 24;
    default:
      return 48;
  }
}

function scoreFacts(value: string): string[] {
  const text = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return [...text.matchAll(/\b(\d{1,2})\s*(?:-|:)\s*(\d{1,2})\b/g)].map(
    (match) => `${Number(match[1])}-${Number(match[2])}`,
  );
}

function entityTokenSequence(value: string): string[] {
  return canonicalized(value)
    .split(" ")
    .filter((token) => token.length >= 3 || SIGNIFICANT_SHORT_TOKENS.has(token))
    .filter((token) => !STOP_WORDS.has(token) && !EVENT_WORDS.has(token));
}

function geographyTokens(value: string): Set<string> {
  return new Set(
    canonicalized(value)
      .split(" ")
      .filter((token) => GEO_TOKENS.has(token)),
  );
}

function participantsAreReversed(
  left: ClusterableArticle,
  right: ClusterableArticle,
): boolean {
  const leftSequence = [...new Set(entityTokenSequence(left.title))];
  const rightSequence = [...new Set(entityTokenSequence(right.title))];
  const rightPositions = new Map(
    rightSequence.map((token, index) => [token, index]),
  );
  const shared = leftSequence.filter((token) => rightPositions.has(token));
  if (shared.length < 2) return false;

  let sameOrderPairs = 0;
  let reversedOrderPairs = 0;
  for (let index = 0; index < shared.length; index += 1) {
    for (
      let otherIndex = index + 1;
      otherIndex < shared.length;
      otherIndex += 1
    ) {
      const firstPosition = rightPositions.get(shared[index]);
      const secondPosition = rightPositions.get(shared[otherIndex]);
      if (firstPosition === undefined || secondPosition === undefined) continue;
      if (firstPosition < secondPosition) sameOrderPairs += 1;
      else reversedOrderPairs += 1;
    }
  }
  return reversedOrderPairs > sameOrderPairs;
}

function reverseScore(score: string): string {
  const [home, away] = score.split("-");
  return `${away}-${home}`;
}

function hasConflictingScore(
  left: ClusterableArticle,
  right: ClusterableArticle,
  type: StoryEventType,
): boolean {
  if (type !== "result") return false;
  const leftScores = scoreFacts(`${left.title} ${left.excerpt}`);
  const rightScores = scoreFacts(`${right.title} ${right.excerpt}`);
  if (!leftScores.length || !rightScores.length) return false;
  if (leftScores.some((score) => rightScores.includes(score))) return false;
  const mirroredScore = leftScores.some((score) =>
    rightScores.includes(reverseScore(score)),
  );
  if (mirroredScore && participantsAreReversed(left, right)) return false;
  return true;
}

function sameCanonicalUrl(
  left: ClusterableArticle,
  right: ClusterableArticle,
): boolean {
  const a = left.canonicalUrl ?? left.originalUrl;
  const b = right.canonicalUrl ?? right.originalUrl;
  if (!a || !b) return false;
  try {
    const first = new URL(a);
    const second = new URL(b);
    first.hash = "";
    second.hash = "";
    return first.toString() === second.toString();
  } catch {
    return false;
  }
}

function evidenceForPair(
  article: ClusterableArticle,
  other: ClusterableArticle,
) {
  const articleType = storyEventType(`${article.title} ${article.excerpt}`);
  const otherType = storyEventType(`${other.title} ${other.excerpt}`);
  const articleTime = validTime(article.publishedAt);
  const otherTime = validTime(other.publishedAt);
  if (articleTime === null || otherTime === null)
    return { score: 0, compatible: false, reason: "invalid_published_time" };

  const hours = Math.abs(articleTime - otherTime) / 3_600_000;
  const maxHours = Math.max(
    timeWindowHours(articleType),
    timeWindowHours(otherType),
  );
  if (hours > maxHours)
    return { score: 0, compatible: false, reason: "outside_event_time_window" };

  if (hasConflictingNumbers(article.title, other.title))
    return { score: 0, compatible: false, reason: "number_sequence_conflict" };
  if (hasAwardConflict(article.title, other.title))
    return { score: 0, compatible: false, reason: "award_rank_conflict" };
  if (hasTrainingScheduleConflict(article.title, other.title))
    return { score: 0, compatible: false, reason: "training_schedule_conflict" };
  if (hasDateMismatch(article.title, other.title))
    return { score: 0, compatible: false, reason: "date_mismatch_conflict" };

  if (!eventTypesCompatible(articleType, otherType))
    return { score: 0, compatible: false, reason: "event_phase_conflict" };
  if (
    hasConflictingScore(
      article,
      other,
      articleType === "result" ? articleType : otherType,
    )
  )
    return { score: 0, compatible: false, reason: "score_fact_conflict" };

  if (sameCanonicalUrl(article, other))
    return { score: 1, compatible: true, reason: "same_canonical_url" };

  const semanticTitleSimilarity = overlapCoefficient(
    tokens(article.title, true),
    tokens(other.title, true),
  );
  const titleSimilarity = Math.max(
    duplicateSimilarity(article.title, other.title),
    duplicateSimilarity(
      canonicalized(article.title),
      canonicalized(other.title),
    ),
    semanticTitleSimilarity,
  );
  const leftEntities = tokens(article.title);
  const rightEntities = tokens(other.title);
  const sharedEntities = commonTokenCount(leftEntities, rightEntities);
  const entityOverlap = overlapCoefficient(leftEntities, rightEntities);
  const bodyOverlap = overlapCoefficient(
    tokens(`${article.title} ${article.excerpt}`, true),
    tokens(`${other.title} ${other.excerpt}`, true),
  );
  const sameTypedEvent = articleType === otherType;

  // Headlines such as "Here's the latest" carry no event identity. Identical
  // boilerplate must not outweigh unrelated article descriptions; require the
  // excerpts themselves to share multiple meaningful terms before review/merge.
  const lowInformationTitle =
    leftEntities.size < 2 || rightEntities.size < 2;
  if (lowInformationTitle) {
    const leftContext = tokens(article.excerpt, true);
    const rightContext = tokens(other.excerpt, true);
    const sharedContext = commonTokenCount(leftContext, rightContext);
    const contextOverlap = overlapCoefficient(leftContext, rightContext);
    if (sharedContext < 2 || contextOverlap < 0.3)
      return {
        score: 0,
        compatible: false,
        reason: "generic_title_without_shared_context",
      };
  }

  // One shared name is never sufficient: it can otherwise merge separate
  // stories about the same politician, company, team or country.
  const entityFloor = 2;
  const exactishTitle = titleSimilarity >= CLUSTER_THRESHOLDS.nearDuplicate;
  if (!exactishTitle && sharedEntities < entityFloor)
    return {
      score: 0,
      compatible: false,
      reason: "insufficient_shared_entities",
    };

  // A generic phase can follow a typed event, while two compatible typed labels
  // need a little less title identity (for example "announces" vs "approves").
  if (!sameTypedEvent) {
    const bridgeThreshold =
      GENERIC_EVENT_PHASES.has(articleType) ||
      GENERIC_EVENT_PHASES.has(otherType)
        ? 0.64
        : 0.58;
    if (titleSimilarity < bridgeThreshold)
      return {
        score: 0,
        compatible: false,
        reason: "event_type_bridge_blocked",
      };
  }

  const leftGeography = geographyTokens(`${article.title} ${article.excerpt}`);
  const rightGeography = geographyTokens(`${other.title} ${other.excerpt}`);
  const sharedGeography = commonTokenCount(leftGeography, rightGeography);
  if (leftGeography.size && rightGeography.size && sharedGeography === 0)
    return { score: 0, compatible: false, reason: "geography_conflict" };
  const divergentGeography =
    sharedGeography > 0 &&
    [...leftGeography].some((token) => !rightGeography.has(token)) &&
    [...rightGeography].some((token) => !leftGeography.has(token));

  const timeSignal = Math.max(0, 1 - hours / maxHours);
  let score =
    titleSimilarity * 0.42 +
    entityOverlap * 0.28 +
    bodyOverlap * 0.17 +
    timeSignal * 0.07 +
    (sameTypedEvent ? 0.03 : 0) +
    (sharedEntities >= 3 ? 0.03 : 0);
  if (divergentGeography) score -= 0.12;
  if (article.sourceId === other.sourceId && titleSimilarity < 0.8)
    score -= 0.1;
  return {
    score: Math.max(0, Math.min(1, score)),
    compatible: true,
    reason: "event_entities_facts_time",
  };
}

export function clusterSimilarity(
  article: ClusterableArticle,
  candidate: ClusterCandidate,
): { score: number; compatible: boolean; reason: string } {
  let best = { score: 0, compatible: false, reason: "empty_candidate" };
  for (const other of candidate.articles) {
    const result = evidenceForPair(article, other);
    if (result.compatible && (!best.compatible || result.score > best.score))
      best = result;
    else if (!best.compatible && result.score >= best.score) best = result;
  }
  return best;
}

function hostname(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "");
  } catch {
    return null;
  }
}

function metadataString(
  metadata: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function agencyName(article: ClusterableArticle): string | null {
  const explicit = metadataString(article.rawMetadata, [
    "originalSource",
    "original_source",
    "syndicatedFrom",
    "syndicated_from",
    "wireSource",
    "wire_source",
    "agency",
  ]);
  const value = explicit ?? article.author ?? article.sourceName ?? "";
  const match = value.match(AGENCY_PATTERN);
  return match ? normalized(match[0]) : explicit ? normalized(explicit) : null;
}

/**
 * Groups copied wire coverage as one independent source. Explicit RSS metadata
 * wins; otherwise only extremely similar title+excerpt pairs are inferred as
 * syndicated, deliberately favouring under-detection over false positives.
 */
export function analyzeSourceIndependence(articles: ClusterableArticle[]): {
  independentSourceCount: number;
  syndicatedArticleIds: Set<string>;
  groupByArticleId: Map<string, string>;
} {
  const syndicatedArticleIds = new Set(
    articles
      .filter((article) => article.isSyndicated)
      .map((article) => article.id),
  );
  const groupByArticleId = new Map<string, string>();

  for (const article of articles) {
    const agency = agencyName(article);
    const publisher =
      hostname(article.canonicalUrl ?? article.originalUrl) ??
      normalized(article.sourceName ?? article.sourceId);
    const sourceLooksLikeAgency = agency
      ? normalized(article.sourceName ?? "").includes(agency)
      : false;
    if (agency) {
      groupByArticleId.set(article.id, `agency:${agency}`);
      if (!sourceLooksLikeAgency) syndicatedArticleIds.add(article.id);
    } else {
      groupByArticleId.set(
        article.id,
        `publisher:${publisher || article.sourceId}`,
      );
    }
  }

  const ordered = [...articles].sort(
    (a, b) => (validTime(a.publishedAt) ?? 0) - (validTime(b.publishedAt) ?? 0),
  );
  for (let index = 0; index < ordered.length; index += 1) {
    const primary = ordered[index];
    for (
      let otherIndex = index + 1;
      otherIndex < ordered.length;
      otherIndex += 1
    ) {
      const copy = ordered[otherIndex];
      if (
        primary.sourceId === copy.sourceId ||
        primary.isOfficial ||
        copy.isOfficial
      )
        continue;
      const hours =
        Math.abs(
          (validTime(primary.publishedAt) ?? 0) -
            (validTime(copy.publishedAt) ?? 0),
        ) / 3_600_000;
      if (hours > 24 || primary.excerpt.length < 80 || copy.excerpt.length < 80)
        continue;
      const titleSimilarity = duplicateSimilarity(primary.title, copy.title);
      const excerptSimilarity = duplicateSimilarity(
        primary.excerpt,
        copy.excerpt,
      );
      if (
        titleSimilarity >= 0.82 &&
        excerptSimilarity >= CLUSTER_THRESHOLDS.nearDuplicate
      ) {
        groupByArticleId.set(
          copy.id,
          groupByArticleId.get(primary.id) ?? `publisher:${primary.sourceId}`,
        );
        syndicatedArticleIds.add(copy.id);
      }
    }
  }

  const independentArticles = articles.filter(
    (article) => !syndicatedArticleIds.has(article.id),
  );
  const counted = independentArticles.length
    ? independentArticles
    : articles.slice(0, 1);
  const groups = new Set(
    counted.map(
      (article) =>
        groupByArticleId.get(article.id) ?? `publisher:${article.sourceId}`,
    ),
  );
  return {
    independentSourceCount: groups.size,
    syndicatedArticleIds,
    groupByArticleId,
  };
}

function hasConflictingNumbers(title1: string, title2: string): boolean {
  const t1 = canonicalized(title1);
  const t2 = canonicalized(title2);
  const matches1 = t1.match(/\b\d+\b/g);
  const matches2 = t2.match(/\b\d+\b/g);
  if (!matches1 || !matches2) return false;
  const nums1 = [...new Set(matches1.map(n => parseInt(n, 10)).filter(n => n < 1900 || n > 2100))];
  const nums2 = [...new Set(matches2.map(n => parseInt(n, 10)).filter(n => n < 1900 || n > 2100))];
  if (nums1.length === 0 || nums2.length === 0) return false;
  const intersection = nums1.filter(n => nums2.includes(n));
  if (intersection.length === 0) {
    const getPatternValue = (text: string, pattern: RegExp): number | null => {
      const m = text.match(pattern);
      return m ? parseInt(m[1], 10) : null;
    };
    const patterns = [
      /\bno\s+(\d+)\b/i,
      /\bngay\s+(\d+)\b/i,
      /\bvong\s+(\d+)\b/i,
      /\btran\s+(\d+)\b/i,
      /\btap\s+(\d+)\b/i,
      /\btop\s+(\d+)\b/i,
      /\bstar\s+(\d+)\b/i,
    ];
    for (const pattern of patterns) {
      const val1 = getPatternValue(t1, pattern);
      const val2 = getPatternValue(t2, pattern);
      if (val1 !== null && val2 !== null && val1 !== val2) {
        return true;
      }
    }
  }
  return false;
}

function hasAwardConflict(title1: string, title2: string): boolean {
  const t1 = canonicalized(title1);
  const t2 = canonicalized(title2);
  const isChampion1 = /\b(vo dich|champion|cup|quan quan|giai nhat|giai cup)\b/i.test(t1);
  const isChampion2 = /\b(vo dich|champion|cup|quan quan|giai nhat|giai cup)\b/i.test(t2);
  const isRunnerUp1 = /\b(giai nhi|a quan|giai ba|khuyen khich)\b/i.test(t1);
  const isRunnerUp2 = /\b(giai nhi|a quan|giai ba|khuyen khich)\b/i.test(t2);
  if ((isChampion1 && isRunnerUp2) || (isChampion2 && isRunnerUp1)) {
    return true;
  }
  return false;
}

function hasTrainingScheduleConflict(title1: string, title2: string): boolean {
  const t1 = canonicalized(title1);
  const t2 = canonicalized(title2);
  const isTraining1 = /\b(tap huan|training|hoi quan|ren luyen)\b/i.test(t1);
  const isTraining2 = /\b(tap huan|training|hoi quan|ren luyen)\b/i.test(t2);
  const isSchedule1 = /\b(lich thi dau|schedule|fixture|thi dau|ket qua)\b/i.test(t1);
  const isSchedule2 = /\b(lich thi dau|schedule|fixture|thi dau|ket qua)\b/i.test(t2);
  if ((isTraining1 && isSchedule2) || (isTraining2 && isSchedule1)) {
    return true;
  }
  return false;
}

function hasDateMismatch(title1: string, title2: string): boolean {
  const t1 = canonicalized(title1);
  const t2 = canonicalized(title2);
  const datePattern = /\b(\d{1,2})[/-](\d{1,2})\b/g;
  const dates1 = [...t1.matchAll(datePattern)].map(m => `${m[1]}/${m[2]}`);
  const dates2 = [...t2.matchAll(datePattern)].map(m => `${m[1]}/${m[2]}`);
  if (dates1.length && dates2.length) {
    const shared = dates1.filter(d => dates2.includes(d));
    if (shared.length === 0) {
      return true;
    }
  }
  const dayPattern = /\bngay\s+(\d{1,2})\b/g;
  const days1 = [...t1.matchAll(dayPattern)].map(m => parseInt(m[1], 10));
  const days2 = [...t2.matchAll(dayPattern)].map(m => parseInt(m[1], 10));
  if (days1.length && days2.length) {
    const shared = days1.filter(d => days2.includes(d));
    if (shared.length === 0) {
      return true;
    }
  }
  return false;
}
