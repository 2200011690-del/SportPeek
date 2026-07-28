import { expect, test, type APIRequestContext } from "@playwright/test";

type Story = {
  id: string;
  slug: string;
  title: string;
  region?: string;
  aiGenerated?: boolean;
};

async function stories(request: APIRequestContext): Promise<Story[]> {
  const response = await request.get("/api/stories");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(Array.isArray(payload.data)).toBeTruthy();
  return payload.data;
}

test("mobile layout has no horizontal overflow and 44px navigation targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveTitle(/NewsPeek/);
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);

  const menu = page.getByRole("button", { name: "Mở menu" });
  const menuBox = await menu.boundingBox();
  expect(menuBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(menuBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await menu.click();

  const close = page.getByRole("button", { name: "Đóng menu" });
  await expect(close).toBeVisible();
  const closeBox = await close.boundingBox();
  expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(43.9);
  expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(43.9);
  await close.click();
});

test("editorial layouts remain stable across all target breakpoints", async ({ page }) => {
  for (const width of [360, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 960 });
    await page.goto("/");
    await expect(page.locator(".editorial-header")).toBeVisible();
    const categoryHeadline = page
      .locator(".home-category-module-grid .dense-news-list a > span:last-child")
      .first();
    await expect(categoryHeadline).toBeVisible();
    const categoryHeadlineBox = await categoryHeadline.boundingBox();
    expect(
      categoryHeadlineBox?.width ?? 0,
      `category headline collapsed at ${width}px`,
    ).toBeGreaterThan(180);
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(viewport.scrollWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(viewport.width);

    if (width < 768) {
      const targets = page.locator(".editorial-mobile-nav a");
      await expect(targets).toHaveCount(4);
      for (const target of await targets.all()) {
        const box = await target.boundingBox();
        expect(box?.height ?? 0, `short mobile target at ${width}px`).toBeGreaterThanOrEqual(44);
      }
    }
  }
});

test("today layout keeps a compact hierarchy on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const heroHeading = page.locator(".home-hero-content h1");
  await expect(heroHeading).toBeVisible();
  const heroHeadingBox = await heroHeading.boundingBox();
  expect(heroHeadingBox?.height ?? Infinity).toBeLessThan(240);

  const sublead = page.locator(".sublead-news-card").first();
  await expect(sublead).toBeVisible();
  const subleadBox = await sublead.boundingBox();
  const subleadVisualBox = await sublead.locator(".news-visual").boundingBox();
  const subleadHeadingBox = await sublead.locator("h3").boundingBox();
  expect(subleadBox?.height ?? Infinity).toBeLessThan(450);
  expect(
    (subleadHeadingBox?.y ?? Infinity)
      - ((subleadVisualBox?.y ?? 0) + (subleadVisualBox?.height ?? 0)),
  ).toBeLessThan(100);

  const tickerContrast = await page.locator(".breaking-news-ticker .ticker-title").evaluate(
    (title) => {
      const ticker = title.closest(".breaking-news-ticker");
      return {
        text: getComputedStyle(title).color,
        background: ticker ? getComputedStyle(ticker).backgroundColor : "",
      };
    },
  );
  expect(tickerContrast.text).not.toBe(tickerContrast.background);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const feedHeading = page.locator(".home-feed-heading");
  const mobileTitle = feedHeading.locator("h2");
  const feedHeadingBox = await feedHeading.boundingBox();
  const mobileTitleBox = await mobileTitle.boundingBox();
  expect(
    (mobileTitleBox?.y ?? Infinity) + (mobileTitleBox?.height ?? Infinity),
  ).toBeLessThanOrEqual(
    (feedHeadingBox?.y ?? 0) + (feedHeadingBox?.height ?? 0),
  );

  const mobileHeroHeadingBox = await heroHeading.boundingBox();
  expect(mobileHeroHeadingBox?.height ?? Infinity).toBeLessThan(160);
});

test("search UI finds a story outside the initial feed", async ({ page, request }) => {
  const current = await stories(request);
  const currentIds = new Set(current.map((story) => story.id));
  const archiveResponse = await request.get("/api/news/archive?page=9&pageSize=30&sort=freshness");
  expect(archiveResponse.ok()).toBeTruthy();
  const archive = await archiveResponse.json();
  const expected = (archive.data as Story[]).find((story) => !currentIds.has(story.id));
  expect(expected, "archive should contain a story outside the initial feed").toBeTruthy();
  if (!expected) throw new Error("archive story missing");
  const query = expected.title
    .split(/\s+/)
    .filter((word) => word.replace(/[^\p{L}\p{N}]/gu, "").length >= 4)
    .slice(0, 4)
    .join(" ")
    || expected.title;
  await page.goto("/search");
  await page.getByRole("textbox", { name: "Từ khóa tìm kiếm" }).fill(query);
  await expect(page.getByRole("link", { name: expected.title, exact: true })).toBeVisible();
});

test("personalized page requests its dedicated feed after SSR", async ({ page }) => {
  const personalizedResponse = page.waitForResponse(
    (response) => response.url().includes("/api/feed/for-you"),
  );
  await page.goto("/for-you");
  expect((await personalizedResponse).ok()).toBeTruthy();
});

test("full article reader renders publisher paragraphs", async ({ page, request }) => {
  const current = await stories(request);
  let selected: Story | undefined;
  for (const candidate of current.slice(0, 12)) {
    const detail = await request.get(`/api/stories/${candidate.slug}`);
    if (!detail.ok()) continue;
    const payload = await detail.json();
    if (payload.data?.articleContents?.some((article: { status: string; paragraphs?: string[] }) =>
      article.status === "available" && (article.paragraphs?.length ?? 0) >= 2
    )) {
      selected = candidate;
      break;
    }
  }
  expect(selected, "at least one current story should have publisher full text").toBeTruthy();
  await page.goto(`/news/${selected?.slug}`);
  await expect(page.getByRole("heading", { name: "Nội dung đầy đủ" })).toBeVisible();
  await expect(page.locator(".article-full-content p").first()).toBeVisible();
});

test("on-demand AI summary completes through the reader UI", async ({ page, request }) => {
  const current = await stories(request);
  const selected = current.find((story) => !story.aiGenerated) ?? current[0];
  await page.goto(`/news/${selected.slug}`);
  const aiMode = page.getByRole("button", { name: /Tóm tắt bằng AI/ }).first();
  await aiMode.click();
  await expect(page.getByRole("heading", { name: "Tóm tắt bằng AI" })).toBeVisible();
  await expect(page.locator(".article-ai-summary p").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Chưa thể tạo bản tóm tắt lúc này.")).toHaveCount(0);
});

test("cron health confirms fresh RSS, stories and AI", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.data.state).toBe("operational");
  for (const service of ["rss", "stories", "ai"]) {
    expect(payload.data.services[service].state).toBe("operational");
  }
  expect(payload.data.metrics.latestArticleAgeMinutes).toBeLessThan(60);
  expect(payload.data.metrics.latestStoryAgeMinutes).toBeLessThan(60);
});

test("production branding, source balance, slugs and strict CSP stay enforced", async ({ page, request }) => {
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("nonce-");
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).not.toContain("unsafe-inline");
  await expect(page.locator("body")).not.toContainText("SportPeek");

  const inlineScripts = await page.locator("script:not([src])").evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLScriptElement).nonce),
  );
  expect(inlineScripts.length).toBeGreaterThan(0);
  expect(inlineScripts.every(Boolean)).toBeTruthy();

  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("https://newspeek.2200011690.workers.dev/sitemap-news");
  const newsSitemap = await request.get("/sitemap-news");
  const sitemapBody = await newsSitemap.text();
  expect(sitemapBody).toContain("<news:name>NewsPeek</news:name>");
  expect(sitemapBody).not.toContain("sportpeek.2200011690.workers.dev");

  const feedResponse = await request.get("/api/news?limit=40");
  const feed = await feedResponse.json();
  const vietnamCount = feed.data.filter((story: Story) => story.region === "Việt Nam").length;
  expect(vietnamCount).toBeGreaterThanOrEqual(16);
  expect(vietnamCount).toBeLessThanOrEqual(24);
  expect(feed.data.every((story: Story) => !story.slug.startsWith("story-"))).toBeTruthy();

  const sourceResponse = await request.get("/api/sources");
  const sourcePayload = await sourceResponse.json();
  const activeSources = sourcePayload.data.filter((source: { active: boolean }) => source.active);
  expect(activeSources.filter((source: { official: boolean }) => source.official).length).toBeGreaterThanOrEqual(5);
  expect(activeSources.some((source: { name: string }) => ["VFF", "VPF"].includes(source.name))).toBeFalsy();
});
