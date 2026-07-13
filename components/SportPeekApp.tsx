"use client";

import {
  Activity, Bell, Bookmark, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleUserRound,
  Clock3, Command, Flame, Goal, Home, Languages, Menu, Moon, Newspaper,
  Radio, Search, Settings, ShieldCheck, Sparkles, Star, Sun, Trophy, UserRound, Users, X, Zap,
  ArrowRight, Check, SlidersHorizontal, ExternalLink, Share2, MapPin, MessageCircle, LockKeyhole,
} from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { competitions, matches, news, players, standings, teams, transfers } from "@/lib/demo-data";
import { hotnessLabel } from "@/lib/scoring";
import type { Match, NewsItem } from "@/lib/types";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

type RuntimeData = { newsItems: NewsItem[]; matchItems: Match[]; standingRows: typeof standings; newsReal: boolean; sportsReal: boolean; newsSources: string[]; aiTranslation: boolean };
type RuntimeResponse<T> = { data: T; demo?: boolean; provider?: string; sources?: string[]; aiTranslation?: boolean };
const RuntimeDataContext = createContext<RuntimeData>({ newsItems: news, matchItems: matches, standingRows: standings, newsReal: false, sportsReal: false, newsSources: [], aiTranslation: false });
const useRuntimeData = () => useContext(RuntimeDataContext);

const navItems = [
  { href: "/", label: "Tổng quan", icon: Home },
  { href: "/for-you", label: "Dành cho bạn", icon: Sparkles },
  { href: "/news", label: "Tin mới nhất", icon: Newspaper },
  { href: "/live", label: "Trực tiếp", icon: Radio, badge: "2" },
  { href: "/fixtures", label: "Lịch thi đấu", icon: CalendarDays },
  { href: "/results", label: "Kết quả", icon: Goal },
  { href: "/standings", label: "Bảng xếp hạng", icon: Trophy },
  { href: "/transfers", label: "Chuyển nhượng", icon: Activity },
];

const getInitials = (name: string) => name.split(" ").map((word) => word[0]).slice(-2).join("").toUpperCase();

function TeamMark({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
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

function NewsVisual({ item, compact = false }: { item: NewsItem; compact?: boolean }) {
  return <div className={`news-visual tone-${item.imageTone} ${compact ? "compact" : ""}`}>
    <div className="field-lines" /><span className="visual-label">{item.translatedByAI ? "AI DỊCH · CÓ NGUỒN" : item.originalLanguage === "en" ? "QUỐC TẾ · BẢN GỐC" : "TIN TỔNG HỢP"}</span><span className="visual-team">{getInitials(item.team)}</span>
  </div>;
}

export function NewsCard({ item, featured = false, bookmarked, onBookmark }: { item: NewsItem; featured?: boolean; bookmarked: boolean; onBookmark: (id: string) => void }) {
  return <article className={`news-card ${featured ? "featured" : ""}`}>
    <Link href={`/news/${item.slug}`} className="card-link" aria-label={`Mở tin: ${item.title}`} />
    <NewsVisual item={item} />
    <div className="news-card-body">
      <div className="meta-row"><HotnessBadge score={item.hotness} /><span>{item.publishedAt}</span></div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      <div className="news-card-footer"><span className="source-line"><span className="source-avatar">SP</span>{item.sources.length} nguồn · {item.competition}</span><button className={`icon-button ${bookmarked ? "active" : ""}`} onClick={(event) => { event.preventDefault(); onBookmark(item.id); }} aria-label={bookmarked ? "Bỏ lưu tin" : "Lưu tin"}><Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} /></button></div>
    </div>
  </article>;
}

function NewsListItem({ item }: { item: NewsItem }) {
  return <article className="news-list-item"><NewsVisual item={item} compact /><div><div className="meta-row"><span className="category-label">{item.category}</span><span>{item.publishedAt}</span></div><Link href={`/news/${item.slug}`}><h3>{item.title}</h3></Link><div className="list-badges"><HotnessBadge score={item.hotness} /><ReliabilityBadge score={item.reliability} /></div></div></article>;
}

function MatchCard({ match, compact = false }: { match: Match; compact?: boolean }) {
  return <Link href={`/matches/${match.id}`} className={`match-card ${match.status} ${compact ? "compact" : ""}`}>
    <div className="match-head"><span>{match.competition}</span>{match.status === "live" ? <span className="live-pill"><i />{match.minute}&apos;</span> : <span>{match.startTime}</span>}</div>
    <div className="match-team"><span><TeamMark name={match.home} size="sm" />{match.home}</span><strong>{match.homeScore ?? "–"}</strong></div>
    <div className="match-team"><span><TeamMark name={match.away} size="sm" />{match.away}</span><strong>{match.awayScore ?? "–"}</strong></div>
    {!compact && <div className="match-venue"><MapPin size={13} />{match.venue}</div>}
  </Link>;
}

export function StandingsTable({ full = false }: { full?: boolean }) {
  const { standingRows } = useRuntimeData();
  return <div className="table-wrap"><table className="standings-table"><thead><tr><th>#</th><th>Đội</th><th>Tr</th>{full && <><th>W</th><th>D</th><th>L</th><th>HS</th></>}<th>Đ</th>{full && <th>Phong độ</th>}</tr></thead><tbody>{standingRows.map((row) => <tr key={row.team}><td><span className={`rank rank-${row.position}`}>{row.position}</span></td><td><span className="standing-team"><TeamMark name={row.team} size="sm" />{row.team}</span></td><td>{row.played}</td>{full && <><td>{row.won}</td><td>{row.drawn}</td><td>{row.lost}</td><td>{row.goalDifference > 0 ? "+" : ""}{row.goalDifference}</td></>}<td><strong>{row.points}</strong></td>{full && <td><span className="form-row">{row.form.map((result, i) => <i key={i} className={result.toLowerCase()}>{result}</i>)}</span></td>}</tr>)}</tbody></table></div>;
}

function AppSidebar({ route, open, onClose }: { route: string; open: boolean; onClose: () => void }) {
  return <><div className={`drawer-backdrop ${open ? "show" : ""}`} onClick={onClose} /><aside className={`app-sidebar ${open ? "open" : ""}`}>
    <div className="brand"><span className="brand-symbol"><span /></span><span>SPORT<b>PEEK</b></span></div>
    <button className="sidebar-close" onClick={onClose} aria-label="Đóng menu"><X size={20} /></button>
    <nav aria-label="Điều hướng chính">{navItems.map((item) => { const Icon = item.icon; const active = route === item.href || (item.href !== "/" && route.startsWith(item.href)); return <Link key={item.href} href={item.href} className={active ? "active" : ""}><Icon size={19} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}</Link>; })}</nav>
    <div className="sidebar-section"><span>Theo dõi</span>{teams.slice(0, 4).map((team) => <Link href={`/teams/${team.slug}`} key={team.id}><TeamMark name={team.name} size="sm" /><span>{team.name}</span></Link>)}</div>
    <div className="sidebar-upgrade"><Zap size={20} /><strong>Cá nhân hóa feed</strong><p>Theo dõi đội bóng và giải đấu bạn quan tâm.</p><Link href="/login">Đăng nhập ngay</Link></div>
    <div className="sidebar-bottom"><Link href="/settings"><Settings size={18} />Cài đặt</Link><Link href="/sources"><ShieldCheck size={18} />Nguồn tin</Link></div>
  </aside></>;
}

function Header({ onMenu, onSearch, theme, onTheme }: { onMenu: () => void; onSearch: () => void; theme: string; onTheme: () => void }) {
  return <header className="app-header"><button className="menu-button" onClick={onMenu} aria-label="Mở menu"><Menu size={22} /></button><button className="search-trigger" onClick={onSearch}><Search size={18} /><span>Tìm tin, đội bóng, cầu thủ...</span><kbd><Command size={12} />K</kbd></button><div className="header-actions"><button className="icon-button" onClick={onTheme} aria-label="Đổi giao diện">{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button><button className="icon-button notification-button" aria-label="Thông báo"><Bell size={19} /><i /></button><Link className="login-button" href="/login"><CircleUserRound size={18} /><span>Đăng nhập</span></Link></div></header>;
}

function MobileNavigation({ route }: { route: string }) {
  const items = [navItems[0], navItems[1], navItems[3], navItems[4], { href: "/settings", label: "Cài đặt", icon: Settings }];
  return <nav className="mobile-nav" aria-label="Điều hướng di động">{items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={route === item.href ? "active" : ""}><Icon size={20} /><span>{item.label}</span></Link>; })}</nav>;
}

function SearchCommand({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const { newsItems } = useRuntimeData();
  const results = useMemo(() => query.length < 2 ? [] : [...newsItems.filter((item) => item.title.toLowerCase().includes(query.toLowerCase())).slice(0, 4).map((item) => ({ label: item.title, href: `/news/${item.slug}`, type: "Tin tức" })), ...teams.filter((team) => team.name.toLowerCase().includes(query.toLowerCase())).slice(0, 4).map((team) => ({ label: team.name, href: `/teams/${team.slug}`, type: "Đội bóng" }))], [query, newsItems]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); } if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose]);
  if (!open) return null;
  return <div className="command-backdrop" onMouseDown={onClose}><div className="command-dialog" role="dialog" aria-modal="true" aria-label="Tìm kiếm" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập ít nhất 2 ký tự..." aria-label="Nội dung tìm kiếm" /><button onClick={onClose}><X size={19} /></button></div><div className="command-results">{query.length < 2 ? <div className="command-hint"><Command size={28} /><p>Tìm kiếm hợp nhất trên tin tức, đội bóng, cầu thủ và giải đấu.</p></div> : results.length ? results.map((result) => <Link key={result.href} href={result.href} onClick={onClose}><span>{result.label}</span><small>{result.type}</small></Link>) : <EmptyState title="Không tìm thấy kết quả" description="Thử từ khóa khác hoặc kiểm tra lại chính tả." />}</div><div className="command-footer"><span>↑↓ di chuyển</span><span>Enter mở</span><span>Esc đóng</span></div></div></div>;
}

function BreakingTicker() {
  return <div className="breaking-ticker"><span className="ticker-label"><Zap size={14} />MỚI NHẤT</span><div className="ticker-copy"><strong>Dữ liệu minh họa:</strong> Lịch thi đấu vòng kế tiếp vừa được cập nhật</div><span className="ticker-time">2 phút trước</span><div className="ticker-arrows"><button aria-label="Tin trước"><ChevronLeft size={16} /></button><button aria-label="Tin sau"><ChevronRight size={16} /></button></div></div>;
}

function HomePage({ bookmarks, onBookmark }: { bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, matchItems } = useRuntimeData();
  return <><BreakingTicker /><div className="home-grid"><main className="main-feed"><div className="welcome-row"><div><span className="eyebrow">THỨ HAI · 13 THÁNG 7</span><h1>Chào buổi tối, người hâm mộ.</h1><p>Những diễn biến đáng chú ý được tổng hợp và kiểm chứng cho bạn.</p></div><div className="signal"><span><i />Hệ thống ổn định</span><strong>128</strong><small>tin đã phân tích hôm nay</small></div></div>
    <section><SectionHeading eyebrow="ĐIỂM TIN" title="Đáng chú ý nhất" action="Xem tất cả" /><div className="featured-grid">{newsItems.slice(0, 2).map((item) => <NewsCard key={item.id} item={item} featured bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div></section>
    <section><SectionHeading eyebrow="CẬP NHẬT LIÊN TỤC" title="Tin mới nhất" action="Mở bảng tin" /><div className="news-stack">{newsItems.slice(2, 7).map((item) => <NewsListItem item={item} key={item.id} />)}</div></section>
    <section className="popular-section"><SectionHeading eyebrow="KHÁM PHÁ" title="Đội bóng phổ biến" /><div className="team-strip">{teams.slice(0, 6).map((team) => <Link href={`/teams/${team.slug}`} key={team.id}><TeamMark name={team.name} /><span>{team.name}</span><small>{team.country}</small></Link>)}</div></section>
  </main><aside className="right-rail"><section className="rail-card live-rail"><SectionHeading eyebrow="ĐANG DIỄN RA" title="Trực tiếp" action="Tất cả" href="/live" />{matchItems.filter((match) => match.status === "live").map((match) => <MatchCard key={match.id} match={match} compact />)}</section><section className="rail-card"><SectionHeading eyebrow="HÔM NAY" title="Lịch thi đấu" action="Lịch đầy đủ" href="/fixtures" />{matchItems.filter((match) => match.status === "scheduled").slice(0, 3).map((match) => <MatchCard key={match.id} match={match} compact />)}</section><section className="rail-card"><SectionHeading eyebrow="PREMIER LEAGUE" title="Bảng xếp hạng" action="Chi tiết" href="/standings" /><StandingsTable /></section><section className="rail-card topics"><SectionHeading eyebrow="XU HƯỚNG" title="Chủ đề nổi bật" /><div>{["# Kỳ chuyển nhượng", "# Đại chiến cuối tuần", "# Tài năng trẻ", "# Chiến thuật pressing", "# V.League"].map((topic, index) => <Link href={`/search?q=${encodeURIComponent(topic)}`} key={topic}><span>{topic}</span><em>{14 - index * 2} tin</em></Link>)}</div></section></aside></div></>;
}

function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-hero"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}

function FilterBar({ search = false }: { search?: boolean }) {
  return <div className="filter-bar">{search && <label className="inline-search"><Search size={17} /><input placeholder="Tìm trong bảng tin..." /></label>}<button><Trophy size={16} />Tất cả giải<ChevronDown size={15} /></button><button><Users size={16} />Tất cả đội<ChevronDown size={15} /></button><button><Flame size={16} />Độ nóng<ChevronDown size={15} /></button><button className="filter-more"><SlidersHorizontal size={16} />Bộ lọc</button></div>;
}

function NewsPage({ bookmarks, onBookmark }: { bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, newsReal, newsSources, aiTranslation } = useRuntimeData();
  return <div className="page-content"><PageHero eyebrow="NEWSROOM" title="Tin nóng Việt Nam & thế giới" description="Tổng hợp nhiều báo thể thao, gộp các bài cùng sự kiện và xếp hạng mức quan tâm bằng tín hiệu minh bạch."><div className="hero-stat"><strong>{newsSources.length || newsItems.length}</strong><span>{newsReal ? "nguồn đang hoạt động" : "tin dự phòng"}</span></div></PageHero><div className="personalization-banner"><div className="ai-orb"><Languages size={22} /></div><div><strong>{aiTranslation ? "AI đang dịch tin quốc tế sang tiếng Việt" : "Tin quốc tế đang hiển thị bản gốc"}</strong><p>{aiTranslation ? "Bản dịch chỉ dựa trên tiêu đề và trích đoạn của nguồn, không tự thêm dữ kiện." : "Kích hoạt khóa AI để tự động dịch và tóm tắt tin BBC, Guardian, ESPN và Sky Sports."}</p></div><Link href="/sources">Xem phương pháp<ArrowRight size={15} /></Link></div><FilterBar search /><div className="news-page-grid">{newsItems.map((item) => <NewsCard key={item.id} item={item} bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div><Pagination /></div>;
}

function ForYouPage({ followed, onFollow, bookmarks, onBookmark }: { followed: Set<string>; onFollow: (id: string) => void; bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, newsReal } = useRuntimeData();
  return <div className="page-content"><PageHero eyebrow="CÁ NHÂN HÓA" title="Dành cho bạn" description="Một bảng tin cân bằng từ đội bóng bạn theo dõi, lịch sử đọc và các chủ đề đang nổi bật."><button className="primary-button"><Sparkles size={17} />Tinh chỉnh sở thích</button></PageHero><div className="personalization-banner"><div className="ai-orb"><Sparkles size={22} /></div><div><strong>{newsReal ? "Mạng lưới báo Việt Nam và quốc tế đang hoạt động" : "Feed dự phòng đang hoạt động"}</strong><p>Đăng nhập để lưu sở thích trên mọi thiết bị và nhận thông báo theo thời gian thực.</p></div><Link href="/login">Đăng nhập<ArrowRight size={15} /></Link></div><section><SectionHeading eyebrow="GỢI Ý CHO BẠN" title="Chọn đội để bắt đầu" /><div className="follow-grid">{teams.slice(0, 8).map((team) => <div className="follow-card" key={team.id}><TeamMark name={team.name} size="lg" /><div><strong>{team.name}</strong><span>{team.country}</span></div><button className={followed.has(team.id) ? "following" : ""} onClick={() => onFollow(team.id)}>{followed.has(team.id) ? <><Check size={15} />Đang theo dõi</> : <>+ Theo dõi</>}</button></div>)}</div></section><section><SectionHeading eyebrow="XẾP HẠNG CÁ NHÂN" title="Bảng tin đề xuất" /><div className="news-page-grid">{[...newsItems].sort((a, b) => b.hotness + b.reliability - a.hotness - a.reliability).slice(0, 6).map((item) => <NewsCard key={item.id} item={item} bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div></section></div>;
}

function LivePage({ mode }: { mode: "live" | "fixtures" | "results" }) {
  const { matchItems, sportsReal } = useRuntimeData();
  const filtered = mode === "live" ? matchItems.filter((item) => item.status !== "finished") : matchItems.filter((item) => item.status === (mode === "fixtures" ? "scheduled" : "finished"));
  const labels = mode === "live" ? ["TRUNG TÂM TRẬN ĐẤU", "Trận đấu trực tiếp", "Theo dõi tỉ số, sự kiện và nhịp độ trận đấu từ provider dữ liệu thể thao."] : mode === "fixtures" ? ["LỊCH THI ĐẤU", "Lịch thi đấu", "Múi giờ hiển thị: Asia/Ho_Chi_Minh (GMT+7)."] : ["KẾT QUẢ", "Kết quả trận đấu", "Kết quả và dữ liệu trận đấu đã hoàn tất từ nguồn minh họa."];
  return <div className="page-content"><PageHero eyebrow={labels[0]} title={labels[1]} description={sportsReal ? "Dữ liệu thật từ football-data.org; gói miễn phí có thể cập nhật tỉ số chậm." : labels[2]}>{mode === "live" && <div className="live-count"><i />{filtered.filter((item)=>item.status==="live").length} trận đang diễn ra</div>}</PageHero>{mode !== "live" && <div className="date-nav"><button><ChevronLeft size={18} /></button><button className="active">Hôm nay<small>{new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit"}).format(new Date())}</small></button><button>Ngày mai</button><button><ChevronRight size={18} /></button><button className="calendar-button"><CalendarDays size={17} />Chọn ngày</button></div>}<FilterBar /><div className="match-groups">{[...new Set(filtered.map((item)=>item.competition))].map((competitionName) => { const group = filtered.filter((item) => item.competition === competitionName); return <section className="match-group" key={competitionName}><div className="competition-title"><span className="competition-icon">SP</span><div><strong>{competitionName}</strong><span>{sportsReal ? "Nguồn football-data.org" : "Dữ liệu dự phòng"}</span></div><ChevronRight size={18} /></div><div className="match-grid">{group.map((match) => <MatchCard key={match.id} match={match} />)}</div></section>; })}</div></div>;
}

function StandingsPage() {
  const { sportsReal } = useRuntimeData();
  return <div className="page-content"><PageHero eyebrow="MÙA GIẢI HIỆN TẠI" title="Bảng xếp hạng" description={sportsReal ? "Thứ hạng và phong độ được cập nhật từ football-data.org." : "Đang hiển thị dữ liệu dự phòng cho tới khi API thể thao được kích hoạt."}><div className="season-select"><Trophy size={18} /><span>Premier League</span><ChevronDown size={16} /></div></PageHero><div className="standings-panel"><div className="panel-tabs"><button className="active">Bảng tổng</button><button>Sân nhà</button><button>Sân khách</button><span>{sportsReal ? "Nguồn football-data.org" : "Dữ liệu dự phòng"}</span></div><StandingsTable full /><div className="table-legend"><span><i className="champions" />Champions League</span><span><i className="europa" />Europa League</span><span><i className="relegation" />Xuống hạng</span></div></div></div>;
}

function TransfersPage() {
  return <div className="page-content"><PageHero eyebrow="MARKET WATCH" title="Chuyển nhượng" description="Theo dõi tin đồn, đàm phán và các thương vụ đã xác nhận — với điểm tin cậy minh bạch."><div className="window-status"><i />Kỳ chuyển nhượng đang mở</div></PageHero><FilterBar search /><div className="transfer-layout"><div className="transfer-list">{transfers.map((item) => <article className="transfer-card" key={item.id}><div className="player-avatar">{getInitials(item.player)}</div><div className="transfer-player"><span className={`status status-${item.status === "Đã xác nhận" ? "confirmed" : item.status === "Tin đồn" ? "rumor" : "talks"}`}>{item.status}</span><h3>{item.player}</h3><small>{item.updated}</small></div><div className="transfer-route"><div><TeamMark name={item.from} /><span>{item.from}</span></div><ArrowRight size={22} /><div><TeamMark name={item.to} /><span>{item.to}</span></div></div><div className="transfer-meta"><strong>{item.fee}</strong><ReliabilityBadge score={item.reliability} /></div></article>)}</div><aside className="transfer-aside"><div className="rail-card"><SectionHeading eyebrow="PHÂN TÍCH" title="Độ tin cậy" /><p className="muted-copy">Điểm được tính từ độ uy tín nguồn, số nguồn độc lập, trạng thái chính thức và ngôn ngữ suy đoán.</p><div className="reliability-scale"><span><i style={{ width: "88%" }} />Đã xác nhận</span><span><i style={{ width: "64%" }} />Đàm phán</span><span><i style={{ width: "38%" }} />Tin đồn</span></div><small>Đây là đánh giá tự động, không phải sự bảo đảm tuyệt đối.</small></div></aside></div></div>;
}

function NewsDetail({ slug, bookmarked, onBookmark }: { slug: string; bookmarked: boolean; onBookmark: (id: string) => void }) {
  const { newsItems } = useRuntimeData();
  const item = newsItems.find((entry) => entry.slug === slug) ?? newsItems[0] ?? news[0];
  const sourceDetails = item.sourceDetails?.length ? item.sourceDetails : item.sources.map((name) => ({ name, url: item.originalUrl ?? "#", reliability: item.reliability, language: item.originalLanguage ?? "vi" as const }));
  return <div className="article-page"><div className="article-breadcrumb"><Link href="/news">Tin tức</Link><ChevronRight size={14} /><span>{item.competition}</span></div><header className="article-header"><div className="article-badges"><span className="demo-label">{item.translatedByAI ? "AI DỊCH TỪ TIẾNG ANH" : item.originalLanguage === "en" ? "BẢN GỐC TIẾNG ANH" : "TIN TỔNG HỢP"}</span><HotnessBadge score={item.hotness} /><ReliabilityBadge score={item.reliability} /></div><h1>{item.title}</h1><p>{item.summary}</p><div className="article-meta"><span className="source-avatar">SP</span><div><strong>SportPeek Newsroom</strong><span>Cập nhật {item.publishedAt} · {item.sources.length} nguồn</span></div><div className="article-actions"><button onClick={() => onBookmark(item.id)} className={bookmarked ? "active" : ""}><Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} />{bookmarked ? "Đã lưu" : "Lưu"}</button><button><Share2 size={17} />Chia sẻ</button></div></div></header><NewsVisual item={item} /><div className="article-layout"><article className="article-body"><div className="summary-box"><div className="summary-title"><Sparkles size={19} /><strong>{item.translatedByAI ? "AI dịch và tóm tắt" : "Tóm tắt từ nguồn"}</strong><span>Không thêm dữ kiện</span></div><p>{item.summary}</p></div><section><h2>Những điểm chính</h2><ul className="key-points">{item.keyPoints.map((point) => <li key={point}><Check size={16} />{point}</li>)}</ul></section><section><h2>Vì sao tin này đang được chú ý?</h2><ul className="key-points">{(item.trendingReasons ?? ["Độ mới và uy tín nguồn được đưa vào điểm số"]).map((reason) => <li key={reason}><Flame size={16} />{reason}</li>)}</ul><p className="muted-copy">Điểm nóng là ước tính từ độ mới, số báo cùng đưa, độ uy tín nguồn và tầm quan trọng chủ đề; không phải lượt xem thật của từng tòa soạn.</p></section><div className="aggregation-notice"><ShieldCheck size={22} /><div><strong>Đây là nội dung tổng hợp</strong><p>SportPeek chỉ dùng metadata, trích đoạn ngắn và bản tóm tắt. Hãy mở từng nguồn bên cạnh để đọc bài đầy đủ và đối chiếu.</p></div></div></article><aside className="article-aside"><div className="rail-card"><SectionHeading eyebrow="ĐỐI CHIẾU" title={`${sourceDetails.length} nguồn`} />{sourceDetails.map((source, index) => <a href={source.url} target="_blank" rel="noreferrer" className="source-card" key={`${source.name}-${source.url}`}><span className="source-avatar">{index + 1}</span><div><strong>{source.name}</strong><span>{source.language === "en" ? "Nguồn tiếng Anh" : "Nguồn tiếng Việt"} · Uy tín {source.reliability}%</span></div><ExternalLink size={15} /></a>)}</div><div className="rail-card"><SectionHeading eyebrow="CHỦ ĐỀ" title="Phân loại" /><div className="entity-chips"><Link href="/news"><Newspaper size={15} />Thể thao</Link><Link href="/news"><Trophy size={15} />{item.competition}</Link></div></div></aside></div><section className="related-news"><SectionHeading eyebrow="ĐỌC TIẾP" title="Tin liên quan" /><div className="news-page-grid">{newsItems.filter((entry) => entry.id !== item.id).slice(0, 3).map((entry) => <NewsCard key={entry.id} item={entry} bookmarked={false} onBookmark={onBookmark} />)}</div></section></div>;
}

function MatchDetail({ id }: { id: string }) {
  const { matchItems, newsItems, sportsReal } = useRuntimeData();
  const match = matchItems.find((item) => item.id === id) ?? matchItems[0] ?? matches[0];
  return <div className="page-content"><div className="match-detail-hero"><div className="match-detail-top"><span>{match.competition} · {sportsReal ? "Dữ liệu trực tiếp" : "Dữ liệu dự phòng"}</span><span className={match.status === "live" ? "live-pill" : "status-pill"}>{match.status === "live" ? `${match.minute}' · TRỰC TIẾP` : match.status === "finished" ? "ĐÃ KẾT THÚC" : "SẮP DIỄN RA"}</span></div><div className="scoreboard"><div><TeamMark name={match.home} size="lg" /><h2>{match.home}</h2><span>Chủ nhà</span></div><strong>{match.homeScore ?? 0}<em>–</em>{match.awayScore ?? 0}<small>{match.status === "scheduled" ? match.startTime : match.status === "live" ? `${match.minute ?? 0}'` : "FT"}</small></strong><div><TeamMark name={match.away} size="lg" /><h2>{match.away}</h2><span>Đội khách</span></div></div><div className="match-facts"><span><CalendarDays size={15} />{match.startTime}</span><span><MapPin size={15} />{match.venue}</span></div></div><div className="panel-tabs match-tabs"><button className="active">Tổng quan</button><button>Đội hình</button><button>Thống kê</button><button>Đối đầu</button><button>Bảng xếp hạng</button></div><div className="match-detail-grid"><main><section className="content-card"><SectionHeading eyebrow="DIỄN BIẾN" title="Dòng thời gian" /><div className="large-empty"><EmptyState title={sportsReal ? "Đang đồng bộ sự kiện trận đấu" : "Cần kích hoạt API thể thao"} description="SportPeek không tự tạo bàn thắng, thẻ phạt hoặc thống kê khi nguồn chưa cung cấp." /></div></section></main><aside><div className="rail-card ai-preview"><Sparkles size={23} /><span className="eyebrow">SPORTPEEK AI</span><h3>Phân tích có kiểm chứng</h3><p>AI chỉ tạo nhận định khi đã có dữ liệu đội hình, phong độ và thống kê từ provider.</p></div><div className="rail-card"><SectionHeading eyebrow="TIN TỨC" title="Liên quan" />{newsItems.slice(0, 3).map((item) => <NewsListItem item={item} key={item.id} />)}</div></aside></div></div>;
}

function EntityPage({ type, slug, followed, onFollow }: { type: "team" | "player" | "competition"; slug: string; followed: Set<string>; onFollow: (id: string) => void }) {
  const { matchItems, newsItems } = useRuntimeData();
  const team = teams.find((item) => item.slug === slug) ?? teams[0];
  const competition = competitions.find((item) => item.slug === slug) ?? competitions[0];
  const player = players.find((item) => item.name.toLowerCase().replace(/\s+/g, "-") === slug) ?? players[0];
  const id = type === "team" ? team.id : type === "competition" ? competition.id : player.id;
  const title = type === "team" ? team.name : type === "competition" ? competition.name : player.name;
  return <div className="page-content"><div className="entity-hero"><div className="entity-mark">{type === "team" ? <TeamMark name={team.name} size="lg" /> : type === "competition" ? <Trophy size={38} /> : <span className="player-avatar large">{getInitials(player.name)}</span>}</div><div><span className="eyebrow">{type === "team" ? `CÂU LẠC BỘ · ${team.country}` : type === "competition" ? `GIẢI ĐẤU · ${competition.country}` : `CẦU THỦ · ${player.nationality}`}</span><h1>{title}</h1><p>{type === "team" ? team.stadium : type === "competition" ? `Mùa ${competition.season}` : `${player.position} · ${player.team}`}</p></div><button className={`follow-button ${followed.has(id) ? "following" : ""}`} onClick={() => onFollow(id)}>{followed.has(id) ? <><Check size={16} />Đang theo dõi</> : <>+ Theo dõi</>}</button></div><div className="entity-layout"><main>{type !== "player" && <section><SectionHeading eyebrow="SẮP TỚI" title="Trận tiếp theo" />{matchItems.slice(0, 2).map((match) => <MatchCard key={match.id} match={match} />)}</section>}<section><SectionHeading eyebrow="CẬP NHẬT" title={`Tin về ${title}`} /><div className="news-stack">{newsItems.slice(0, 5).map((item) => <NewsListItem item={item} key={item.id} />)}</div></section></main><aside><div className="rail-card"><SectionHeading eyebrow="THÔNG TIN" title="Hồ sơ" /><dl className="profile-list"><div><dt>Quốc gia</dt><dd>{type === "player" ? player.nationality : type === "team" ? team.country : competition.country}</dd></div><div><dt>{type === "team" ? "Sân vận động" : type === "player" ? "Vị trí" : "Mùa hiện tại"}</dt><dd>{type === "team" ? team.stadium : type === "player" ? player.position : competition.season}</dd></div><div><dt>Trạng thái</dt><dd className="active-text">Đang hoạt động</dd></div></dl></div>{type !== "player" && <div className="rail-card"><SectionHeading eyebrow="XẾP HẠNG" title="Premier League" /><StandingsTable /></div>}</aside></div></div>;
}

function SearchPage() {
  const { newsItems } = useRuntimeData();
  return <div className="page-content"><PageHero eyebrow="TÌM KIẾM HỢP NHẤT" title="Tìm mọi thứ về bóng đá" description="Tin tức, đội bóng, cầu thủ và giải đấu trong cùng một nơi." /><label className="search-page-input"><Search size={22} /><input placeholder="Nhập từ khóa..." /><kbd><Command size={12} />K</kbd></label><div className="search-sections"><section><SectionHeading eyebrow="ĐỘI BÓNG" title="Kết quả nổi bật" /><div className="follow-grid">{teams.slice(0, 4).map((team) => <Link className="follow-card" href={`/teams/${team.slug}`} key={team.id}><TeamMark name={team.name} size="lg" /><div><strong>{team.name}</strong><span>{team.country}</span></div><ChevronRight size={18} /></Link>)}</div></section><section><SectionHeading eyebrow="TIN TỨC" title={`${newsItems.length} kết quả`} /><div className="news-stack">{newsItems.slice(0, 6).map((item) => <NewsListItem item={item} key={item.id} />)}</div></section></div></div>;
}

function BookmarksPage({ bookmarks, onBookmark }: { bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems } = useRuntimeData();
  const items = newsItems.filter((item) => bookmarks.has(item.id));
  return <div className="page-content"><PageHero eyebrow="THƯ VIỆN CÁ NHÂN" title="Tin đã lưu" description="Các bản tin bạn muốn quay lại đọc sau."><LockKeyhole size={22} /></PageHero>{items.length ? <div className="news-page-grid">{items.map((item) => <NewsCard key={item.id} item={item} bookmarked onBookmark={onBookmark} />)}</div> : <div className="large-empty"><EmptyState title="Chưa có tin nào được lưu" description="Nhấn biểu tượng dấu trang trên một bản tin để lưu vào đây." /><Link href="/news" className="primary-button">Khám phá tin mới</Link></div>}</div>;
}

function SettingsPage() {
  return <div className="page-content settings-page"><PageHero eyebrow="TÀI KHOẢN" title="Cài đặt" description="Quản lý hồ sơ, trải nghiệm và thông báo của bạn." /><div className="settings-layout"><nav><button className="active"><UserRound size={17} />Hồ sơ</button><button><Languages size={17} />Ngôn ngữ & múi giờ</button><button><Star size={17} />Sở thích</button><button><Bell size={17} />Thông báo</button><button><MessageCircle size={17} />Telegram</button><button><ShieldCheck size={17} />Quyền riêng tư</button></nav><div className="settings-panel"><section><h2>Hồ sơ cá nhân</h2><p>Thông tin hiển thị trong trải nghiệm SportPeek.</p><div className="avatar-setting"><span className="player-avatar large">NK</span><button>Thay ảnh</button></div><FormField label="Tên hiển thị" value="Người hâm mộ" /><FormField label="Email" value="demo@sportpeek.local" disabled /><div className="form-row-two"><FormField label="Ngôn ngữ" value="Tiếng Việt" /><FormField label="Múi giờ" value="Asia/Ho_Chi_Minh" /></div></section><section><h2>Thông báo</h2><p>Chọn các cập nhật bạn muốn nhận.</p>{["Tin nóng đã xác minh", "Trận đấu bắt đầu", "Bàn thắng", "Kết quả trận đấu", "Tin chuyển nhượng", "Bản tin hằng ngày"].map((label, index) => <label className="toggle-row" key={label}><span><strong>{label}</strong><small>{index === 0 ? "Chỉ gửi khi có đủ nguồn tin cậy" : "Thông báo theo đội bóng đang theo dõi"}</small></span><input type="checkbox" defaultChecked={index < 4} /><i /></label>)}</section><div className="settings-actions"><button>Hủy</button><button className="primary-button">Lưu thay đổi</button></div></div></div></div>;
}

function FormField({ label, value, disabled, name, type = "text", required = false }: { label: string; value: string; disabled?: boolean; name?: string; type?: string; required?: boolean }) { return <label className="form-field"><span>{label}</span><input name={name} type={type} defaultValue={value} disabled={disabled} required={required} /></label>; }

function AuthPage({ type }: { type: "login" | "register" | "forgot" }) {
  const [status, setStatus] = useState("");
  const content = type === "login" ? ["Chào mừng trở lại", "Đăng nhập để cá nhân hóa bảng tin của bạn.", "Đăng nhập"] : type === "register" ? ["Tạo tài khoản", "Theo dõi đội bóng và lưu những tin quan trọng.", "Đăng ký"] : ["Khôi phục mật khẩu", "Nhập email để nhận liên kết đặt lại mật khẩu.", "Gửi liên kết"];
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setStatus("Đang xử lý..."); const client = createSupabaseClient();
    if (!client) { setStatus("Chế độ demo: hãy cấu hình Supabase để bật đăng nhập thật."); return; }
    const data = new FormData(event.currentTarget); const email = String(data.get("email") ?? ""); const password = String(data.get("password") ?? "");
    const result = type === "login" ? await client.auth.signInWithPassword({ email, password }) : type === "register" ? await client.auth.signUp({ email, password, options: { data: { display_name: String(data.get("displayName") ?? "") } } }) : await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback` });
    if (result.error) setStatus(result.error.message); else if (type === "login") window.location.href = "/for-you"; else setStatus("Hãy kiểm tra email để hoàn tất.");
  };
  const oauth = async () => { const client = createSupabaseClient(); if (!client) return setStatus("Chế độ demo: Google OAuth chưa được kết nối."); await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } }); };
  const magic = async (event: React.MouseEvent<HTMLButtonElement>) => { const form = event.currentTarget.form; const email = String(new FormData(form ?? undefined).get("email") ?? ""); const client = createSupabaseClient(); if (!client) return setStatus("Chế độ demo: Magic Link chưa được kết nối."); const result = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } }); setStatus(result.error?.message ?? "Magic Link đã được gửi."); };
  return <div className="auth-page"><div className="auth-art"><div className="brand large"><span className="brand-symbol"><span /></span><span>SPORT<b>PEEK</b></span></div><div><span className="eyebrow">THỂ THAO · ĐƯỢC TỔNG HỢP THÔNG MINH</span><h2>Một góc nhìn rõ ràng hơn về trận đấu.</h2><p>SportPeek gom nhiều nguồn, loại bỏ nội dung trùng và làm nổi bật điều thực sự đáng chú ý.</p></div><div className="auth-stats"><span><strong>5</strong>giải đấu</span><span><strong>20</strong>đội bóng</span><span><strong>AI</strong>tóm tắt</span></div></div><div className="auth-form-wrap"><Link href="/" className="auth-back"><ChevronLeft size={16} />Về trang chủ</Link><form className="auth-form" onSubmit={submit}><span className="eyebrow">TÀI KHOẢN SPORTPEEK</span><h1>{content[0]}</h1><p>{content[1]}</p>{type === "register" && <FormField label="Tên hiển thị" name="displayName" value="" required />}<FormField label="Email" name="email" type="email" value="" required />{type !== "forgot" && <FormField label="Mật khẩu" name="password" type="password" value="" required />}{type === "login" && <div className="form-options"><label><input type="checkbox" />Ghi nhớ tôi</label><Link href="/forgot-password">Quên mật khẩu?</Link></div>}<button type="submit" className="primary-button auth-submit">{content[2]}<ArrowRight size={17} /></button>{status && <p className="auth-status" role="status">{status}</p>}{type !== "forgot" && <><div className="or"><span />hoặc<span /></div><button type="button" className="oauth-button" onClick={oauth}>G<span>{type === "login" ? "Đăng nhập" : "Đăng ký"} với Google</span></button><button type="button" className="magic-button" onClick={magic}><Sparkles size={17} />Gửi magic link</button></>}<p className="auth-switch">{type === "login" ? "Chưa có tài khoản?" : "Đã có tài khoản?"} <Link href={type === "login" ? "/register" : "/login"}>{type === "login" ? "Đăng ký" : "Đăng nhập"}</Link></p></form></div></div>;
}

function AdminPage() {
  const metrics = [["Bài raw", "2.418", "+124 hôm nay", Newspaper], ["News cluster", "846", "92% đã xử lý", Sparkles], ["Chờ xử lý", "37", "12 ưu tiên", Clock3], ["Nguồn hoạt động", "18", "100% ổn định", Radio], ["Người dùng", "5.284", "+8,4% tháng", Users], ["Trận hôm nay", "28", "2 đang live", Goal], ["AI thành công", "1.206", "98,7%", Check], ["AI thất bại", "16", "1,3%", X]] as const;
  return <div className="admin-page"><div className="admin-top"><div><span className="eyebrow">ADMIN CONSOLE</span><h1>Tổng quan vận hành</h1><p>Các chỉ số hệ thống từ dữ liệu demo ngày 13/07/2026.</p></div><button className="primary-button"><Zap size={17} />Chạy ingestion</button></div><div className="metric-grid">{metrics.map(([label, value, note, Icon]) => <div className="metric-card" key={label}><span><Icon size={18} />{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div><div className="admin-charts"><section className="content-card"><SectionHeading eyebrow="7 NGÀY QUA" title="Bài viết theo ngày" /><div className="bar-chart">{[42, 68, 54, 81, 73, 92, 78].map((value, index) => <span key={index}><i style={{ height: `${value}%` }} /><small>{["T2", "T3", "T4", "T5", "T6", "T7", "CN"][index]}</small></span>)}</div></section><section className="content-card"><SectionHeading eyebrow="TRẠNG THÁI" title="AI jobs" /><div className="donut-wrap"><div className="donut"><span><strong>98.7%</strong>thành công</span></div><div className="donut-legend"><span><i className="success" />Thành công <strong>1.206</strong></span><span><i className="processing" />Đang chạy <strong>12</strong></span><span><i className="failed" />Thất bại <strong>16</strong></span></div></div></section></div><div className="admin-tables"><section className="content-card"><SectionHeading eyebrow="INGESTION" title="Tác vụ gần đây" /><JobTable type="ingestion" /></section><section className="content-card"><SectionHeading eyebrow="AI PIPELINE" title="AI jobs gần đây" /><JobTable type="ai" /></section></div></div>;
}

function JobTable({ type }: { type: "ai" | "ingestion" }) { return <div className="job-list">{Array.from({ length: 5 }, (_, index) => <div key={index}><span className={`job-status ${index === 3 ? "failed" : "success"}`}>{index === 3 ? <X size={13} /> : <Check size={13} />}</span><div><strong>{type === "ai" ? ["cluster_articles", "summarize_cluster", "score_hotness", "extract_entities", "match_preview"][index] : ["RSS · Sport Demo", "JSON API · Match Data", "RSS · Club Channel", "RSS · Transfer Wire", "Mock · V.League"][index]}</strong><span>{index === 3 ? "Lỗi timeout — sẽ thử lại" : `Hoàn tất · ${24 + index * 8} bản ghi`}</span></div><time>{index + 2} phút trước</time></div>)}</div>; }

function LegalPage({ type }: { type: string }) {
  const titles: Record<string, string> = { terms: "Điều khoản sử dụng", privacy: "Chính sách quyền riêng tư", copyright: "Bản quyền & nội dung", sources: "Nguồn tin & phương pháp" };
  return <div className="legal-page"><span className="eyebrow">SPORTPEEK · MINH BẠCH</span><h1>{titles[type] ?? "Thông tin"}</h1><p className="legal-lead">Cập nhật lần cuối: 13/07/2026. Phương pháp này áp dụng cho bảng tin tổng hợp đang hoạt động.</p><section><h2>Mạng lưới nguồn</h2><p>SportPeek đọc RSS công khai của VFF, VPF, VnExpress, Tuổi Trẻ, Thanh Niên, VietNamNet, Dân trí, VOV, BBC Sport, The Guardian, ESPN và Sky Sports. Nguồn có thể tạm dừng nếu feed lỗi hoặc chính sách của nhà xuất bản thay đổi.</p></section><section><h2>Dịch và tóm tắt</h2><p>Với bài tiếng Anh, AI chỉ dịch và tóm tắt từ tiêu đề cùng trích đoạn mà RSS cung cấp. Hệ thống được yêu cầu giữ tên riêng, không thêm dữ kiện và luôn giữ liên kết về bài gốc.</p></section><section><h2>Điểm nóng</h2><p>Điểm nóng là chỉ số quan tâm ước tính từ độ mới, số nguồn độc lập cùng đưa, uy tín nguồn và tầm quan trọng của sự kiện. Đây không phải lượt đọc, lượt chia sẻ hoặc số người xem thật của các tòa soạn.</p></section><section><h2>Quyền của nguồn tin</h2><p>SportPeek không đăng lại toàn văn, không vượt paywall và không tải lại video. Người dùng được dẫn về nguồn gốc để đọc đầy đủ. Yêu cầu chỉnh sửa hoặc gỡ nội dung sẽ được bổ sung kênh tiếp nhận trước khi phát hành thương mại.</p></section></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) { return <div className="empty-state"><Search size={28} /><strong>{title}</strong><p>{description}</p></div>; }
function Pagination() { return <nav className="pagination" aria-label="Phân trang"><button disabled><ChevronLeft size={16} /></button><button className="active">1</button><button>2</button><button>3</button><span>…</span><button>12</button><button><ChevronRight size={16} /></button></nav>; }

function AppFooter() {
  return <footer className="app-footer"><div><div className="brand"><span className="brand-symbol"><span /></span><span>SPORT<b>PEEK</b></span></div><p>Tin thể thao quan trọng, được tổng hợp thông minh.</p></div><div><strong>Sản phẩm</strong><Link href="/news">Tin tức</Link><Link href="/live">Trực tiếp</Link><Link href="/standings">Bảng xếp hạng</Link></div><div><strong>Minh bạch</strong><Link href="/sources">Nguồn tin</Link><Link href="/copyright">Bản quyền</Link><Link href="/privacy">Quyền riêng tư</Link></div><div><strong>Hệ thống</strong><span className="system-ok"><i />Hoạt động bình thường</span><small>© 2026 SportPeek Beta</small></div></footer>;
}

export default function SportPeekApp({ route }: { route: string }) {
  const [theme, setTheme] = useState("dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => new Set(["n1", "n5"]));
  const [followed, setFollowed] = useState<Set<string>>(() => new Set(["team-1", "team-7"]));
  const [runtimeData, setRuntimeData] = useState<RuntimeData>({ newsItems: news, matchItems: matches, standingRows: standings, newsReal: false, sportsReal: false, newsSources: [], aiTranslation: false });
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const requests = await Promise.allSettled([
        fetch("/api/news").then((response) => response.json() as Promise<RuntimeResponse<NewsItem[]>>),
        fetch("/api/matches/live").then((response) => response.json() as Promise<RuntimeResponse<Match[]>>),
        fetch("/api/fixtures").then((response) => response.json() as Promise<RuntimeResponse<Match[]>>),
        fetch("/api/results").then((response) => response.json() as Promise<RuntimeResponse<Match[]>>),
        fetch("/api/standings").then((response) => response.json() as Promise<RuntimeResponse<typeof standings>>),
      ]);
      if (!active) return;
      const newsResponse = requests[0].status === "fulfilled" ? requests[0].value : null;
      const sportsResponses = requests.slice(1, 4).filter((result): result is PromiseFulfilledResult<RuntimeResponse<Match[]>> => result.status === "fulfilled").map((result) => result.value);
      const tableResponse = requests[4].status === "fulfilled" ? requests[4].value : null;
      const mergedMatches = [...new Map(sportsResponses.flatMap((result) => result.data ?? []).map((match) => [match.id, match])).values()];
      setRuntimeData({ newsItems: newsResponse?.data?.length ? newsResponse.data : news, matchItems: mergedMatches.length ? mergedMatches : matches, standingRows: tableResponse?.data?.length ? tableResponse.data : standings, newsReal: newsResponse?.demo === false, sportsReal: sportsResponses.some((result) => result.provider !== "mock" && result.demo === false), newsSources: newsResponse?.sources ?? [], aiTranslation: newsResponse?.aiTranslation === true });
    };
    void load();
    return () => { active = false; };
  }, []);
  const toggleBookmark = async (id: string) => { setBookmarks((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); try { await fetch("/api/bookmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ newsClusterId: id, action: bookmarks.has(id) ? "remove" : "save" }) }); } catch { /* optimistic demo state remains usable */ } };
  const toggleFollow = async (id: string) => { setFollowed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); try { await fetch("/api/follows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entityType: "team", entityId: id, action: followed.has(id) ? "unfollow" : "follow" }) }); } catch { /* optimistic demo state remains usable */ } };
  const segments = route.split("/").filter(Boolean);
  const isAuth = ["/login", "/register", "/forgot-password", "/auth/callback"].includes(route);
  if (isAuth) return <AuthPage type={route === "/register" ? "register" : route === "/forgot-password" ? "forgot" : "login"} />;
  let page: React.ReactNode;
  if (route === "/") page = <HomePage bookmarks={bookmarks} onBookmark={toggleBookmark} />;
  else if (route === "/for-you") page = <ForYouPage followed={followed} onFollow={toggleFollow} bookmarks={bookmarks} onBookmark={toggleBookmark} />;
  else if (route === "/news") page = <NewsPage bookmarks={bookmarks} onBookmark={toggleBookmark} />;
  else if (segments[0] === "news" && segments[1]) page = <NewsDetail slug={segments[1]} bookmarked={bookmarks.has(runtimeData.newsItems.find((item) => item.slug === segments[1])?.id ?? "n1")} onBookmark={toggleBookmark} />;
  else if (route === "/live") page = <LivePage mode="live" />;
  else if (route === "/fixtures") page = <LivePage mode="fixtures" />;
  else if (route === "/results") page = <LivePage mode="results" />;
  else if (segments[0] === "matches") page = <MatchDetail id={segments[1] ?? "m1"} />;
  else if (route === "/standings") page = <StandingsPage />;
  else if (route === "/transfers") page = <TransfersPage />;
  else if (segments[0] === "teams") page = <EntityPage type="team" slug={segments[1] ?? "arsenal"} followed={followed} onFollow={toggleFollow} />;
  else if (segments[0] === "players") page = <EntityPage type="player" slug={segments[1] ?? "minh-quan-1"} followed={followed} onFollow={toggleFollow} />;
  else if (segments[0] === "competitions") page = <EntityPage type="competition" slug={segments[1] ?? "premier-league"} followed={followed} onFollow={toggleFollow} />;
  else if (route === "/search") page = <SearchPage />;
  else if (route === "/bookmarks") page = <BookmarksPage bookmarks={bookmarks} onBookmark={toggleBookmark} />;
  else if (route === "/settings") page = <SettingsPage />;
  else if (route.startsWith("/admin")) page = <AdminPage />;
  else if (["terms", "privacy", "copyright", "sources"].includes(segments[0])) page = <LegalPage type={segments[0]} />;
  else page = <div className="large-empty"><EmptyState title="Không tìm thấy trang" description="Trang bạn tìm kiếm không tồn tại hoặc đã được di chuyển." /><Link href="/" className="primary-button">Về trang chủ</Link></div>;
  return <RuntimeDataContext.Provider value={runtimeData}><div className="app-shell"><AppSidebar route={route} open={menuOpen} onClose={() => setMenuOpen(false)} /><div className="app-column"><Header onMenu={() => setMenuOpen(true)} onSearch={() => setSearchOpen(true)} theme={theme} onTheme={() => setTheme(theme === "dark" ? "light" : "dark")} /><div className="demo-bar"><ShieldCheck size={14} />{runtimeData.newsReal ? `Đang tổng hợp ${runtimeData.newsSources.length} nguồn Việt Nam và quốc tế.` : "Mạng lưới tin tạm gián đoạn — đang dùng dữ liệu dự phòng."} {runtimeData.aiTranslation ? "AI dịch tiếng Anh đang hoạt động." : "Chưa kích hoạt dịch AI."} {runtimeData.sportsReal ? "Tỉ số trực tiếp đang hoạt động." : "Tỉ số đang dùng dữ liệu dự phòng."}</div><div className="content-wrap">{page}</div><AppFooter /></div><MobileNavigation route={route} /><SearchCommand open={searchOpen} onClose={() => setSearchOpen(false)} /></div></RuntimeDataContext.Provider>;
}
