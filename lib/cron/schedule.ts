export type ScheduledPipelineTask = "rss" | "stories" | "ai";
export type ScheduledPipelineRunners = Record<
  ScheduledPipelineTask,
  () => Promise<void>
>;

/**
 * Cloudflare Cron Triggers allow up to 15 minutes of wall time. Treat a job as
 * abandoned just before that platform ceiling so healthy I/O-heavy work is not
 * reclaimed by the next three-minute phase.
 */
export const SCHEDULED_PIPELINE_STALL_MS = 14 * 60_000;

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
  const drainBacklog = minute % 8 === 7;
  return {
    useAi: false,
    aiLimit: 0,
    matchAiLimit: 0,
    limit: 12,
    candidateLimit: 96,
    leaseSeconds: 600,
    oldestFirst: drainBacklog,
    includeFailed: drainBacklog,
  } as const;
}
