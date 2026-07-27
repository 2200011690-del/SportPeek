import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607270002_story_queue_terminal_repair.sql",
    import.meta.url,
  ),
  "utf8",
);

test("exhausted pending articles become terminal without being deleted", () => {
  assert.match(migration, /update public\.raw_articles/i);
  assert.match(
    migration,
    /where processing_status = 'pending'[\s\S]*processing_attempts >= 5/i,
  );
  assert.match(migration, /processing_status = 'failed'/i);
  assert.match(migration, /retained for audit/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.raw_articles/i);
});

test("database rejects future unclaimable pending queue rows", () => {
  assert.match(
    migration,
    /add constraint raw_articles_pending_attempts_check/i,
  );
  assert.match(
    migration,
    /processing_status <> 'pending'[\s\S]*processing_attempts < 5/i,
  );
  assert.match(
    migration,
    /validate constraint raw_articles_pending_attempts_check/i,
  );
});
