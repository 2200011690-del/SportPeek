export type ScheduledPipelineTask = "rss" | "stories";
export type ScheduledSportsTask = {
  command:
    | "competitions"
    | "teams"
    | "fixtures"
    | "results"
    | "matches"
    | "daily"
    | "standings"
    | "live"
    | "details"
    | "transfers";
  competitionIds?: string[];
  dateOffset?: number;
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

// All current free-tier competitions discovered from football-data.org. EC is
// intentionally excluded because its "current" season is still Euro 2024 and
// would create a stale, empty competition in the live product.
const FOOTBALL_DATA_COMPETITIONS = [
  "PL",
  "CL",
  "PD",
  "SA",
  "BL1",
  "FL1",
  "DED",
  "PPL",
  "BSA",
  "ELC",
  "WC",
  "CLI",
];

const API_FOOTBALL_COMPETITIONS = [
  "2",
  "39",
  "40",
  "61",
  "71",
  "78",
  "88",
  "94",
  "135",
  "140",
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

/**
 * Refresh football-data.org one competition at a time. This keeps every run
 * below the free-tier rate limit and the Workers subrequest ceiling while
 * ensuring discovered competitions are populated instead of remaining empty
 * shells forever.
 */
export function scheduledFootballDataTask(
  timestampMs: number,
): ScheduledSportsTask | null {
  if (!Number.isFinite(timestampMs))
    throw new TypeError("Scheduled timestamp must be finite");
  const date = new Date(timestampMs);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const competitionAt = (startMinute: number) => {
    const index = minute - startMinute;
    return index >= 0 && index < FOOTBALL_DATA_COMPETITIONS.length
      ? [FOOTBALL_DATA_COMPETITIONS[index]]
      : null;
  };

  if (hour === 0 && minute === 18) return { command: "competitions" };

  const dailyTeam = hour === 0 ? competitionAt(20) : null;
  if (dailyTeam) return { command: "teams", competitionIds: dailyTeam };

  const fixture = [1, 13].includes(hour) ? competitionAt(20) : null;
  if (fixture) return { command: "fixtures", competitionIds: fixture };

  const result = [2, 8, 14, 20].includes(hour) ? competitionAt(20) : null;
  if (result) return { command: "results", competitionIds: result };

  const standing = [3, 15].includes(hour) ? competitionAt(20) : null;
  if (standing) return { command: "standings", competitionIds: standing };

  // Rotate all competitions once per hour during the main match window.
  const live = hour >= 9 && hour <= 22 ? competitionAt(35) : null;
  if (live) return { command: "live", competitionIds: live };

  return null;
}

/**
 * API-Football Free allows 100 calls/day and 10 calls/minute. This schedule
 * stays around 48 calls/day: one catalog call, one rotating metadata refresh,
 * three free-plan match-date calls, fourteen global live calls and four rich
 * match-detail runs (seven sequential endpoints each), plus one rotating
 * team transfer refresh.
 */
export function scheduledApiFootballTask(
  timestampMs: number,
): ScheduledSportsTask | null {
  if (!Number.isFinite(timestampMs))
    throw new TypeError("Scheduled timestamp must be finite");
  const date = new Date(timestampMs);
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const dayBucket = Math.floor(timestampMs / (24 * 60 * 60_000));

  if (hour === 0 && minute === 48) return { command: "competitions" };
  if (hour === 0 && minute === 49)
    return {
      command: "teams",
      competitionIds: [
        API_FOOTBALL_COMPETITIONS[
          dayBucket % API_FOOTBALL_COMPETITIONS.length
        ],
      ],
    };
  if (hour === 0 && minute === 53)
    return {
      command: "transfers",
      competitionIds: [
        API_FOOTBALL_COMPETITIONS[
          dayBucket % API_FOOTBALL_COMPETITIONS.length
        ],
      ],
    };
  if (hour === 4 && minute >= 40 && minute < 43)
    return {
      command: "daily",
      dateOffset: minute - 41,
    };
  if (hour >= 9 && hour <= 22 && minute === 50)
    return { command: "live" };
  if ([1, 7, 13, 19].includes(hour) && minute === 52)
    return { command: "details" };
  return null;
}
