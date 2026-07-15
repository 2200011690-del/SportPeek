export type ScheduledPipelineTask = "rss" | "stories";
export type ScheduledSportsTask = {
  command:
    "competitions" | "teams" | "fixtures" | "results" | "standings" | "live";
  competitionIds?: string[];
};

const OPENLIGA_COMPETITIONS = [
  "bl2",
  "bl3",
  "dfb",
  "ffb1",
  "regio-bayern",
  "BLSupercup",
  "unl",
];

/**
 * The Worker is triggered once per minute. Keeping the phase selection pure
 * makes the production schedule deterministic and straightforward to test.
 */
export function scheduledPipelineTask(
  timestampMs: number,
): ScheduledPipelineTask {
  if (!Number.isFinite(timestampMs))
    throw new TypeError("Scheduled timestamp must be finite");
  return new Date(timestampMs).getUTCMinutes() % 2 === 0 ? "rss" : "stories";
}

/** One story per run ensures every newly completed story gets one remote-AI attempt. */
export function scheduledStoryProcessingOptions() {
  return { useAi: true, aiLimit: 1, limit: 1 } as const;
}

/**
 * Keep the no-cost community provider fresh without syncing every league in a
 * single Worker invocation. One competition per slot stays below subrequest
 * limits and avoids hammering OpenLigaDB.
 */
export function scheduledSportsTask(
  timestampMs: number,
): ScheduledSportsTask | null {
  if (!Number.isFinite(timestampMs))
    throw new TypeError("Scheduled timestamp must be finite");
  const date = new Date(timestampMs);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();

  if (hour === 0 && minute === 1) return { command: "competitions" };
  if (
    hour === 0 &&
    minute >= 10 &&
    minute < 10 + OPENLIGA_COMPETITIONS.length
  ) {
    return {
      command: "teams",
      competitionIds: [OPENLIGA_COMPETITIONS[minute - 10]],
    };
  }

  if (minute >= 1 && minute <= OPENLIGA_COMPETITIONS.length) {
    const competitionIds = [OPENLIGA_COMPETITIONS[minute - 1]];
    if (hour % 6 === 1) return { command: "fixtures", competitionIds };
    if (hour % 6 === 2) return { command: "standings", competitionIds };
    if (hour % 6 === 3) return { command: "results", competitionIds };
  }

  if (hour >= 9 && hour <= 22 && minute % 5 === 0) {
    const bucket = Math.floor(timestampMs / (5 * 60_000));
    return {
      command: "live",
      competitionIds: [
        OPENLIGA_COMPETITIONS[bucket % OPENLIGA_COMPETITIONS.length],
      ],
    };
  }
  return null;
}
