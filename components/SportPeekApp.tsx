"use client";

import {
  Activity, Bell, Bookmark, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleUserRound,
  Clock3, Command, Flame, Goal, Home, Languages, Menu, Moon, Newspaper,
  Radio, Search, Settings, ShieldCheck, Sparkles, Star, Sun, Trophy, UserRound, Users, X, Zap,
  ArrowRight, Check, ExternalLink, Share2, MapPin, MessageCircle,
  BadgeCheck, Globe2, ListFilter, Rss, Video,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { hotnessLabel } from "@/lib/scoring";
import { fetchStoryDetail, loadingStoryReaderState, type StoryReaderState } from "@/lib/stories/client";
import { storyToNewsItem } from "@/lib/stories/presenter";
import { isSafeExternalUrl, type RawArticle, type StoryCluster } from "@/lib/stories/schema";
import type { Competition, CompetitionDetailData, Match, MatchDetailData, NewsItem, NewsSourceCatalogItem, Player, PlayerDetailData, Standing, Team, TeamDetailData } from "@/lib/types";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  filterNewsItems,
  isTransferNews,
  normalizeSearchText,
  paginateItems,
  personalizedNewsItems,
  relatedNewsItems,
} from "@/lib/ui-logic";
import type { HealthSnapshot, HealthState, ServiceHealth } from "@/lib/health";

type NewsAIStatus = { provider: string; state: "ok" | "off" | "error"; translatedCount: number };
type SourceFilter = "all" | "vi" | "international" | "official" | "youtube" | "rss";
type RuntimeData = { newsItems: NewsItem[]; forYouItems: NewsItem[]; personalized: boolean; matchItems: Match[]; standingRows: Standing[]; teams: Team[]; competitions: Competition[]; players: Player[]; sourceCatalog: NewsSourceCatalogItem[]; newsReal: boolean; sportsReal: boolean; newsSources: string[]; aiTranslation: boolean; aiStatus: NewsAIStatus; loading: boolean; lastUpdated: string | null; health: HealthSnapshot };
type RuntimeResponse<T> = { status?: string; data: T; demo?: boolean; personalized?: boolean; provider?: string; sources?: string[]; aiTranslation?: boolean; aiStatus?: NewsAIStatus; error?: { code: string; message: string } | null };
const loadingService = (label: string): ServiceHealth => ({ state: "unavailable", label, message: "Đang tải trạng thái từ server.", provider: null, lastUpdatedAt: null, count: null });
const loadingHealth: HealthSnapshot = { state: "unavailable", generatedAt: new Date(0).toISOString(), services: { rss: loadingService("Đang tải RSS"), stories: loadingService("Đang tải stories"), sports: loadingService("Đang tải sports"), ai: loadingService("Đang tải AI"), telegram: loadingService("Đang tải Telegram") } };
const emptyRuntimeData: RuntimeData = { newsItems: [], forYouItems: [], personalized: false, matchItems: [], standingRows: [], teams: [], competitions: [], players: [], sourceCatalog: [], newsReal: false, sportsReal: false, newsSources: [], aiTranslation: false, aiStatus: { provider: "off", state: "off", translatedCount: 0 }, loading: true, lastUpdated: null, health: loadingHealth };
const RuntimeDataContext = createContext<RuntimeData>(emptyRuntimeData);
const useRuntimeData = () => useContext(RuntimeDataContext);
const STORAGE_KEYS = { theme: "sportpeek.theme" } as const;
type StoredSettings = { displayName: string; language: "vi" | "en"; timezone: string; notifications: boolean[]; quietHoursStart: string; quietHoursEnd: string };
type TelegramAccount = { configured: boolean; connected: boolean; enabled: boolean; botUsername: string | null };
const DEFAULT_DEVICE_SETTINGS: StoredSettings = { displayName: "Người hâm mộ", language: "vi", timezone: "Asia/Ho_Chi_Minh", notifications: [true, true, true, true, false, false], quietHoursStart: "", quietHoursEnd: "" };

async function fetchRuntime<T>(url: string): Promise<RuntimeResponse<T>> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${url} trả về HTTP ${response.status}`);
  return response.json() as Promise<RuntimeResponse<T>>;
}

const navItems = [
  { href: "/", label: "Tổng quan", icon: Home },
  { href: "/for-you", label: "Dành cho bạn", icon: Sparkles },
  { href: "/news", label: "Tin mới nhất", icon: Newspaper },
  { href: "/live", label: "Trực tiếp", icon: Radio },
  { href: "/fixtures", label: "Lịch thi đấu", icon: CalendarDays },
  { href: "/results", label: "Kết quả", icon: Goal },
  { href: "/standings", label: "Bảng xếp hạng", icon: Trophy },
  { href: "/transfers", label: "Chuyển nhượng", icon: Activity },
];

const getInitials = (name: string) => (name?.trim() || "TBD").split(" ").map((word) => word[0]).slice(-2).join("").toUpperCase();

function TeamMark({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const { teams } = useRuntimeData();
  const team = teams.find((item) => item.name === name);
  return <span className={`team-mark ${size}`} style={{ "--team-accent": team?.accent ?? "#7cfa4c" } as React.CSSProperties}>{getInitials(name)}</span>;
}

export function HotnessBadge({ score }: { score: number }) {
  return <span className={`hotness hotness-${score >= 70 ? "high" : score >= 50 ? "mid" : "low"}`}><Flame size={13} aria-hidden />{hotnessLabel(score)} · {score}</span>;
}

export function ReliabilityBadge({ score }: { score: number }) {
  return <span className="reliability"><ShieldCheck size={13} aria-hidden />Tin cậy {score}%</span>;
}

function SectionHeading({ eyebrow, title, action, href = "/news" }: { eyebrow?: string; title: string; action?: string; href?: string }) {
  return <div className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action && <Link className="text-link" href={href}>{action}<ArrowRight size={15} /></Link>}</div>;
}

function DataLoadingState({ label = "Đang tải dữ liệu thật" }: { label?: string }) {
  return <div className="data-loading" role="status"><span /><div><strong>{label}</strong><small>SportPeek đang kết nối các nguồn, vui lòng chờ trong giây lát.</small></div></div>;
}

function ContentNotFound({ title, description }: { title: string; description: string }) {
  return <div className="large-empty"><EmptyState title={title} description={description} /><Link href="/" className="primary-button">Về trang chủ</Link></div>;
}

function NewsVisual({ item, compact = false, priority = false }: { item: NewsItem; compact?: boolean; priority?: boolean }) {
  const { newsReal } = useRuntimeData();
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const hasImage = Boolean(item.imageUrl && item.imageUrl !== failedImageUrl);
  return <div className={`news-visual tone-${item.imageTone} ${compact ? "compact" : ""} ${hasImage ? "has-real-image" : "image-fallback"}`}>
    {hasImage && <>
      {/* Publisher images are intentionally unproxied to keep this internal, free deployment within quota. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.imageUrl} alt={item.imageAlt ?? item.title} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} referrerPolicy="no-referrer" onError={() => setFailedImageUrl(item.imageUrl)} />
    </>}
    {!hasImage && <><div className="field-lines" /><span className="visual-team">{getInitials(item.team)}</span></>}
    <span className="visual-label">{!newsReal ? "DỮ LIỆU MINH HỌA" : hasImage ? `ẢNH · ${item.imageSource ?? item.sources[0]}` : "NGUỒN CHƯA CÓ ẢNH"}</span>
  </div>;
}

export function NewsCard({ item, featured = false, bookmarked, onBookmark }: { item: NewsItem; featured?: boolean; bookmarked: boolean; onBookmark: (id: string) => void }) {
  const articleCount = item.sourceDetails?.length ?? item.sources.length;
  const officialCount = item.sourceDetails?.filter((source) => source.isOfficialSource).length ?? 0;
  return <article className={`news-card ${featured ? "featured" : ""}`}>
    <Link href={`/news/${item.slug}`} className="card-link" aria-label={`Mở tin: ${item.title}`} />
    <NewsVisual item={item} />
    <div className="news-card-body">
      <div className="meta-row"><HotnessBadge score={item.hotness} />{item.storyStatus && <span className={`story-status story-status-${item.storyStatus}`}>{storyStatusLabels[item.storyStatus]}</span>}<span>{item.publishedAt}</span></div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      {item.personalization?.reasons.length ? <div className="why-recommended"><Sparkles size={14} /><span><strong>Vì sao bạn thấy tin này</strong>{item.personalization.reasons.join(" · ")}</span></div> : null}
      <div className="news-card-footer"><span className="source-line"><span className="source-avatar">SP</span>{articleCount} bài · {item.sources.length} nguồn độc lập{officialCount ? ` · ${officialCount} chính thức` : ""}</span><button className={`icon-button ${bookmarked ? "active" : ""}`} onClick={(event) => { event.preventDefault(); onBookmark(item.id); }} aria-label={bookmarked ? "Bỏ lưu tin" : "Lưu tin"}><Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} /></button></div>
    </div>
  </article>;
}

function NewsListItem({ item }: { item: NewsItem }) {
  return <article className="news-list-item"><NewsVisual item={item} compact /><div><div className="meta-row"><span className="category-label">{item.category}</span><span>{item.publishedAt}</span></div><Link href={`/news/${item.slug}`}><h3>{item.title}</h3></Link><div className="list-badges"><HotnessBadge score={item.hotness} /><ReliabilityBadge score={item.reliability} /></div></div></article>;
}

function MatchCard({ match, compact = false }: { match: Match; compact?: boolean }) {
  const statusLabel = match.status === "postponed" ? "HOÃN" : match.status === "cancelled" ? "ĐÃ HỦY" : null;
  return <Link href={`/matches/${match.id}`} className={`match-card ${match.status} ${compact ? "compact" : ""}`}>
    <div className="match-head"><span>{match.competition}</span>{match.status === "live" ? <span className="live-pill"><i />{match.minute ?? "–"}&apos;{match.dataFreshness === "delayed" || match.dataFreshness === "stale" ? " · TRỄ" : ""}</span> : <span>{statusLabel ? `${statusLabel} · ` : ""}{match.startTime}</span>}</div>
    <div className="match-team"><span><TeamMark name={match.home} size="sm" />{match.home}</span><strong>{match.homeScore ?? "–"}</strong></div>
    <div className="match-team"><span><TeamMark name={match.away} size="sm" />{match.away}</span><strong>{match.awayScore ?? "–"}</strong></div>
    {!compact && <div className="match-venue"><MapPin size={13} />{match.venue}</div>}
  </Link>;
}

export function StandingsTable({ full = false, rows }: { full?: boolean; rows?: Standing[] }) {
  const { standingRows } = useRuntimeData();
  const data = rows ?? standingRows;
  return <div className="table-wrap"><table className="standings-table"><thead><tr><th>#</th><th>Đội</th><th>Tr</th>{full && <><th>W</th><th>D</th><th>L</th><th>HS</th></>}<th>Đ</th>{full && <th>Phong độ</th>}</tr></thead><tbody>{data.map((row) => <tr key={`${row.competitionId ?? "table"}-${row.team}`}><td><span className={`rank rank-${row.position}`}>{row.position}</span></td><td><span className="standing-team"><TeamMark name={row.team} size="sm" />{row.team}</span></td><td>{row.played}</td>{full && <><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalDifference > 0 ? "+" : ""}{row.goalDifference}</td></>}<td><strong>{row.points}</strong></td>{full && <td><span className="form-row">{row.form.map((result, i) => <i key={i} className={result.toLowerCase()}>{result}</i>)}</span></td>}</tr>)}</tbody></table></div>;
}

function AppSidebar({ route, open, onClose, sourceFilter, onSourceFilter }: { route: string; open: boolean; onClose: () => void; sourceFilter: SourceFilter; onSourceFilter: (filter: SourceFilter) => void }) {
  const { matchItems, newsItems, teams } = useRuntimeData();
  const liveCount = matchItems.filter((match) => match.status === "live").length;
  const homeMode = route === "/";
  const primaryItems = [navItems[0], navItems[2], navItems[3]];
  const secondaryItems = [navItems[4], navItems[5], navItems[6]];
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of newsItems) for (const source of item.sources) counts.set(source, (counts.get(source) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [newsItems]);
  const filterItems = [
    { id: "vi" as const, label: "Báo Việt Nam", icon: Newspaper, count: newsItems.filter((item) => item.originalLanguage !== "en").length },
    { id: "international" as const, label: "Báo quốc tế", icon: Globe2, count: newsItems.filter((item) => item.originalLanguage === "en").length },
    { id: "official" as const, label: "Kênh chính thức", icon: BadgeCheck, count: newsItems.filter((item) => item.sources.some((source) => /\b(?:vff|vpf)\b/i.test(source))).length },
    { id: "youtube" as const, label: "YouTube", icon: Video, count: newsItems.filter((item) => item.sources.some((source) => /youtube/i.test(source))).length },
    { id: "rss" as const, label: "RSS", icon: Rss, count: newsItems.length },
  ];
  const renderNav = (items: typeof navItems) => items.map((item) => { const Icon = item.icon; const active = route === item.href || (item.href !== "/" && route.startsWith(item.href)); return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon size={18} /><span>{homeMode && item.href === "/" ? "Trang chủ" : item.label}</span>{item.href === "/live" && liveCount > 0 && <em>{liveCount}</em>}</Link>; });
  return <><div className={`drawer-backdrop ${open ? "show" : ""}`} onClick={onClose} /><aside className={`app-sidebar ${open ? "open" : ""}`}>
    <div className="brand"><span className="brand-symbol"><span /></span><span>SPORT<b>PEEK</b></span></div>
    <button className="sidebar-close" onClick={onClose} aria-label="Đóng menu"><X size={20} /></button>
    <nav aria-label="Điều hướng chính">{renderNav(homeMode ? primaryItems : navItems)}</nav>
    {homeMode ? <>
      <div className="sidebar-section source-filter-section"><span><ListFilter size={13} />Lọc nguồn</span>{filterItems.map((item) => { const Icon = item.icon; return <button type="button" className={sourceFilter === item.id ? "active" : ""} key={item.id} onClick={() => onSourceFilter(sourceFilter === item.id ? "all" : item.id)}><Icon size={16} /><span>{item.label}</span><em>{item.count}</em></button>; })}</div>
      <div className="sidebar-section followed-sources"><span>Nguồn đang theo dõi</span>{sourceCounts.map(([source, count]) => <Link href="/sources" key={source}><span className="source-logo">{getInitials(source)}</span><span>{source}</span><em>{count} mới</em></Link>)}</div>
      <div className="home-secondary-nav"><span>Tỉ số & lịch</span><nav aria-label="Tỉ số và lịch thi đấu">{renderNav(secondaryItems)}</nav></div>
    </> : <><div className="sidebar-section"><span>Theo dõi</span>{teams.slice(0, 4).map((team) => <Link href={`/teams/${team.slug}`} key={team.id}><TeamMark name={team.name} size="sm" /><span>{team.name}</span></Link>)}</div><div className="sidebar-upgrade"><Zap size={20} /><strong>Cá nhân hóa feed</strong><p>Theo dõi đội bóng và giải đấu bạn quan tâm.</p><Link href="/login">Đăng nhập ngay</Link></div></>}
    <div className="sidebar-bottom"><Link href="/bookmarks"><Bookmark size={18} />Tin đã lưu</Link><Link href="/settings"><Settings size={18} />Cài đặt</Link><Link href="/sources"><ShieldCheck size={18} />Nguồn tin</Link></div>
  </aside></>;
}

function Header({ onMenu, onSearch, theme, onTheme }: { onMenu: () => void; onSearch: () => void; theme: string; onTheme: () => void }) {
  return <header className="app-header"><button className="menu-button" onClick={onMenu} aria-label="Mở menu"><Menu size={22} /></button><button className="search-trigger" onClick={onSearch}><Search size={18} /><span>Tìm tin, đội bóng, giải đấu...</span><kbd><Command size={12} />K</kbd></button><div className="header-actions"><button className="icon-button" onClick={onTheme} aria-label="Đổi giao diện">{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button><Link className="icon-button notification-button" href="/settings" aria-label="Mở cài đặt thông báo"><Bell size={19} /><i /></Link><Link className="login-button" href="/login"><CircleUserRound size={18} /><span>Đăng nhập</span></Link></div></header>;
}

function MobileNavigation({ route }: { route: string }) {
  const items = [navItems[0], navItems[1], navItems[3], navItems[4], { href: "/settings", label: "Cài đặt", icon: Settings }];
  return <nav className="mobile-nav" aria-label="Điều hướng di động">{items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={route === item.href ? "active" : ""}><Icon size={20} /><span>{item.label}</span></Link>; })}</nav>;
}

function SearchCommand({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const { newsItems, teams, competitions, players } = useRuntimeData();
  const results = useMemo(() => {
    const normalized = normalizeSearchText(query);
    if (normalized.length < 2) return [];
    return [
      ...filterNewsItems(newsItems, { query }).slice(0, 5).map((item) => ({ label: item.title, href: `/news/${item.slug}`, type: "Tin tức" })),
      ...teams.filter((team) => normalizeSearchText(team.name).includes(normalized)).slice(0, 3).map((team) => ({ label: team.name, href: `/teams/${team.slug}`, type: "Đội bóng" })),
      ...competitions.filter((competition) => normalizeSearchText(competition.name).includes(normalized)).slice(0, 2).map((competition) => ({ label: competition.name, href: `/competitions/${competition.slug}`, type: "Giải đấu" })),
      ...players.filter((player) => normalizeSearchText(player.name).includes(normalized)).slice(0, 2).map((player) => ({ label: player.name, href: `/players/${player.slug}`, type: "Cầu thủ" })),
    ];
  }, [query, newsItems, teams, competitions, players]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); } if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose]);
  if (!open) return null;
  return <div className="command-backdrop" onMouseDown={onClose}><div className="command-dialog" role="dialog" aria-modal="true" aria-label="Tìm kiếm" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập ít nhất 2 ký tự..." aria-label="Nội dung tìm kiếm" /><button onClick={onClose} aria-label="Đóng tìm kiếm"><X size={19} /></button></div><div className="command-results">{normalizeSearchText(query).length < 2 ? <div className="command-hint"><Command size={28} /><p>Tìm kiếm hợp nhất trên tin tức, đội bóng và giải đấu.</p></div> : results.length ? results.map((result) => <Link key={`${result.type}-${result.href}`} href={result.href} onClick={onClose}><span>{result.label}</span><small>{result.type}</small></Link>) : <EmptyState title="Không tìm thấy kết quả" description="Thử từ khóa khác hoặc kiểm tra lại chính tả." />}</div><div className="command-footer"><span>Nhấp vào kết quả để mở</span><span>Esc để đóng</span></div></div></div>;
}

function matchesSourceFilter(item: NewsItem, filter: SourceFilter): boolean {
  if (filter === "all" || filter === "rss") return true;
  if (filter === "vi") return item.originalLanguage !== "en";
  if (filter === "international") return item.originalLanguage === "en";
  if (filter === "official") return item.sources.some((source) => /\b(?:vff|vpf)\b/i.test(source));
  return item.sources.some((source) => /youtube/i.test(source));
}

function HomeHeroNews({ item, demo, bookmarked, onBookmark }: { item: NewsItem; demo: boolean; bookmarked: boolean; onBookmark: (id: string) => void }) {
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const hasImage = Boolean(item.imageUrl && item.imageUrl !== failedImageUrl);
  return <article className={`home-hero-news ${hasImage ? "has-real-image" : "image-fallback"}`}>
    {hasImage && <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="home-hero-image" src={item.imageUrl} alt={item.imageAlt ?? item.title} fetchPriority="high" referrerPolicy="no-referrer" onError={() => setFailedImageUrl(item.imageUrl)} />
    </>}
    {!hasImage && <div className="home-hero-glow" aria-hidden><span>SP</span></div>}
    <div className="home-hero-content">
      <div className="home-hero-kicker"><span>{demo ? "Dữ liệu minh họa" : item.storyStatus ? storyStatusLabels[item.storyStatus] : hasImage ? `Ảnh từ ${item.imageSource ?? item.sources[0]}` : "Tiêu điểm SportPeek"}</span><HotnessBadge score={item.hotness} /></div>
      <h1>{item.title}</h1>
      <p>{item.summary}</p>
      <div className="home-hero-meta"><span><Newspaper size={15} />{item.sourceDetails?.length ?? item.sources.length} bài · {item.sources.length} nguồn độc lập</span><span><Clock3 size={15} />{item.publishedAt}</span><span><ShieldCheck size={15} />Tin cậy {item.reliability}%</span></div>
      <div className="home-hero-actions"><Link href={`/news/${item.slug}`}>Xem tin<ArrowRight size={17} /></Link><button type="button" className={bookmarked ? "active" : ""} onClick={() => onBookmark(item.id)} aria-label={bookmarked ? "Bỏ lưu tin" : "Lưu tin"}><Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} /></button></div>
    </div>
  </article>;
}

function HomeNewsRow({ item, demo }: { item: NewsItem; demo: boolean }) {
  return <article className="home-news-row"><NewsVisual item={item} compact /><div className="home-news-copy"><div className="meta-row"><span className="category-label">{demo ? "Dữ liệu minh họa" : item.category}</span><span>{item.publishedAt}</span></div><Link href={`/news/${item.slug}`}><h3>{item.title}</h3></Link><p>{item.summary}</p><div className="home-news-meta"><span>{item.sources.length} nguồn</span><HotnessBadge score={item.hotness} /></div></div><Link className="home-news-open" href={`/news/${item.slug}`} aria-label={`Xem tin ${item.title}`}><ChevronRight size={18} /></Link></article>;
}

function DenseNewsList({ items, numbered = false }: { items: NewsItem[]; numbered?: boolean }) {
  return <div className="dense-news-list">{items.map((item, index) => <Link href={`/news/${item.slug}`} key={item.id}><span className="dense-news-index">{numbered ? String(index + 1).padStart(2, "0") : <i />}</span><span><strong>{item.title}</strong><small>{item.publishedAt} · {item.sources.length} nguồn</small></span></Link>)}</div>;
}

function HomePage({ bookmarks, onBookmark, sourceFilter }: { bookmarks: Set<string>; onBookmark: (id: string) => void; sourceFilter: SourceFilter }) {
  const { newsItems, matchItems, newsReal, sportsReal, loading } = useRuntimeData();
  const filteredNews = newsItems.filter((item) => matchesSourceFilter(item, sourceFilter));
  const hotNews = [...filteredNews].sort((a, b) => b.hotness - a.hotness || b.reliability - a.reliability);
  const hero = hotNews[0];
  const feedItems = filteredNews.filter((item) => item.id !== hero?.id).slice(0, 12);
  const overallHot = [...newsItems].sort((a, b) => b.hotness - a.hotness || b.reliability - a.reliability).filter((item) => item.id !== hero?.id).slice(0, 6);
  const dateKey = (value?: string) => value ? new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)) : "";
  const todayKey = dateKey(new Date().toISOString());
  const todayItems = newsItems.filter((item) => dateKey(item.publishedTimestamp) === todayKey).slice(0, 5);
  const liveMatches = matchItems.filter((match) => match.status === "live");
  const today = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  return <div className="home-grid"><main className="main-feed home-main-feed"><div className="home-feed-heading"><div><span>{today}</span><h2>Dòng tin thể thao</h2></div><Link href="/news">Xem toàn bộ<ArrowRight size={15} /></Link></div>
    {loading ? <DataLoadingState /> : hero ? <HomeHeroNews item={hero} demo={!newsReal} bookmarked={bookmarks.has(hero.id)} onBookmark={onBookmark} /> : <div className="home-filter-empty"><Rss size={26} /><strong>Chưa có tin từ nhóm nguồn này</strong><p>Chọn một nhóm nguồn khác để tiếp tục theo dõi.</p></div>}
    {feedItems.length > 0 && <section className="home-continuous-feed" aria-label="Tin mới nhất"><div className="home-feed-label"><span>Tin mới nhất</span><em>{filteredNews.length} tin</em></div>{feedItems.map((item) => <HomeNewsRow item={item} demo={!newsReal} key={item.id} />)}<Link href="/news" className="home-feed-more">Mở bảng tin đầy đủ<ArrowRight size={16} /></Link></section>}
  </main><aside className="right-rail home-right-rail"><section className="rail-card hot-news-rail"><SectionHeading eyebrow="ĐANG ĐƯỢC QUAN TÂM" title="Tin nóng" action="Tất cả" /><DenseNewsList items={overallHot} numbered /></section><section className="rail-card today-news-rail"><SectionHeading eyebrow="CẬP NHẬT TRONG NGÀY" title="Tin hôm nay" /><DenseNewsList items={(todayItems.length ? todayItems : newsItems).slice(0, 5)} /></section><section className="rail-card compact-live-rail"><SectionHeading eyebrow={sportsReal ? "FOOTBALL-DATA.ORG" : "DỮ LIỆU MINH HỌA"} title="Đang trực tiếp" action="Mở live" href="/live" />{liveMatches.length ? liveMatches.slice(0, 2).map((match) => <MatchCard key={match.id} match={match} compact />) : <div className="no-live"><Radio size={18} /><span><strong>Chưa có trận đang diễn ra</strong><small>Dữ liệu sẽ tự cập nhật khi trận bắt đầu.</small></span></div>}</section></aside></div>;
}

function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-hero"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}

type FilterBarProps = {
  search?: boolean;
  query?: string;
  onQueryChange?: (value: string) => void;
  competition?: string;
  onCompetitionChange?: (value: string) => void;
  competitionOptions?: string[];
  team?: string;
  onTeamChange?: (value: string) => void;
  teamOptions?: string[];
  minHotness?: number;
  onMinHotnessChange?: (value: number) => void;
};

function FilterBar({ search = false, query = "", onQueryChange, competition = "", onCompetitionChange, competitionOptions = [], team = "", onTeamChange, teamOptions = [], minHotness = 0, onMinHotnessChange }: FilterBarProps) {
  return <div className="filter-bar">
    {search && <label className="inline-search"><Search size={17} /><input value={query} onChange={(event) => onQueryChange?.(event.target.value)} placeholder="Tìm trong bảng tin..." aria-label="Tìm trong bảng tin" /></label>}
    {onCompetitionChange && <label className="filter-select"><Trophy size={16} /><select value={competition} onChange={(event) => onCompetitionChange(event.target.value)} aria-label="Lọc theo giải đấu"><option value="">Tất cả giải</option>{competitionOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select><ChevronDown size={15} /></label>}
    {onTeamChange && <label className="filter-select"><Users size={16} /><select value={team} onChange={(event) => onTeamChange(event.target.value)} aria-label="Lọc theo đội bóng"><option value="">Tất cả đội</option>{teamOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select><ChevronDown size={15} /></label>}
    {onMinHotnessChange && <label className="filter-select"><Flame size={16} /><select value={minHotness} onChange={(event) => onMinHotnessChange(Number(event.target.value))} aria-label="Lọc theo độ nóng"><option value={0}>Mọi độ nóng</option><option value={50}>Từ 50 điểm</option><option value={70}>Từ 70 điểm</option><option value={85}>Từ 85 điểm</option></select><ChevronDown size={15} /></label>}
  </div>;
}

function NewsPage({ bookmarks, onBookmark }: { bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, newsReal, newsSources, aiTranslation, aiStatus, loading } = useRuntimeData();
  const [query, setQuery] = useState("");
  const [competition, setCompetition] = useState("");
  const [team, setTeam] = useState("");
  const [minHotness, setMinHotness] = useState(0);
  const [page, setPage] = useState(1);
  const filtered = filterNewsItems(newsItems, { query, competition, team, minHotness });
  const pagination = paginateItems(filtered, page, 12);
  const updateFilter = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1); };
  const competitionOptions = [...new Set(newsItems.map((item) => item.competition))].sort();
  const teamOptions = [...new Set(newsItems.map((item) => item.team))].filter((value) => !/thể thao|bóng đá|nhiều đội/i.test(value)).sort();
  const aiMessage = aiStatus.state === "ok"
    ? aiTranslation
      ? ["Cloudflare AI đang dịch tin quốc tế sang tiếng Việt", "Bản dịch chỉ dựa trên tiêu đề và trích đoạn của nguồn, không tự thêm dữ kiện."]
      : ["Cloudflare AI đã sẵn sàng", "Chưa có tin tiếng Anh mới cần dịch trong lần cập nhật này."]
    : aiStatus.state === "error"
      ? ["Cloudflare AI đang tạm gián đoạn", "SportPeek vẫn hiển thị bản gốc và không tạo bản dịch giả khi AI lỗi hoặc hết hạn mức."]
      : ["Tin quốc tế đang hiển thị bản gốc", "AI chưa được bật trong môi trường này."];
  return <div className="page-content"><PageHero eyebrow="NEWSROOM" title="Tin nóng Việt Nam & thế giới" description="Tổng hợp nhiều báo thể thao, gộp các bài cùng sự kiện và xếp hạng mức quan tâm bằng tín hiệu minh bạch."><div className="hero-stat"><strong>{newsSources.length || newsItems.length}</strong><span>{loading ? "đang kết nối" : newsReal ? "nguồn đang hoạt động" : "nguồn tạm gián đoạn"}</span></div></PageHero><div className="personalization-banner"><div className="ai-orb"><Languages size={22} /></div><div><strong>{aiMessage[0]}</strong><p>{aiMessage[1]}</p></div><Link href="/sources">Xem phương pháp<ArrowRight size={15} /></Link></div><FilterBar search query={query} onQueryChange={updateFilter(setQuery)} competition={competition} onCompetitionChange={updateFilter(setCompetition)} competitionOptions={competitionOptions} team={team} onTeamChange={updateFilter(setTeam)} teamOptions={teamOptions} minHotness={minHotness} onMinHotnessChange={updateFilter(setMinHotness)} />{loading ? <DataLoadingState /> : pagination.items.length ? <><div className="results-summary">Hiển thị {pagination.items.length} trong {filtered.length} tin phù hợp</div><div className="news-page-grid">{pagination.items.map((item) => <NewsCard key={item.id} item={item} bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div><Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} /></> : <EmptyState title={newsReal ? "Không có tin phù hợp" : "Nguồn tin đang tạm gián đoạn"} description={newsReal ? "Hãy thử bỏ bớt bộ lọc hoặc dùng từ khóa khác." : "SportPeek không chèn dữ liệu giả. Hãy thử tải lại sau khi các nguồn RSS hoạt động."} />}</div>;
}

function ForYouPage({ followed, onFollow, bookmarks, onBookmark }: { followed: Set<string>; onFollow: (id: string) => void; bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, forYouItems, personalized, newsReal, loading, teams } = useRuntimeData();
  const followedNames = teams.filter((team) => followed.has(team.id)).map((team) => team.name);
  const recommendations = (forYouItems.length ? forYouItems : personalizedNewsItems(newsItems, followedNames)).slice(0, 24);
  return <div className="page-content"><PageHero eyebrow="CÁ NHÂN HÓA" title="Dành cho bạn" description="Xếp hạng bằng sở thích, nguồn, độ mới, độ nóng, độ tin cậy, lịch sử đọc và giới hạn lặp chủ đề."><Link className="primary-button" href="/settings"><Sparkles size={17} />Tinh chỉnh sở thích</Link></PageHero><div className="personalization-banner"><div className="ai-orb"><Sparkles size={22} /></div><div><strong>{personalized ? followedNames.length ? `Đang dùng ${followedNames.length} đội bạn theo dõi và lịch sử tài khoản` : "Đang dùng sở thích và lịch sử tài khoản nội bộ" : newsReal ? "Chưa đăng nhập — đang xếp theo độ nóng và tin cậy" : "Nguồn tin đang tạm gián đoạn"}</strong><p>Mỗi card giải thích lý do xuất hiện; diversity penalty tránh feed chỉ toàn một đội.</p></div><Link href="/bookmarks">Tin đã lưu<ArrowRight size={15} /></Link></div><section><SectionHeading eyebrow="SỞ THÍCH" title="Chọn đội để ưu tiên" /><div className="follow-grid">{teams.slice(0, 8).map((team) => <div className="follow-card" key={team.id}><TeamMark name={team.name} size="lg" /><div><strong>{team.name}</strong><span>{team.country}</span></div><button className={followed.has(team.id) ? "following" : ""} onClick={() => onFollow(team.id)}>{followed.has(team.id) ? <><Check size={15} />Đang theo dõi</> : <>+ Theo dõi</>}</button></div>)}</div></section><section><SectionHeading eyebrow={personalized ? "ĐÃ CÁ NHÂN HÓA" : "ĐANG THỊNH HÀNH"} title="Bảng tin đề xuất" />{loading ? <DataLoadingState /> : recommendations.length ? <div className="news-page-grid">{recommendations.map((item) => <NewsCard key={item.id} item={item} bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div> : <EmptyState title="Chưa có tin đề xuất" description="Không dùng dữ liệu giả khi nguồn RSS không khả dụng." />}</section></div>;
}

function LivePage({ mode }: { mode: "live" | "fixtures" | "results" }) {
  const { matchItems, sportsReal, loading } = useRuntimeData();
  const [query, setQuery] = useState("");
  const [competition, setCompetition] = useState("");
  const [team, setTeam] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const byMode = matchItems.filter((item) => mode === "live" ? item.status === "live" : mode === "fixtures" ? ["scheduled", "postponed", "cancelled"].includes(item.status) : item.status === "finished");
  const localDateKey = (value?: string) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";
  const filtered = byMode.filter((item) => {
    const haystack = normalizeSearchText(`${item.home} ${item.away} ${item.competition} ${item.venue}`);
    const normalizedQuery = normalizeSearchText(query);
    return (!normalizedQuery || haystack.includes(normalizedQuery)) && (!competition || item.competition === competition) && (!team || item.home === team || item.away === team) && (!dateFilter || localDateKey(item.startTimestamp) === dateFilter);
  });
  const competitionOptions = [...new Set(byMode.map((item) => item.competition))].sort();
  const teamOptions = [...new Set(byMode.flatMap((item) => [item.home, item.away]))].sort();
  const shiftDate = (days: number) => { const base = dateFilter || localDateKey(byMode[0]?.startTimestamp) || new Date().toISOString().slice(0, 10); const date = new Date(`${base}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); setDateFilter(date.toISOString().slice(0, 10)); };
  const labels = mode === "live" ? ["TRUNG TÂM TRẬN ĐẤU", "Trận đấu trực tiếp", "Theo dõi tỉ số, sự kiện và nhịp độ trận đấu từ nhà cung cấp dữ liệu thể thao."] : mode === "fixtures" ? ["LỊCH THI ĐẤU", "Lịch thi đấu", "Múi giờ hiển thị: Asia/Ho_Chi_Minh (GMT+7)."] : ["KẾT QUẢ", "Kết quả trận đấu", "Kết quả và dữ liệu trận đấu đã hoàn tất từ nhà cung cấp dữ liệu."];
  return <div className="page-content"><PageHero eyebrow={labels[0]} title={labels[1]} description={sportsReal ? "Dữ liệu cache thật từ provider; nhãn TRỄ xuất hiện khi nguồn không còn đủ mới để gọi là trực tiếp." : labels[2]}>{mode === "live" && <div className="live-count"><i />{byMode.length} trận đang diễn ra</div>}</PageHero>{mode !== "live" && <div className="scope-note"><CalendarDays size={17} /><span>{mode === "fixtures" ? "Scheduled, postponed và cancelled trong cửa sổ cache" : "Các kết quả gần nhất trong bộ nhớ đệm"}</span><small>Asia/Ho_Chi_Minh · GMT+7</small><div className="date-navigation"><button onClick={() => shiftDate(-1)} aria-label="Ngày trước"><ChevronLeft size={16} /></button><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Chọn ngày" /><button onClick={() => shiftDate(1)} aria-label="Ngày sau"><ChevronRight size={16} /></button>{dateFilter && <button onClick={() => setDateFilter("")}>Mọi ngày</button>}</div></div>}<FilterBar search query={query} onQueryChange={setQuery} competition={competition} onCompetitionChange={setCompetition} competitionOptions={competitionOptions} team={team} onTeamChange={setTeam} teamOptions={teamOptions} />{loading ? <DataLoadingState label="Đang tải dữ liệu trận đấu" /> : filtered.length ? <div className="match-groups">{[...new Set(filtered.map((item)=>item.competition))].map((competitionName) => { const group = filtered.filter((item) => item.competition === competitionName); return <section className="match-group" key={competitionName}><div className="competition-title"><span className="competition-icon">SP</span><div><strong>{competitionName}</strong><span>{group[0]?.provider ?? "Provider cache"} · cập nhật theo nguồn</span></div></div><div className="match-grid">{group.map((match) => <MatchCard key={match.id} match={match} />)}</div></section>; })}</div> : <div className="large-empty compact-empty"><EmptyState title={sportsReal ? mode === "live" ? "Hiện không có trận trực tiếp" : "Không có trận phù hợp" : "Dữ liệu thể thao chưa khả dụng"} description={sportsReal ? mode === "live" ? "Trang này chỉ hiển thị trận thực sự đang diễn ra. Hãy mở Lịch thi đấu để xem các trận sắp tới." : "Hãy thử bỏ bộ lọc ngày, giải hoặc đội." : "SportPeek không chèn trận đấu giả khi provider chưa cấu hình hoặc đang lỗi."} />{mode === "live" && <Link href="/fixtures" className="primary-button">Xem lịch thi đấu</Link>}</div>}</div>;
}

function StandingsPage() {
  const { sportsReal, loading, standingRows } = useRuntimeData();
  const competitionNames = [...new Set(standingRows.map((row) => row.competition).filter((value): value is string => Boolean(value)))];
  const [competition, setCompetition] = useState("");
  const selected = competition || competitionNames[0] || "";
  const rows = selected ? standingRows.filter((row) => row.competition === selected) : standingRows;
  const season = rows[0]?.season ?? "Chưa xác định";
  return <div className="page-content"><PageHero eyebrow="MÙA GIẢI HIỆN TẠI" title="Bảng xếp hạng" description={sportsReal ? "Thứ hạng, mùa giải và độ mới lấy từ sports cache đã đồng bộ." : "Bảng xếp hạng chỉ xuất hiện khi có dữ liệu thật đã được đồng bộ."}><label className="season-select"><Trophy size={18} /><select value={selected} onChange={(event) => setCompetition(event.target.value)} aria-label="Chọn giải đấu">{competitionNames.map((name) => <option value={name} key={name}>{name}</option>)}</select><span>Mùa {season}</span></label></PageHero>{loading ? <DataLoadingState label="Đang tải bảng xếp hạng" /> : sportsReal && rows.length > 0 && <div className="standings-panel"><div className="panel-tabs"><strong>{selected}</strong><span>{rows[0]?.provider ?? "Provider cache"} · {rows[0]?.dataFreshness ?? "unknown"}</span></div><StandingsTable full rows={rows} /><div className="table-legend"><span><i className="champions" />Nhóm dẫn đầu</span><span><i className="europa" />Nhóm giữa</span><span><i className="relegation" />Nhóm cuối</span></div></div>}{!loading && (!sportsReal || !rows.length) && <EmptyState title="Chưa có bảng xếp hạng thật" description="SportPeek không dùng bảng xếp hạng minh họa trong production." />}</div>;
}

function TransfersPage({ bookmarks, onBookmark }: { bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, newsReal, loading } = useRuntimeData();
  const [query, setQuery] = useState("");
  const transferNews = filterNewsItems(newsItems.filter(isTransferNews), { query });
  return <div className="page-content"><PageHero eyebrow="MARKET WATCH" title="Tin chuyển nhượng" description="Chỉ hiển thị bài từ mạng lưới RSS; SportPeek không tự tạo cầu thủ, mức phí hay trạng thái thương vụ."><div className="window-status"><i />{newsReal ? "Nguồn báo chí đang hoạt động" : "Nguồn tin tạm gián đoạn"}</div></PageHero><div className="personalization-banner"><div className="ai-orb"><ShieldCheck size={22} /></div><div><strong>Phân biệt rõ tin đồn và xác nhận chính thức</strong><p>Hãy mở các nguồn đối chiếu trong từng bài trước khi xem một thương vụ là hoàn tất.</p></div><Link href="/sources">Nguồn & phương pháp<ArrowRight size={15} /></Link></div><FilterBar search query={query} onQueryChange={setQuery} />{loading ? <DataLoadingState /> : transferNews.length ? <><div className="results-summary">Tìm thấy {transferNews.length} tin chuyển nhượng từ các nguồn đang theo dõi</div><div className="news-page-grid">{transferNews.map((item) => <NewsCard item={item} key={item.id} bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div></> : <EmptyState title="Chưa có tin chuyển nhượng phù hợp" description="SportPeek sẽ hiển thị khi các nguồn RSS đăng tin có liên quan; hệ thống không điền dữ liệu giả." />}</div>;
}


const storyStatusLabels: Record<StoryCluster["status"], string> = {
  official: "Nguồn chính thức",
  reported: "Nhiều nguồn đưa tin",
  rumor: "Tin đồn",
  unverified: "Chưa kiểm chứng",
  developing: "Đang phát triển",
  disputed: "Có điểm mâu thuẫn",
  completed: "Đã hoàn tất",
  correction: "Đính chính",
};

function formatStoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

function StorySourceCard({ article, lead }: { article: RawArticle; lead: boolean }) {
  return <article className="story-source-card">
    <div className="story-source-heading"><span className="source-avatar">{getInitials(article.sourceName)}</span><div><strong>{article.sourceName}</strong><small>{formatStoryTime(article.publishedAt)} · {article.language === "en" ? "Tiếng Anh" : "Tiếng Việt"}</small></div></div>
    <div className="story-source-flags">{lead && <span>Nguồn đầu tiên</span>}{article.isOfficialSource && <span className="official">Nguồn chính thức</span>}{article.isSyndicated && <span>Bài dẫn lại</span>}</div>
    <h3>{article.title}</h3>
    {article.excerpt ? <p>{article.excerpt}</p> : <p className="muted-copy">Nguồn không cung cấp trích đoạn trong RSS.</p>}
    {isSafeExternalUrl(article.originalUrl) && <a href={article.originalUrl} target="_blank" rel="noopener noreferrer">Đọc bài gốc<ExternalLink size={14} /></a>}
  </article>;
}

function RichNewsDetail({ slug, bookmarks, onBookmark }: { slug: string; bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const [readerResult, setReaderResult] = useState<{ slug: string; reloadToken: number; state: StoryReaderState }>({ slug: "", reloadToken: -1, state: loadingStoryReaderState });
  const readerState = readerResult.slug === slug && readerResult.reloadToken === reloadToken ? readerResult.state : loadingStoryReaderState;
  const [activeTab, setActiveTab] = useState("summary");
  const [shareStatus, setShareStatus] = useState("");
  useEffect(() => {
    let active = true;
    void fetchStoryDetail(slug).then((next) => { if (active) setReaderResult({ slug, reloadToken, state: next }); });
    return () => { active = false; };
  }, [slug, reloadToken]);
  useEffect(() => {
    const canonicalSlug = readerState.meta?.canonicalSlug;
    if (readerState.data && canonicalSlug && canonicalSlug !== slug) router.replace(`/news/${canonicalSlug}`, { scroll: false });
  }, [readerState.data, readerState.meta, router, slug]);
  const activeStoryId = readerState.data?.story.id;
  useEffect(() => {
    if (!activeStoryId) return;
    const startedAt = Date.now();
    const persist = () => {
      const durationSeconds = Math.floor((Date.now() - startedAt) / 1000); if (durationSeconds < 5) return;
      void fetch("/api/reading-history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storyId: activeStoryId, durationSeconds }), keepalive: true }).catch(() => { /* Anonymous mode has no reading history. */ });
    };
    const timer = window.setInterval(persist, 30_000);
    return () => { window.clearInterval(timer); persist(); };
  }, [activeStoryId]);

  if (readerState.status === "idle" || readerState.status === "loading") {
    return <div className="article-page story-reader-skeleton" aria-busy="true" aria-label="Đang tải bài viết"><div className="story-skeleton-line wide" /><div className="story-skeleton-line title" /><div className="story-skeleton-line title short" /><div className="story-skeleton-media" /><div className="story-skeleton-grid"><div /><div /></div></div>;
  }
  if (!readerState.data) {
    const isNotFound = readerState.status === "not_found";
    return <div className="article-page story-state-panel"><EmptyState title={isNotFound ? "Không tìm thấy bài viết" : readerState.status === "configuration_required" ? "Chưa cấu hình nguồn tin thật" : "Không thể tải bài viết"} description={readerState.message ?? "Không thể tải bài viết lúc này."} /><div className="story-state-actions">{!isNotFound && <button className="primary-button" onClick={() => setReloadToken((value) => value + 1)}>Thử lại</button>}<Link className="secondary-button" href="/news">Quay lại feed</Link><Link href="/">Về trang chủ</Link></div></div>;
  }

  const { story, relatedStories } = readerState.data;
  const item = storyToNewsItem(story);
  const bookmarked = bookmarks.has(story.id);
  const readingBody = story.summaryLong.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const wordCount = story.summaryLong.split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(2, Math.ceil(wordCount / 210));
  const officialArticles = story.articles.filter((article) => article.isOfficialSource);
  const tabs = [
    { id: "summary", label: "Tóm tắt" },
    { id: "sources", label: "Tất cả bài nguồn" },
    ...(story.timeline.length ? [{ id: "timeline", label: "Dòng thời gian" }] : []),
    ...(story.agreedFacts.length ? [{ id: "facts", label: "Các điểm đã thống nhất" }] : []),
    ...(story.disputedPoints.length ? [{ id: "disputed", label: "Điểm còn mâu thuẫn" }] : []),
    ...(officialArticles.length ? [{ id: "official", label: "Nguồn chính thức" }] : []),
  ];
  const moveTabFocus = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    setActiveTab(next.id);
    document.getElementById(`story-tab-${next.id}`)?.focus();
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: item.title, url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
      setShareStatus("Đã sao chép liên kết");
    } catch { setShareStatus("Không thể chia sẻ lúc này"); }
  };

  return <div className="article-page rich-article-page story-reader-page">
    {readerState.status === "stale" && <div className="story-stale-banner" role="status"><Clock3 size={16} />{readerState.message}</div>}
    <div className="article-breadcrumb"><Link href="/news">Tin tức</Link><ChevronRight size={14} /><span>{item.competition}</span></div>
    <header className="article-header">
      <div className="article-badges"><span className={`story-status story-status-${story.status}`}>{storyStatusLabels[story.status]}</span>{story.aiGenerated ? <span className="demo-label">AI ĐÃ XỬ LÝ TRƯỚC</span> : <span className="demo-label neutral">CHƯA XỬ LÝ BỞI AI</span>}{story.hotnessScore !== null && <HotnessBadge score={story.hotnessScore} />}{story.reliabilityScore !== null && <ReliabilityBadge score={story.reliabilityScore} />}</div>
      <h1>{item.title}</h1>
      <p>{item.summary}</p>
      <div className="article-meta"><span className="source-avatar">SP</span><div><strong>SportPeek Newsroom</strong><span>Xuất bản {formatStoryTime(story.publishedAt)} · cập nhật {formatStoryTime(story.updatedAt)} · {story.articles.length} bài · {story.sourceCount} nguồn độc lập · {officialArticles.length} chính thức · {readingMinutes} phút đọc</span></div><div className="article-actions"><button onClick={() => onBookmark(story.id)} className={bookmarked ? "active" : ""}><Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} />{bookmarked ? "Đã lưu" : "Lưu"}</button><button onClick={share}><Share2 size={17} />Chia sẻ</button></div></div>
      {shareStatus && <p className="inline-status" role="status">{shareStatus}</p>}
    </header>
    <NewsVisual item={item} priority />
    <p className="article-image-caption">{item.imageUrl ? `Ảnh do ${item.imageSource ?? item.sources[0]} cung cấp qua RSS hoặc metadata bài gốc.` : "Nguồn hiện chưa cung cấp ảnh đại diện; SportPeek không dùng ảnh không liên quan để lấp chỗ trống."}</p>
    <div className="story-tabs" role="tablist" aria-label="Nội dung cụm tin">{tabs.map((tab, index) => <button type="button" role="tab" id={`story-tab-${tab.id}`} aria-controls={`story-panel-${tab.id}`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => moveTabFocus(event, index)} key={tab.id}>{tab.label}</button>)}</div>
    <div className="article-layout">
      <article className="article-body">
        <div role="tabpanel" id={`story-panel-${activeTab}`} aria-labelledby={`story-tab-${activeTab}`}>
          {activeTab === "summary" && <><div className="summary-box"><div className="summary-title"><Sparkles size={19} /><strong>{story.aiGenerated ? "Bản dịch và tóm tắt đã xử lý trước" : "Bản tin chưa được xử lý bởi AI"}</strong><span>{story.aiGenerated ? "Chỉ dùng metadata nguồn" : "Đang hiển thị summary heuristic từ nguồn"}</span></div><p>{story.summary}</p></div><section className="article-story"><span className="article-section-kicker">BẢN TIN MỞ RỘNG</span><h2>Toàn cảnh từ các nguồn</h2>{readingBody.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 35)}`}>{paragraph}</p>)}</section><section><h2>Vì sao tin này được chú ý?</h2><ul className="key-points">{(item.trendingReasons ?? []).map((reason) => <li key={reason}><Flame size={16} />{reason}</li>)}</ul><p className="muted-copy">Điểm nóng là ước tính từ độ mới, số nguồn, độ uy tín và tầm quan trọng chủ đề; không phải lượt xem của tòa soạn.</p></section></>}
          {activeTab === "sources" && <section className="story-source-grid"><h2>{story.articles.length} bài nguồn</h2>{story.articles.map((article, index) => <StorySourceCard article={article} lead={index === 0} key={article.id} />)}</section>}
          {activeTab === "official" && <section className="story-source-grid"><h2>Nguồn chính thức</h2>{officialArticles.map((article) => <StorySourceCard article={article} lead={story.articles[0]?.id === article.id} key={article.id} />)}</section>}
          {activeTab === "timeline" && <section><h2>Dòng thời gian nguồn đăng</h2><div className="story-timeline">{story.timeline.map((entry) => <div key={entry.id}><time>{formatStoryTime(entry.occurredAt)}</time><span><i /><strong>{entry.description}</strong></span></div>)}</div></section>}
          {activeTab === "facts" && <section><h2>Các điểm đã thống nhất</h2><ul className="key-points">{story.agreedFacts.map((fact) => <li key={fact.text}><Check size={16} />{fact.text}<small>{fact.sourceArticleIds.length} bài nguồn</small></li>)}</ul></section>}
          {activeTab === "disputed" && <section><h2>Điểm còn mâu thuẫn</h2>{story.disputedPoints.map((point) => <div className="disputed-point" key={point.topic}><strong>{point.topic}</strong>{point.positions.map((position) => <p key={position.claim}>{position.claim}</p>)}</div>)}</section>}
        </div>
        <div className="aggregation-notice"><ShieldCheck size={22} /><div><strong>Nội dung tổng hợp có giới hạn</strong><p>SportPeek dùng metadata và trích đoạn ngắn, không đăng lại toàn văn. Mỗi bài nguồn đều có liên kết để bạn kiểm tra ngữ cảnh.</p></div></div>
      </article>
      <aside className="article-aside"><div className="rail-card"><SectionHeading eyebrow="CẬP NHẬT" title={formatStoryTime(story.updatedAt)} /><p className="muted-copy">{story.sourceCount} nguồn · {story.articles.length} bài gốc · {story.hasOfficialSource ? "có nguồn chính thức" : "chưa có nguồn chính thức"}.</p></div>{story.linkedMatch && <div className="rail-card"><SectionHeading eyebrow="TRẬN LIÊN QUAN" title={story.linkedMatch.label} /><Link className="primary-button" href={story.linkedMatch.href}>Mở trung tâm trận đấu</Link></div>}<div className="rail-card"><SectionHeading eyebrow="ĐỌC TIẾP" title="Tin liên quan" />{relatedStories.length ? relatedStories.map((entry) => <NewsListItem item={storyToNewsItem(entry)} key={entry.id} />) : <EmptyState title="Chưa có tin liên quan" description="Không chèn nội dung khác chủ đề để lấp chỗ trống." />}</div><div className="rail-card article-read-card"><span className="eyebrow">THỜI LƯỢNG</span><strong>{readingMinutes} phút đọc</strong><p>{wordCount} từ trong bản tổng hợp; dữ kiện có thể được kiểm tra tại bài gốc.</p>{isSafeExternalUrl(story.articles[0]?.originalUrl) && <a href={story.articles[0].originalUrl} target="_blank" rel="noopener noreferrer">Mở bài nguồn đầu tiên<ExternalLink size={14} /></a>}</div></aside>
    </div>
  </div>;
}

type SportsDetailState<T> = { url: string; status: "loading" | "success" | "not_found" | "error"; data: T | null };
function useSportsDetail<T>(url: string): SportsDetailState<T> {
  const [state, setState] = useState<SportsDetailState<T>>({ url, status: "loading", data: null });
  useEffect(() => {
    let active = true;
    void fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) }).then(async (response) => {
      if (!active) return; if (response.status === 404) { setState({ url, status: "not_found", data: null }); return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`); const payload = await response.json() as { data: T }; if (active) setState({ url, status: "success", data: payload.data });
    }).catch(() => { if (active) setState({ url, status: "error", data: null }); });
    return () => { active = false; };
  }, [url]);
  return state.url === url ? state : { url, status: "loading", data: null };
}

function MatchDetail({ id }: { id: string }) {
  const { newsItems } = useRuntimeData(); const [activeTab, setActiveTab] = useState("overview");
  const state = useSportsDetail<MatchDetailData>(`/api/matches/${encodeURIComponent(id)}`);
  if (state.status === "loading") return <DataLoadingState label="Đang tải chi tiết trận đấu từ cache" />;
  if (state.status === "not_found") return <ContentNotFound title="Không tìm thấy trận đấu" description="Mã trận không tồn tại trong sports cache." />;
  if (state.status === "error" || !state.data) return <ContentNotFound title="Không thể tải trận đấu" description="Sports cache đang lỗi hoặc chưa được cấu hình; không có dữ liệu giả thay thế." />;
  const { match, events, statistics, standings: matchStandings, capabilities, providerCoverage, updatedAt, stale } = state.data;
  const related = relatedNewsItems(newsItems, [match.home, match.away, match.competition], undefined, 3);
  const tabs = [["overview", "Tổng quan"], ...(capabilities.events ? [["events", "Sự kiện"]] : []), ...(capabilities.statistics ? [["stats", "Thống kê"]] : []), ...(capabilities.standings ? [["standings", "Bảng xếp hạng"]] : [])] as Array<[string, string]>;
  const statusLabel = match.status === "live" ? `${match.minute ?? "–"}' · ${stale ? "DỮ LIỆU TRỄ" : "TRỰC TIẾP"}` : match.status === "finished" ? "ĐÃ KẾT THÚC" : match.status === "postponed" ? "ĐÃ HOÃN" : match.status === "cancelled" ? "ĐÃ HỦY" : "SẮP DIỄN RA";
  return <div className="page-content"><div className="match-detail-hero"><div className="match-detail-top"><Link href={`/competitions/${match.competitionSlug}`}>{match.competition}</Link><span className={match.status === "live" && !stale ? "live-pill" : "status-pill"}>{statusLabel}</span></div><div className="scoreboard"><div><TeamMark name={match.home} size="lg" /><Link href={`/teams/${match.homeTeamSlug}`}><h2>{match.home}</h2></Link><span>Chủ nhà</span></div><strong>{match.homeScore ?? "–"}<em>–</em>{match.awayScore ?? "–"}<small>{match.status === "live" ? `${match.minute ?? "–"}'` : match.status === "finished" ? "FT" : match.startTime}</small></strong><div><TeamMark name={match.away} size="lg" /><Link href={`/teams/${match.awayTeamSlug}`}><h2>{match.away}</h2></Link><span>Đội khách</span></div></div><div className="match-facts"><span><CalendarDays size={15} />{match.startTime}</span>{capabilities.venue && <span><MapPin size={15} />{match.venue}</span>}{capabilities.referee && <span><ShieldCheck size={15} />Trọng tài: {match.referee}</span>}</div>{stale && <p className="inline-status">Dữ liệu cập nhật cuối {formatStoryTime(updatedAt)}; không được gọi là real-time.</p>}</div><div className="panel-tabs match-tabs">{tabs.map(([value, label]) => <button key={value} className={activeTab === value ? "active" : ""} onClick={() => setActiveTab(value)}>{label}</button>)}</div><div className="match-detail-grid"><main><section className="content-card">{activeTab === "overview" && <><SectionHeading eyebrow="TRẠNG THÁI THẬT" title="Thông tin trận đấu" /><dl className="profile-list"><div><dt>Provider</dt><dd>{match.provider ?? "Chưa xác định"}</dd></div><div><dt>Mùa giải</dt><dd>{match.season}</dd></div><div><dt>Cập nhật cache</dt><dd>{formatStoryTime(updatedAt)}</dd></div><div><dt>Độ mới</dt><dd>{stale ? "Stale" : match.dataFreshness ?? "Unknown"}</dd></div></dl>{!capabilities.events && <EmptyState title={match.status === "scheduled" ? "Trận đấu chưa bắt đầu" : "Nguồn chưa cung cấp sự kiện"} description="SportPeek không tự tạo bàn thắng, thẻ phạt hoặc diễn biến." />}</>}{activeTab === "events" && <><SectionHeading eyebrow="DIỄN BIẾN" title={`${events.length} sự kiện từ provider`} /><div className="match-event-list">{events.map((event) => <div key={event.id}><time>{event.minute}{event.extraMinute ? `+${event.extraMinute}` : ""}&apos;</time><strong>{event.type.replaceAll("_", " ")}</strong><span>{[event.player, event.team].filter(Boolean).join(" · ")}</span></div>)}</div></>}{activeTab === "stats" && <><SectionHeading eyebrow="THỐNG KÊ" title="Số liệu do provider cung cấp" /><div className="table-wrap"><table className="standings-table"><thead><tr><th>Đội</th><th>Kiểm soát</th><th>Sút</th><th>Trúng đích</th><th>Phạt góc</th><th>Phạm lỗi</th><th>xG</th></tr></thead><tbody>{statistics.map((stat) => <tr key={stat.team}><td>{stat.team}</td><td>{stat.possession ?? "–"}{stat.possession !== undefined ? "%" : ""}</td><td>{stat.shots ?? "–"}</td><td>{stat.shotsOnTarget ?? "–"}</td><td>{stat.corners ?? "–"}</td><td>{stat.fouls ?? "–"}</td><td>{stat.expectedGoals ?? "–"}</td></tr>)}</tbody></table></div></>}{activeTab === "standings" && <><SectionHeading eyebrow="GIẢI ĐẤU" title="Bối cảnh bảng xếp hạng" /><StandingsTable full rows={matchStandings} /></>}</section></main><aside><div className="rail-card"><SectionHeading eyebrow="PROVIDER COVERAGE" title="Khả năng đã cấu hình" /><div className="entity-chips">{providerCoverage.map((entry) => <span key={entry.capability}>{entry.capability} · {entry.provider}</span>)}</div><p className="muted-copy">Chỉ phần có bản ghi thật mới xuất hiện thành tab.</p></div><div className="rail-card"><SectionHeading eyebrow="TIN TỨC" title="Liên quan" />{related.length ? related.map((item) => <NewsListItem item={item} key={item.id} />) : <EmptyState title="Chưa có tin liên quan" description="Không dùng tin khác chủ đề để lấp nội dung." />}</div></aside></div></div>;
}

function EntityPage({ type, slug, followed, onFollow }: { type: "team" | "player" | "competition"; slug: string; followed: Set<string>; onFollow: (id: string, type?: "team" | "player" | "competition") => void }) {
  const { newsItems, loading } = useRuntimeData();
  const state = useSportsDetail<TeamDetailData | CompetitionDetailData | PlayerDetailData>(`/api/${type === "team" ? "teams" : type === "competition" ? "competitions" : "players"}/${encodeURIComponent(slug)}`);
  if (state.status === "loading") return <DataLoadingState label="Đang tải hồ sơ từ sports cache" />;
  if (state.status === "not_found") return <ContentNotFound title="Không tìm thấy hồ sơ" description="Thực thể này chưa tồn tại trong sports cache hiện tại." />;
  if (state.status === "error" || !state.data) return <ContentNotFound title="Không thể tải hồ sơ" description="Supabase sports cache đang lỗi hoặc chưa được cấu hình." />;
  const teamData = type === "team" ? state.data as TeamDetailData : null; const competitionData = type === "competition" ? state.data as CompetitionDetailData : null; const playerData = type === "player" ? state.data as PlayerDetailData : null;
  const entity = teamData?.team ?? competitionData?.competition ?? playerData!.player; const title = entity.name; const id = entity.id;
  const fixtures = teamData?.fixtures ?? competitionData?.fixtures ?? []; const results = teamData?.results ?? competitionData?.results ?? []; const entityStandings = teamData?.standings ?? competitionData?.standings ?? [];
  const playerTeam = playerData?.player.teamName; const newsTerms = playerData ? [title, playerTeam ?? ""].filter(Boolean) : [title]; const entityNews = relatedNewsItems(newsItems, newsTerms, undefined, 8);
  const transferStories = playerData ? entityNews.filter(isTransferNews) : [];
  const country = teamData?.team.country ?? competitionData?.competition.country ?? playerData?.player.nationality ?? "Chưa xác định";
  const detail = teamData?.team.stadium || (competitionData ? `Mùa ${competitionData.competition.season}` : `${playerData?.player.position || "Chưa rõ vị trí"}${playerTeam ? ` · ${playerTeam}` : ""}`);
  const updatedAt = teamData?.updatedAt ?? competitionData?.updatedAt ?? playerData?.updatedAt;
  return <div className="page-content"><div className="entity-hero"><div className="entity-mark">{teamData ? <TeamMark name={title} size="lg" /> : competitionData ? <Trophy size={38} /> : <span className="player-avatar large">{getInitials(title)}</span>}</div><div><span className="eyebrow">{type === "team" ? "CÂU LẠC BỘ" : type === "competition" ? "GIẢI ĐẤU" : "CẦU THỦ"} · {country}</span><h1>{title}</h1><p>{detail}</p></div><button className={`follow-button ${followed.has(id) ? "following" : ""}`} onClick={() => onFollow(id, type)}>{followed.has(id) ? <><Check size={16} />Đang theo dõi</> : <>+ Theo dõi</>}</button></div><div className="entity-layout"><main>{!playerData && <section><SectionHeading eyebrow="SẮP TỚI" title="Trận tiếp theo" />{fixtures.length ? fixtures.slice(0, 6).map((match) => <MatchCard key={match.id} match={match} />) : <EmptyState title="Chưa có lịch phù hợp" description={`Sports cache chưa có trận sắp tới của ${title}.`} />}</section>}{!playerData && <section><SectionHeading eyebrow="KẾT QUẢ" title="Trận gần đây" />{results.length ? results.slice(0, 6).map((match) => <MatchCard key={match.id} match={match} />) : <EmptyState title="Chưa có kết quả" description="Không có kết quả thật trong cửa sổ cache." />}</section>}{competitionData && <section><SectionHeading eyebrow="THÀNH VIÊN" title={`${competitionData.teams.length} đội đã đồng bộ`} /><div className="follow-grid">{competitionData.teams.map((team) => <Link className="follow-card" href={`/teams/${team.slug}`} key={team.id}><TeamMark name={team.name} size="md" /><div><strong>{team.name}</strong><span>{team.country}</span></div><ChevronRight size={17} /></Link>)}</div></section>}{playerData && transferStories.length > 0 && <section><SectionHeading eyebrow="CHUYỂN NHƯỢNG" title={`Tin chuyển nhượng về ${title}`} /><div className="news-stack">{transferStories.map((item) => <NewsListItem item={item} key={item.id} />)}</div></section>}<section><SectionHeading eyebrow="CẬP NHẬT" title={`Tin về ${title}`} />{loading ? <DataLoadingState label="Đang tìm tin liên quan" /> : entityNews.length ? <div className="news-stack">{entityNews.map((item) => <NewsListItem item={item} key={item.id} />)}</div> : <EmptyState title="Chưa có tin đúng chủ đề" description={`Không chèn tin không liên quan vào hồ sơ ${title}.`} />}</section></main><aside><div className="rail-card"><SectionHeading eyebrow="THÔNG TIN" title="Hồ sơ cache" /><dl className="profile-list"><div><dt>Quốc gia</dt><dd>{country}</dd></div><div><dt>{teamData ? "Sân vận động" : playerData ? "Vị trí" : "Mùa hiện tại"}</dt><dd>{teamData?.team.stadium || playerData?.player.position || competitionData?.competition.season || "Chưa có"}</dd></div>{playerData?.player.teamName && <div><dt>Đội hiện tại</dt><dd>{playerData.player.teamSlug ? <Link href={`/teams/${playerData.player.teamSlug}`}>{playerData.player.teamName}</Link> : playerData.player.teamName}</dd></div>}<div><dt>Cập nhật cache</dt><dd>{updatedAt ? formatStoryTime(updatedAt) : "Chưa rõ"}</dd></div></dl></div>{entityStandings.length > 0 && <div className="rail-card"><SectionHeading eyebrow="XẾP HẠNG" title={teamData?.competitions[0]?.name ?? competitionData?.competition.name ?? "Bối cảnh"} /><StandingsTable rows={entityStandings} /></div>}{competitionData && <div className="rail-card"><SectionHeading eyebrow="COVERAGE" title="Nguồn theo capability" /><div className="entity-chips">{competitionData.providerCoverage.map((entry) => <span key={entry.capability}>{entry.capability} · {entry.provider}</span>)}</div></div>}</aside></div></div>;
}

function SearchPage() {
  const { newsItems, loading, teams, competitions, players } = useRuntimeData();
  const [query, setQuery] = useState("");
  const normalized = normalizeSearchText(query);
  const newsResults = normalized.length >= 2 ? filterNewsItems(newsItems, { query }) : [];
  const teamResults = normalized.length >= 2 ? teams.filter((team) => normalizeSearchText(team.name).includes(normalized)) : [];
  const competitionResults = normalized.length >= 2 ? competitions.filter((competition) => normalizeSearchText(competition.name).includes(normalized)) : [];
  const playerResults = normalized.length >= 2 ? players.filter((player) => normalizeSearchText(player.name).includes(normalized)) : [];
  const total = newsResults.length + teamResults.length + competitionResults.length + playerResults.length;
  return <div className="page-content"><PageHero eyebrow="TÌM KIẾM HỢP NHẤT" title="Tìm mọi thứ về bóng đá" description="Tin tức, đội bóng, cầu thủ và giải đấu trong cùng một nơi." /><label className="search-page-input"><Search size={22} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập ít nhất 2 ký tự..." aria-label="Từ khóa tìm kiếm" /><kbd><Command size={12} />K</kbd></label>{loading ? <DataLoadingState /> : normalized.length < 2 ? <div className="large-empty compact-empty"><EmptyState title="Nhập từ khóa để bắt đầu" description="Có thể tìm theo tên đội, cầu thủ, giải đấu hoặc nội dung tin." /></div> : total ? <div className="search-sections">{teamResults.length > 0 && <section><SectionHeading eyebrow="ĐỘI BÓNG" title={`${teamResults.length} kết quả`} /><div className="follow-grid">{teamResults.map((team) => <Link className="follow-card" href={`/teams/${team.slug}`} key={team.id}><TeamMark name={team.name} size="lg" /><div><strong>{team.name}</strong><span>{team.country}</span></div><ChevronRight size={18} /></Link>)}</div></section>}{competitionResults.length > 0 && <section><SectionHeading eyebrow="GIẢI ĐẤU" title={`${competitionResults.length} kết quả`} /><div className="entity-chips result-chips">{competitionResults.map((competition) => <Link href={`/competitions/${competition.slug}`} key={competition.id}><Trophy size={15} />{competition.name}</Link>)}</div></section>}{playerResults.length > 0 && <section><SectionHeading eyebrow="CẦU THỦ" title={`${playerResults.length} kết quả`} /><div className="entity-chips result-chips">{playerResults.map((player) => <Link href={`/players/${player.slug}`} key={player.id}><UserRound size={15} />{player.name}</Link>)}</div></section>}{newsResults.length > 0 && <section><SectionHeading eyebrow="TIN TỨC" title={`${newsResults.length} kết quả`} /><div className="news-stack">{newsResults.slice(0, 20).map((item) => <NewsListItem item={item} key={item.id} />)}</div></section>}</div> : <div className="large-empty compact-empty"><EmptyState title="Không tìm thấy kết quả" description={`Không có dữ liệu phù hợp với “${query.trim()}”.`} /></div>}</div>;
}

function BookmarksPage({ bookmarks, onBookmark }: { bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, loading } = useRuntimeData();
  const items = newsItems.filter((item) => bookmarks.has(item.id));
  return <div className="page-content"><PageHero eyebrow="THƯ VIỆN CÁ NHÂN" title="Tin đã lưu" description="Các bản tin được lưu theo tài khoản nội bộ của bạn."><Bookmark size={22} /></PageHero>{loading ? <DataLoadingState /> : items.length ? <div className="news-page-grid">{items.map((item) => <NewsCard key={item.id} item={item} bookmarked onBookmark={onBookmark} />)}</div> : <div className="large-empty"><EmptyState title="Chưa có tin nào được lưu" description="Nhấn biểu tượng dấu trang trên một bản tin để lưu vào đây." /><Link href="/news" className="primary-button">Khám phá tin mới</Link></div>}</div>;
}

function SettingsPage() {
  type SettingsTab = "profile" | "locale" | "preferences" | "notifications" | "telegram" | "privacy";
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [settings, setSettings] = useState<StoredSettings>(DEFAULT_DEVICE_SETTINGS);
  const [email, setEmail] = useState("Chưa đăng nhập");
  const [status, setStatus] = useState("");
  const [telegram, setTelegram] = useState<TelegramAccount>({ configured: false, connected: false, enabled: false, botUsername: null });
  const [linkCode, setLinkCode] = useState("");
  useEffect(() => {
    void fetchRuntime<{ email: string; profile: StoredSettings; notifications: boolean[]; quietHoursStart: string; quietHoursEnd: string; telegram: TelegramAccount }>("/api/me/preferences").then((response) => {
      setEmail(response.data.email || "Chưa đăng nhập");
      setSettings({ ...DEFAULT_DEVICE_SETTINGS, ...response.data.profile, notifications: response.data.notifications, quietHoursStart: response.data.quietHoursStart, quietHoursEnd: response.data.quietHoursEnd });
      setTelegram(response.data.telegram);
    }).catch(() => setStatus("Không thể tải cài đặt tài khoản."));
  }, []);
  const save = async () => {
    setStatus("Đang lưu...");
    const response = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(settings), signal: AbortSignal.timeout(12_000) }).catch(() => null);
    setStatus(response?.ok ? "Đã lưu cài đặt vào tài khoản Supabase." : "Không thể lưu cài đặt lúc này.");
  };
  const resetPersonalization = async () => {
    setStatus("Đang xóa...");
    const response = await fetch("/api/me/reset", { method: "POST", signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (response?.ok) window.location.reload(); else setStatus("Không thể xóa dữ liệu cá nhân hóa lúc này.");
  };
  const createTelegramCode = async () => {
    setStatus("Đang tạo mã liên kết..."); const response = await fetch("/api/telegram/link-code", { method: "POST", signal: AbortSignal.timeout(12_000) }).catch(() => null);
    if (!response?.ok) { setStatus("Không thể tạo mã liên kết."); return; }
    const result = await response.json() as { configured: boolean; code: string | null }; if (!result.configured || !result.code) { setStatus("Telegram chưa được cấu hình trên server."); return; }
    setLinkCode(result.code); setStatus("Mã có hiệu lực 15 phút. Gửi /link CODE cho bot.");
  };
  const notificationLabels = ["Tin nóng đã xác minh", "Trận đấu bắt đầu", "Bàn thắng", "Kết quả trận đấu", "Tin chuyển nhượng", "Bản tin hằng ngày"];
  const tabs: Array<[SettingsTab, string, typeof UserRound]> = [["profile", "Hồ sơ", UserRound], ["locale", "Ngôn ngữ & múi giờ", Languages], ["preferences", "Sở thích", Star], ["notifications", "Thông báo", Bell], ["telegram", "Telegram", MessageCircle], ["privacy", "Dữ liệu thiết bị", ShieldCheck]];
  return <div className="page-content settings-page"><PageHero eyebrow="CÁ NHÂN" title="Cài đặt" description="Các lựa chọn được lưu theo tài khoản nội bộ." /><div className="settings-layout"><nav>{tabs.map(([value, label, Icon]) => <button key={value} className={activeTab === value ? "active" : ""} onClick={() => { setActiveTab(value); setStatus(""); }}><Icon size={17} />{label}</button>)}</nav><div className="settings-panel">{activeTab === "profile" && <section><h2>Hồ sơ cá nhân</h2><p>Tên hiển thị dành cho trải nghiệm nội bộ của bạn.</p><div className="avatar-setting"><span className="player-avatar large">{getInitials(settings.displayName)}</span><small>Ảnh đại diện chưa được bật</small></div><label className="form-field"><span>Tên hiển thị</span><input value={settings.displayName} onChange={(event) => setSettings((current) => ({ ...current, displayName: event.target.value }))} /></label><label className="form-field"><span>Email Supabase</span><input value={email} disabled readOnly /></label></section>}{activeTab === "locale" && <section><h2>Ngôn ngữ & múi giờ</h2><p>Áp dụng cho các mốc thời gian và nội dung giao diện.</p><div className="form-row-two"><label className="form-field"><span>Ngôn ngữ</span><select value={settings.language} onChange={(event) => setSettings((current) => ({ ...current, language: event.target.value as "vi" | "en" }))}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label><label className="form-field"><span>Múi giờ</span><select value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))}><option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option><option value="UTC">UTC</option></select></label></div></section>}{activeTab === "preferences" && <section><h2>Sở thích đội bóng</h2><p>Theo dõi đội, giải và cầu thủ tại trang hồ sơ tương ứng.</p><Link className="primary-button inline-action" href="/for-you"><Star size={16} />Chọn đội yêu thích</Link></section>}{activeTab === "notifications" && <section><h2>Thông báo</h2><p>Tùy chọn chỉ được thực thi khi Telegram đã liên kết; quiet hours dùng múi giờ tài khoản.</p>{notificationLabels.map((label, index) => <label className="toggle-row" key={label}><span><strong>{label}</strong><small>{index === 0 ? "Chỉ gửi khi có đủ nguồn tin cậy" : "Theo sở thích đã lưu"}</small></span><input type="checkbox" checked={settings.notifications[index] ?? false} onChange={(event) => setSettings((current) => ({ ...current, notifications: current.notifications.map((value, itemIndex) => itemIndex === index ? event.target.checked : value) }))} /><i /></label>)}<div className="form-row-two"><label className="form-field"><span>Không làm phiền từ</span><input type="time" value={settings.quietHoursStart} onChange={(event) => setSettings((current) => ({ ...current, quietHoursStart: event.target.value }))} /></label><label className="form-field"><span>Đến</span><input type="time" value={settings.quietHoursEnd} onChange={(event) => setSettings((current) => ({ ...current, quietHoursEnd: event.target.value }))} /></label></div></section>}{activeTab === "telegram" && <section><h2>Telegram</h2>{!telegram.configured ? <><p>Server chưa có đủ TELEGRAM_BOT_TOKEN và TELEGRAM_WEBHOOK_SECRET. Module đang tắt an toàn; website vẫn hoạt động.</p><button className="primary-button" disabled>Chưa cấu hình</button></> : telegram.connected ? <><p>Telegram đã liên kết. Dùng /today, /live, /following hoặc /stop trong bot.</p><span className="active-text">Đã kết nối{telegram.botUsername ? ` · @${telegram.botUsername}` : ""}</span></> : <><p>Tạo mã một lần, sau đó gửi <strong>/link CODE</strong> cho bot trong vòng 15 phút.</p><button className="primary-button" onClick={createTelegramCode}>Tạo mã liên kết</button>{linkCode && <div className="telegram-link-code"><strong>{linkCode}</strong><span>/link {linkCode}</span></div>}</>}</section>}{activeTab === "privacy" && <section><h2>Dữ liệu tài khoản</h2><p>Bookmark, theo dõi, lịch sử đọc và cài đặt được lưu trong Supabase với RLS theo tài khoản.</p><button className="danger-button" onClick={resetPersonalization}>Xóa toàn bộ dữ liệu cá nhân hóa</button></section>}{["profile", "locale", "notifications"].includes(activeTab) && <div className="settings-actions"><button onClick={() => setSettings(DEFAULT_DEVICE_SETTINGS)}>Khôi phục mặc định</button><button className="primary-button" onClick={save}>Lưu thay đổi</button></div>}{status && <p className="inline-status" role="status">{status}</p>}</div></div></div>;
}

function FormField({ label, value, disabled, name, type = "text", required = false }: { label: string; value: string; disabled?: boolean; name?: string; type?: string; required?: boolean }) { return <label className="form-field"><span>{label}</span><input name={name} type={type} defaultValue={value} disabled={disabled} required={required} /></label>; }

function AuthPage({ type, signupAllowed }: { type: "login" | "register" | "forgot" | "reset"; signupAllowed: boolean }) {
  const [status, setStatus] = useState("");
  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "callback_invalid") queueMicrotask(() => setStatus("Liên kết đăng nhập không hợp lệ hoặc đã hết hạn."));
    if (error === "callback_failed") queueMicrotask(() => setStatus("Không thể hoàn tất đăng nhập. Vui lòng thử lại."));
    if (error === "invitation_only") queueMicrotask(() => setStatus("SportPeek chỉ dành cho thành viên được mời; đăng ký công khai đã tắt."));
    if (error === "not_invited") queueMicrotask(() => setStatus("Email này chưa nằm trong danh sách thành viên SportPeek."));
    if (error === "configuration_required") queueMicrotask(() => setStatus("Đăng nhập nội bộ chưa được cấu hình hoàn chỉnh."));
  }, []);
  const content = type === "login" ? ["Chào mừng trở lại", "Đăng nhập để cá nhân hóa bảng tin của bạn.", "Đăng nhập"] : type === "register" ? ["Tạo tài khoản", "Theo dõi đội bóng và lưu những tin quan trọng.", "Đăng ký"] : type === "reset" ? ["Đặt mật khẩu mới", "Nhập mật khẩu mới cho tài khoản của bạn.", "Cập nhật mật khẩu"] : ["Khôi phục mật khẩu", "Nhập email để nhận liên kết đặt lại mật khẩu.", "Gửi liên kết"];
  const returnTo = () => { const value = new URLSearchParams(window.location.search).get("next"); return value?.startsWith("/") && !value.startsWith("//") ? value : "/for-you"; };
  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnTo())}`;
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setStatus("Đang xử lý..."); const client = createSupabaseClient();
    if (type === "register" && !signupAllowed) { setStatus("Đăng ký công khai đã tắt. Chủ sở hữu cần mời email của bạn."); return; }
    if (!client) { setStatus("Supabase Auth chưa được cấu hình."); return; }
    const data = new FormData(event.currentTarget); const email = String(data.get("email") ?? ""); const password = String(data.get("password") ?? "");
    const result = type === "login" ? await client.auth.signInWithPassword({ email, password }) : type === "register" ? await client.auth.signUp({ email, password, options: { data: { display_name: String(data.get("displayName") ?? "") } } }) : type === "reset" ? await client.auth.updateUser({ password }) : await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}` });
    if (result.error) setStatus(result.error.message); else if (type === "login") window.location.href = returnTo(); else if (type === "reset") { setStatus("Đã cập nhật mật khẩu. Đang chuyển về bảng tin..."); window.setTimeout(() => { window.location.href = "/for-you"; }, 900); } else setStatus("Hãy kiểm tra email để hoàn tất.");
  };
  const oauth = async () => { const client = createSupabaseClient(); if (!client) return setStatus("Google OAuth chưa được kết nối."); const result = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl() } }); if (result.error) setStatus(result.error.message); };
  const magic = async (event: React.MouseEvent<HTMLButtonElement>) => { const form = event.currentTarget.form; const email = String(new FormData(form ?? undefined).get("email") ?? ""); const client = createSupabaseClient(); if (!client) return setStatus("Magic Link chưa được kết nối."); const result = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl() } }); setStatus(result.error?.message ?? "Magic Link đã được gửi."); };
  return <div className="auth-page"><div className="auth-art"><div className="brand large"><span className="brand-symbol"><span /></span><span>SPORT<b>PEEK</b></span></div><div><span className="eyebrow">THỂ THAO · ĐƯỢC TỔNG HỢP THÔNG MINH</span><h2>Một góc nhìn rõ ràng hơn về trận đấu.</h2><p>SportPeek gom nhiều nguồn, loại bỏ nội dung trùng và làm nổi bật điều thực sự đáng chú ý.</p></div><div className="auth-stats"><span><strong>Nội bộ</strong>5–30 người</span><span><strong>RSS</strong>đa nguồn</span><span><strong>AI</strong>xử lý trước</span></div></div><div className="auth-form-wrap"><Link href="/" className="auth-back"><ChevronLeft size={16} />Về trang chủ</Link><form className="auth-form" onSubmit={submit}><span className="eyebrow">TÀI KHOẢN SPORTPEEK</span><h1>{content[0]}</h1><p>{content[1]}</p>{type === "register" && <FormField label="Tên hiển thị" name="displayName" value="" required />}{type !== "reset" && <FormField label="Email" name="email" type="email" value="" required />}{type !== "forgot" && <FormField label={type === "reset" ? "Mật khẩu mới" : "Mật khẩu"} name="password" type="password" value="" required />}{type === "login" && <div className="form-options"><label><input type="checkbox" />Ghi nhớ tôi</label><Link href="/forgot-password">Quên mật khẩu?</Link></div>}<button type="submit" className="primary-button auth-submit">{content[2]}<ArrowRight size={17} /></button>{status && <p className="auth-status" role="status">{status}</p>}{(type === "login" || type === "register") && <><div className="or"><span />hoặc<span /></div><button type="button" className="oauth-button" onClick={oauth}>G<span>{type === "login" ? "Đăng nhập" : "Đăng ký"} với Google</span></button><button type="button" className="magic-button" onClick={magic}><Sparkles size={17} />Gửi magic link</button></>}{type === "login" && !signupAllowed ? <p className="auth-switch">Chỉ thành viên được mời mới có thể đăng nhập.</p> : type !== "reset" && <p className="auth-switch">{type === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"} <Link href={type === "login" ? "/register" : "/login"}>{type === "login" ? "Đăng ký" : "Đăng nhập"}</Link></p>}</form></div></div>;
}

function LegalPage({ type }: { type: string }) {
  const titles: Record<string, string> = { terms: "Điều khoản sử dụng", privacy: "Chính sách quyền riêng tư", copyright: "Bản quyền & nội dung", sources: "Nguồn tin & phương pháp" };
  return <div className="legal-page"><span className="eyebrow">SPORTPEEK · MINH BẠCH</span><h1>{titles[type] ?? "Thông tin"}</h1><p className="legal-lead">Cập nhật lần cuối: 13/07/2026. Phương pháp này áp dụng cho bảng tin tổng hợp đang hoạt động.</p><section><h2>Mạng lưới nguồn</h2><p>SportPeek đọc RSS công khai của VFF, VPF, VnExpress, Tuổi Trẻ, Thanh Niên, VietNamNet, Dân trí, VOV, BBC Sport, The Guardian, ESPN và Sky Sports. Nguồn có thể tạm dừng nếu feed lỗi hoặc chính sách của nhà xuất bản thay đổi.</p></section><section><h2>Dịch và tóm tắt</h2><p>Với bài tiếng Anh, AI chỉ dịch và tóm tắt từ tiêu đề cùng trích đoạn mà RSS cung cấp. Hệ thống được yêu cầu giữ tên riêng, không thêm dữ kiện và luôn giữ liên kết về bài gốc.</p></section><section><h2>Điểm nóng</h2><p>Điểm nóng là chỉ số quan tâm ước tính từ độ mới, số nguồn độc lập cùng đưa, uy tín nguồn và tầm quan trọng của sự kiện. Đây không phải lượt đọc, lượt chia sẻ hoặc số người xem thật của các tòa soạn.</p></section><section><h2>Quyền của nguồn tin</h2><p>SportPeek không đăng lại toàn văn, không vượt paywall và không tải lại video. Người dùng được dẫn về nguồn gốc để đọc đầy đủ. Yêu cầu chỉnh sửa hoặc gỡ nội dung sẽ được bổ sung kênh tiếp nhận trước khi phát hành thương mại.</p></section></div>;
}

function SourcesPage({ followed, onFollow }: { followed: Set<string>; onFollow: (id: string, type?: "team" | "player" | "competition" | "source") => void }) {
  const { sourceCatalog, loading } = useRuntimeData();
  return <div className="legal-page sources-page"><span className="eyebrow">SPORTPEEK · MINH BẠCH</span><h1>Nguồn tin & phương pháp</h1><p className="legal-lead">Danh mục này đọc trực tiếp từ Supabase. Theo dõi nguồn sẽ trở thành một tín hiệu trong feed cá nhân, nhưng không ghi đè độ tin cậy và diversity penalty.</p>{loading ? <DataLoadingState label="Đang tải source catalog" /> : <div className="source-catalog-grid">{sourceCatalog.map((source) => <article className="content-card" key={source.id}><div className="story-source-heading"><span className="source-avatar">{getInitials(source.name)}</span><div><strong>{source.name}</strong><small>{source.language === "en" ? "Quốc tế · Tiếng Anh" : "Việt Nam · Tiếng Việt"}{source.official ? " · Chính thức" : ""}</small></div></div><dl className="profile-list"><div><dt>Độ tin cậy cấu hình</dt><dd>{source.reliability}/100</dd></div><div><dt>Cập nhật cuối</dt><dd>{source.lastFetchedAt ? formatStoryTime(source.lastFetchedAt) : "Chưa đồng bộ"}</dd></div><div><dt>Trạng thái</dt><dd className={source.active && !source.lastError ? "active-text" : ""}>{!source.active ? "Đã tắt" : source.lastError ? "Có lỗi gần nhất" : "Đang hoạt động"}</dd></div></dl><button className={`follow-button ${followed.has(source.id) ? "following" : ""}`} onClick={() => onFollow(source.id, "source")}>{followed.has(source.id) ? <><Check size={16} />Đang theo dõi</> : <>+ Theo dõi nguồn</>}</button></article>)}</div>}<section><h2>Phương pháp tổng hợp</h2><p>SportPeek lưu metadata và trích đoạn ngắn từ RSS, gom các bài cùng sự kiện thành một story, ghi rõ nguồn độc lập, nguồn chính thức, điểm chưa thống nhất và liên kết về bài gốc. Hệ thống không đăng lại toàn văn, không vượt paywall và không tải lại video.</p></section><section><h2>Giới hạn của điểm nóng</h2><p>Điểm nóng là ước tính từ độ mới, số nguồn, độ uy tín và tầm quan trọng sự kiện; không phải lượt xem thật của tòa soạn. Feed cá nhân còn dùng follow, bookmark, reading history và phạt lặp chủ đề, nhưng mỗi card luôn giải thích lý do.</p></section></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) { return <div className="empty-state"><Search size={28} /><strong>{title}</strong><p>{description}</p></div>; }
function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((value) => value === 1 || value === totalPages || Math.abs(value - page) <= 1);
  return <nav className="pagination" aria-label="Phân trang"><button disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Trang trước"><ChevronLeft size={16} /></button>{pages.map((value, index) => <span className="pagination-item" key={value}>{index > 0 && value - pages[index - 1] > 1 && <em>…</em>}<button className={value === page ? "active" : ""} onClick={() => onPageChange(value)} aria-current={value === page ? "page" : undefined}>{value}</button></span>)}<button disabled={page === totalPages} onClick={() => onPageChange(page + 1)} aria-label="Trang sau"><ChevronRight size={16} /></button></nav>;
}

function SystemStatusBanner() {
  const { health, loading } = useRuntimeData();
  return <div className={`demo-bar status-banner ${loading ? "loading" : health.state}`}><span className="status-banner-label"><ShieldCheck size={14} />Trạng thái dữ liệu</span>{([health.services.rss, health.services.stories, health.services.sports, health.services.ai]).map((service) => <span className={`service-status ${loading ? "loading" : service.state}`} title={service.message} key={`${service.provider}-${service.label}`}><i />{service.label}</span>)}</div>;
}

function AppFooter({ compact = false }: { compact?: boolean }) {
  const { health, loading } = useRuntimeData();
  const statusText = [health.services.rss.label, health.services.stories.label, health.services.sports.label, health.services.ai.label].join(" · ");
  const statusClass: HealthState | "loading" = loading ? "loading" : health.state;
  if (compact) return <footer className="app-footer compact-footer"><div><span>© 2026 SportPeek</span><Link href="/sources">Nguồn & phương pháp</Link><Link href="/privacy">Quyền riêng tư</Link></div><span className={`footer-data-status ${statusClass}`}><i />{statusText}</span></footer>;
  return <footer className="app-footer"><div><div className="brand"><span className="brand-symbol"><span /></span><span>SPORT<b>PEEK</b></span></div><p>Tin thể thao quan trọng, được tổng hợp thông minh.</p></div><div><strong>Sản phẩm</strong><Link href="/news">Tin tức</Link><Link href="/live">Trực tiếp</Link><Link href="/standings">Bảng xếp hạng</Link></div><div><strong>Minh bạch</strong><Link href="/sources">Nguồn tin</Link><Link href="/copyright">Bản quyền</Link><Link href="/privacy">Quyền riêng tư</Link></div><div><strong>Trạng thái dữ liệu</strong><span className={`footer-data-status ${statusClass}`}><i />{statusText}</span><small>© 2026 SportPeek Beta</small></div></footer>;
}

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
  return <RuntimeDataContext.Provider value={runtimeData}><div className={`app-shell ${route === "/" ? "home-shell" : ""}`}><AppSidebar route={route} open={menuOpen} onClose={() => setMenuOpen(false)} sourceFilter={homeSourceFilter} onSourceFilter={setHomeSourceFilter} /><div className="app-column"><Header onMenu={() => setMenuOpen(true)} onSearch={() => setSearchOpen(true)} theme={theme} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} /><SystemStatusBanner /><div className="content-wrap">{page}</div><AppFooter compact={route === "/"} /></div><MobileNavigation route={route} /><SearchCommand open={searchOpen} onClose={() => setSearchOpen(false)} /></div></RuntimeDataContext.Provider>;
}
