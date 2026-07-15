import { z } from "zod";

export const sportsProviderSchema = z.enum(["football-data", "api-football", "thesportsdb", "openligadb", "statsbomb"]);
export type SportsProviderName = z.infer<typeof sportsProviderSchema>;

export const sportsCapabilitySchema = z.enum([
  "fixtures", "results", "standings", "live_score", "events", "lineups", "statistics",
  "players", "transfers", "injuries", "logos", "historical_analytics",
]);
export type SportsCapability = z.infer<typeof sportsCapabilitySchema>;
export type DataFreshness = "fresh" | "delayed" | "stale" | "unknown";

const providerFields = {
  provider: sportsProviderSchema,
  externalId: z.string().min(1),
  fetchedAt: z.string().datetime(),
  sourceTimestamp: z.string().datetime().nullable(),
  dataFreshness: z.enum(["fresh", "delayed", "stale", "unknown"]),
  rawMetadata: z.record(z.string(), z.unknown()).default({}),
};

export const normalizedCompetitionSchema = z.object({
  ...providerFields,
  name: z.string().min(1), slug: z.string().min(1), country: z.string().nullable(), season: z.string().nullable(),
  logoUrl: z.string().url().nullable(), capabilities: z.array(sportsCapabilitySchema).default([]),
});
export type NormalizedCompetition = z.infer<typeof normalizedCompetitionSchema>;

export const normalizedTeamSchema = z.object({
  ...providerFields,
  competitionExternalId: z.string().nullable(), name: z.string().min(1), shortName: z.string().min(1),
  slug: z.string().min(1), country: z.string().nullable(), logoUrl: z.string().url().nullable(), venue: z.string().nullable(),
});
export type NormalizedTeam = z.infer<typeof normalizedTeamSchema>;

export const normalizedPlayerSchema = z.object({
  ...providerFields,
  teamExternalId: z.string().nullable(), name: z.string().min(1), slug: z.string().min(1), nationality: z.string().nullable(),
  position: z.string().nullable(), imageUrl: z.string().url().nullable(), dateOfBirth: z.string().nullable(),
});
export type NormalizedPlayer = z.infer<typeof normalizedPlayerSchema>;

export const normalizedMatchSchema = z.object({
  ...providerFields,
  competitionExternalId: z.string().min(1), season: z.string().min(1), homeTeamExternalId: z.string().min(1), awayTeamExternalId: z.string().min(1),
  kickoffAt: z.string().datetime(), status: z.enum(["scheduled", "live", "paused", "finished", "postponed", "cancelled"]),
  minute: z.number().int().min(0).max(200).nullable(), homeScore: z.number().int().min(0).nullable(), awayScore: z.number().int().min(0).nullable(),
  venue: z.string().nullable(), referee: z.string().nullable(), round: z.string().nullable(), stage: z.string().nullable(), matchday: z.number().int().nullable(),
});
export type NormalizedMatch = z.infer<typeof normalizedMatchSchema>;

export const normalizedMatchEventSchema = z.object({ ...providerFields, matchExternalId: z.string(), teamExternalId: z.string().nullable(), playerExternalId: z.string().nullable(), relatedPlayerExternalId: z.string().nullable(), type: z.string(), minute: z.number().int().nullable(), extraMinute: z.number().int().nullable() });
export type NormalizedMatchEvent = z.infer<typeof normalizedMatchEventSchema>;

export const normalizedStandingSchema = z.object({
  ...providerFields,
  competitionExternalId: z.string(), teamExternalId: z.string(), season: z.string(), position: z.number().int().positive(),
  played: z.number().int().nonnegative(), won: z.number().int().nonnegative(), drawn: z.number().int().nonnegative(), lost: z.number().int().nonnegative(),
  goalsFor: z.number().int(), goalsAgainst: z.number().int(), points: z.number().int(), form: z.array(z.enum(["W", "D", "L"])),
});
export type NormalizedStanding = z.infer<typeof normalizedStandingSchema>;

export const normalizedLineupSchema = z.object({ ...providerFields, matchExternalId: z.string(), teamExternalId: z.string(), formation: z.string().nullable(), starters: z.array(z.string()), substitutes: z.array(z.string()) });
export type NormalizedLineup = z.infer<typeof normalizedLineupSchema>;

export const normalizedMatchStatisticsSchema = z.object({ ...providerFields, matchExternalId: z.string(), teamExternalId: z.string(), values: z.record(z.string(), z.number().nullable()) });
export type NormalizedMatchStatistics = z.infer<typeof normalizedMatchStatisticsSchema>;

export type NormalizedMatchLineup = {
  teamExternalId: string;
  teamName: string;
  formation: string | null;
  starters: Array<{ externalId: string; name: string; number: number | null; position: string | null; grid: string | null }>;
  substitutes: Array<{ externalId: string; name: string; number: number | null; position: string | null }>;
  coach: { externalId: string | null; name: string | null; imageUrl: string | null };
};

export type NormalizedMatchInjury = {
  teamExternalId: string | null;
  teamName: string | null;
  playerExternalId: string | null;
  playerName: string;
  playerImageUrl: string | null;
  type: string | null;
  reason: string | null;
};

export type NormalizedMatchDetails = {
  matchExternalId: string;
  fetchedAt: string;
  events: NormalizedMatchEvent[];
  statistics: NormalizedMatchStatistics[];
  lineups: NormalizedMatchLineup[];
  players: NormalizedPlayer[];
  injuries: NormalizedMatchInjury[];
  prediction: Record<string, unknown> | null;
  headToHead: NormalizedMatch[];
};

export type NormalizedTransfer = {
  externalId: string;
  playerExternalId: string;
  playerName: string;
  fromTeamExternalId: string | null;
  fromTeamName: string | null;
  toTeamExternalId: string | null;
  toTeamName: string | null;
  transferDate: string;
  transferType: string;
  rawMetadata: Record<string, unknown>;
};

export function dataFreshness(sourceTimestamp: string | null, now = Date.now()): DataFreshness {
  if (!sourceTimestamp) return "unknown";
  const age = now - Date.parse(sourceTimestamp);
  if (!Number.isFinite(age)) return "unknown";
  if (age <= 5 * 60_000) return "fresh";
  if (age <= 60 * 60_000) return "delayed";
  return "stale";
}
