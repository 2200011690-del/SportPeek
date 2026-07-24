import assert from "node:assert/strict";
import test from "node:test";
import { clusterSimilarity } from "../../lib/stories/clustering";
import { extractPublisherArticleContent, fetchPublisherArticleContent } from "../../lib/articles/publisher";
import { sanitizeClusterSummary } from "../../lib/ai/grounding";

test("clustering prevents false merges on date or sequence mismatches", () => {
  const article1 = {
    id: "a1",
    sourceId: "src1",
    sourceName: "Source 1",
    sourceLogoUrl: null,
    originalUrl: "http://example.com/1",
    canonicalUrl: "http://example.com/1",
    title: "Lịch bóng đá Ngoại hạng Anh các ngày 13, 15 và 17/7",
    excerpt: "Lịch thi đấu chi tiết giải ngoại hạng anh tuần mới",
    imageUrl: null,
    author: null,
    publishedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    isOfficial: false,
    language: "vi" as const,
    processingStatus: "completed" as const,
  };

  const article2 = {
    ...article1,
    id: "a2",
    title: "Lịch bóng đá Ngoại hạng Anh ngày 20/7",
    excerpt: "Lịch thi đấu chi tiết ngày hai mươi tháng bảy",
    originalUrl: "http://example.com/2",
    canonicalUrl: "http://example.com/2",
  };

  const res1 = clusterSimilarity(article1, { articles: [article2] });
  assert.equal(res1.compatible, false);
  assert.equal(res1.reason, "date_mismatch_conflict");

  const star38 = {
    ...article1,
    title: "Guess World Cup star No 38",
    excerpt: "Can you guess this player",
  };

  const star40 = {
    ...article1,
    title: "Guess World Cup star No 40",
    excerpt: "Can you guess this other player",
  };

  const res2 = clusterSimilarity(star38, { articles: [star40] });
  assert.equal(res2.compatible, false);
  assert.equal(res2.reason, "number_sequence_conflict");
});

test("clustering prevents merging championships with runner-up titles", () => {
  const champ = {
    id: "c1",
    sourceId: "src1",
    sourceName: "Source 1",
    sourceLogoUrl: null,
    originalUrl: "http://example.com/1",
    canonicalUrl: "http://example.com/1",
    title: "Trao giải vô địch cho U23 Việt Nam",
    excerpt: "Đội tuyển giành cúp vàng danh giá",
    imageUrl: null,
    author: null,
    publishedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    isOfficial: false,
    language: "vi" as const,
    processingStatus: "completed" as const,
  };

  const runnerUp = {
    ...champ,
    id: "c2",
    title: "Trao giải nhì cho U23 Việt Nam",
    excerpt: "Đội tuyển đạt vị trí á quân chung cuộc",
    originalUrl: "http://example.com/2",
    canonicalUrl: "http://example.com/2",
  };

  const res = clusterSimilarity(champ, { articles: [runnerUp] });
  assert.equal(res.compatible, false);
  assert.equal(res.reason, "award_rank_conflict");
});

test("clustering prevents merging training schedules with tournament fixtures", () => {
  const training = {
    id: "t1",
    sourceId: "src1",
    sourceName: "Source 1",
    sourceLogoUrl: null,
    originalUrl: "http://example.com/1",
    canonicalUrl: "http://example.com/1",
    title: "U23 Việt Nam chuẩn bị tập huấn tại Hàn Quốc",
    excerpt: "Các cầu thủ lên đường rèn luyện thể lực",
    imageUrl: null,
    author: null,
    publishedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    isOfficial: false,
    language: "vi" as const,
    processingStatus: "completed" as const,
  };

  const fixtures = {
    ...training,
    id: "t2",
    title: "Lịch thi đấu của U23 Việt Nam tại giải châu Á",
    excerpt: "Chi tiết các trận đấu vòng bảng",
    originalUrl: "http://example.com/2",
    canonicalUrl: "http://example.com/2",
  };

  const res = clusterSimilarity(training, { articles: [fixtures] });
  assert.equal(res.compatible, false);
  assert.equal(res.reason, "training_schedule_conflict");
});

test("extract respects noarchive robots metadata by returning null", () => {
  const html = `
    <html>
      <head>
        <meta name="robots" content="noarchive, nosnippet">
      </head>
      <body>
        <p>This is a long body text with enough words to satisfy word count limits. We need at least one hundred and twenty words to ensure it matches the minimum publisher word requirement.</p>
        <p>Adding more sentences here. This content is high quality news material but must be blocked due to the noarchive directive in the meta tags.</p>
      </body>
    </html>
  `;
  assert.equal(extractPublisherArticleContent(html), null);
});

test("extract respects paywall indicators by returning null", () => {
  const html = `
    <html>
      <body>
        <p>This is a premium article. Đăng nhập để đọc tiếp. Membership required for this content.</p>
        <p>We do not want to extract trash login pages or subscription blocks into the news database.</p>
      </body>
    </html>
  `;
  assert.equal(extractPublisherArticleContent(html), null);
});

test("fetch respects nosnippet and noarchive robots metadata with error return", async () => {
  const html = `
    <html>
      <head>
        <meta name="robots" content="noarchive">
      </head>
      <body>
        <p>This is a long body text with enough words to satisfy word count limits. We need at least one hundred and twenty words to ensure it matches the minimum publisher word requirement.</p>
      </body>
    </html>
  `;
  const mockFetch: typeof fetch = async () => new Response(html, { headers: { "content-type": "text/html" } });
  const res = await fetchPublisherArticleContent("http://example.com", { fetcher: mockFetch });
  assert.equal(res?.content, "");
  assert.equal(res?.error, "Extraction blocked by robots noarchive directive.");
});

test("fetch respects paywall restriction with error return", async () => {
  const html = `
    <html>
      <body>
        <p>This is a premium article. Đăng nhập để đọc tiếp. Membership required for this content.</p>
      </body>
    </html>
  `;
  const mockFetch: typeof fetch = async () => new Response(html, { headers: { "content-type": "text/html" } });
  const res = await fetchPublisherArticleContent("http://example.com", { fetcher: mockFetch });
  assert.equal(res?.content, "");
  assert.equal(res?.error, "Extraction blocked by paywall restriction.");
});

test("citations sanitization keeps valid source IDs", () => {
  const articles = [
    { id: "art1", title: "A1", excerpt: "E1" },
    { id: "art2", title: "A2", excerpt: "E2" },
  ];
  const summaryOutput = {
    title: "Beautiful Story Summary",
    summary: "This is a detailed summary with more than eighty characters to make sure it complies with Zod length requirements.",
    keyPoints: ["Point 1 of high interest", "Point 2 of high interest"],
    sourceIds: ["art1", "art2"],
    citations: [
      { fact: "Fact 1 from Source 1", sourceArticleIds: ["art1"] },
      { fact: "Fact 2 from Source 2", sourceArticleIds: ["art2"] },
      { fact: "Invalid Fact", sourceArticleIds: ["unknown-id"] },
    ],
  };

  const result = sanitizeClusterSummary(summaryOutput, articles);
  assert.equal(result.citations?.length, 2);
  assert.equal(result.citations?.[0].fact, "Fact 1 from Source 1");
  assert.deepEqual(result.citations?.[0].sourceArticleIds, ["art1"]);
});
