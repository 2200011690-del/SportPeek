import assert from "node:assert/strict";
import test from "node:test";
import { contentHash, duplicateSimilarity, isLikelyDuplicate, normalizeArticle, normalizeTitle } from "../../lib/ingestion/utils";

test("normalizes Vietnamese titles for comparison", () => { assert.equal(normalizeTitle("  Arsenal: Hoàn tất BUỔI tập! "), "arsenal hoan tat buoi tap"); });
test("article normalization trims content and hashes deterministically", () => { const input = { externalId:"1",url:"https://example.com/a",title:" Demo  title ",excerpt:" đoạn trích ",publishedAt:"2026-07-13T00:00:00Z" }; const article = normalizeArticle(input,"source-1"); assert.equal(article.title,"Demo title"); assert.equal(article.excerpt,"đoạn trích"); assert.equal(article.contentHash, contentHash(input)); });
test("duplicate heuristic combines keyword overlap and time", () => { assert.ok(duplicateSimilarity("Arsenal hoàn tất buổi tập chiến thuật", "Arsenal hoàn tất buổi tập trước trận") >= .55); assert.equal(isLikelyDuplicate({title:"Arsenal hoàn tất buổi tập chiến thuật",publishedAt:"2026-07-13T10:00:00Z"},{title:"Arsenal hoàn tất buổi tập trước trận",publishedAt:"2026-07-13T12:00:00Z"}),true); });
