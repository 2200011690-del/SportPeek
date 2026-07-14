export type MatchStatus = "scheduled" | "live" | "finished";

export interface Team {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  country: string;
  accent: string;
  stadium: string;
}

export interface Competition {
  id: string;
  name: string;
  slug: string;
  country: string;
  season: string;
}

export interface NewsItem {
  id: string;
  title: string;
  slug: string;
  summary: string;
  keyPoints: string[];
  category: string;
  competition: string;
  team: string;
  publishedAt: string;
  publishedTimestamp?: string;
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

export interface Match {
  id: string;
  competition: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  startTime: string;
  startTimestamp?: string;
  status: MatchStatus;
  minute?: number;
  venue: string;
}

export interface Standing {
  position: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalDifference: number;
  points: number;
  form: ("W" | "D" | "L")[];
}
