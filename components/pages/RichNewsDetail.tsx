"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Check, ChevronRight, Clock3, ExternalLink, Flame, Share2, ShieldCheck, Sparkles } from "lucide-react";
import { HotnessBadge, ReliabilityBadge, NewsVisual, SectionHeading, EmptyState } from "@/components/ui/badges";
import { NewsListItem } from "@/components/pages/NewsPage";
import { fetchStoryDetail, loadingStoryReaderState, type StoryReaderState } from "@/lib/stories/client";
import { storyToNewsItem } from "@/lib/stories/presenter";
import { isSafeExternalUrl, type RawArticle, type StoryCluster } from "@/lib/stories/schema";

const storyStatusLabels: Record<StoryCluster["status"], string> = {
  official: "Nguồn chính thức",
  reported: "Nhiều nguồn đưa tin",
  rumor: "Tin đồn",
  unverified: "Chưa kiểm chứng",
  developing: "Đang phát triển",
  disputed: "Có điểm mâu thuẫn",
  completed: "Đã hoàn tất",
  correction: "Đính chính",
};

const getInitials = (name: string) => (name?.trim() || "TBD").split(" ").map((word) => word[0]).slice(-2).join("").toUpperCase();

function formatStoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

function StorySourceCard({ article, lead }: { article: RawArticle; lead: boolean }) {
  return <article className="story-source-card">
    <div className="story-source-heading"><span className="source-avatar">{getInitials(article.sourceName)}</span><div><strong>{article.sourceName}</strong><small>{formatStoryTime(article.publishedAt)} · {article.language === "en" ? "Tiếng Anh" : "Tiếng Việt"}</small></div></div>
    <div className="story-source-flags">{lead && <span>Nguồn đầu tiên</span>}{article.isOfficialSource && <span className="official">Nguồn chính thức</span>}{article.isSyndicated && <span>Bài dẫn lại</span>}</div>
    <h3>{article.title}</h3>
    {article.excerpt ? <p>{article.excerpt}</p> : <p className="muted-copy">Nguồn không cung cấp trích đoạn trong RSS.</p>}
    {isSafeExternalUrl(article.originalUrl) && <a href={article.originalUrl} target="_blank" rel="noopener noreferrer">Đọc bài gốc<ExternalLink size={14} /></a>}
  </article>;
}

export default function RichNewsDetail({ slug, bookmarks, onBookmark }: { slug: string; bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const [readerResult, setReaderResult] = useState<{ slug: string; reloadToken: number; state: StoryReaderState }>({ slug: "", reloadToken: -1, state: loadingStoryReaderState });
  const readerState = readerResult.slug === slug && readerResult.reloadToken === reloadToken ? readerResult.state : loadingStoryReaderState;
  const [activeTab, setActiveTab] = useState("summary");
  const [shareStatus, setShareStatus] = useState("");
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
      const durationSeconds = Math.floor((Date.now() - startedAt) / 1000); if (durationSeconds < 5) return;
      void fetch("/api/reading-history", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storyId: activeStoryId, durationSeconds }), keepalive: true }).catch(() => { /* Anonymous mode has no reading history. */ });
    };
    const timer = window.setInterval(persist, 30_000);
    return () => { window.clearInterval(timer); persist(); };
  }, [activeStoryId]);

  if (readerState.status === "idle" || readerState.status === "loading") {
    return <div className="article-page story-reader-skeleton" aria-busy="true" aria-label="Đang tải bài viết"><div className="story-skeleton-line wide" /><div className="story-skeleton-line title" /><div className="story-skeleton-line title short" /><div className="story-skeleton-media" /><div className="story-skeleton-grid"><div /><div /></div></div>;
  }
  if (!readerState.data) {
    const isNotFound = readerState.status === "not_found";
    return <div className="article-page story-state-panel"><EmptyState title={isNotFound ? "Không tìm thấy bài viết" : readerState.status === "configuration_required" ? "Chưa cấu hình nguồn tin thật" : "Không thể tải bài viết"} description={readerState.message ?? "Không thể tải bài viết lúc này."} /><div className="story-state-actions">{!isNotFound && <button className="primary-button" onClick={() => setReloadToken((value) => value + 1)}>Thử lại</button>}<Link className="secondary-button" href="/news">Quay lại feed</Link><Link href="/">Về trang chủ</Link></div></div>;
  }

  const { story, relatedStories } = readerState.data;
  const item = storyToNewsItem(story);
  const bookmarked = bookmarks.has(story.id);
  const readingBody = item.readingBody ?? [story.summary];
  const wordCount = story.summaryLong.split(/\s+/).filter(Boolean).length;
  const readingMinutes = Math.max(2, Math.ceil(wordCount / 210));
  const officialArticles = story.articles.filter((article) => article.isOfficialSource);
  const tabs = [
    { id: "summary", label: "Tóm tắt" },
    { id: "sources", label: "Tất cả bài nguồn" },
    ...(story.timeline.length ? [{ id: "timeline", label: "Dòng thời gian" }] : []),
    ...(story.agreedFacts.length ? [{ id: "facts", label: "Các điểm đã thống nhất" }] : []),
    ...(story.disputedPoints.length ? [{ id: "disputed", label: "Điểm còn mâu thuẫn" }] : []),
    ...(officialArticles.length ? [{ id: "official", label: "Nguồn chính thức" }] : []),
  ];
  const moveTabFocus = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    setActiveTab(next.id);
    document.getElementById(`story-tab-${next.id}`)?.focus();
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: item.title, url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
      setShareStatus("Đã sao chép liên kết");
    } catch { setShareStatus("Không thể chia sẻ lúc này"); }
  };

  return <div className="article-page rich-article-page story-reader-page">
    {readerState.status === "stale" && <div className="story-stale-banner" role="status"><Clock3 size={16} />{readerState.message}</div>}
    <div className="article-breadcrumb"><Link href="/news">Tin tức</Link><ChevronRight size={14} /><span>{item.competition}</span></div>
    <header className="article-header">
      <div className="article-badges"><span className={`story-status story-status-${story.status}`}>{storyStatusLabels[story.status]}</span>{story.aiGenerated ? <span className="demo-label">AI ĐÃ XỬ LÝ TRƯỚC</span> : <span className="demo-label neutral">CHƯA XỬ LÝ BỞI AI</span>}{story.hotnessScore !== null && <HotnessBadge score={story.hotnessScore} />}{story.reliabilityScore !== null && <ReliabilityBadge score={story.reliabilityScore} />}</div>
      <h1>{item.title}</h1>
      <p>{item.summary}</p>
      <div className="article-meta"><span className="source-avatar">SP</span><div><strong>SportPeek Newsroom</strong><span>Xuất bản {formatStoryTime(story.publishedAt)} · cập nhật {formatStoryTime(story.updatedAt)} · {story.articles.length} bài · {story.sourceCount} nguồn độc lập · {officialArticles.length} chính thức · {readingMinutes} phút đọc</span></div><div className="article-actions"><button onClick={() => onBookmark(story.id)} className={bookmarked ? "active" : ""}><Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} />{bookmarked ? "Đã lưu" : "Lưu"}</button><button onClick={share}><Share2 size={17} />Chia sẻ</button></div></div>
      {shareStatus && <p className="inline-status" role="status">{shareStatus}</p>}
    </header>
    <NewsVisual item={item} priority />
    <p className="article-image-caption">{item.imageUrl ? `Ảnh do ${item.imageSource ?? item.sources[0]} cung cấp qua RSS hoặc metadata bài gốc.` : "Nguồn hiện chưa cung cấp ảnh đại diện; SportPeek không dùng ảnh không liên quan để lấp chỗ trống."}</p>
    <div className="story-tabs" role="tablist" aria-label="Nội dung cụm tin">{tabs.map((tab, index) => <button type="button" role="tab" id={`story-tab-${tab.id}`} aria-controls={`story-panel-${tab.id}`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} className={activeTab === tab.id ? "active" : ""} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => moveTabFocus(event, index)} key={tab.id}>{tab.label}</button>)}</div>
    <div className="article-layout">
      <article className="article-body">
        <div role="tabpanel" id={`story-panel-${activeTab}`} aria-labelledby={`story-tab-${activeTab}`}>
          {activeTab === "summary" && <><div className="summary-box"><div className="summary-title"><Sparkles size={19} /><strong>{story.aiGenerated ? "Bản dịch và tóm tắt đã xử lý trước" : "Bản tin chưa được xử lý bởi AI"}</strong><span>{story.aiGenerated ? "Chỉ dùng metadata nguồn" : "Đang hiển thị summary heuristic từ nguồn"}</span></div><p>{story.summary}</p></div><section className="article-story"><span className="article-section-kicker">BẢN TIN MỞ RỘNG</span><h2>Toàn cảnh từ các nguồn</h2>{readingBody.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 35)}`}>{paragraph}</p>)}</section><section><h2>Vì sao tin này được chú ý?</h2><ul className="key-points">{(item.trendingReasons ?? []).map((reason) => <li key={reason}><Flame size={16} />{reason}</li>)}</ul><p className="muted-copy">Điểm nóng là ước tính từ độ mới, số nguồn, độ uy tín và tầm quan trọng chủ đề; không phải lượt xem của tòa soạn.</p></section></>}
          {activeTab === "sources" && <section className="story-source-grid"><h2>{story.articles.length} bài nguồn</h2>{story.articles.map((article, index) => <StorySourceCard article={article} lead={index === 0} key={article.id} />)}</section>}
          {activeTab === "official" && <section className="story-source-grid"><h2>Nguồn chính thức</h2>{officialArticles.map((article) => <StorySourceCard article={article} lead={story.articles[0]?.id === article.id} key={article.id} />)}</section>}
          {activeTab === "timeline" && <section><h2>Dòng thời gian nguồn đăng</h2><div className="story-timeline">{story.timeline.map((entry) => <div key={entry.id}><time>{formatStoryTime(entry.occurredAt)}</time><span><i /><strong>{entry.description}</strong></span></div>)}</div></section>}
          {activeTab === "facts" && <section><h2>Các điểm đã thống nhất</h2><ul className="key-points">{story.agreedFacts.map((fact) => <li key={fact.text}><Check size={16} />{fact.text}<small>{fact.sourceArticleIds.length} bài nguồn</small></li>)}</ul></section>}
          {activeTab === "disputed" && <section><h2>Điểm còn mâu thuẫn</h2>{story.disputedPoints.map((point) => <div className="disputed-point" key={point.topic}><strong>{point.topic}</strong>{point.positions.map((position) => <p key={position.claim}>{position.claim}</p>)}</div>)}</section>}
        </div>
        <div className="aggregation-notice"><ShieldCheck size={22} /><div><strong>Nội dung tổng hợp có giới hạn</strong><p>SportPeek dùng metadata và trích đoạn ngắn, không đăng lại toàn văn. Mỗi bài nguồn đều có liên kết để bạn kiểm tra ngữ cảnh.</p></div></div>
      </article>
      <aside className="article-aside"><div className="rail-card"><SectionHeading eyebrow="CẬP NHẬT" title={formatStoryTime(story.updatedAt)} /><p className="muted-copy">{story.sourceCount} nguồn · {story.articles.length} bài gốc · {story.hasOfficialSource ? "có nguồn chính thức" : "chưa có nguồn chính thức"}.</p></div>{story.linkedMatch && <div className="rail-card"><SectionHeading eyebrow="TRẬN LIÊN QUAN" title={story.linkedMatch.label} /><Link className="primary-button" href={story.linkedMatch.href}>Mở trung tâm trận đấu</Link></div>}<div className="rail-card"><SectionHeading eyebrow="ĐỌC TIẾP" title="Tin liên quan" />{relatedStories.length ? relatedStories.map((entry) => <NewsListItem item={storyToNewsItem(entry)} key={entry.id} />) : <EmptyState title="Chưa có tin liên quan" description="Không chèn nội dung khác chủ đề để lấp chỗ trống." />}</div><div className="rail-card article-read-card"><span className="eyebrow">THỜI LƯỢNG</span><strong>{readingMinutes} phút đọc</strong><p>{wordCount} từ trong bản tổng hợp; dữ kiện có thể được kiểm tra tại bài gốc.</p>{isSafeExternalUrl(story.articles[0]?.originalUrl) && <a href={story.articles[0].originalUrl} target="_blank" rel="noopener noreferrer">Mở bài nguồn đầu tiên<ExternalLink size={14} /></a>}</div></aside>
    </div>
  </div>;
}
