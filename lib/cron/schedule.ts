export type ScheduledPipelineTask = "rss" | "stories" | "ai";

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
    limit: 16,
    candidateLimit: 128,
    leaseSeconds: 120,
    oldestFirst: drainBacklog,
    includeFailed: drainBacklog,
  } as const;
}
