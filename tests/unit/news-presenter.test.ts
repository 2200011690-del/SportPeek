import assert from "node:assert/strict";
import test from "node:test";
import { newsHasSourceLanguage } from "../../components/news/news-presenter";
import { makeStoryNewsItem } from "../fixtures/story-news";

test("language filters inspect every source in a mixed-language story", () => {
  const mixedStory = makeStoryNewsItem({
    originalLanguage: "vi",
    sourceDetails: [
      {
        name: "VOV Thể thao",
        url: "https://vov.vn/the-thao/example",
        reliability: 90,
        language: "vi",
      },
      {
        name: "BBC Sport",
        url: "https://bbc.com/sport/example",
        reliability: 94,
        language: "en",
      },
    ],
  });

  assert.equal(newsHasSourceLanguage(mixedStory, "vi"), true);
  assert.equal(newsHasSourceLanguage(mixedStory, "en"), true);
});

test("language filters retain the legacy lead-language fallback", () => {
  const legacyInternationalStory = makeStoryNewsItem({
    originalLanguage: "en",
    sourceDetails: undefined,
  });

  assert.equal(newsHasSourceLanguage(legacyInternationalStory, "en"), true);
  assert.equal(newsHasSourceLanguage(legacyInternationalStory, "vi"), false);
});
