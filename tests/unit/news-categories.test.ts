import assert from "node:assert/strict";
import test from "node:test";
import { matchesNewsCategory } from "../../lib/news/categories";
import type { NewsItem } from "../../lib/types";

function newsItem(overrides: Partial<NewsItem>): NewsItem {
  return {
    id: "story",
    title: "Bản tin",
    slug: "ban-tin",
    summary: "Nội dung bản tin",
    keyPoints: [],
    category: "Tin tức",
    publishedAt: "vừa xong",
    hotness: 50,
    reliability: 80,
    sources: ["Nguồn"],
    imageTone: "default",
    ...overrides,
  };
}

test("category keywords match complete tokens instead of substrings", () => {
  const entertainment = newsItem({
    title: "Chương trình giải trí mới lên sóng",
    summary: "Nhiều nghệ sĩ tham gia chương trình.",
  });
  assert.equal(matchesNewsCategory(entertainment, "cong-nghe"), false);
  assert.equal(matchesNewsCategory(entertainment, "van-hoa-giai-tri"), true);

  const technology = newsItem({
    title: "AI hỗ trợ phát hiện gian lận",
    summary: "Công cụ mới được thử nghiệm.",
  });
  assert.equal(matchesNewsCategory(technology, "cong-nghe"), true);
});

test("category matching combines topic and region semantics", () => {
  const internationalPolitics = newsItem({
    category: "Thế giới",
    primaryTopic: "Chính trị",
    region: "Châu Âu",
    countries: ["Pháp"],
  });
  assert.equal(matchesNewsCategory(internationalPolitics, "the-gioi"), true);
  assert.equal(matchesNewsCategory(internationalPolitics, "chinh-tri"), true);
  assert.equal(matchesNewsCategory(internationalPolitics, "viet-nam"), false);

  const vietnamTechnology = newsItem({
    category: "Công nghệ",
    region: "Việt Nam",
    countries: ["Việt Nam"],
  });
  assert.equal(matchesNewsCategory(vietnamTechnology, "cong-nghe"), true);
  assert.equal(matchesNewsCategory(vietnamTechnology, "viet-nam"), true);
});

test("a declared topic is not reclassified from an incidental headline phrase", () => {
  const musicMarket = newsItem({
    category: "Văn hóa & Giải trí",
    title: "Thị trường âm nhạc sôi động mùa hè",
  });
  assert.equal(matchesNewsCategory(musicMarket, "kinh-te"), false);
  assert.equal(matchesNewsCategory(musicMarket, "van-hoa-giai-tri"), true);
});

test("generic policy research is not mistaken for science and sports terms remain discoverable", () => {
  const housingPolicy = newsItem({
    title: "Nghiên cứu phương án phát triển nhà ở xã hội tại thủ đô",
    category: "Việt Nam",
  });
  assert.equal(matchesNewsCategory(housingPolicy, "khoa-hoc"), false);

  const nationalTeam = newsItem({
    title: "Đội tuyển Indonesia giành vé vào chung kết",
    category: "Thể thao",
  });
  assert.equal(matchesNewsCategory(nationalTeam, "the-thao"), true);
});
