export type ScheduledPipelineTask = "rss" | "stories";

/**
 * The Worker is triggered once per minute. Keeping the phase selection pure
 * makes the production schedule deterministic and straightforward to test.
 */
export function scheduledPipelineTask(timestampMs: number): ScheduledPipelineTask {
  if (!Number.isFinite(timestampMs)) throw new TypeError("Scheduled timestamp must be finite");
  return new Date(timestampMs).getUTCMinutes() % 2 === 0 ? "rss" : "stories";
}
