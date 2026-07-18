"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import type { NewsItem, NewsSourceCatalogItem } from "@/lib/types";
import type { HealthSnapshot } from "@/lib/health";
import type { StoryDetailPayload } from "@/lib/stories/schema";
import {
  RuntimeDataContext,
  STORAGE_KEYS,
  emptyRuntimeData,
  type NewsAIStatus,
  type RuntimeData,
  type SourceFilter,
} from "@/components/runtime/RuntimeDataContext";

type RuntimeResponse<T> = { status?: string; data: T; demo?: boolean; personalized?: boolean; provider?: string; sources?: string[]; aiTranslation?: boolean; aiStatus?: NewsAIStatus; error?: { code: string; message: string } | null };

async function fetchRuntime<T>(url: string): Promise<RuntimeResponse<T>> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${url} trả về HTTP ${response.status}`);
  return response.json() as Promise<RuntimeResponse<T>>;
}

// Split page and layout components
import HomePage from "@/components/pages/HomePage";
import { ForYouPage, NewsPage } from "@/components/pages/NewsPage";
import RichNewsDetail from "@/components/pages/RichNewsDetail";
import SearchPage from "@/components/pages/SearchPage";
import BookmarksPage from "@/components/pages/BookmarksPage";
import SettingsPage from "@/components/pages/SettingsPage";
import AuthPage from "@/components/pages/AuthPage";
import { SourcesPage, LegalPage } from "@/components/pages/TransparencyPages";

import { AppSidebar, Header, MobileNavigation, SystemStatusBanner, AppFooter } from "@/components/layout/Shell";
import { SearchCommand } from "@/components/ui/Search";
import { EmptyState } from "@/components/ui/badges";

export default function SportPeekApp({ route, signupAllowed = false, initialStory = null }: { route: string; signupAllowed?: boolean; initialStory?: StoryDetailPayload | null }) {
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
        const storedTheme = localStorage.getItem(STORAGE_KEYS.theme) ?? localStorage.getItem(STORAGE_KEYS.legacyTheme);
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
        console.log("[NewsPeek PWA] Service Worker registered:", reg.scope);
      }).catch((err) => {
        console.error("[NewsPeek PWA] Service Worker registration failed:", err);
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
          fetchRuntime<HealthSnapshot>("/api/health"),
          fetchRuntime<NewsItem[]>("/api/feed/for-you"),
          fetchRuntime<NewsSourceCatalogItem[]>("/api/sources"),
        ]);
        if (!active) return;
        const newsResponse = requests[0].status === "fulfilled" ? requests[0].value : null;
        const healthResponse = requests[1].status === "fulfilled" ? requests[1].value : null;
        const forYouResponse = requests[2].status === "fulfilled" ? requests[2].value : null;
        const sourceCatalogResponse = requests[3].status === "fulfilled" ? requests[3].value : null;
        const health = healthResponse?.data ?? emptyRuntimeData.health;
        const rssActive = newsResponse?.demo === false && Boolean(newsResponse.data?.length) && !["unavailable", "configuration_required", "development_mock"].includes(health.services.rss.state);
        const aiStatus = newsResponse?.aiStatus ?? { provider: "off" as const, state: "off" as const, translatedCount: 0 };
        const aiActive = newsResponse?.aiTranslation === true;
        setRuntimeData({ newsItems: newsResponse?.data ?? [], forYouItems: forYouResponse?.data ?? [], personalized: forYouResponse?.personalized === true, sourceCatalog: sourceCatalogResponse?.data ?? [], newsReal: rssActive, newsSources: newsResponse?.sources ?? [], aiTranslation: aiActive, aiStatus, loading: false, lastUpdated: health.generatedAt, health });
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
  const toggleFollow = (id: string, entityType: "source" = "source") => {
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
  else if (segments[0] === "category" && segments[1]) page = <NewsPage bookmarks={bookmarks} onBookmark={toggleBookmark} categorySlug={segments[1]} />;
  else if (segments[0] === "news" && segments[1]) page = <RichNewsDetail slug={segments[1]} bookmarks={bookmarks} onBookmark={toggleBookmark} initialData={initialStory} />;
  else if (route === "/search") page = <SearchPage />;
  else if (route === "/bookmarks") page = <BookmarksPage bookmarks={bookmarks} onBookmark={toggleBookmark} />;
  else if (route === "/settings") page = <SettingsPage />;
  else if (route === "/sources") page = <SourcesPage followed={followed} onFollow={toggleFollow} />;
  else if (["terms", "privacy", "copyright"].includes(segments[0])) page = <LegalPage type={segments[0]} />;
  else page = <div className="large-empty"><EmptyState title="Không tìm thấy trang" description="Trang bạn tìm kiếm không tồn tại hoặc đã được di chuyển." /><Link href="/" className="primary-button">Về trang chủ</Link></div>;
  return <RuntimeDataContext.Provider value={runtimeData}><div className={`app-shell ${route === "/" ? "home-shell" : ""}`}><AppSidebar route={route} open={menuOpen} onClose={() => setMenuOpen(false)} sourceFilter={homeSourceFilter} onSourceFilter={setHomeSourceFilter} /><div className="app-column"><Header onMenu={() => setMenuOpen(true)} onSearch={() => setSearchOpen(true)} theme={theme} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} /><SystemStatusBanner /><main className="content-wrap">{page}</main><AppFooter compact={route === "/"} /></div><MobileNavigation route={route} /><SearchCommand open={searchOpen} onClose={() => setSearchOpen(false)} /></div></RuntimeDataContext.Provider>;
}
