export type ScheduledPipelineTask = "rss" | "stories";

/**
 * The Worker is triggered once per minute. Keeping the phase selection pure
 * makes the production schedule deterministic and straightforward to test.
 */
export function scheduledPipelineTask(timestampMs: number): ScheduledPipelineTask {
  if (!Number.isFinite(timestampMs)) {
    throw new TypeError("Scheduled timestamp must be finite");
  }
  return new Date(timestampMs).getUTCMinutes() % 2 === 0 ? "rss" : "stories";
}

/**
 * Process source metadata in economical batches while keeping remote AI to one
 * call. Alternating newest and oldest batches keeps breaking news fast without
 * allowing an older backlog to starve forever.
 */
export function scheduledStoryProcessingOptions(timestampMs = Date.now()) {
  if (!Number.isFinite(timestampMs)) {
    throw new TypeError("Scheduled timestamp must be finite");
  }
  const minute = new Date(timestampMs).getUTCMinutes();
  return { useAi: true, aiLimit: 1, limit: 20, oldestFirst: minute % 4 === 3 } as const;
}
