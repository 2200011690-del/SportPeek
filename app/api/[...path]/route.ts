import { NextRequest, NextResponse } from "next/server";
import { news, players, standings, teams } from "@/lib/demo-data";
import { getAIProvider } from "@/lib/ai";
import { runIngestion } from "@/lib/ingestion";
import { rateLimit } from "@/lib/rate-limit";
import { getSportsDataProvider } from "@/lib/sports-data";
import { bookmarkSchema, followSchema, profileSchema, searchSchema } from "@/lib/validation";

type Context = { params: Promise<{ path: string[] }> };
const clientKey = (request: NextRequest) => request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
const protectedBySecret = (request: NextRequest) => process.env.CRON_SECRET && request.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;

export async function GET(request: NextRequest, { params }: Context) {
  const { path } = await params; const route = path.join("/"); const sports = getSportsDataProvider();
  if (route === "news") return NextResponse.json({ data: news, nextCursor: null, demo: true });
  if (route === "feed/for-you") return NextResponse.json({ data: [...news].sort((a,b)=>b.hotness+b.reliability-a.hotness-a.reliability), strategy: "trending_fallback" });
  if (route === "search") { const rate = rateLimit(`search:${clientKey(request)}`, 30); if (!rate.allowed) return NextResponse.json({ error: "Quá nhiều yêu cầu" }, { status: 429 }); const parsed = searchSchema.safeParse({ q: request.nextUrl.searchParams.get("q") ?? "", type: request.nextUrl.searchParams.get("type") ?? "all" }); if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }); const q = parsed.data.q.toLowerCase(); return NextResponse.json({ news: news.filter((x)=>`${x.title} ${x.summary}`.toLowerCase().includes(q)), teams: teams.filter((x)=>x.name.toLowerCase().includes(q)), players: players.filter((x)=>x.name.toLowerCase().includes(q)) }); }
  if (route === "matches/live") return NextResponse.json({ data: await sports.getLiveMatches(), demo: true });
  if (route === "fixtures") return NextResponse.json({ data: await sports.getFixtures(), timezone: "Asia/Ho_Chi_Minh" });
  if (route === "results") return NextResponse.json({ data: await sports.getResults() });
  if (route === "standings") return NextResponse.json({ data: standings, season: "2025/26" });
  if (route.startsWith("teams/")) return NextResponse.json({ data: teams.find((x)=>x.slug===path[1]) ?? null });
  if (route.startsWith("players/")) return NextResponse.json({ data: players.find((x)=>x.id===path[1]) ?? null });
  return NextResponse.json({ error: "Không tìm thấy endpoint" }, { status: 404 });
}

export async function POST(request: NextRequest, { params }: Context) {
  const { path } = await params; const route = path.join("/"); const body: unknown = await request.json().catch(() => null);
  if (route === "bookmarks") { const parsed = bookmarkSchema.safeParse(body); return parsed.success ? NextResponse.json({ ok: true, ...parsed.data }) : NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }); }
  if (route === "follows") { const parsed = followSchema.safeParse(body); return parsed.success ? NextResponse.json({ ok: true, ...parsed.data }) : NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }); }
  if (route === "profile") { const parsed = profileSchema.safeParse(body); return parsed.success ? NextResponse.json({ ok: true, profile: parsed.data }) : NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }); }
  if (["cron/ingest", "admin/ingest"].includes(route)) { if (!protectedBySecret(request)) return NextResponse.json({ error: "Không có quyền" }, { status: 401 }); const rate = rateLimit(`cron:${clientKey(request)}`, 5, 300_000); if (!rate.allowed) return NextResponse.json({ error: "Đã vượt giới hạn" }, { status: 429 }); return NextResponse.json(await runIngestion()); }
  if (route === "ai/process") { if (!protectedBySecret(request)) return NextResponse.json({ error: "Không có quyền" }, { status: 401 }); const parsed = (body && typeof body === "object" ? body : {}) as { title?: string; excerpt?: string }; return NextResponse.json(await getAIProvider().classifyArticle({ title: parsed.title ?? "", excerpt: parsed.excerpt ?? "" })); }
  return NextResponse.json({ error: "Không tìm thấy endpoint" }, { status: 404 });
}
