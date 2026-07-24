import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607180001_story_queue_recovery.sql",
    import.meta.url,
  ),
  "utf8",
);

test("story queue claim is atomic, leased, and restricted to active sources", () => {
  assert.match(
    migration,
    /create or replace function public\.claim_story_processing_batch/i,
  );
  assert.match(migration, /for update of article skip locked/i);
  assert.match(
    migration,
    /join public\.news_sources as source[\s\S]*source\.is_active/i,
  );
  assert.match(migration, /processing_lease_expires_at/);
});

test("story queue recovery treats persisted links as authoritative", () => {
  assert.match(
    migration,
    /create or replace function public\.recover_story_processing_queue/i,
  );
  assert.match(
    migration,
    /exists \([\s\S]*public\.story_cluster_articles as link[\s\S]*processing_status = 'completed'/i,
  );
  assert.match(migration, /STORY_JOB_LEASE_EXPIRED/);
});

test("story job finalization updates raw rows and diagnostics in one database function", () => {
  assert.match(
    migration,
    /create or replace function public\.finish_story_processing_job/i,
  );
  assert.match(migration, /update public\.raw_articles/);
  assert.match(migration, /update public\.ingestion_jobs/);
  assert.match(
    migration,
    /grant execute on function public\.finish_story_processing_job[\s\S]*service_role/i,
  );
});
