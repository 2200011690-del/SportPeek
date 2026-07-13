import { matches as demoMatches, players as demoPlayers, standings as demoStandings, teams as demoTeams } from "@/lib/demo-data";
import type { Match, Standing, Team } from "@/lib/types";

type PlayerRecord = (typeof demoPlayers)[number];
export interface SportsDataProvider { readonly name: string; getLiveMatches(): Promise<Match[]>; getFixtures(): Promise<Match[]>; getResults(): Promise<Match[]>; getStandings(): Promise<Standing[]>; getTeams(): Promise<Team[]>; getPlayers(): Promise<PlayerRecord[]>; }

export class MockSportsDataProvider implements SportsDataProvider {
  readonly name = "mock";
  async getLiveMatches(){return demoMatches.filter((match)=>match.status==="live")} async getFixtures(){return demoMatches.filter((match)=>match.status==="scheduled")} async getResults(){return demoMatches.filter((match)=>match.status==="finished")} async getStandings(){return demoStandings} async getTeams(){return demoTeams} async getPlayers(){return demoPlayers}
}

type ApiTeam = { id: number; name: string; code?: string; country?: string; logo?: string };
type ApiFixture = { fixture: { id: number; date: string; status: { short: string; elapsed?: number | null }; venue?: { name?: string | null } }; league: { id: number; name: string }; teams: { home: ApiTeam; away: ApiTeam }; goals: { home: number | null; away: number | null } };
type ApiStanding = { rank: number; team: ApiTeam; points: number; goalsDiff: number; form?: string; all: { played: number; win: number; draw: number; lose: number } };
type ApiEnvelope<T> = { response: T; errors?: unknown[] | Record<string, unknown>; results?: number };
const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();

function formatDate(date: Date): string { return date.toISOString().slice(0, 10); }
function configuredLeagueIds(): number[] { return (process.env.API_FOOTBALL_LEAGUE_IDS ?? "39,2,140,135").split(",").map(Number).filter(Number.isFinite); }
function matchStatus(short: string): Match["status"] { if (["1H","HT","2H","ET","BT","P","INT","LIVE"].includes(short)) return "live"; if (["FT","AET","PEN"].includes(short)) return "finished"; return "scheduled"; }

export class ApiFootballProvider implements SportsDataProvider {
  readonly name = "api-football";
  private readonly baseUrl = process.env.API_FOOTBALL_BASE_URL ?? "https://v3.football.api-sports.io";
  private readonly key = process.env.SPORTS_DATA_API_KEY ?? "";
  private readonly season = Number(process.env.API_FOOTBALL_SEASON ?? "2025");

  private async request<T>(path: string, ttlMs: number): Promise<T> {
    if (!this.key) throw new Error("Thiếu SPORTS_DATA_API_KEY");
    const cacheKey = `${path}:${this.season}`; const cached = memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    const response = await fetch(`${this.baseUrl}${path}`, { headers: { "x-apisports-key": this.key, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`API-Football HTTP ${response.status}`);
    const payload = await response.json() as ApiEnvelope<T>;
    const hasErrors = Array.isArray(payload.errors) ? payload.errors.length > 0 : payload.errors && Object.keys(payload.errors).length > 0;
    if (hasErrors) throw new Error(`API-Football từ chối yêu cầu: ${JSON.stringify(payload.errors)}`);
    memoryCache.set(cacheKey, { value: payload.response, expiresAt: Date.now() + ttlMs });
    return payload.response;
  }

  private mapMatches(items: ApiFixture[]): Match[] {
    const allowed = new Set(configuredLeagueIds());
    return items.filter((item) => !allowed.size || allowed.has(item.league.id)).map((item) => ({ id: String(item.fixture.id), competition: item.league.name, home: item.teams.home.name, away: item.teams.away.name, homeScore: item.goals.home, awayScore: item.goals.away, startTime: new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh", hour12: false }).format(new Date(item.fixture.date)), status: matchStatus(item.fixture.status.short), minute: item.fixture.status.elapsed ?? undefined, venue: item.fixture.venue?.name ?? "Chưa công bố" }));
  }

  async getLiveMatches(): Promise<Match[]> { const ids = configuredLeagueIds(); const items = await this.request<ApiFixture[]>(`/fixtures?live=${ids.length ? ids.join("-") : "all"}`, 15_000); return this.mapMatches(items); }
  async getFixtures(): Promise<Match[]> { const items = await this.request<ApiFixture[]>(`/fixtures?date=${formatDate(new Date())}&timezone=Asia%2FHo_Chi_Minh`, 5 * 60_000); return this.mapMatches(items).filter((item) => item.status === "scheduled"); }
  async getResults(): Promise<Match[]> { const date = new Date(); date.setDate(date.getDate() - 1); const items = await this.request<ApiFixture[]>(`/fixtures?date=${formatDate(date)}&timezone=Asia%2FHo_Chi_Minh`, 10 * 60_000); return this.mapMatches(items).filter((item) => item.status === "finished"); }
  async getStandings(): Promise<Standing[]> { const league = configuredLeagueIds()[0] ?? 39; const groups = await this.request<Array<{ league: { standings: ApiStanding[][] } }>>(`/standings?league=${league}&season=${this.season}`, 30 * 60_000); return (groups[0]?.league.standings[0] ?? []).map((row) => ({ position: row.rank, team: row.team.name, played: row.all.played, won: row.all.win, drawn: row.all.draw, lost: row.all.lose, goalDifference: row.goalsDiff, points: row.points, form: (row.form?.split("") ?? []).slice(-5).filter((value): value is "W"|"D"|"L" => ["W","D","L"].includes(value)) })); }
  async getTeams(): Promise<Team[]> { const league = configuredLeagueIds()[0] ?? 39; const records = await this.request<Array<{ team: ApiTeam; venue?: { name?: string } }>>(`/teams?league=${league}&season=${this.season}`, 24 * 60 * 60_000); return records.map(({ team, venue }) => ({ id: String(team.id), name: team.name, shortName: team.code ?? team.name.slice(0,3).toUpperCase(), slug: team.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""), country: team.country ?? "", accent: "#8cff4e", stadium: venue?.name ?? "" })); }
  async getPlayers(): Promise<PlayerRecord[]> { return demoPlayers; }
}

export function isRealSportsDataEnabled(): boolean { return process.env.SPORTS_DATA_PROVIDER === "api-football" && Boolean(process.env.SPORTS_DATA_API_KEY); }
export function getSportsDataProvider(): SportsDataProvider { return isRealSportsDataEnabled() ? new ApiFootballProvider() : new MockSportsDataProvider(); }
