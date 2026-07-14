import { NextRequest, NextResponse } from "next/server";
import { competitions, players, standings, teams } from "@/lib/demo-data";
import { getAIProvider } from "@/lib/ai";
import { runIngestion } from "@/lib/ingestion";
import { rateLimit } from "@/lib/rate-limit";
import { getSportsDataProvider, MockSportsDataProvider } from "@/lib/sports-data";
import { storyToNewsItem } from "@/lib/stories/presenter";
import { storyRepository, type StoryRepositoryResult } from "@/lib/stories/repository";
import { storyDetailEnvelopeSchema, storyFeedEnvelopeSchema, type StoryCluster } from "@/lib/stories/schema";
import { storySlugSchema } from "@/lib/stories/slug";
import { bookmarkSchema, followSchema, profileSchema, searchSchema } from "@/lib/validation";
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

function detailEnvelope(result: Awaited<ReturnType<typeof storyRepository.getStoryBySlug>>) {
  return storyDetailEnvelopeSchema.parse({
    status: result.status,
    data: result.data,
    meta: result.meta,
    error: result.error ?? null,
  });
}

export async function GET(request: NextRequest, { params }: Context) {
  const { path } = await params; const route = path.join("/"); const sports = getSportsDataProvider();
  if (route === "stories") {
    const result = await storyRepository.getStoryFeed();
    return NextResponse.json(feedEnvelope(result), {
      status: repositoryHttpStatus(result.status),
      headers: { "cache-control": "public, s-maxage=90, stale-while-revalidate=300" },
    });
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
    const result = await storyRepository.getStoryBySlug(parsedSlug.data);
    return NextResponse.json(detailEnvelope(result), {
      status: repositoryHttpStatus(result.status),
      headers: { "cache-control": "public, s-maxage=90, stale-while-revalidate=300" },
    });
  }
  if (route === "news") {
    const result = await storyRepository.getStoryFeed();
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
    const result = await storyRepository.getStoryFeed();
    const source = (result.data ?? []).map(storyToNewsItem);
    return NextResponse.json({ status: result.status, data: [...source].sort((a,b)=>b.hotness+b.reliability-a.hotness-a.reliability), strategy: "trending", personalized: false, demo: false, meta: result.meta, error: result.error ?? null }, { status: repositoryHttpStatus(result.status) });
  }
  if (route === "search") {
    const rate = rateLimit(`search:${clientKey(request)}`, 30);
    if (!rate.allowed) return NextResponse.json({ error: "Quá nhiều yêu cầu" }, { status: 429 });
    const parsed = searchSchema.safeParse({ q: request.nextUrl.searchParams.get("q") ?? "", type: request.nextUrl.searchParams.get("type") ?? "all" });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const storyResult = await storyRepository.getStoryFeed();
    const source = (storyResult.data ?? []).map(storyToNewsItem);
    const q = normalizeSearchText(parsed.data.q);
    const include = (type: typeof parsed.data.type) => parsed.data.type === "all" || parsed.data.type === type;
    return NextResponse.json({
      news: include("news") ? source.filter((item) => newsSearchText(item).includes(q)) : [],
      teams: include("teams") ? teams.filter((item) => normalizeSearchText(item.name).includes(q)) : [],
      players: [],
      competitions: include("competitions") ? competitions.filter((item) => normalizeSearchText(item.name).includes(q)) : [],
      playersAvailable: false,
      demo: false,
      status: storyResult.status,
      meta: storyResult.meta,
      error: storyResult.error ?? null,
    }, { status: repositoryHttpStatus(storyResult.status) });
  }
  if (["matches/live", "fixtures", "results", "standings"].includes(route)) { try { const data = route === "matches/live" ? await sports.getLiveMatches() : route === "fixtures" ? await sports.getFixtures() : route === "results" ? await sports.getResults() : await sports.getStandings(); return NextResponse.json({ data, provider: sports.name, demo: sports.name === "mock", timezone: "Asia/Ho_Chi_Minh" }, { headers: { "cache-control": route === "matches/live" ? "public, s-maxage=15, stale-while-revalidate=30" : "public, s-maxage=300, stale-while-revalidate=900" } }); } catch (error) { const message = error instanceof Error ? error.message : String(error); console.error("sports_provider_unavailable", { route, provider: sports.name, error: message }); const fallback = new MockSportsDataProvider(); const data = route === "matches/live" ? await fallback.getLiveMatches() : route === "fixtures" ? await fallback.getFixtures() : route === "results" ? await fallback.getResults() : standings; return NextResponse.json({ data, provider: "mock", demo: true, warning: "sports_provider_unavailable" }); } }
  if (route.startsWith("teams/")) return NextResponse.json({ data: teams.find((x)=>x.slug===path[1]) ?? null });
  if (route.startsWith("players/")) return NextResponse.json({ data: players.find((x)=>x.id===path[1]) ?? null });
  return NextResponse.json({ error: "Không tìm thấy endpoint" }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: Context) {
  const { path } = await params; const route = path.join("/"); const body: unknown = await request.json().catch(() => null);
  if (route === "bookmarks") { const parsed = bookmarkSchema.safeParse(body); return parsed.success ? NextResponse.json({ ok: true, persisted: false, storage: "device-local", ...parsed.data }, { status: 202 }) : NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }); }
  if (route === "follows") { const parsed = followSchema.safeParse(body); return parsed.success ? NextResponse.json({ ok: true, persisted: false, storage: "device-local", ...parsed.data }, { status: 202 }) : NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }); }
  if (route === "profile") { const parsed = profileSchema.safeParse(body); return parsed.success ? NextResponse.json({ ok: true, persisted: false, storage: "device-local", profile: parsed.data }, { status: 202 }) : NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }); }
  if (["cron/ingest", "admin/ingest"].includes(route)) { if (!protectedBySecret(request)) return NextResponse.json({ error: "Không có quyền" }, { status: 401 }); const rate = rateLimit(`cron:${clientKey(request)}`, 5, 300_000); if (!rate.allowed) return NextResponse.json({ error: "Đã vượt giới hạn" }, { status: 429 }); return NextResponse.json(await runIngestion()); }
  if (route === "ai/process") { if (!protectedBySecret(request)) return NextResponse.json({ error: "Không có quyền" }, { status: 401 }); const parsed = (body && typeof body === "object" ? body : {}) as { title?: string; excerpt?: string }; return NextResponse.json(await getAIProvider().classifyArticle({ title: parsed.title ?? "", excerpt: parsed.excerpt ?? "" })); }
  return NextResponse.json({ error: "Không tìm thấy endpoint" }, { status: 404 });
}
