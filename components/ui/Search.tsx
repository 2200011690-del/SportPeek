"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  Command,
  Flame,
  Search,
  Tag,
  X,
} from "lucide-react";
import { useRuntimeData } from "@/components/runtime/RuntimeDataContext";
import { EmptyState } from "@/components/ui/badges";
import { NEWS_CATEGORIES } from "@/lib/news/categories";
import { filterNewsItems, normalizeSearchText } from "@/lib/ui-logic";

type FilterBarProps = {
  search?: boolean;
  query?: string;
  onQueryChange?: (value: string) => void;
  category?: string;
  onCategoryChange?: (value: string) => void;
  categoryOptions?: string[];
  source?: string;
  onSourceChange?: (value: string) => void;
  sourceOptions?: string[];
  minHotness?: number;
  onMinHotnessChange?: (value: number) => void;
};

export function FilterBar({
  search = false,
  query = "",
  onQueryChange,
  category = "",
  onCategoryChange,
  categoryOptions = [],
  source = "",
  onSourceChange,
  sourceOptions = [],
  minHotness = 0,
  onMinHotnessChange,
}: FilterBarProps) {
  return (
    <div className="filter-bar">
      {search && (
        <label className="inline-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            placeholder="Tìm trong bảng tin..."
            aria-label="Tìm trong bảng tin"
          />
        </label>
      )}
      {onCategoryChange && (
        <label className="filter-select">
          <Tag size={16} />
          <select value={category} onChange={(event) => onCategoryChange(event.target.value)} aria-label="Lọc theo chuyên mục">
            <option value="">Tất cả chuyên mục</option>
            {categoryOptions.map((option) => <option value={option} key={option}>{option}</option>)}
          </select>
          <ChevronDown size={15} />
        </label>
      )}
      {onSourceChange && (
        <label className="filter-select">
          <Building2 size={16} />
          <select value={source} onChange={(event) => onSourceChange(event.target.value)} aria-label="Lọc theo nguồn tin">
            <option value="">Tất cả nguồn</option>
            {sourceOptions.map((option) => <option value={option} key={option}>{option}</option>)}
          </select>
          <ChevronDown size={15} />
        </label>
      )}
      {onMinHotnessChange && (
        <label className="filter-select">
          <Flame size={16} />
          <select value={minHotness} onChange={(event) => onMinHotnessChange(Number(event.target.value))} aria-label="Lọc theo độ nổi bật">
            <option value={0}>Mọi mức độ</option>
            <option value={50}>Từ 50 điểm</option>
            <option value={70}>Từ 70 điểm</option>
            <option value={85}>Từ 85 điểm</option>
          </select>
          <ChevronDown size={15} />
        </label>
      )}
    </div>
  );
}

export function SearchCommand({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const { newsItems, sourceCatalog } = useRuntimeData();
  const results = useMemo(() => {
    const normalized = normalizeSearchText(query);
    if (normalized.length < 2) return [];
    return [
      ...filterNewsItems(newsItems, { query }).slice(0, 8).map((item) => ({
        label: item.title,
        href: `/news/${item.slug}`,
        type: "Tin tức",
      })),
      ...NEWS_CATEGORIES.filter((category) =>
        normalizeSearchText(category.label).includes(normalized),
      ).map((category) => ({
        label: category.label,
        href: `/category/${category.slug}`,
        type: "Chuyên mục",
      })),
      ...sourceCatalog
        .filter((source) => normalizeSearchText(source.name).includes(normalized))
        .slice(0, 4)
        .map((source) => ({ label: source.name, href: "/sources", type: "Nguồn tin" })),
    ];
  }, [query, newsItems, sourceCatalog]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="command-backdrop" onMouseDown={onClose}>
      <div className="command-dialog" role="dialog" aria-modal="true" aria-label="Tìm kiếm" onMouseDown={(event) => event.stopPropagation()}>
        <div className="command-input">
          <Search size={20} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập ít nhất 2 ký tự..." aria-label="Nội dung tìm kiếm" />
          <button onClick={onClose} aria-label="Đóng tìm kiếm"><X size={19} /></button>
        </div>
        <div className="command-results">
          {normalizeSearchText(query).length < 2 ? (
            <div className="command-hint"><Command size={28} /><p>Tìm trên tin tức, chuyên mục và nguồn tin.</p></div>
          ) : results.length ? (
            results.map((result) => (
              <Link key={`${result.type}-${result.href}-${result.label}`} href={result.href} onClick={onClose}>
                <span>{result.label}</span><small>{result.type}</small>
              </Link>
            ))
          ) : (
            <EmptyState title="Không tìm thấy kết quả" description="Thử từ khóa khác hoặc kiểm tra lại chính tả." />
          )}
        </div>
        <div className="command-footer"><span>Nhấp vào kết quả để mở</span><span>Esc để đóng</span></div>
      </div>
    </div>
  );
}
