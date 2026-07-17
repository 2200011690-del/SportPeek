export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

export interface Team {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  country: string;
  accent: string;
  stadium: string;
  logoUrl?: string;
}

export interface Competition {
  id: string;
  name: string;
  slug: string;
  country: string;
  season: string;
  logoUrl?: string;
}

export interface Player {
  id: string;
  name: string;
  slug: string;
  nationality: string;
  position: string;
  teamId?: string;
  teamName?: string;
  teamSlug?: string;
  imageUrl?: string;
  dateOfBirth?: string;
}

export interface TransferRecord {
  id: string;
  player: string;
  playerSlug: string;
  fromTeam?: string;
  fromTeamSlug?: string;
  toTeam?: string;
  toTeamSlug?: string;
  transferType: string;
  fee?: string;
  status: "rumor" | "negotiating" | "confirmed" | "cancelled";
  transferDate?: string;
  provider?: string;
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
  provider?: string;
  sourceTimestamp?: string;
  dataFreshness?: "fresh" | "delayed" | "stale" | "unknown";
}

export interface MatchEvent {
  id: string;
  type: string;
  minute: number;
  extraMinute?: number;
  team?: string;
  player?: string;
  relatedPlayer?: string;
}

export interface MatchStatistic {
  team: string;
  possession?: number;
  shots?: number;
  shotsOnTarget?: number;
  corners?: number;
  fouls?: number;
  yellowCards?: number;
  redCards?: number;
  expectedGoals?: number;
}

export interface MatchLineup {
  team: string;
  formation?: string;
  starters: Array<{ name: string; number?: number; position?: string; grid?: string }>;
  substitutes: Array<{ name: string; number?: number; position?: string }>;
  coach?: string;
}

export interface MatchInjury {
  team?: string;
  player: string;
  imageUrl?: string;
  type?: string;
  reason?: string;
}

export interface MatchPrediction {
  advice?: string;
  winner?: string;
  homePercent?: string;
  drawPercent?: string;
  awayPercent?: string;
  underOver?: string;
}

export interface HeadToHeadMatch {
  id: string;
  date: string;
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
}

export type MatchCapability = "score" | "venue" | "referee" | "events" | "lineups" | "statistics" | "injuries" | "standings" | "form" | "head_to_head" | "preview" | "recap" | "official_highlights";

export interface MatchDetailData {
  match: Match & {
    competitionId: string;
    competitionSlug: string;
    season: string;
    referee?: string;
    homeTeamId: string;
    homeTeamSlug: string;
    awayTeamId: string;
    awayTeamSlug: string;
  };
  events: MatchEvent[];
  statistics: MatchStatistic[];
  lineups: MatchLineup[];
  injuries: MatchInjury[];
  prediction: MatchPrediction | null;
  headToHead: HeadToHeadMatch[];
  standings: Standing[];
  capabilities: Record<MatchCapability, boolean>;
  providerCoverage: Array<{ capability: string; provider: string }>;
  updatedAt: string;
  stale: boolean;
}

export interface CompetitionDetailData {
  competition: Competition;
  teams: Team[];
  fixtures: Match[];
  results: Match[];
  standings: Standing[];
  providerCoverage: Array<{ capability: string; provider: string }>;
  updatedAt: string | null;
}

export interface TeamDetailData {
  team: Team;
  competitions: Competition[];
  fixtures: Match[];
  results: Match[];
  standings: Standing[];
  updatedAt: string | null;
}

export interface PlayerDetailData {
  player: Player;
  updatedAt: string | null;
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
  provider?: string;
  sourceTimestamp?: string;
  dataFreshness?: "fresh" | "delayed" | "stale" | "unknown";
  competitionId?: string;
  competition?: string;
  season?: string;
}
