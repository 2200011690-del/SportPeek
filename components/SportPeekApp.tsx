"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { Home, Newspaper, Radio, CalendarDays, Goal, Trophy, Activity, Sparkles } from "lucide-react";
import type { Competition, Match, NewsItem, NewsSourceCatalogItem, Standing, Team, Player } from "@/lib/types";
import type { HealthSnapshot, ServiceHealth } from "@/lib/health";

// Types and Context
export type SourceFilter = "all" | "vi" | "international" | "official" | "youtube" | "rss";
export type NewsAIStatus = { provider: string; state: "ok" | "off" | "error"; translatedCount: number };
export type RuntimeData = { newsItems: NewsItem[]; forYouItems: NewsItem[]; personalized: boolean; matchItems: Match[]; standingRows: Standing[]; teams: Team[]; competitions: Competition[]; players: Player[]; sourceCatalog: NewsSourceCatalogItem[]; newsReal: boolean; sportsReal: boolean; newsSources: string[]; aiTranslation: boolean; aiStatus: NewsAIStatus; loading: boolean; lastUpdated: string | null; health: HealthSnapshot };
type RuntimeResponse<T> = { status?: string; data: T; demo?: boolean; personalized?: boolean; provider?: string; sources?: string[]; aiTranslation?: boolean; aiStatus?: NewsAIStatus; error?: { code: string; message: string } | null };

const loadingService = (label: string): ServiceHealth => ({ state: "unavailable", label, message: "Đang tải trạng thái từ server.", provider: null, lastUpdatedAt: null, count: null });
const loadingHealth: HealthSnapshot = { state: "unavailable", generatedAt: new Date(0).toISOString(), services: { rss: loadingService("Đang tải RSS"), stories: loadingService("Đang tải stories"), sports: loadingService("Đang tải sports"), ai: loadingService("Đang tải AI"), telegram: loadingService("Đang tải Telegram") } };
export const emptyRuntimeData: RuntimeData = { newsItems: [], forYouItems: [], personalized: false, matchItems: [], standingRows: [], teams: [], competitions: [], players: [], sourceCatalog: [], newsReal: false, sportsReal: false, newsSources: [], aiTranslation: false, aiStatus: { provider: "off", state: "off", translatedCount: 0 }, loading: true, lastUpdated: null, health: loadingHealth };

export const RuntimeDataContext = createContext<RuntimeData>(emptyRuntimeData);
export const useRuntimeData = () => useContext(RuntimeDataContext);

export const STORAGE_KEYS = { theme: "sportpeek.theme" } as const;
export type StoredSettings = { displayName: string; language: "vi" | "en"; timezone: string; notifications: boolean[]; quietHoursStart: string; quietHoursEnd: string };
export const DEFAULT_DEVICE_SETTINGS: StoredSettings = { displayName: "Người hâm mộ", language: "vi", timezone: "Asia/Ho_Chi_Minh", notifications: [true, true, true, true, false, false], quietHoursStart: "", quietHoursEnd: "" };

async function fetchRuntime<T>(url: string): Promise<RuntimeResponse<T>> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${url} trả về HTTP ${response.status}`);
  return response.json() as Promise<RuntimeResponse<T>>;
}

export const navItems = [
  { href: "/", label: "Tổng quan", icon: Home },
  { href: "/for-you", label: "Dành cho bạn", icon: Sparkles },
  { href: "/news", label: "Tin mới nhất", icon: Newspaper },
  { href: "/live", label: "Trực tiếp", icon: Radio },
  { href: "/fixtures", label: "Lịch thi đấu", icon: CalendarDays },
  { href: "/results", label: "Kết quả", icon: Goal },
  { href: "/standings", label: "Bảng xếp hạng", icon: Trophy },
  { href: "/transfers", label: "Chuyển nhượng", icon: Activity },
];

// Split page and layout components
import HomePage from "@/components/pages/HomePage";
import { ForYouPage, NewsPage, TransfersPage } from "@/components/pages/NewsPage";
import RichNewsDetail from "@/components/pages/RichNewsDetail";
import { LivePage, MatchDetail } from "@/components/pages/LivePage";
import StandingsPage from "@/components/pages/StandingsPage";
import EntityPage from "@/components/pages/EntityPage";
import SearchPage from "@/components/pages/SearchPage";
import BookmarksPage from "@/components/pages/BookmarksPage";
import SettingsPage from "@/components/pages/SettingsPage";
import AuthPage from "@/components/pages/AuthPage";
import { SourcesPage, LegalPage } from "@/components/pages/TransparencyPages";

import { AppSidebar, Header, MobileNavigation, SystemStatusBanner, AppFooter } from "@/components/layout/Shell";
import { SearchCommand } from "@/components/ui/Search";
import { EmptyState } from "@/components/ui/badges";

export default function SportPeekApp({ route, signupAllowed = false }: { route: string; signupAllowed?: boolean }) {
  const [theme, setTheme] = useState("dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [homeSourceFilter, setHomeSourceFilter] = useState<SourceFilter>("all");
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => new Set());
  const [followed, setFollowed] = useState<Set<string>>(() => new Set());
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [runtimeData, setRuntimeData] = useState<RuntimeData>(emptyRuntimeData);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const storedTheme = localStorage.getItem(STORAGE_KEYS.theme);
        if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);
      } catch { /* ignore invalid device-local data */ }
      setPreferencesLoaded(true);
    });
    void fetchRuntime<{ bookmarks: string[]; follows: Array<{ entityId: string }> }>("/api/me/preferences").then((response) => {
      setBookmarks(new Set(response.data.bookmarks));
      setFollowed(new Set(response.data.follows.map((follow) => follow.entityId)));
    }).catch(() => { /* Anonymous/public mode has no account state. */ });

    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        console.log("[SportPeek PWA] Service Worker registered:", reg.scope);
      }).catch((err) => {
        console.error("[SportPeek PWA] Service Worker registration failed:", err);
      });
    }
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; if (preferencesLoaded) localStorage.setItem(STORAGE_KEYS.theme, theme); }, [theme, preferencesLoaded]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);
  useEffect(() => {
    let active = true;
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const requests = await Promise.allSettled([
          fetchRuntime<NewsItem[]>("/api/news"),
          fetchRuntime<Match[]>("/api/matches/live"),
          fetchRuntime<Match[]>("/api/fixtures"),
          fetchRuntime<Match[]>("/api/results"),
          fetchRuntime<Standing[]>("/api/standings"),
          fetchRuntime<HealthSnapshot>("/api/health"),
          fetchRuntime<Team[]>("/api/teams"),
          fetchRuntime<Competition[]>("/api/competitions"),
          fetchRuntime<Player[]>("/api/players"),
          fetchRuntime<NewsItem[]>("/api/feed/for-you"),
          fetchRuntime<NewsSourceCatalogItem[]>("/api/sources"),
        ]);
        if (!active) return;
        const newsResponse = requests[0].status === "fulfilled" ? requests[0].value : null;
        const sportsResponses = requests.slice(1, 4).filter((result): result is PromiseFulfilledResult<RuntimeResponse<Match[]>> => result.status === "fulfilled").map((result) => result.value);
        const tableResponse = requests[4].status === "fulfilled" ? requests[4].value : null;
        const healthResponse = requests[5].status === "fulfilled" ? requests[5].value : null;
        const teamResponse = requests[6].status === "fulfilled" ? requests[6].value : null;
        const competitionResponse = requests[7].status === "fulfilled" ? requests[7].value : null;
        const playerResponse = requests[8].status === "fulfilled" ? requests[8].value : null;
        const forYouResponse = requests[9].status === "fulfilled" ? requests[9].value : null;
        const sourceCatalogResponse = requests[10].status === "fulfilled" ? requests[10].value : null;
        const health = healthResponse?.data ?? loadingHealth;
        const mergedMatches = [...new Map(sportsResponses.flatMap((result) => result.data ?? []).map((match) => [match.id, match])).values()];
        const rssActive = newsResponse?.demo === false && Boolean(newsResponse.data?.length) && !["unavailable", "configuration_required", "development_mock"].includes(health.services.rss.state);
        const sportsActive = !["unavailable", "configuration_required", "development_mock"].includes(health.services.sports.state);
        const aiStatus = newsResponse?.aiStatus ?? { provider: "off" as const, state: "off" as const, translatedCount: 0 };
        const aiActive = newsResponse?.aiTranslation === true;
        setRuntimeData({ newsItems: newsResponse?.data ?? [], forYouItems: forYouResponse?.data ?? [], personalized: forYouResponse?.personalized === true, matchItems: mergedMatches, standingRows: tableResponse?.data ?? [], teams: teamResponse?.data ?? [], competitions: competitionResponse?.data ?? [], players: playerResponse?.data ?? [], sourceCatalog: sourceCatalogResponse?.data ?? [], newsReal: rssActive, sportsReal: sportsActive, newsSources: newsResponse?.sources ?? [], aiTranslation: aiActive, aiStatus, loading: false, lastUpdated: health.generatedAt, health });
      } finally { loading = false; }
    };
    void load();
    const refreshTimer = window.setInterval(() => { void load(); }, 120_000);
    return () => { active = false; window.clearInterval(refreshTimer); };
  }, []);
  const toggleBookmark = (id: string) => {
    const remove = bookmarks.has(id);
    setBookmarks((current) => { const next = new Set(current); if (remove) next.delete(id); else next.add(id); return next; });
    void fetch("/api/bookmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newsClusterId: id, action: remove ? "remove" : "save" }), signal: AbortSignal.timeout(12_000) }).then((response) => {
      if (!response.ok) setBookmarks((current) => { const next = new Set(current); if (remove) next.add(id); else next.delete(id); return next; });
    }).catch(() => setBookmarks((current) => { const next = new Set(current); if (remove) next.add(id); else next.delete(id); return next; }));
  };
  const toggleFollow = (id: string, entityType: "team" | "player" | "competition" | "source" = "team") => {
    const remove = followed.has(id);
    setFollowed((current) => { const next = new Set(current); if (remove) next.delete(id); else next.add(id); return next; });
    void fetch("/api/follows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entityType, entityId: id, action: remove ? "unfollow" : "follow" }), signal: AbortSignal.timeout(12_000) }).then((response) => {
      if (!response.ok) setFollowed((current) => { const next = new Set(current); if (remove) next.add(id); else next.delete(id); return next; });
    }).catch(() => setFollowed((current) => { const next = new Set(current); if (remove) next.add(id); else next.delete(id); return next; }));
  };
  const segments = route.split("/").filter(Boolean);
  const isAuth = ["/login", "/register", "/forgot-password", "/reset-password", "/auth/callback"].includes(route);
  if (isAuth) return <AuthPage type={route === "/register" ? "register" : route === "/forgot-password" ? "forgot" : route === "/reset-password" ? "reset" : "login"} signupAllowed={signupAllowed} />;
  let page: React.ReactNode;
  if (route === "/") page = <HomePage bookmarks={bookmarks} onBookmark={toggleBookmark} sourceFilter={homeSourceFilter} />;
  else if (route === "/for-you") page = <ForYouPage followed={followed} onFollow={toggleFollow} bookmarks={bookmarks} onBookmark={toggleBookmark} />;
  else if (route === "/news") page = <NewsPage bookmarks={bookmarks} onBookmark={toggleBookmark} />;
  else if (segments[0] === "news" && segments[1]) page = <RichNewsDetail slug={segments[1]} bookmarks={bookmarks} onBookmark={toggleBookmark} />;
  else if (route === "/live") page = <LivePage mode="live" />;
  else if (route === "/fixtures") page = <LivePage mode="fixtures" />;
  else if (route === "/results") page = <LivePage mode="results" />;
  else if (segments[0] === "matches") page = <MatchDetail id={segments[1] ?? "m1"} />;
  else if (route === "/standings") page = <StandingsPage />;
  else if (route === "/transfers") page = <TransfersPage bookmarks={bookmarks} onBookmark={toggleBookmark} />;
  else if (segments[0] === "teams") page = <EntityPage type="team" slug={segments[1] ?? "arsenal"} followed={followed} onFollow={toggleFollow} />;
  else if (segments[0] === "players") page = <EntityPage type="player" slug={segments[1] ?? "minh-quan-1"} followed={followed} onFollow={toggleFollow} />;
  else if (segments[0] === "competitions") page = <EntityPage type="competition" slug={segments[1] ?? "premier-league"} followed={followed} onFollow={toggleFollow} />;
  else if (route === "/search") page = <SearchPage />;
  else if (route === "/bookmarks") page = <BookmarksPage bookmarks={bookmarks} onBookmark={toggleBookmark} />;
  else if (route === "/settings") page = <SettingsPage />;
  else if (route === "/sources") page = <SourcesPage followed={followed} onFollow={toggleFollow} />;
  else if (["terms", "privacy", "copyright"].includes(segments[0])) page = <LegalPage type={segments[0]} />;
  else page = <div className="large-empty"><EmptyState title="Không tìm thấy trang" description="Trang bạn tìm kiếm không tồn tại hoặc đã được di chuyển." /><Link href="/" className="primary-button">Về trang chủ</Link></div>;
  return <RuntimeDataContext.Provider value={runtimeData}><div className={`app-shell ${route === "/" ? "home-shell" : ""}`}><AppSidebar route={route} open={menuOpen} onClose={() => setMenuOpen(false)} sourceFilter={homeSourceFilter} onSourceFilter={setHomeSourceFilter} /><div className="app-column"><Header onMenu={() => setMenuOpen(true)} onSearch={() => setSearchOpen(true)} theme={theme} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} /><SystemStatusBanner /><main className="content-wrap">{page}</main><AppFooter compact={route === "/"} /></div><MobileNavigation route={route} /><SearchCommand open={searchOpen} onClose={() => setSearchOpen(false)} /></div></RuntimeDataContext.Provider>;
}
