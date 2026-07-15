"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { EmptyState } from "@/components/ui/badges";
import { fetchStoryDetail, loadingStoryReaderState, type StoryReaderState } from "@/lib/stories/client";
import { isSafeExternalUrl } from "@/lib/stories/schema";

export default function RichNewsDetail({ slug }: { slug: string; bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const [readerResult, setReaderResult] = useState<{ slug: string; reloadToken: number; state: StoryReaderState }>({ slug: "", reloadToken: -1, state: loadingStoryReaderState });
  const readerState = readerResult.slug === slug && readerResult.reloadToken === reloadToken ? readerResult.state : loadingStoryReaderState;

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
      const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);
      if (durationSeconds < 5) return;
      void fetch("/api/reading-history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storyId: activeStoryId, durationSeconds }), keepalive: true }).catch(() => { /* Anonymous mode has no reading history. */ });
    };
    const timer = window.setInterval(persist, 30_000);
    return () => { window.clearInterval(timer); persist(); };
  }, [activeStoryId]);

  if (readerState.status === "idle" || readerState.status === "loading") {
    return <div className="article-page simple-news-detail story-reader-skeleton" aria-busy="true" aria-label="Đang tải bài viết"><div className="story-skeleton-line wide" /><div className="story-skeleton-line title" /><div className="story-skeleton-line title short" /><div className="story-skeleton-summary" /></div>;
  }

  if (!readerState.data) {
    const isNotFound = readerState.status === "not_found";
    return <div className="article-page story-state-panel"><EmptyState title={isNotFound ? "Không tìm thấy bài viết" : readerState.status === "configuration_required" ? "Chưa cấu hình nguồn tin thật" : "Không thể tải bài viết"} description={readerState.message ?? "Không thể tải bài viết lúc này."} /><div className="story-state-actions">{!isNotFound && <button className="primary-button" onClick={() => setReloadToken((value) => value + 1)}>Thử lại</button>}<Link className="secondary-button" href="/news">Quay lại tin tức</Link></div></div>;
  }

  const { story } = readerState.data;
  const summaryParagraphs = story.summaryLong.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  if (!summaryParagraphs.length) summaryParagraphs.push(story.summary);
  const sourceLinks = [...new Map(story.articles
    .filter((article) => isSafeExternalUrl(article.originalUrl))
    .map((article) => [article.originalUrl, article])).values()];

  return <main className="article-page simple-news-detail">
    <Link className="simple-news-back" href="/news">← Quay lại tin tức</Link>
    <article>
      <header><h1>{story.title}</h1></header>
      <section className="simple-news-summary" aria-labelledby="full-summary-heading">
        <h2 id="full-summary-heading">Tóm tắt đầy đủ</h2>
        <div>{summaryParagraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 40)}`}>{paragraph}</p>)}</div>
      </section>
      <section className="simple-news-sources" aria-labelledby="source-links-heading">
        <h2 id="source-links-heading">Nguồn bài viết</h2>
        {sourceLinks.length ? <ul>{sourceLinks.map((article, index) => <li key={article.originalUrl}><a href={article.originalUrl} target="_blank" rel="noopener noreferrer"><span>Nguồn {index + 1}: {article.sourceName}</span><ExternalLink size={16} aria-hidden="true" /></a></li>)}</ul> : <p>Chưa có liên kết nguồn hợp lệ.</p>}
      </section>
    </article>
  </main>;
}
