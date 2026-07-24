"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  Bell,
  Bookmark,
  BookOpen,
  ChevronDown,
  CircleUserRound,
  Command,
  Globe2,
  ListFilter,
  Menu,
  Moon,
  Newspaper,
  Rss,
  Search,
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
import { newsIsInternational, newsIsVietnamese } from "@/lib/news/region";

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
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);
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
      count: newsItems.filter(newsIsVietnamese).length,
    },
    {
      id: "international" as const,
      label: "Tin quốc tế",
      icon: Globe2,
      count: newsItems.filter(newsIsInternational).length,
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
        <button
          className="icon-button"
          onClick={onTheme}
          aria-label={`Đổi giao diện: ${theme === "dark" ? "Chuyển sang Sáng" : theme === "light" ? "Chuyển sang Giấy ấm" : "Chuyển sang Tối"}`}
          title={`Giao diện: ${theme === "dark" ? "Tối" : theme === "light" ? "Sáng" : "Giấy ấm"}`}
        >
          {theme === "dark" ? <Sun size={19} /> : theme === "light" ? <BookOpen size={19} /> : <Moon size={19} />}
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

const editorialPrimaryNav = [
  { href: "/news", label: "Mới nhất" },
  { href: "/category/viet-nam", label: "Việt Nam" },
  { href: "/category/the-gioi", label: "Thế giới" },
  { href: "/category/kinh-te", label: "Kinh tế" },
  { href: "/category/cong-nghe", label: "Công nghệ" },
];

const isRouteActive = (route: string, href: string) =>
  route === href || (href !== "/" && route.startsWith(href));

export function EditorialHeader({
  route,
  onMenu,
  onSearch,
  theme,
  onTheme,
}: {
  route: string;
  onMenu: () => void;
  onSearch: () => void;
  theme: string;
  onTheme: () => void;
}) {
  const secondaryCategories = NEWS_CATEGORIES.filter(
    (category) =>
      !editorialPrimaryNav.some((item) => item.href === `/category/${category.slug}`),
  );
  return (
    <header className="editorial-header">
      <div className="editorial-header-inner">
        <button className="mobile-menu-button" onClick={onMenu} aria-label="Mở menu">
          <Menu size={21} />
        </button>
        <Link className="editorial-brand" href="/" aria-label="NewsPeek — Trang chủ">
          <span className="editorial-brand-mark" aria-hidden="true">N</span>
          <span>NewsPeek</span>
        </Link>
        <nav className="desktop-navigation" aria-label="Điều hướng tin tức">
          {editorialPrimaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isRouteActive(route, item.href) ? "active" : ""}
            >
              {item.label}
            </Link>
          ))}
          <details className="category-menu">
            <summary>
              Chuyên mục <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <div className="category-menu-panel">
              {secondaryCategories.map((category) => (
                <Link
                  href={`/category/${category.slug}`}
                  key={category.slug}
                  className={route === `/category/${category.slug}` ? "active" : ""}
                >
                  {category.label}
                </Link>
              ))}
              <span className="category-menu-divider" />
              <Link href="/sources">Nguồn tin & phương pháp</Link>
            </div>
          </details>
        </nav>
        <div className="editorial-header-actions">
          <button className="header-search-button" onClick={onSearch} aria-label="Tìm kiếm tin tức">
            <Search size={19} />
            <span>Tìm kiếm</span>
            <kbd><Command size={11} />K</kbd>
          </button>
          <Link className="header-action-button saved-link" href="/bookmarks" aria-label="Mở tin đã lưu">
            <Bookmark size={19} />
            <span>Đã lưu</span>
          </Link>
          <button
            className="header-action-button theme-button"
            onClick={onTheme}
            aria-label={`Đổi giao diện, hiện tại: ${theme === "light" ? "Sáng" : theme === "dark" ? "Tối" : "Theo hệ thống"}`}
            title="Đổi giao diện"
          >
            {theme === "light" ? <Moon size={19} /> : theme === "dark" ? <Sun size={19} /> : <BookOpen size={19} />}
          </button>
          <Link className="editorial-login" href="/login">
            <CircleUserRound size={19} />
            <span>Đăng nhập</span>
          </Link>
          <button className="mobile-search-button" onClick={onSearch} aria-label="Tìm kiếm">
            <Search size={21} />
          </button>
        </div>
      </div>
    </header>
  );
}

export function EditorialDrawer({
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
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);
  return (
    <>
      <div className={`drawer-backdrop editorial-drawer-backdrop ${open ? "show" : ""}`} onClick={onClose} />
      <aside className={`editorial-drawer ${open ? "open" : ""}`} inert={!open} aria-label="Menu NewsPeek">
        <div className="editorial-drawer-heading">
          <Link className="editorial-brand" href="/" onClick={onClose}>
            <span className="editorial-brand-mark" aria-hidden="true">N</span>
            <span>NewsPeek</span>
          </Link>
          <button onClick={onClose} aria-label="Đóng menu"><X size={21} /></button>
        </div>
        <nav aria-label="Điều hướng chính">
          <Link href="/" onClick={onClose} className={route === "/" ? "active" : ""}>Trang chủ</Link>
          {editorialPrimaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={isRouteActive(route, item.href) ? "active" : ""}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="editorial-drawer-section">
          <strong>Chuyên mục khác</strong>
          <div className="drawer-category-grid">
            {NEWS_CATEGORIES.filter(
              (category) =>
                !editorialPrimaryNav.some((item) => item.href === `/category/${category.slug}`),
            ).map((category) => (
              <Link href={`/category/${category.slug}`} key={category.slug} onClick={onClose}>
                {category.label}
              </Link>
            ))}
          </div>
        </div>
        {route === "/" && (
          <div className="editorial-drawer-section">
            <strong>Lọc nhanh trang chủ</strong>
            <div className="drawer-filter-list">
              {[
                ["all", "Tất cả tin"],
                ["vi", "Tin Việt Nam"],
                ["international", "Tin quốc tế"],
                ["official", "Có nguồn chính thức"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={sourceFilter === id ? "active" : ""}
                  onClick={() => {
                    onSourceFilter(id as SourceFilter);
                    onClose();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="editorial-drawer-utility">
          <Link href="/sources" onClick={onClose}><ShieldCheck size={18} />Nguồn tin</Link>
          <Link href="/bookmarks" onClick={onClose}><Bookmark size={18} />Tin đã lưu</Link>
          <Link href="/settings" onClick={onClose}><Settings size={18} />Cài đặt</Link>
        </div>
      </aside>
    </>
  );
}

export function EditorialMobileNavigation({ route }: { route: string }) {
  const items = [
    navItems[0],
    navItems[1],
    navItems[2],
    { href: "/bookmarks", label: "Đã lưu", icon: Bookmark },
  ];
  return (
    <nav className="editorial-mobile-nav" aria-label="Điều hướng di động">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isRouteActive(route, item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <Icon size={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
