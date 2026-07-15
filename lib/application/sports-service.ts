import { ConfigurationError, toSafeError } from "@/lib/core/errors";
import { logger } from "@/lib/core/logger";
import { sportsCacheRepository, type MatchReadOptions } from "@/lib/sports-data/repository";
import type { Match, Standing, Team } from "@/lib/types";

export type SportsReadKind = "live" | "fixtures" | "results" | "standings" | "teams";
export type SportsReadResult<T> = {
  status: "success" | "empty" | "configuration_required" | "error";
  data: T[];
  provider: string;
  stale: boolean;
  updatedAt: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
};

type SportsDataByKind = { live: Match; fixtures: Match; results: Match; standings: Standing; teams: Team };

export class SportsApplicationService {
  async read<K extends SportsReadKind>(kind: K, options: MatchReadOptions = {}): Promise<SportsReadResult<SportsDataByKind[K]>> {
    try {
      const result = await (kind === "standings" ? sportsCacheRepository.readStandings() : kind === "teams" ? sportsCacheRepository.readTeams() : sportsCacheRepository.readMatches(kind, options)) as unknown as { data: SportsDataByKind[K][]; provider: string; stale: boolean; updatedAt: string | null };
      return { status: result.data.length ? "success" : "empty", data: result.data, provider: result.provider, stale: result.stale, updatedAt: result.updatedAt, error: result.stale ? { code: "STALE_DATA", message: "Dữ liệu có thể đã cũ.", retryable: true } : null };
    } catch (error) {
      const safe = toSafeError(error);
      logger.warn("sports_cache_read_failed", { provider: "supabase", code: safe.code, kind });
      return { status: error instanceof ConfigurationError ? "configuration_required" : "error", data: [], provider: "supabase", stale: false, updatedAt: null, error: safe };
    }
  }
}

export const sportsService = new SportsApplicationService();
