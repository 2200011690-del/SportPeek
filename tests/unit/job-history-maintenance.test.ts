import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607280001_job_history_maintenance.sql",
    import.meta.url,
  ),
  "utf8",
);

test("job maintenance is serialized, daily by default, and service-role only", () => {
  assert.match(
    migration,
    /create or replace function public\.maintain_newspeek_job_history\(\s*p_now timestamptz default now\(\),\s*p_force boolean default false\s*\)/i,
  );
  assert.match(migration, /security definer/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(
    migration,
    /job_history_maintenance_state[\s\S]*last_run_day >= v_run_day/i,
  );
  assert.match(migration, /if not coalesce\(p_force, false\)/i);
  assert.match(
    migration,
    /revoke all on function public\.maintain_newspeek_job_history[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.maintain_newspeek_job_history[\s\S]*to service_role/i,
  );
});

test("stale ingestion and AI leases become explicit failures", () => {
  assert.match(
    migration,
    /job\.job_type in \('rss:sync', 'stories:process'\)[\s\S]*interval '5 minutes'/i,
  );
  assert.match(
    migration,
    /job\.job_type = 'ai:backfill'[\s\S]*interval '10 minutes'/i,
  );
  assert.match(
    migration,
    /update public\.ingestion_jobs[\s\S]*error_code = 'LEASE_EXPIRED'/i,
  );
  assert.match(
    migration,
    /update public\.ai_jobs[\s\S]*job\.job_type = 'summarize_cluster'[\s\S]*job\.status in \('pending', 'processing'\)[\s\S]*interval '10 minutes'/i,
  );
});

test("expired article retries become terminal without deleting source records", () => {
  assert.match(
    migration,
    /update public\.raw_articles[\s\S]*processing_attempts = greatest\(article\.processing_attempts, 5\)/i,
  );
  assert.match(migration, /processing_retry_after = null/i);
  assert.match(
    migration,
    /processing_status = 'failed'[\s\S]*fetched_at <= v_now - interval '7 days'/i,
  );
  assert.doesNotMatch(migration, /delete\s+from\s+public\.raw_articles/i);
});

test("terminal jobs are aggregated by UTC dimensions before retention deletes", () => {
  const aggregateAt = migration.indexOf(
    "insert into public.job_history_daily_metrics",
  );
  const ingestionDeleteAt = migration.indexOf(
    "delete from public.ingestion_jobs",
  );
  const aiDeleteAt = migration.indexOf("delete from public.ai_jobs");

  assert.ok(aggregateAt >= 0);
  assert.ok(ingestionDeleteAt > aggregateAt);
  assert.ok(aiDeleteAt > aggregateAt);
  assert.match(migration, /at time zone 'UTC'/i);
  assert.match(
    migration,
    /primary key \(metric_day, job_source, job_type, status, provider, error_key\)/i,
  );
  assert.match(
    migration,
    /job\.status = 'completed'[\s\S]*interval '14 days'[\s\S]*job\.status = 'failed'[\s\S]*interval '90 days'/i,
  );
  assert.match(
    migration,
    /public\.ai_jobs[\s\S]*job\.status = 'completed'[\s\S]*interval '30 days'[\s\S]*job\.status = 'failed'[\s\S]*interval '90 days'/i,
  );
});

test("retention can delete only completed or failed job rows", () => {
  const deletionSection = migration.slice(
    migration.indexOf("delete from public.ingestion_jobs"),
  );

  assert.match(deletionSection, /job\.status = 'completed'/i);
  assert.match(deletionSection, /job\.status = 'failed'/i);
  assert.doesNotMatch(deletionSection, /job\.status = 'pending'/i);
  assert.doesNotMatch(deletionSection, /job\.status = 'processing'/i);
});
