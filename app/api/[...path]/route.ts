import { NextRequest, NextResponse } from "next/server";
import { aiService } from "@/lib/application/ai-service";
import { personalizationService } from "@/lib/application/personalization-service";
import { sportsService } from "@/lib/application/sports-service";
import { storyService } from "@/lib/application/story-service";
import { toSafeError } from "@/lib/core/errors";
import { syncRss } from "@/lib/rss/sync";
import { processStories, summarizePersistedStoryById } from "@/lib/stories/processor";
import { readNewsSourceCatalog } from "@/lib/rss/repository";
import { getHealthSnapshot } from "@/lib/health";
import { sportsCacheRepository, vietnamDateRange } from "@/lib/sports-data/repository";
import { handleTelegramUpdate } from "@/lib/telegram/commands";
import { rateLimit } from "@/lib/rate-limit";
import { storyToNewsItem } from "@/lib/stories/presenter";
import type { StoryRepositoryResult } from "@/lib/stories/repository";
import { storyDetailEnvelopeSchema, storyFeedEnvelopeSchema, type StoryCluster } from "@/lib/stories/schema";
import { storySlugSchema } from "@/lib/stories/slug";
import { bookmarkSchema, followSchema, profileSchema, readingHistorySchema, searchSchema } from "@/lib/validation";
import { newsSearchText, normalizeSearchText } from "@/lib/ui-logic";

type Context = { params: Promise<{ path: string[] }> };
const clientKey = (request: NextRequest) => request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
const protectedBySecret = (request: NextRequest) => process.env.CRON_SECRET && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

const repositoryHttpStatus = (status: StoryRepositoryResult<unknown>["status"]) =>
  status === "not_found" ? 404 : status === "configuration_required" || status === "error" ? 503 : 200;

function feedEnvelope(result: StoryRepositoryResult<StoryCluster[]>) {
  return storyFeedEnvelopeSchema.parse({
    status: result.status,
    data: result.data ?? [],
    meta: result.meta,
    error: result.error ?? null,
  });
}

function detailEnvelope(result: Awaited<ReturnType<typeof storyService.getBySlug>>) {
  return storyDetailEnvelopeSchema.parse({
    status: result.status,
    data: result.data,
    meta: result.meta,
    error: result.error ?? null,
  });
}

export async function GET(request: NextRequest, { params }: Context) {
  const { path } = await params; const route = path.join("/");
  if (route === "health") return NextResponse.json({ status: "success", data: await getHealthSnapshot() }, { headers: { "cache-control": "private, max-age=30" } });
  if (route === "me/preferences") {
    try { return NextResponse.json({ status: "success", data: await personalizationService.snapshot() }); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ status: safe.code === "AUTHENTICATION_REQUIRED" ? "unauthorized" : "error", data: null, error: safe }, { status: safe.status }); }
  }
  if (route === "stories") {
    const result = await storyService.getFeed();
    return NextResponse.json(feedEnvelope(result), {
      status: repositoryHttpStatus(result.status),
      headers: { "cache-control": "public, s-maxage=90, stale-while-revalidate=300" },
    });
  }
  if (route === "sources") {
    try { const data = await readNewsSourceCatalog(); return NextResponse.json({ status: data.length ? "success" : "empty", data, demo: false }); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ status: "error", data: [], error: safe }, { status: safe.status }); }
  }
  if (path[0] === "stories" && path[1]) {
    const parsedSlug = storySlugSchema.safeParse(path[1]);
    if (!parsedSlug.success) {
      return NextResponse.json(storyDetailEnvelopeSchema.parse({
        status: "not_found",
        data: null,
        meta: { source: "aggregated-rss", cached: false, stale: false, lastUpdatedAt: null },
        error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." },
      }), { status: 404 });
    }
    const result = await storyService.getBySlug(parsedSlug.data);
    return NextResponse.json(detailEnvelope(result), {
      status: repositoryHttpStatus(result.status),
      headers: { "cache-control": "public, s-maxage=90, stale-while-revalidate=300" },
    });
  }
  if (route === "news/archive") {
    const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(48, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("pageSize") ?? "12", 10) || 12));
    const result = await storyService.getArchive(page, pageSize);
    const archive = result.data;
    return NextResponse.json({
      status: result.status,
      data: (archive?.stories ?? []).map(storyToNewsItem),
      pagination: archive ? { page: archive.page, pageSize: archive.pageSize, total: archive.total, totalPages: archive.totalPages } : { page, pageSize, total: 0, totalPages: 1 },
      meta: result.meta,
      error: result.error ?? null,
    }, { status: repositoryHttpStatus(result.status), headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=180" } });
  }
  if (route === "news") {
    const result = await storyService.getFeed();
    const data = (result.data ?? []).map(storyToNewsItem);
    const aiStatus = result.diagnostics?.aiStatus ?? { provider: "off" as const, state: "off" as const, translatedCount: 0 };
    return NextResponse.json({
      status: result.status,
      data,
      nextCursor: null,
      demo: false,
      sources: result.diagnostics?.sources ?? [],
      aiTranslation: result.diagnostics?.aiTranslation ?? false,
      aiStatus,
      meta: result.meta,
      error: result.error ?? null,
    }, {
      status: repositoryHttpStatus(result.status),
      headers: { "cache-control": "public, s-maxage=90, stale-while-revalidate=300" },
    });
  }
  if (route === "feed/for-you") {
    const result = await storyService.getFeed();
    const stories = result.data ?? [];
    try {
      const ranked = await personalizationService.personalizedFeed(stories);
      return NextResponse.json({ status: result.status, data: ranked.map((entry, index) => ({ ...storyToNewsItem(entry.value, index), personalization: { score: entry.score, reasons: entry.reasons } })), strategy: "rules-v1", personalized: true, demo: false, meta: result.meta, error: result.error ?? null }, {
        status: repositoryHttpStatus(result.status),
        headers: { "cache-control": "private, max-age=30, stale-while-revalidate=60" }
      });
    } catch (error) {
      const safe = toSafeError(error);
      if (safe.code !== "AUTHENTICATION_REQUIRED") return NextResponse.json({ status: "error", data: [], strategy: "unavailable", personalized: false, demo: false, error: safe }, { status: safe.status });
      const source = stories.map((story, index) => ({ ...storyToNewsItem(story, index), personalization: { score: Math.round(((story.hotnessScore ?? 0) + (story.reliabilityScore ?? 0)) * 10) / 10, reasons: ["Đăng nhập nội bộ để dùng sở thích; hiện xếp theo độ nóng và độ tin cậy"] } }));
      return NextResponse.json({ status: result.status, data: source.sort((a,b)=>b.hotness+b.reliability-a.hotness-a.reliability), strategy: "trending-anonymous", personalized: false, demo: false, meta: result.meta, error: result.error ?? null }, {
        status: repositoryHttpStatus(result.status),
        headers: { "cache-control": "private, max-age=30, stale-while-revalidate=60" }
      });
    }
  }
  if (route === "search") {
    const rate = rateLimit(`search:${clientKey(request)}`, 30);
    if (!rate.allowed) return NextResponse.json({ error: "Quá nhiều yêu cầu" }, { status: 429 });
    const parsed = searchSchema.safeParse({ q: request.nextUrl.searchParams.get("q") ?? "", type: request.nextUrl.searchParams.get("type") ?? "all" });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    try {
      const [storyResult, teamResult, competitionResult, playerResult] = await Promise.all([storyService.getFeed(), sportsCacheRepository.readTeams(), sportsCacheRepository.readCompetitions(), sportsCacheRepository.readPlayers()]);
      const source = (storyResult.data ?? []).map(storyToNewsItem); const q = normalizeSearchText(parsed.data.q);
      const include = (type: typeof parsed.data.type) => parsed.data.type === "all" || parsed.data.type === type;
      return NextResponse.json({
        news: include("news") ? source.filter((item) => newsSearchText(item).includes(q)) : [],
        teams: include("teams") ? teamResult.data.filter((item) => normalizeSearchText(item.name).includes(q)) : [],
        players: include("players") ? playerResult.data.filter((item) => normalizeSearchText(item.name).includes(q)) : [],
        competitions: include("competitions") ? competitionResult.data.filter((item) => normalizeSearchText(item.name).includes(q)) : [],
        playersAvailable: playerResult.data.length > 0, demo: false, status: storyResult.status, meta: storyResult.meta, error: storyResult.error ?? null,
      }, { status: repositoryHttpStatus(storyResult.status) });
    } catch (error) {
      const safe = toSafeError(error); return NextResponse.json({ status: "error", error: safe }, { status: safe.status });
    }
  }
  if (["matches/live", "fixtures", "results", "standings"].includes(route)) {
    const kind = route === "matches/live" ? "live" : route as "fixtures" | "results" | "standings";
    const requestedDate = request.nextUrl.searchParams.get("date")?.trim() || undefined;
    if (requestedDate && !vietnamDateRange(requestedDate)) {
      return NextResponse.json({ status: "error", data: [], error: { code: "INVALID_DATE", message: "Ngày lọc phải có định dạng YYYY-MM-DD." } }, { status: 400 });
    }
    const result = await sportsService.read(kind, { date: requestedDate });
    const httpStatus = result.status === "configuration_required" || result.status === "error" ? 503 : 200;
    return NextResponse.json({ ...result, demo: false, timezone: "Asia/Ho_Chi_Minh" }, { status: httpStatus, headers: { "cache-control": route === "matches/live" ? "private, max-age=10" : "private, max-age=120" } });
  }
  if (route === "teams") {
    const result = await sportsService.read("teams"); return NextResponse.json({ ...result, demo: false }, { status: result.status === "error" || result.status === "configuration_required" ? 503 : 200 });
  }
  if (route === "transfers") {
    try {
      const result = await sportsCacheRepository.readTransfers();
      return NextResponse.json({ status: result.data.length ? "success" : "empty", ...result, demo: false });
    } catch (error) { const safe = toSafeError(error); return NextResponse.json({ status: "error", data: [], error: safe }, { status: safe.status }); }
  }
  if (route === "competitions" || route === "players") {
    try {
      const result = route === "competitions" ? await sportsCacheRepository.readCompetitions() : await sportsCacheRepository.readPlayers();
      return NextResponse.json({ status: result.data.length ? "success" : "empty", ...result, demo: false });
    } catch (error) { const safe = toSafeError(error); return NextResponse.json({ status: "error", data: [], error: safe }, { status: safe.status }); }
  }
  if (path[0] === "matches" && path[1]) {
    try { const data = await sportsCacheRepository.readMatch(path[1]); return data ? NextResponse.json({ status: "success", data, demo: false }) : NextResponse.json({ status: "not_found", data: null, error: { code: "MATCH_NOT_FOUND", message: "Không tìm thấy trận đấu." } }, { status: 404 }); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ status: "error", data: null, error: safe }, { status: safe.status }); }
  }
  if (path[0] === "competitions" && path[1]) {
    try { const data = await sportsCacheRepository.readCompetition(path[1]); return data ? NextResponse.json({ status: "success", data, demo: false }) : NextResponse.json({ status: "not_found", data: null, error: { code: "COMPETITION_NOT_FOUND", message: "Không tìm thấy giải đấu." } }, { status: 404 }); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ status: "error", data: null, error: safe }, { status: safe.status }); }
  }
  if (path[0] === "teams" && path[1]) {
    try { const data = await sportsCacheRepository.readTeam(path[1]); return data ? NextResponse.json({ status: "success", data, demo: false }) : NextResponse.json({ status: "not_found", data: null, error: { code: "TEAM_NOT_FOUND", message: "Không tìm thấy đội bóng." } }, { status: 404 }); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ status: "error", data: null, error: safe }, { status: safe.status }); }
  }
  if (path[0] === "players" && path[1]) {
    try { const data = await sportsCacheRepository.readPlayer(path[1]); return data ? NextResponse.json({ status: "success", data, demo: false }) : NextResponse.json({ status: "not_found", data: null, error: { code: "PLAYER_NOT_FOUND", message: "Không tìm thấy cầu thủ." } }, { status: 404 }); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ status: "error", data: null, error: safe }, { status: safe.status }); }
  }
  return NextResponse.json({ error: "Không tìm thấy endpoint" }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: Context) {
  const { path } = await params; const route = path.join("/"); const body: unknown = await request.json().catch(() => null);
  const bodyRecord = body && typeof body === "object" ? body as Record<string, unknown> : null;
  if (path[0] === "stories" && path[1] && path[2] === "summarize") {
    const parsedSlug = storySlugSchema.safeParse(path[1]);
    if (!parsedSlug.success) return NextResponse.json({ status: "not_found", data: null, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }, { status: 404 });
    const clientRate = rateLimit(`story-ai-client:${clientKey(request)}`, 6, 600_000);
    const storyRate = rateLimit(`story-ai-story:${parsedSlug.data}`, 2, 60_000);
    if (!clientRate.allowed || !storyRate.allowed) return NextResponse.json({ status: "rate_limited", data: null, error: { code: "RATE_LIMITED", message: "AI đang xử lý bài này. Vui lòng chờ một lát." } }, { status: 429 });
    try {
      const existing = await storyService.getBySlug(parsedSlug.data);
      if (!existing.data) return NextResponse.json({ status: "not_found", data: null, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }, { status: 404 });
      const story = await summarizePersistedStoryById(existing.data.story.id);
      return story
        ? NextResponse.json({ status: "success", data: { story } }, { headers: { "cache-control": "no-store" } })
        : NextResponse.json({ status: "not_found", data: null, error: { code: "STORY_NOT_FOUND", message: "Không tìm thấy bài viết." } }, { status: 404 });
    } catch (error) {
      const safe = toSafeError(error);
      return NextResponse.json({ status: "error", data: null, error: { code: safe.code, message: safe.message } }, { status: safe.status });
    }
  }
  if (route === "telegram/webhook") {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET) return NextResponse.json({ status: "configuration_required" }, { status: 503 });
    if (request.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) return NextResponse.json({ error: "Không có quyền" }, { status: 401 });
    try { return NextResponse.json(await handleTelegramUpdate((body ?? {}) as Parameters<typeof handleTelegramUpdate>[0])); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ status: "error", error: safe }, { status: safe.status }); }
  }
  if (route === "bookmarks") {
    const parsed = bookmarkSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    try { return NextResponse.json({ ...(await personalizationService.bookmark(parsed.data.newsClusterId, parsed.data.action)), ...parsed.data }); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
  }
  if (route === "reading-history") {
    const parsed = readingHistorySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    try { return NextResponse.json(await personalizationService.recordReading(parsed.data.storyId, parsed.data.durationSeconds)); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
  }
  if (route === "telegram/link-code") {
    try { return NextResponse.json(await personalizationService.createTelegramLinkCode()); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
  }
  if (route === "follows") {
    const parsed = followSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    try { return NextResponse.json({ ...(await personalizationService.follow(parsed.data.entityType, parsed.data.entityId, parsed.data.action)), ...parsed.data }); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
  }
  if (route === "profile") {
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    try { return NextResponse.json({ ...(await personalizationService.updateProfile(parsed.data)), profile: parsed.data }); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
  }
  if (route === "me/reset") {
    try { return NextResponse.json(await personalizationService.reset()); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ error: safe }, { status: safe.status }); }
  }
  if (["cron/ingest", "admin/ingest"].includes(route)) {
    if (!protectedBySecret(request)) return NextResponse.json({ error: "Không có quyền" }, { status: 401 });
    const rate = rateLimit(`cron:${clientKey(request)}`, 10, 300_000);
    if (!rate.allowed) return NextResponse.json({ error: "Đã vượt giới hạn" }, { status: 429 });
    const mode = bodyRecord && "mode" in bodyRecord ? String(bodyRecord.mode) : "both";
    const recluster = bodyRecord && "recluster" in bodyRecord ? Boolean(bodyRecord.recluster) : false;
    const useAi = process.env.AI_PROVIDER !== "disabled" && process.env.AI_PROVIDER !== "off";
    try {
      if (mode === "rss") {
        const rssResult = await syncRss();
        return NextResponse.json({ rss: rssResult });
      }
      if (mode === "stories") {
        // useAi defaults to false to avoid hitting Cloudflare's 50-subrequest limit;
        // pass { mode: 'stories', useAi: true } explicitly to enable AI processing
        const explicitUseAi = bodyRecord && "useAi" in bodyRecord ? Boolean(bodyRecord.useAi) : false;
        const storyResult = await processStories({ useAi: explicitUseAi, recluster, limit: 5 });
        return NextResponse.json({ stories: storyResult });
      }
      // mode === "both": run sequentially with small limits
      const rssResult = await syncRss();
      const storyResult = await processStories({ useAi, recluster, limit: 5 });
      return NextResponse.json({ rss: rssResult, stories: storyResult });
    }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ status: "configuration_required", error: { code: safe.code, message: safe.message } }, { status: safe.status }); }
  }
  if (route === "ai/process") {
    if (!protectedBySecret(request)) return NextResponse.json({ error: "Không có quyền" }, { status: 401 });
    const parsed = (body && typeof body === "object" ? body : {}) as { title?: string; excerpt?: string };
    try { return NextResponse.json(await aiService.classify({ title: parsed.title ?? "", excerpt: parsed.excerpt ?? "" })); }
    catch (error) { const safe = toSafeError(error); return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status }); }
  }
  return NextResponse.json({ error: "Không tìm thấy endpoint" }, { status: 404 });
}
