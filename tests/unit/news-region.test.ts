import assert from "node:assert/strict";
import test from "node:test";
import { newsIsInternational, newsIsVietnamese } from "../../lib/news/region";
import type { NewsItem } from "../../lib/types";

const item = (region: string | undefined, originalLanguage: "vi" | "en") =>
  ({ region, originalLanguage }) as NewsItem;

test("region filters use event geography before source language", () => {
  const translatedWorldStory = item("Thế giới", "vi");
  assert.equal(newsIsInternational(translatedWorldStory), true);
  assert.equal(newsIsVietnamese(translatedWorldStory), false);

  const vietnamStoryFromEnglishPublisher = item("Việt Nam", "en");
  assert.equal(newsIsVietnamese(vietnamStoryFromEnglishPublisher), true);
  assert.equal(newsIsInternational(vietnamStoryFromEnglishPublisher), false);
});

test("legacy cards without region retain their language fallback", () => {
  assert.equal(newsIsVietnamese(item(undefined, "vi")), true);
  assert.equal(newsIsInternational(item(undefined, "en")), true);
});
