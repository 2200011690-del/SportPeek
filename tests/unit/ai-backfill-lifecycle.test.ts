import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const processor = readFileSync(
  new URL("../../lib/stories/processor.ts", import.meta.url),
  "utf8",
);
const backfillProcessor = processor.slice(
  processor.indexOf("export async function summarizePersistedStories"),
);

test("AI backfill recovers an expired orchestration lease before checking for an active job", () => {
  const recovery = backfillProcessor.indexOf(
    '.eq("job_type", "ai:backfill")\n      .eq("status", "processing")\n      .lt("started_at", leaseCutoff)',
  );
  const activeCheck = backfillProcessor.indexOf(
    'const { data: activeJobs, error: activeCheckError }',
  );

  assert.ok(recovery >= 0, "expected stale AI backfill recovery");
  assert.ok(activeCheck > recovery, "recovery must precede the active-job check");
  assert.match(backfillProcessor, /error_code: "LEASE_EXPIRED"/);
  assert.match(backfillProcessor, /completed_at: nowIso/);
});

test("AI backfill invokes idempotent job-history maintenance without blocking a rolling deploy", () => {
  assert.match(
    backfillProcessor,
    /client\.rpc\("maintain_newspeek_job_history", \{[\s\S]*p_force: false/,
  );
  assert.match(backfillProcessor, /\["42883", "PGRST202"\]/);
});
