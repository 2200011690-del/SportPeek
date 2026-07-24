"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Command, Search, Tag } from "lucide-react";
import { useRuntimeData } from "@/components/runtime/RuntimeDataContext";
import { SectionHeading, DataLoadingState, EmptyState } from "@/components/ui/badges";
import { NewsListItem } from "@/components/pages/NewsPage";
import { NEWS_CATEGORIES } from "@/lib/news/categories";
import { filterNewsItems, normalizeSearchText } from "@/lib/ui-logic";

export default function SearchPage() {
  const { newsItems, loading, sourceCatalog } = useRuntimeData();
  const [query, setQuery] = useState("");
  const normalized = normalizeSearchText(query);
  const newsResults = normalized.length >= 2 ? filterNewsItems(newsItems, { query }) : [];
  const categoryResults =
    normalized.length >= 2
      ? NEWS_CATEGORIES.filter((category) =>
          normalizeSearchText(category.label).includes(normalized),
        )
      : [];
  const sourceResults =
    normalized.length >= 2
      ? sourceCatalog.filter((source) =>
          normalizeSearchText(source.name).includes(normalized),
        )
      : [];
  const total = newsResults.length + categoryResults.length + sourceResults.length;

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
