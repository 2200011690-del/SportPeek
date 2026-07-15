import type { MatchCapability, MatchStatus, Standing } from "@/lib/types";

export function deriveMatchCapabilities(input: {
  status: MatchStatus;
  venue?: string | null;
  referee?: string | null;
  eventCount: number;
  statisticCount: number;
  lineupCount?: number;
  injuryCount?: number;
  headToHeadCount?: number;
  hasPrediction?: boolean;
  standings: Standing[];
}): Record<MatchCapability, boolean> {
  return {
    score: !["scheduled", "postponed", "cancelled"].includes(input.status),
    venue: Boolean(input.venue),
    referee: Boolean(input.referee),
    events: input.eventCount > 0,
    lineups: (input.lineupCount ?? 0) > 0,
    statistics: input.statisticCount > 0,
    injuries: (input.injuryCount ?? 0) > 0,
    standings: input.standings.length > 0,
    form: input.standings.some((standing) => standing.form.length > 0),
    head_to_head: (input.headToHeadCount ?? 0) > 0,
    preview: Boolean(input.hasPrediction),
    recap: false,
    official_highlights: false,
  };
}
