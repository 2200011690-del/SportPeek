import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildStorySearchText } from "../../lib/stories/processor";
import { buildStorySearchTerms } from "../../lib/stories/persisted-repository";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/202607270001_story_search_sync.sql",
    import.meta.url,
  ),
  "utf8",
);

test("story search text includes the current AI title and original article titles", () => {
  const searchText = buildStorySearchText({
    title:
      "Cháy rừng lan rộng tại Tây Ban Nha và Pháp đe dọa khu dân cư",
    summary: "Hàng trăm nghìn người phải sơ tán.",
    category: "Thế giới",
    geography: "Tây Ban Nha",
    region: "Thế giới",
    sourceNames: ["Reuters"],
    articles: [
      {
        title:
          "Live updates: Hundreds of thousands flee as fires rage in Spain and France",
      },
    ],
  } as Parameters<typeof buildStorySearchText>[0]);

  assert.match(searchText, /chay rung lan rong tai tay ban nha va phap/);
  assert.match(searchText, /fires rage in spain and france/);
});

test("database trigger rebuilds search text whenever AI updates the payload", () => {
  assert.match(
    migration,
    /create or replace function public\.refresh_story_cluster_search_text/i,
  );
  assert.match(
    migration,
    /before insert or update of title, summary, category, source_names, payload/i,
  );
  assert.match(migration, /new\.search_text :=/i);
  assert.match(migration, /payload->>'title'/i);
  assert.match(migration, /payload->'articles'/i);
  assert.match(migration, /update public\.story_clusters/i);
});

test("natural multi-word searches match words separated by other title text", () => {
  assert.deepEqual(buildStorySearchTerms("killed injured after mows"), [
    "killed",
    "injured",
    "after",
    "mows",
  ]);
  assert.ok(
    buildStorySearchTerms("killed injured after mows").every((term) =>
      "one killed 16 injured after van mows into crowd".includes(term),
    ),
  );
});
