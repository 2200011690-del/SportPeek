"use client";

import React from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { useRuntimeData } from "@/components/SportPeekApp";
import { DataLoadingState, EmptyState } from "@/components/ui/badges";
import { NewsCard } from "@/components/pages/NewsPage";

export default function BookmarksPage({ bookmarks, onBookmark }: { bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, loading } = useRuntimeData();
  const items = newsItems.filter((item) => bookmarks.has(item.id));
  return <div className="page-content"><PageHero eyebrow="THƯ VIỆN CÁ NHÂN" title="Tin đã lưu" description="Các bản tin được lưu theo tài khoản nội bộ của bạn."><Bookmark size={22} /></PageHero>{loading ? <DataLoadingState /> : items.length ? <div className="news-page-grid">{items.map((item) => <NewsCard key={item.id} item={item} bookmarked onBookmark={onBookmark} />)}</div> : <div className="large-empty"><EmptyState title="Chưa có tin nào được lưu" description="Nhấn biểu tượng dấu trang trên một bản tin để lưu vào đây." /><Link href="/news" className="primary-button">Khám phá tin mới</Link></div>}</div>;
}

function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-hero"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
