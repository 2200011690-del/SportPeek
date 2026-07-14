import { NextRequest, NextResponse } from "next/server";
import { competitions, news, players, standings, teams } from "@/lib/demo-data";
import { getAIProvider } from "@/lib/ai";
import { runIngestion } from "@/lib/ingestion";
import { getAggregatedNews } from "@/lib/ingestion/official-feed";
import { rateLimit } from "@/lib/rate-limit";
import { getSportsDataProvider, MockSportsDataProvider } from "@/lib/sports-data";
import { bookmarkSchema, followSchema, profileSchema, searchSchema } from "@/lib/validation";
import { newsSearchText, normalizeSearchText } from "@/lib/ui-logic";

type Context = { params: Promise<{ path: string[] }> };
const clientKey = (request: NextRequest) => request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
const protectedBySecret = (request: NextRequest) => process.env.CRON_SECRET && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

export async function GET(request: NextRequest, { params }: Context) {
  const { path } = await params; const route = path.join("/"); const sports = getSportsDataProvider();
  if (route === "news") { try { const result = await getAggregatedNews(); return NextResponse.json({ ...result, nextCursor: null, demo: false }, { headers: { "cache-control": "public, s-maxage=90, stale-while-revalidate=180" } }); } catch { return NextResponse.json({ data: news, nextCursor: null, demo: true, sources: [], aiTranslation: false, warning: "news_feeds_unavailable" }); } }
  if (route === "feed/for-you") { let source = news; try { source = (await getAggregatedNews()).data; } catch { /* use safe demo fallback */ } return NextResponse.json({ data: [...source].sort((a,b)=>b.hotness+b.reliability-a.hotness-a.reliability), strategy: "trending", personalized: false, demo: source === news }); }
  if (route === "search") {
    const rate = rateLimit(`search:${clientKey(request)}`, 30);
    if (!rate.allowed) return NextResponse.json({ error: "Quá nhiều yêu cầu" }, { status: 429 });
    const parsed = searchSchema.safeParse({ q: request.nextUrl.searchParams.get("q") ?? "", type: request.nextUrl.searchParams.get("type") ?? "all" });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    let source = news;
    try { source = (await getAggregatedNews()).data; } catch { /* use labeled demo fallback */ }
    const q = normalizeSearchText(parsed.data.q);
    const include = (type: typeof parsed.data.type) => parsed.data.type === "all" || parsed.data.type === type;
    return NextResponse.json({
      news: include("news") ? source.filter((item) => newsSearchText(item).includes(q)) : [],
      teams: include("teams") ? teams.filter((item) => normalizeSearchText(item.name).includes(q)) : [],
      players: [],
      competitions: include("competitions") ? competitions.filter((item) => normalizeSearchText(item.name).includes(q)) : [],
      playersAvailable: false,
      demo: source === news,
    });
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
