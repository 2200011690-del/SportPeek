"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Command, Search, Tag } from "lucide-react";
import { useRuntimeData } from "@/components/runtime/RuntimeDataContext";
import { SectionHeading, DataLoadingState, EmptyState } from "@/components/ui/badges";
import { NewsListItem } from "@/components/pages/NewsPage";
import { NEWS_CATEGORIES } from "@/lib/news/categories";
import { filterNewsItems, normalizeSearchText } from "@/lib/ui-logic";
import type { NewsItem, NewsSourceCatalogItem } from "@/lib/types";
import type { SearchSuggestion } from "@/lib/search/suggestions";

type SearchResults = {
  news: NewsItem[];
  categories: Array<(typeof NEWS_CATEGORIES)[number]>;
  sources: NewsSourceCatalogItem[];
  suggestions: SearchSuggestion[];
};

type SearchState =
  | { query: string; status: "loading" | "error"; results: null }
  | { query: string; status: "success"; results: SearchResults };

export default function SearchPage() {
  const { newsItems, loading, sourceCatalog } = useRuntimeData();
  const [query, setQuery] = useState("");
  const normalized = normalizeSearchText(query);
  const queryKey = query.trim();
  const [searchState, setSearchState] = useState<SearchState | null>(null);
  const currentSearch = searchState?.query === queryKey ? searchState : null;
  const remoteResults =
    currentSearch?.status === "success" ? currentSearch.results : null;
  const searching = currentSearch?.status === "loading";
  const searchError = currentSearch?.status === "error";
  const localNewsResults =
    normalized.length >= 2 ? filterNewsItems(newsItems, { query }) : [];
  const localCategoryResults =
    normalized.length >= 2
      ? NEWS_CATEGORIES.filter((category) =>
          normalizeSearchText(category.label).includes(normalized),
        )
      : [];
  const localSourceResults =
    normalized.length >= 2
      ? sourceCatalog.filter((source) =>
          normalizeSearchText(source.name).includes(normalized),
        )
      : [];
  const newsResults = remoteResults?.news ?? localNewsResults;
  const categoryResults = remoteResults?.categories ?? localCategoryResults;
  const sourceResults = remoteResults?.sources ?? localSourceResults;
  const total = newsResults.length + categoryResults.length + sourceResults.length;

  useEffect(() => {
    if (normalized.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState({ query: queryKey, status: "loading", results: null });
      try {
        const response = await fetch(
          `/api/search?${new URLSearchParams({ q: queryKey, type: "all" })}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Search request failed");
        const payload = await response.json() as Partial<SearchResults>;
        if (controller.signal.aborted) return;
        setSearchState({
          query: queryKey,
          status: "success",
          results: {
            news: Array.isArray(payload.news) ? payload.news : [],
            categories: Array.isArray(payload.categories) ? payload.categories : [],
            sources: Array.isArray(payload.sources) ? payload.sources : [],
            suggestions: Array.isArray(payload.suggestions) ? payload.suggestions : [],
          },
        });
      } catch {
        if (!controller.signal.aborted) {
          setSearchState({ query: queryKey, status: "error", results: null });
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, queryKey]);

  return (
    <div className="page-content">
      <PageHero
        eyebrow="TÌM KIẾM"
        title="Tìm trong dòng tin"
        description="Tìm bài viết, chuyên mục và nguồn tin Việt Nam hoặc quốc tế trong cùng một nơi."
      />
      <label className="search-page-input">
        <Search size={22} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nhập ít nhất 2 ký tự..."
          aria-label="Từ khóa tìm kiếm"
        />
        <kbd><Command size={12} />K</kbd>
      </label>
      {remoteResults?.suggestions.length ? (
        <div className="search-suggestions" aria-label="Gợi ý tìm kiếm">
          <span>Gợi ý:</span>
          {remoteResults.suggestions.map((suggestion) => suggestion.href ? (
            <Link href={suggestion.href} key={`${suggestion.type}-${suggestion.label}`}>
              {suggestion.label}
            </Link>
          ) : (
            <button
              type="button"
              key={`${suggestion.type}-${suggestion.label}`}
              onClick={() => setQuery(suggestion.label)}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="sr-only" role="status" aria-live="polite">
        {searching
          ? "Đang tìm trong toàn bộ kho tin."
          : normalized.length >= 2
            ? `Đã tìm thấy ${total} kết quả.`
            : ""}
      </div>
      {searchError ? (
        <p className="search-fallback-notice">
          Không thể tìm toàn bộ kho tin lúc này; đang hiển thị kết quả gần nhất đã tải.
        </p>
      ) : null}
      {loading ? (
        <DataLoadingState />
      ) : normalized.length < 2 ? (
        <div className="large-empty compact-empty">
          <EmptyState title="Nhập từ khóa để bắt đầu" description="Có thể tìm theo nội dung, chuyên mục hoặc tên nguồn tin." />
        </div>
      ) : total ? (
        <div className="search-sections">
          {categoryResults.length > 0 && (
            <section>
              <SectionHeading eyebrow="CHUYÊN MỤC" title={`${categoryResults.length} kết quả`} />
              <div className="entity-chips result-chips">
                {categoryResults.map((category) => (
                  <Link href={`/category/${category.slug}`} key={category.slug}>
                    <Tag size={15} />{category.label}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {sourceResults.length > 0 && (
            <section>
              <SectionHeading eyebrow="NGUỒN TIN" title={`${sourceResults.length} kết quả`} />
              <div className="entity-chips result-chips">
                {sourceResults.slice(0, 12).map((source) => (
                  <Link href="/sources" key={source.id}>
                    <span className="source-avatar">
                      {source.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    {source.name}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {newsResults.length > 0 && (
            <section>
              <SectionHeading eyebrow="TIN TỨC" title={`${newsResults.length} kết quả`} />
              <div className="news-stack">
                {newsResults.slice(0, 30).map((item) => <NewsListItem item={item} key={item.id} />)}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="large-empty compact-empty">
          <EmptyState title="Không tìm thấy kết quả" description={`Không có dữ liệu phù hợp với “${query.trim()}”.`} />
        </div>
      )}
    </div>
  );
}

function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-hero">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
    </div>
  );
}
