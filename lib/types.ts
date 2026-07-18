export interface NewsItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  keyPoints: string[];
  category: string;
  primaryTopic?: string;
  region?: string;
  /** Kept optional while older cached story payloads are migrated. */
  competition?: string;
  /** Kept optional while older cached story payloads are migrated. */
  team?: string;
  topics?: string[];
  locations?: string[];
  countries?: string[];
  publishedAt: string;
  publishedTimestamp?: string;
  updatedAt?: string;
  updatedTimestamp?: string;
  hotness: number;
  reliability: number;
  sources: string[];
  sourceDetails?: NewsSourceDetail[];
  imageUrl?: string;
  imageAlt?: string;
  imageSource?: string;
  readingBody?: string[];
  originalUrl?: string;
  originalLanguage?: "vi" | "en";
  translatedByAI?: boolean;
  trendingReasons?: string[];
  imageTone: string;
  featured?: boolean;
  storyStatus?: "official" | "reported" | "rumor" | "unverified" | "developing" | "disputed" | "completed" | "correction";
  personalization?: { score: number; reasons: string[] };
}

export interface NewsSourceDetail {
  name: string;
  url: string;
  reliability: number;
  language: "vi" | "en";
  excerpt?: string;
  articleId?: string;
  title?: string;
  publishedAt?: string;
  fetchedAt?: string;
  isOfficialSource?: boolean;
  imageUrl?: string;
  sourceLogoUrl?: string;
  canonicalUrl?: string;
  author?: string;
}

export interface NewsSourceCatalogItem {
  id: string;
  name: string;
  language: "vi" | "en";
  reliability: number;
  official: boolean;
  active: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
}
