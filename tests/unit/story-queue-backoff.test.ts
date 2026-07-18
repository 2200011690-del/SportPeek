import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607180003_story_queue_backoff.sql",
    import.meta.url,
  ),
  "utf8",
);

test("atomic job claim enforces backoff and retry bounds", () => {
  assert.match(
    migration,
    /create or replace function public\.claim_story_processing_batch/i,
  );
  assert.match(
    migration,
    /article\.processing_retry_after is null or article\.processing_retry_after <= now\(\)/i,
  );
  assert.match(migration, /processing_attempts < 5/i);
});

test("lease timeout and reclaim marks raw articles as failed with backoff", () => {
  assert.match(
    migration,
    /create or replace function public\.recover_story_processing_queue/i,
  );
  assert.match(
    migration,
    /processing_status = 'failed'[\s\S]*Previous story-processing lease expired/i,
  );
  assert.match(
    migration,
    /processing_retry_after = now\(\) \+ \(interval '2 minutes' \* power\(2, least\(article\.processing_attempts, 4\)\)\) \* \(0.8 \+ 0.4 \* random\(\)\)/i,
  );
});

test("retry cap and jitter is applied on story job finalization failures", () => {
  assert.match(
    migration,
    /create or replace function public\.finish_story_processing_job/i,
  );
  assert.match(
    migration,
    /processing_retry_after = now\(\) \+ \(interval '2 minutes' \* power\(2, least\(article\.processing_attempts, 4\)\)\) \* \(0.8 \+ 0.4 \* random\(\)\)/i,
  );
});
