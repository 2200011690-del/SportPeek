"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  Bell,
  Bookmark,
  CircleUserRound,
  Command,
  Globe2,
  ListFilter,
  Menu,
  Moon,
  Newspaper,
  Rss,
  Settings,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import {
  navItems,
  useRuntimeData,
  type SourceFilter,
} from "@/components/runtime/RuntimeDataContext";
import { NEWS_CATEGORIES } from "@/lib/news/categories";
import type { HealthState } from "@/lib/health";

const getInitials = (name: string) =>
  (name?.trim() || "TBD")
    .split(" ")
    .map((word) => word[0])
    .slice(-2)
    .join("")
    .toUpperCase();

export function AppSidebar({
  route,
  open,
  onClose,
  sourceFilter,
  onSourceFilter,
}: {
  route: string;
  open: boolean;
  onClose: () => void;
  sourceFilter: SourceFilter;
  onSourceFilter: (filter: SourceFilter) => void;
}) {
  const { newsItems } = useRuntimeData();
  const homeMode = route === "/";
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  const primaryItems = [navItems[0], navItems[1], navItems[2]];
  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of newsItems) {
      for (const source of item.sources) {
        counts.set(source, (counts.get(source) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [newsItems]);
  const filterItems = [
    {
      id: "vi" as const,
      label: "Tin Việt Nam",
      icon: Newspaper,
      count: newsItems.filter((item) => item.originalLanguage !== "en").length,
    },
    {
      id: "international" as const,
      label: "Tin quốc tế",
      icon: Globe2,
      count: newsItems.filter((item) => item.originalLanguage === "en").length,
    },
    {
      id: "official" as const,
      label: "Nguồn chính thức",
      icon: ShieldCheck,
      count: newsItems.filter((item) =>
        item.sourceDetails?.some((source) => source.isOfficialSource),
      ).length,
    },
    { id: "rss" as const, label: "Tất cả RSS", icon: Rss, count: newsItems.length },
  ];
  const renderNav = (items: typeof navItems) =>
    items.map((item) => {
      const Icon = item.icon;
      const active =
        route === item.href || (item.href !== "/" && route.startsWith(item.href));
      return (
        <Link key={item.href} href={item.href} className={active ? "active" : ""}>
          <Icon size={18} />
          <span>{item.label}</span>
        </Link>
      );
    });

  return (
    <>
      <div className={`drawer-backdrop ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`app-sidebar ${open ? "open" : ""}`} inert={isMobile && !open}>
        <Link className="brand" href="/" aria-label="NewsPeek — Trang chủ">
          <span className="brand-symbol"><span /></span>
          <span>NEWS<b>PEEK</b></span>
        </Link>
        <button className="sidebar-close" onClick={onClose} aria-label="Đóng menu">
          <X size={20} />
        </button>
        <nav aria-label="Điều hướng chính">
          {renderNav(homeMode ? primaryItems : navItems)}
        </nav>
        <div className="sidebar-section">
          <span>Chuyên mục</span>
          {NEWS_CATEGORIES.map((category) => (
            <Link
              href={`/category/${category.slug}`}
              key={category.slug}
              className={route === `/category/${category.slug}` ? "active" : ""}
            >
              <span className="source-logo">{getInitials(category.label)}</span>
              <span>{category.label}</span>
            </Link>
          ))}
        </div>
        {homeMode ? (
          <>
            <div className="sidebar-section source-filter-section">
              <span><ListFilter size={13} />Lọc bảng tin</span>
              {filterItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    type="button"
                    className={sourceFilter === item.id ? "active" : ""}
                    key={item.id}
                    onClick={() =>
                      onSourceFilter(sourceFilter === item.id ? "all" : item.id)
                    }
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                    <em>{item.count}</em>
                  </button>
                );
              })}
            </div>
            <div className="sidebar-section followed-sources">
              <span>Nguồn cập nhật nhiều</span>
              {sourceCounts.map(([source, count]) => (
                <Link href="/sources" key={source}>
                  <span className="source-logo">{getInitials(source)}</span>
                  <span>{source}</span>
                  <em>{count} tin</em>
                </Link>
              ))}
            </div>
          </>
        ) : null}
        <div className="sidebar-bottom">
          <Link href="/bookmarks"><Bookmark size={18} />Tin đã lưu</Link>
          <Link href="/settings"><Settings size={18} />Cài đặt</Link>
          <Link href="/sources"><ShieldCheck size={18} />Nguồn tin</Link>
        </div>
      </aside>
    </>
  );
}

export function Header({
  onMenu,
  onSearch,
  theme,
  onTheme,
}: {
  onMenu: () => void;
  onSearch: () => void;
  theme: string;
  onTheme: () => void;
}) {
  return (
    <header className="app-header">
      <button className="menu-button" onClick={onMenu} aria-label="Mở menu">
        <Menu size={22} />
      </button>
      <button className="search-trigger" onClick={onSearch}>
        <Newspaper size={18} />
        <span>Tìm tin tức, chủ đề hoặc nguồn...</span>
        <kbd><Command size={12} />K</kbd>
      </button>
      <div className="header-actions">
        <button className="icon-button" onClick={onTheme} aria-label="Đổi giao diện">
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <Link className="icon-button notification-button" href="/settings" aria-label="Mở cài đặt thông báo">
          <Bell size={19} /><i />
        </Link>
        <Link className="login-button" href="/login">
          <CircleUserRound size={18} /><span>Đăng nhập</span>
        </Link>
      </div>
    </header>
  );
}

export function MobileNavigation({ route }: { route: string }) {
  const items = [
    navItems[0],
    navItems[1],
    navItems[2],
    navItems[4],
    { href: "/settings", label: "Cài đặt", icon: Settings },
  ];
  return (
    <nav className="mobile-nav" aria-label="Điều hướng di động">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={route === item.href ? "active" : ""}>
            <Icon size={20} /><span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SystemStatusBanner() {
  const { health, loading } = useRuntimeData();
  if (loading || health.state === "operational") return null;
  const message =
    health.state === "stale"
      ? "Một số nguồn đang chậm; NewsPeek vẫn hiển thị bản tổng hợp gần nhất."
      : "Một số nguồn đang được kết nối lại; nội dung sẵn có vẫn đọc bình thường.";
  return (
    <div className={`demo-bar status-banner ${health.state}`} role="status">
      <span className="status-banner-label"><ShieldCheck size={14} />Dữ liệu đang cập nhật</span>
      <span className="service-status"><i />{message}</span>
    </div>
  );
}

export function AppFooter({ compact = false }: { compact?: boolean }) {
  const { health, loading } = useRuntimeData();
  const statusText = loading
    ? "Đang đồng bộ dữ liệu"
    : health.state === "operational"
      ? "Nguồn tin đang hoạt động"
      : health.state === "stale"
        ? "Đang hiển thị dữ liệu gần nhất"
        : "Một số nguồn đang cập nhật";
  const statusClass: HealthState | "loading" = loading ? "loading" : health.state;
  if (compact) {
    return (
      <footer className="app-footer compact-footer">
        <div>
          <span>© 2026 NewsPeek</span>
          <Link href="/sources">Nguồn & phương pháp</Link>
          <Link href="/privacy">Quyền riêng tư</Link>
        </div>
        <span className={`footer-data-status ${statusClass}`}><i />{statusText}</span>
      </footer>
    );
  }
  return (
    <footer className="app-footer">
      <div>
        <div className="brand"><span className="brand-symbol"><span /></span><span>NEWS<b>PEEK</b></span></div>
        <p>Tin quan trọng từ Việt Nam và thế giới, được tổng hợp thông minh.</p>
      </div>
      <div>
        <strong>Chuyên mục</strong>
        <Link href="/category/viet-nam">Việt Nam</Link>
        <Link href="/category/the-gioi">Thế giới</Link>
        <Link href="/category/cong-nghe">Công nghệ</Link>
      </div>
      <div>
        <strong>Minh bạch</strong>
        <Link href="/sources">Nguồn tin</Link>
        <Link href="/copyright">Bản quyền</Link>
        <Link href="/privacy">Quyền riêng tư</Link>
      </div>
      <div>
        <strong>Trạng thái dữ liệu</strong>
        <span className={`footer-data-status ${statusClass}`}><i />{statusText}</span>
        <small>© 2026 NewsPeek Beta</small>
      </div>
    </footer>
  );
}
