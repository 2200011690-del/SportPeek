import assert from "node:assert/strict";
import test from "node:test";
import { buildSitemap } from "../../app/sitemap";

test("sitemap includes canonical story URLs once with material modification time", () => {
  const sitemap = buildSitemap(new URL("https://sportpeek.example/some/path"), [
    { slug: "arsenal-thang-tran", publishedAt: "2026-07-14T08:00:00.000Z", lastMaterialUpdateAt: "2026-07-14T09:00:00.000Z" },
    { slug: "arsenal-thang-tran", publishedAt: "2026-07-14T08:00:00.000Z", lastMaterialUpdateAt: "2026-07-14T09:00:00.000Z" },
  ]);
  const stories = sitemap.filter((entry) => entry.url.endsWith("/news/arsenal-thang-tran"));
  assert.equal(stories.length, 1);
  assert.equal(new Date(stories[0].lastModified!).toISOString(), "2026-07-14T09:00:00.000Z");
  assert.ok(sitemap.some((entry) => entry.url === "https://sportpeek.example/news"));
  assert.equal(sitemap.some((entry) => entry.url.endsWith("/search")), false);
});
