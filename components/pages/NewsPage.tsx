"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Check,
  Layers,
  Sparkles,
} from "lucide-react";
import { useRuntimeData } from "@/components/runtime/RuntimeDataContext";
import {
  NewsVisual,
  SectionHeading,
  DataLoadingState,
  EmptyState,
  Pagination,
} from "@/components/ui/badges";
import {
  conciseNewsSummary,
  independentSourceCount,
  newsStatusLabel,
  newsTimeLabel,
  rankFeaturedNews,
  sortLatestNews,
} from "@/components/news/news-presenter";
import { FilterBar } from "@/components/ui/Search";
import {
  filterNewsItems,
  paginateItems,
  personalizedNewsItems,
} from "@/lib/ui-logic";
import { matchesNewsCategory, newsCategory } from "@/lib/news/categories";
import type { NewsItem } from "@/lib/types";

type NewsFeedView = "featured" | "latest";

export function NewsCard({
  item,
  featured = false,
  bookmarked,
  onBookmark,
}: {
  item: NewsItem;
  featured?: boolean;
  bookmarked: boolean;
  onBookmark: (id: string) => void;
}) {
  const sourceCount = independentSourceCount(item);
  const articleCount = item.sourceDetails?.length ?? sourceCount;
  const officialCount =
    item.sourceDetails?.filter((source) => source.isOfficialSource).length ?? 0;
  return (
    <article className={`news-card ${featured ? "featured" : ""}`}>
      <Link
        href={`/news/${item.slug}`}
        className="card-link"
        aria-label={`Mở tin: ${item.title}`}
      />
      <NewsVisual item={item} />
      <div className="news-card-body">
        <div className="meta-row">
          <span
            className={`story-status story-status-${item.storyStatus ?? "reported"}`}
          >
            {newsStatusLabel(item)}
          </span>
          <span>{newsTimeLabel(item)}</span>
        </div>
        <h3>{item.title}</h3>
        <p>{conciseNewsSummary(item)}</p>
        {item.personalization?.reasons.length ? (
          <div className="why-recommended">
            <Sparkles size={14} />
            <span>
              <strong>Vì sao bạn thấy tin này</strong>
              {item.personalization.reasons.join(" · ")}
            </span>
          </div>
        ) : null}
        <div className="news-card-footer">
          <span className="source-line">
            <span className="source-avatar">NP</span>
            {articleCount} bài · {sourceCount} nguồn độc lập
            {officialCount ? ` · ${officialCount} chính thức` : ""}
          </span>
          <button
            type="button"
            className={`icon-button ${bookmarked ? "active" : ""}`}
            onClick={(event) => {
              event.preventDefault();
              onBookmark(item.id);
            }}
            aria-label={bookmarked ? "Bỏ lưu tin" : "Lưu tin"}
          >
            <Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function NewsListItem({ item }: { item: NewsItem }) {
  return (
    <article className="news-list-item">
      <NewsVisual item={item} compact />
      <div>
        <div className="meta-row">
          <span className="category-label">{item.category}</span>
          <span>{newsTimeLabel(item)}</span>
        </div>
        <Link href={`/news/${item.slug}`}>
          <h3>{item.title}</h3>
        </Link>
        <div className="list-badges">
          <span
            className={`story-status story-status-${item.storyStatus ?? "reported"}`}
          >
            {newsStatusLabel(item)}
          </span>
          <span className="source-count-compact">
            {independentSourceCount(item)} nguồn
          </span>
        </div>
      </div>
    </article>
  );
}

export function NewsPage({
  bookmarks,
  onBookmark,
  categorySlug,
}: {
  bookmarks: Set<string>;
  onBookmark: (id: string) => void;
  categorySlug?: string;
}) {
  const { newsItems, newsReal, newsSources, loading } = useRuntimeData();
  const routeCategory = newsCategory(categorySlug);
  const [feedView, setFeedView] = useState<NewsFeedView>("featured");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [minHotness, setMinHotness] = useState(0);
  const [page, setPage] = useState(1);
  const [archiveItems, setArchiveItems] = useState<NewsItem[]>([]);
  const [archivePagination, setArchivePagination] = useState({
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
  });
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState(false);
  const categoryItems = categorySlug
    ? newsItems.filter((item) => matchesNewsCategory(item, categorySlug))
    : newsItems;
  const orderedItems =
    feedView === "featured"
      ? rankFeaturedNews(categoryItems)
      : sortLatestNews(categoryItems);
  const searched = filterNewsItems(orderedItems, {
    query,
    minHotness,
  });
  const filtered = searched.filter(
    (item) =>
      (!category || item.category === category) &&
      (!source || item.sources.includes(source)),
  );
  const localPagination = paginateItems(filtered, page, 12);
  const filtersActive = Boolean(
    categorySlug || query.trim() || category || source || minHotness > 0,
  );
  const usesArchive = feedView === "latest";
  const archiveCategory = category || routeCategory?.label || "";
  const updateFilter =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      if (feedView === "latest") setArchiveLoading(true);
      setPage(1);
    };
  const categoryOptions = [...new Set(newsItems.map((item) => item.category))]
    .filter(Boolean)
    .sort();
  const sourceOptions = [...new Set(newsItems.flatMap((item) => item.sources))]
    .filter(Boolean)
    .sort();
  useEffect(() => {
    if (!usesArchive) return;
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(page), pageSize: "12" });
      if (query.trim()) params.set("q", query.trim());
      if (archiveCategory) params.set("category", archiveCategory);
      if (source) params.set("source", source);
      if (minHotness > 0) params.set("minHotness", String(minHotness));
      setArchiveLoading(true);
      void fetch(`/api/news/archive?${params.toString()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json() as Promise<{
            data: NewsItem[];
            pagination: {
              page: number;
              pageSize: number;
              total: number;
              totalPages: number;
            };
          }>;
        })
        .then((response) => {
          if (active) {
            setArchiveItems(response.data);
            setArchivePagination(response.pagination);
            setArchiveError(false);
          }
        })
        .catch(() => {
          if (active) setArchiveError(true);
        })
        .finally(() => {
          if (active) setArchiveLoading(false);
        });
    }, query.trim() ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [archiveCategory, minHotness, page, query, source, usesArchive]);
  const displayedItems = usesArchive ? archiveItems : localPagination.items;
  const displayedPage = usesArchive
    ? archivePagination.page
    : localPagination.page;
  const displayedTotalPages = usesArchive
    ? archivePagination.totalPages
    : localPagination.totalPages;
  const changePage = (nextPage: number) => {
    if (usesArchive) setArchiveLoading(true);
    setPage(nextPage);
  };
  const changeFeedView = (view: NewsFeedView) => {
    if (view === "latest") setArchiveLoading(true);
    setFeedView(view);
    setPage(1);
  };
  const isLoadingNews = usesArchive ? archiveLoading : loading;
  const resultSummary = usesArchive
    ? `Kho tin có ${archivePagination.total} bài · Trang ${archivePagination.page}/${archivePagination.totalPages}`
    : `${feedView === "featured" ? "Nổi bật" : "Mới nhất"} · Hiển thị ${displayedItems.length} trong ${filtered.length} tin${filtersActive ? " phù hợp" : ""}`;
  return (
    <div className="page-content">
      <PageHero
        eyebrow={routeCategory ? "CHUYÊN MỤC" : "NEWSROOM"}
        title={routeCategory ? `Tin ${routeCategory.label}` : "Tin tức mới nhất"}
        description="Tin quan trọng từ Việt Nam và thế giới được gộp theo sự kiện, tóm tắt rõ ràng và luôn giữ liên kết về bài gốc."
      >
        <div className="hero-stat">
          <strong>{newsSources.length || newsItems.length}</strong>
          <span>
            {loading
              ? "đang kết nối"
              : newsReal
                ? "nguồn đang hoạt động"
                : "nguồn tạm gián đoạn"}
          </span>
        </div>
      </PageHero>
      <nav className="news-feed-tabs" aria-label="Chọn bảng tin">
        <button
          type="button"
          className={feedView === "featured" ? "active" : ""}
          aria-pressed={feedView === "featured"}
          onClick={() => changeFeedView("featured")}
        >
          <strong>Nổi bật</strong>
          <span>Quan trọng và đa nguồn</span>
        </button>
        <button
          type="button"
          className={feedView === "latest" ? "active" : ""}
          aria-pressed={feedView === "latest"}
          onClick={() => changeFeedView("latest")}
        >
          <strong>Mới nhất</strong>
          <span>Tin mới và cập nhật quan trọng</span>
        </button>
        <Link href="/for-you">
          <strong>Dành cho bạn</strong>
          <span>Nguồn và chủ đề bạn quan tâm</span>
          <ArrowRight size={16} />
        </Link>
      </nav>
      <div className="personalization-banner news-method-banner">
        <div className="ai-orb">
          <Layers size={22} />
        </div>
        <div>
          <strong>Gộp nhiều bài thành một câu chuyện</strong>
          <p>
            Thông tin trùng chỉ xuất hiện một lần; điểm chưa thống nhất và từng
            nguồn gốc được giữ riêng để đối chiếu.
          </p>
        </div>
        <Link href="/sources">
          Cách NewsPeek xử lý tin
          <ArrowRight size={15} />
        </Link>
      </div>
      <FilterBar
        search
        query={query}
        onQueryChange={updateFilter(setQuery)}
        category={category}
        onCategoryChange={updateFilter(setCategory)}
        categoryOptions={categoryOptions}
        source={source}
        onSourceChange={updateFilter(setSource)}
        sourceOptions={sourceOptions}
        minHotness={minHotness}
        onMinHotnessChange={updateFilter(setMinHotness)}
      />
      {isLoadingNews ? (
        <DataLoadingState
          label={
            filtersActive
              ? "Đang lọc tin mới"
              : usesArchive
                ? "Đang mở kho tin mới nhất"
                : "Đang chọn tin nổi bật"
          }
        />
      ) : displayedItems.length ? (
        <>
          <div className="results-summary" aria-live="polite">
            {resultSummary}
          </div>
          <div className="news-page-grid">
            {displayedItems.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                bookmarked={bookmarks.has(item.id)}
                onBookmark={onBookmark}
              />
            ))}
          </div>
          <Pagination
            page={displayedPage}
            totalPages={displayedTotalPages}
            onPageChange={changePage}
          />
        </>
      ) : (
        <EmptyState
          title={
            archiveError && usesArchive
              ? "Chưa mở được kho tin cũ"
              : newsReal
                ? "Không có tin phù hợp"
                : "Nguồn tin đang tạm gián đoạn"
          }
          description={
            archiveError && usesArchive
              ? "Hãy tải lại trang sau ít phút; các bài đã lưu không bị xoá."
              : newsReal
                ? "Hãy thử bỏ bớt bộ lọc hoặc dùng từ khóa khác."
                : "Hãy thử tải lại sau khi các nguồn tin hoạt động trở lại."
          }
        />
      )}
    </div>
  );
}

export function ForYouPage({
  followed,
  onFollow,
  bookmarks,
  onBookmark,
}: {
  followed: Set<string>;
  onFollow: (id: string, type?: "source") => void;
  bookmarks: Set<string>;
  onBookmark: (id: string) => void;
}) {
  const { newsItems, forYouItems, personalized, newsReal, loading, sourceCatalog } =
    useRuntimeData();
  const followedNames = sourceCatalog
    .filter((source) => followed.has(source.id))
    .map((source) => source.name);
  const recommendations = (
    forYouItems.length
      ? forYouItems
      : personalizedNewsItems(newsItems, followedNames)
  ).slice(0, 24);
  return (
    <div className="page-content">
      <PageHero
        eyebrow="CÁ NHÂN HÓA"
        title="Dành cho bạn"
        description="Xếp hạng bằng sở thích, nguồn, độ mới, độ nóng, độ tin cậy, lịch sử đọc và giới hạn lặp chủ đề."
      >
        <Link className="primary-button" href="/settings">
          <Sparkles size={17} />
          Tinh chỉnh sở thích
        </Link>
      </PageHero>
      <div className="personalization-banner">
        <div className="ai-orb">
          <Sparkles size={22} />
        </div>
        <div>
          <strong>
            {personalized
              ? followedNames.length
                ? `Đang dùng ${followedNames.length} nguồn bạn theo dõi và lịch sử tài khoản`
                : "Đang dùng sở thích và lịch sử tài khoản nội bộ"
              : newsReal
                ? "Chưa đăng nhập — đang xếp theo độ nóng và tin cậy"
                : "Nguồn tin đang tạm gián đoạn"}
          </strong>
          <p>
            Mỗi card giải thích lý do xuất hiện; diversity penalty tránh feed
            chỉ toàn một chủ đề hoặc một nguồn.
          </p>
        </div>
        <Link href="/bookmarks">
          Tin đã lưu
          <ArrowRight size={15} />
        </Link>
      </div>
      <section>
        <SectionHeading eyebrow="SỞ THÍCH" title="Chọn nguồn để ưu tiên" />
        <div className="follow-grid">
          {sourceCatalog.slice(0, 8).map((source) => (
            <div className="follow-card" key={source.id}>
              <span className="source-avatar">
                {source.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <div>
                <strong>{source.name}</strong>
                <span>{source.language === "en" ? "Quốc tế" : "Việt Nam"}</span>
              </div>
              <button
                className={followed.has(source.id) ? "following" : ""}
                onClick={() => onFollow(source.id, "source")}
              >
                {followed.has(source.id) ? (
                  <>
                    <Check size={15} />
                    Đang theo dõi
                  </>
                ) : (
                  <>+ Theo dõi</>
                )}
              </button>
            </div>
          ))}
        </div>
      </section>
      <section>
        <SectionHeading
          eyebrow={personalized ? "ĐÃ CÁ NHÂN HÓA" : "ĐANG THỊNH HÀNH"}
          title="Bảng tin đề xuất"
        />
        {loading ? (
          <DataLoadingState />
        ) : recommendations.length ? (
          <div className="news-page-grid">
            {recommendations.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                bookmarked={bookmarks.has(item.id)}
                onBookmark={onBookmark}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="Chưa có tin đề xuất"
            description="Không dùng dữ liệu giả khi nguồn RSS không khả dụng."
          />
        )}
      </section>
    </div>
  );
}

function PageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-hero">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
