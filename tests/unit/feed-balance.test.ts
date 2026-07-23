import assert from "node:assert/strict";
import test from "node:test";
import { balanceStoryRegions } from "../../lib/stories/feed-balance";
import { storyClusterSchema, type StoryCluster } from "../../lib/stories/schema";

function story(id: string, region: "Việt Nam" | "Thế giới"): StoryCluster {
  const timestamp = new Date(Date.UTC(2026, 6, 23, 12, 0, 0) - Number(id.replace(/\D/g, "")) * 60_000).toISOString();
  return storyClusterSchema.parse({
    id: `11111111-1111-4111-8111-${id.padStart(12, "0")}`,
    slug: `tin-${id}`,
    title: `Tin ${id}`,
    summary: `Nội dung tin ${id}`,
    summaryLong: `Nội dung tin ${id}`,
    category: "Tin mới",
    language: region === "Việt Nam" ? "vi" : "en",
    region,
    publisherCountry: region,
    status: "developing",
    sourceCount: 1,
    sourceNames: ["Nguồn"],
    officialSources: [],
    hasOfficialSource: false,
    hotnessScore: 50,
    reliabilityScore: 80,
    publishedAt: timestamp,
    updatedAt: timestamp,
    imageUrl: null,
    agreedFacts: [],
    disputedPoints: [],
    timeline: [],
    linkedMatch: null,
    competition: null,
    teams: [],
    players: [],
    articles: [{
      id: `article-${id}`,
      sourceId: "source",
      sourceName: "Nguồn",
      sourceLogoUrl: null,
      originalUrl: `https://example.com/${id}`,
      canonicalUrl: `https://example.com/${id}`,
      title: `Tin ${id}`,
      excerpt: `Nội dung tin ${id}`,
      imageUrl: null,
      author: null,
      publishedAt: timestamp,
      fetchedAt: timestamp,
      isOfficialSource: false,
      isSyndicated: false,
      language: region === "Việt Nam" ? "vi" : "en",
      processingStatus: "completed",
    }],
    aiGenerated: false,
    reviewStatus: "reviewed",
  });
}

test("latest feed alternates Việt Nam and international stories", () => {
  const input = [
    ...Array.from({ length: 8 }, (_, index) => story(`1${index}`, "Thế giới")),
    ...Array.from({ length: 8 }, (_, index) => story(`2${index}`, "Việt Nam")),
  ];
  const result = balanceStoryRegions(input, 10);
  assert.equal(result.length, 10);
  assert.equal(result.filter((item) => item.region === "Việt Nam").length, 5);
  assert.equal(result.filter((item) => item.region === "Thế giới").length, 5);
});

test("feed fills remaining slots when one region has too little inventory", () => {
  const input = [
    story("1", "Việt Nam"),
    ...Array.from({ length: 6 }, (_, index) => story(`3${index}`, "Thế giới")),
  ];
  const result = balanceStoryRegions(input, 6);
  assert.equal(result.length, 6);
  assert.equal(result.filter((item) => item.region === "Việt Nam").length, 1);
});
