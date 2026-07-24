export type ScheduledPipelineTask = "rss" | "stories" | "ai";
export type ScheduledPipelineRunners = Record<
  ScheduledPipelineTask,
  () => Promise<void>
>;

/**
 * RSS and story phases normally finish in seconds and recur every three
 * minutes. A five-minute lease lets one overlapping invocation finish while
 * ensuring a deploy, isolate eviction, or platform interruption can block at
 * most one subsequent phase instead of freezing ingestion for 15 minutes.
 */
export const SCHEDULED_PIPELINE_STALL_MS = 5 * 60_000;

/**
 * The Worker is triggered once per minute. Keeping the phase selection pure
 * makes the production schedule deterministic and straightforward to test.
 *
 * The AI backlog has its own phase so summary generation keeps moving even
 * when raw RSS articles never fully drain.
 */
export function scheduledPipelineTask(
  timestampMs: number,
): ScheduledPipelineTask {
  if (!Number.isFinite(timestampMs)) {
    throw new TypeError("Scheduled timestamp must be finite");
  }
  const phase = new Date(timestampMs).getUTCMinutes() % 3;
  if (phase === 0) return "rss";
  if (phase === 1) return "stories";
  return "ai";
}

export function runScheduledPipelineTask(
  task: ScheduledPipelineTask,
  runners: ScheduledPipelineRunners,
): Promise<void> {
  return runners[task]();
}

/**
 * Keep batches below the Worker CPU ceiling. Story creation is deliberately
 * source-backed only; remote summaries are handled by the separate AI phase.
 * Three of every four story runs prioritize breaking news; the fourth drains
 * the oldest active-source backlog.
 */
export function scheduledStoryProcessingOptions(timestampMs = Date.now()) {
  if (!Number.isFinite(timestampMs)) {
    throw new TypeError("Scheduled timestamp must be finite");
  }
  const minute = new Date(timestampMs).getUTCMinutes();
  // Story phases occur every three minutes. Minute 7 in each 12-minute window
  // is therefore exactly one of every four story runs.
  const drainBacklog = minute % 12 === 7;
  return {
    useAi: false,
    aiLimit: 0,
    matchAiLimit: 0,
    limit: 12,
    candidateLimit: 96,
    leaseSeconds: 240,
    oldestFirst: drainBacklog,
    includeFailed: drainBacklog,
  } as const;
}
