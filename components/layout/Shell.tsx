"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  Bell, Bookmark, CircleUserRound, Command, Globe2, ListFilter, Moon, Menu, Newspaper,
  Rss, Settings, ShieldCheck, Sun, Video, X, Zap
} from "lucide-react";
import { useRuntimeData, navItems, SourceFilter } from "@/components/SportPeekApp";
import { TeamMark } from "@/components/ui/badges";
import type { HealthState } from "@/lib/health";

const getInitials = (name: string) => (name?.trim() || "TBD").split(" ").map((word) => word[0]).slice(-2).join("").toUpperCase();

export function AppSidebar({ route, open, onClose, sourceFilter, onSourceFilter }: { route: string; open: boolean; onClose: () => void; sourceFilter: SourceFilter; onSourceFilter: (filter: SourceFilter) => void }) {
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
    { id: "official" as const, label: "Kênh chính thức", icon: ShieldCheck, count: newsItems.filter((item) => item.sources.some((source) => /\b(?:vff|vpf)\b/i.test(source))).length },
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

export function Header({ onMenu, onSearch, theme, onTheme }: { onMenu: () => void; onSearch: () => void; theme: string; onTheme: () => void }) {
  return <header className="app-header"><button className="menu-button" onClick={onMenu} aria-label="Mở menu"><Menu size={22} /></button><button className="search-trigger" onClick={onSearch}><Newspaper size={18} /><span>Tìm tin, đội bóng, giải đấu...</span><kbd><Command size={12} />K</kbd></button><div className="header-actions"><button className="icon-button" onClick={onTheme} aria-label="Đổi giao diện">{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button><Link className="icon-button notification-button" href="/settings" aria-label="Mở cài đặt thông báo"><Bell size={19} /><i /></Link><Link className="login-button" href="/login"><CircleUserRound size={18} /><span>Đăng nhập</span></Link></div></header>;
}

export function MobileNavigation({ route }: { route: string }) {
  const items = [navItems[0], navItems[1], navItems[3], navItems[4], { href: "/settings", label: "Cài đặt", icon: Settings }];
  return <nav className="mobile-nav" aria-label="Điều hướng di động">{items.map((item) => { const Icon = item.icon; return <Link key={item.href} href={item.href} className={route === item.href ? "active" : ""}><Icon size={20} /><span>{item.label}</span></Link>; })}</nav>;
}

export function SystemStatusBanner() {
  const { health, loading } = useRuntimeData();
  if (loading || health.state === "operational") return null;
  const message = health.state === "stale"
    ? "Một số nguồn đang chậm; SportPeek vẫn hiển thị bản đã xác minh gần nhất."
    : "Một số nguồn đang được kết nối lại; nội dung sẵn có vẫn đọc bình thường.";
  return <div className={`demo-bar status-banner ${health.state}`} role="status"><span className="status-banner-label"><ShieldCheck size={14} />Dữ liệu đang cập nhật</span><span className="service-status"><i />{message}</span></div>;
}

export function AppFooter({ compact = false }: { compact?: boolean }) {
  const { health, loading } = useRuntimeData();
  const statusText = loading
    ? "Đang đồng bộ dữ liệu"
    : health.state === "operational"
      ? "Dữ liệu đang hoạt động"
      : health.state === "stale"
        ? "Đang hiển thị dữ liệu gần nhất"
        : "Một số nguồn đang cập nhật";
  const statusClass: HealthState | "loading" = loading ? "loading" : health.state;
  if (compact) return <footer className="app-footer compact-footer"><div><span>© 2026 SportPeek</span><Link href="/sources">Nguồn & phương pháp</Link><Link href="/privacy">Quyền riêng tư</Link></div><span className={`footer-data-status ${statusClass}`}><i />{statusText}</span></footer>;
  return <footer className="app-footer"><div><div className="brand"><span className="brand-symbol"><span /></span><span>SPORT<b>PEEK</b></span></div><p>Tin thể thao quan trọng, được tổng hợp thông minh.</p></div><div><strong>Sản phẩm</strong><Link href="/news">Tin tức</Link><Link href="/live">Trực tiếp</Link><Link href="/standings">Bảng xếp hạng</Link></div><div><strong>Minh bạch</strong><Link href="/sources">Nguồn tin</Link><Link href="/copyright">Bản quyền</Link><Link href="/privacy">Quyền riêng tư</Link></div><div><strong>Trạng thái dữ liệu</strong><span className={`footer-data-status ${statusClass}`}><i />{statusText}</span><small>© 2026 SportPeek Beta</small></div></footer>;
}
