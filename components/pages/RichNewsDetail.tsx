"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookOpen, Clock3, ExternalLink, LoaderCircle, Newspaper, Share2, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/badges";
import {
  fetchStoryDetail,
  loadingStoryReaderState,
  requestStoryAISummary,
  type StoryReaderState,
} from "@/lib/stories/client";
import { getHighResolutionStoryImageUrl } from "@/lib/stories/images";
import { isSafeExternalUrl } from "@/lib/stories/schema";
import type { StoryArticleContent, StoryCluster, StoryDetailPayload } from "@/lib/stories/schema";
import { storyDisplaySummaryParagraphs } from "@/lib/stories/summary";

const storyStatusLabels = {
  official: "Có nguồn chính thức",
  reported: "Nhiều nguồn đưa tin",
  rumor: "Chưa xác nhận",
  unverified: "Chưa kiểm chứng",
  developing: "Đang phát triển",
  disputed: "Các nguồn chưa thống nhất",
  completed: "Đã hoàn tất",
  correction: "Đã đính chính",
} as const;

function storyStatusLabel(
  status: keyof typeof storyStatusLabels,
  category: string,
  title: string,
  sourceCount: number,
): string {
  if (status === "reported" && sourceCount < 2) return "Một nguồn";
  void category;
  void title;
  return storyStatusLabels[status];
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
}

function readableSummaryParagraphs(values: string[]): string[] {
  const cleaned = values
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const allSentences = cleaned
    .flatMap((value) => value.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [value])
    .map((value) => value.trim())
    .filter(Boolean);
  if (allSentences.length < 4) return cleaned;
  const wordCount = allSentences.join(" ").split(/\s+/).length;
  const targetCount = Math.min(8, Math.max(4, Math.ceil(wordCount / 75)));
  const groupCount = Math.min(targetCount, allSentences.length);
  return Array.from({ length: groupCount }, (_, index) => {
    const start = Math.floor((index * allSentences.length) / groupCount);
    const end = Math.floor(((index + 1) * allSentences.length) / groupCount);
    return allSentences.slice(start, end).join(" ");
  }).filter(Boolean);
}

function articleTabStatus(article: StoryArticleContent): string {
  if (article.status === "available") return `${article.wordCount} từ`;
  if (article.status === "processing" || article.status === "pending") return "Đang lấy nội dung";
  if (article.status === "failed") return "Đọc tại nguồn";
  return "Đọc tại nguồn";
}

function contentOriginLabel(source: StoryArticleContent["source"]): string {
  return source === "publisher"
    ? "Toàn văn được lấy từ trang nguồn công khai"
    : "Toàn văn do nguồn phát hành trong feed";
}

function sourceOnlyTitle(status: StoryArticleContent["status"] | undefined): string {
  if (status === "pending" || status === "processing") return "Đang lấy nội dung đầy đủ.";
  if (status === "failed") return "Chưa lấy được nội dung đầy đủ.";
  return "Nguồn này chưa có toàn văn trong NewsPeek.";
}

const articleContentResolved = (article: StoryArticleContent) =>
  article.status !== "pending" && article.status !== "processing";

export default function RichNewsDetail({
  slug,
  initialData,
  bookmarks,
  onBookmark,
}: {
  slug: string;
  bookmarks: Set<string>;
  onBookmark: (id: string) => void;
  initialData?: StoryDetailPayload | null;
}) {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const [contentRetry, setContentRetry] = useState({ slug, count: 0 });
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const [readingPreference, setReadingPreference] = useState<{
    slug: string;
    mode: "full" | "summary";
  }>({ slug, mode: "full" });
  const [scrollProgress, setScrollProgress] = useState(0);
  const [readerFontSize, setReaderFontSize] = useState<"sm" | "md" | "lg">("md");
  const [articleSelection, setArticleSelection] = useState({ slug, articleId: "" });
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        setScrollProgress(Math.min(100, Math.max(0, (window.scrollY / totalHeight) * 100)));
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  const [aiResult, setAiResult] = useState<{ slug: string; story: StoryCluster | null }>({
    slug,
    story: null,
  });
  const [aiRequest, setAiRequest] = useState<{
    slug: string;
    state: "idle" | "loading" | "error";
  }>({ slug, state: "idle" });
  const [readerResult, setReaderResult] = useState<{
    slug: string;
    reloadToken: number;
    state: StoryReaderState;
  }>(() => ({
    slug: initialData?.story.slug === slug ? slug : "",
    reloadToken: initialData?.story.slug === slug ? 0 : -1,
    state: initialData?.story.slug === slug
      ? {
          status: "success",
          data: initialData,
          meta: {
            source: "supabase",
            cached: true,
            stale: false,
            lastUpdatedAt: initialData.story.lastMaterialUpdateAt ?? initialData.story.updatedAt,
            canonicalSlug: initialData.story.slug,
          },
          message: null,
        }
      : loadingStoryReaderState,
  }));
  const readerState =
    readerResult.slug === slug && readerResult.reloadToken === reloadToken
      ? readerResult.state
      : loadingStoryReaderState;
  const readingMode = readingPreference.slug === slug ? readingPreference.mode : "full";
  const aiStory = aiResult.slug === slug ? aiResult.story : null;
  const aiRequestState = aiRequest.slug === slug ? aiRequest.state : "idle";
  const contentRetryCount = contentRetry.slug === slug ? contentRetry.count : 0;

  useEffect(() => {
    if (
      reloadToken === 0 &&
      initialData?.story.slug === slug &&
      initialData.articleContents.length === initialData.story.articles.length &&
      initialData.articleContents.every(articleContentResolved)
    ) return;
    let active = true;
    void fetchStoryDetail(slug).then((next) => {
      if (active) setReaderResult({ slug, reloadToken, state: next });
    });
    return () => {
      active = false;
    };
  }, [initialData, slug, reloadToken]);

  const unresolvedArticleContent = Boolean(
    readerState.data &&
      (readerState.data.articleContents.length < readerState.data.story.articles.length ||
        readerState.data.articleContents.some(
          (article) => !articleContentResolved(article),
        )),
  );
  useEffect(() => {
    if (!unresolvedArticleContent || contentRetryCount >= 3) return;
    const delays = [5_000, 15_000, 30_000];
    const timer = window.setTimeout(() => {
      setContentRetry({ slug, count: contentRetryCount + 1 });
      setReloadToken((value) => value + 1);
    }, delays[contentRetryCount]);
    return () => window.clearTimeout(timer);
  }, [contentRetryCount, slug, unresolvedArticleContent]);

  useEffect(() => {
    const canonicalSlug = readerState.meta?.canonicalSlug;
    if (readerState.data && canonicalSlug && canonicalSlug !== slug)
      router.replace(`/news/${canonicalSlug}`, { scroll: false });
  }, [readerState.data, readerState.meta, router, slug]);

  const activeStoryId = readerState.data?.story.id;
  useEffect(() => {
    if (!activeStoryId) return;
    const startedAt = Date.now();
    const persist = () => {
      const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);
      if (durationSeconds < 5) return;
      void fetch("/api/reading-history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storyId: activeStoryId, durationSeconds }),
        keepalive: true,
      }).catch(() => {
        /* Anonymous mode has no reading history. */
      });
    };
    const timer = window.setInterval(persist, 30_000);
    return () => {
      window.clearInterval(timer);
      persist();
    };
  }, [activeStoryId]);

  if (readerState.status === "idle" || readerState.status === "loading") {
    return (
      <div
        className="article-page simple-news-detail story-reader-skeleton"
        aria-busy="true"
        aria-label="Đang tải bài viết"
      >
        <div className="story-skeleton-line wide" />
        <div className="story-skeleton-line title" />
        <div className="story-skeleton-line title short" />
        <div className="story-skeleton-summary" />
      </div>
    );
  }

  if (!readerState.data) {
    const isNotFound = readerState.status === "not_found";
    return (
      <div className="article-page story-state-panel">
        <EmptyState
          title={
            isNotFound
              ? "Không tìm thấy bài viết"
              : readerState.status === "configuration_required"
                ? "Chưa cấu hình nguồn tin thật"
                : "Không thể tải bài viết"
          }
          description={readerState.message ?? "Không thể tải bài viết lúc này."}
        />
        <div className="story-state-actions">
          {!isNotFound && (
            <button
              className="primary-button"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              Thử lại
            </button>
          )}
          <Link className="secondary-button" href="/news">
            Quay lại tin tức
          </Link>
        </div>
      </div>
    );
  }

  const { story } = readerState.data;
  const summaryStory = aiStory?.id === story.id ? aiStory : story;
  const summaryParagraphs = readableSummaryParagraphs(
    storyDisplaySummaryParagraphs(summaryStory),
  );
  const articleContents = readerState.data.articleContents;
  const preferredArticleId = (
    articleContents.find((article) => article.status === "available") ?? articleContents[0]
  )?.articleId ?? "";
  const selectedArticleId =
    articleSelection.slug === slug &&
    articleContents.some((article) => article.articleId === articleSelection.articleId)
      ? articleSelection.articleId
      : preferredArticleId;
  const selectedContent =
    articleContents.find((article) => article.articleId === selectedArticleId) ??
    articleContents.find((article) => article.status === "available") ??
    articleContents[0];
  const selectedArticle = story.articles.find(
    (article) => article.id === selectedContent?.articleId,
  );
  const imageUrl = getHighResolutionStoryImageUrl(story.imageUrl);
  const imageArticle =
    story.articles.find((article) => article.imageUrl === story.imageUrl) ??
    story.articles.find((article) => article.imageUrl);
  const sourceLinks = [
    ...new Map(
      story.articles
        .filter((article) => isSafeExternalUrl(article.originalUrl))
        .map((article) => [article.originalUrl, article]),
    ).values(),
  ];
  const publisherCount = story.sourceCount;
  const publishedAt = story.firstPublishedAt ?? story.publishedAt;
  const updatedAt = story.lastMaterialUpdateAt ?? story.updatedAt;
  const hasMaterialUpdate =
    Date.parse(updatedAt) - Date.parse(publishedAt) >= 5 * 60_000;
  const primarySourceUrl = sourceLinks[0]?.originalUrl;
  const bookmarked = bookmarks.has(story.id);

  const shareStory = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: story.title, url });
        setShareStatus("Đã mở bảng chia sẻ.");
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus("Đã sao chép liên kết.");
      }
    } catch {
      setShareStatus("");
    }
  };

  const openAISummary = async () => {
    setReadingPreference({ slug, mode: "summary" });
    if (summaryStory.aiGenerated || aiRequestState === "loading") return;
    setAiRequest({ slug, state: "loading" });
    const generated = await requestStoryAISummary(story.slug);
    if (generated) {
      setAiResult({ slug, story: generated });
      setAiRequest({ slug, state: "idle" });
    } else {
      setAiRequest({ slug, state: "error" });
    }
  };

  return (
    <div className="article-page simple-news-detail">
      <div
        className="reading-progress-bar"
        style={{ width: `${scrollProgress}%` }}
        aria-hidden="true"
      />
      <nav className="article-breadcrumb" aria-label="Đường dẫn bài viết">
        <Link href="/">Trang chủ</Link>
        <span aria-hidden="true">/</span>
        <Link href="/news">{story.category}</Link>
      </nav>
      {readerState.status === "stale" && (
        <div className="simple-news-stale" role="status">
          Đang hiển thị bản lưu gần nhất vì nguồn tin tạm thời gián đoạn.
        </div>
      )}
      <article>
        <header>
          <div className="simple-news-kicker">
            <span className={`story-status story-status-${story.status}`}>
              {storyStatusLabel(
                story.status,
                story.category,
                story.title,
                publisherCount,
              )}
            </span>
            <span>{story.category}</span>
          </div>
          <h1>{story.title}</h1>
          {summaryParagraphs.length > 0 && (
            <p className="article-dek">{summaryParagraphs.slice(0, 2).join(" ")}</p>
          )}
          <div className="simple-news-meta">
            <span>
              <Clock3 size={15} aria-hidden="true" />
              Đăng{" "}
              <time dateTime={publishedAt}>{formatDateTime(publishedAt)}</time>
            </span>
            {hasMaterialUpdate && (
              <span>
                Cập nhật{" "}
                <time dateTime={updatedAt}>{formatDateTime(updatedAt)}</time>
              </span>
            )}
            <span>
              <Newspaper size={15} aria-hidden="true" />
              {story.articles.length} bài · {publisherCount} nguồn
            </span>
          </div>
          <div className="article-actions" aria-label="Thao tác bài viết">
            <button type="button" className={bookmarked ? "active" : ""} onClick={() => onBookmark(story.id)}>
              <Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} />
              {bookmarked ? "Đã lưu" : "Lưu bài"}
            </button>
            <button type="button" onClick={() => void shareStory()}>
              <Share2 size={17} />
              Chia sẻ
            </button>
            {primarySourceUrl && (
              <a href={primarySourceUrl} target="_blank" rel="noopener noreferrer" className="primary-source-action">
                Đọc bài gốc
                <ExternalLink size={16} />
              </a>
            )}
          </div>
          {shareStatus && <span className="article-share-status" role="status">{shareStatus}</span>}
        </header>
        {imageUrl && imageUrl !== failedImageUrl && (
          <figure className="simple-news-image">
            {/* Publisher images stay on their original CDN; known thumbnail URLs are upgraded before rendering. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={`Ảnh minh họa cho tin “${story.title}”`}
              width="1200"
              height="675"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setFailedImageUrl(imageUrl)}
            />
            {imageArticle && (
              <figcaption>Ảnh từ {imageArticle.sourceName}</figcaption>
            )}
          </figure>
        )}
        <div className="reader-toolbar">
          <nav className="article-reading-modes" aria-label="Chọn cách đọc bài viết">
            <button
              type="button"
              className={readingMode === "full" ? "active" : ""}
              aria-pressed={readingMode === "full"}
              onClick={() => setReadingPreference({ slug, mode: "full" })}
            >
              <BookOpen size={19} aria-hidden="true" />
              <span>
                <strong>Đọc đầy đủ</strong>
                <small>Nội dung nguồn cung cấp</small>
              </span>
            </button>
            <button
              type="button"
              className={readingMode === "summary" ? "active" : ""}
              aria-pressed={readingMode === "summary"}
              disabled={aiRequestState === "loading"}
              onClick={() => void openAISummary()}
            >
              {aiRequestState === "loading" ? (
                <LoaderCircle className="spin" size={19} aria-hidden="true" />
              ) : (
                <Sparkles size={19} aria-hidden="true" />
              )}
              <span>
                <strong>Tóm tắt bằng AI</strong>
                <small>{summaryStory.aiGenerated ? "Đã sẵn sàng" : "Tạo khi bạn yêu cầu"}</small>
              </span>
            </button>
          </nav>
          <div className="font-size-adjuster" role="group" aria-label="Cỡ chữ đọc bài">
            <span className="adjuster-label">Cỡ chữ:</span>
            <button
              type="button"
              className={readerFontSize === "sm" ? "active" : ""}
              onClick={() => setReaderFontSize("sm")}
              aria-label="Cỡ chữ nhỏ"
            >
              A-
            </button>
            <button
              type="button"
              className={readerFontSize === "md" ? "active" : ""}
              onClick={() => setReaderFontSize("md")}
              aria-label="Cỡ chữ vừa"
            >
              A
            </button>
            <button
              type="button"
              className={readerFontSize === "lg" ? "active" : ""}
              onClick={() => setReaderFontSize("lg")}
              aria-label="Cỡ chữ lớn"
            >
              A+
            </button>
          </div>
        </div>

        {readingMode === "full" ? (
          <section
            className={`simple-news-summary article-full-reader font-size-${readerFontSize}`}
            aria-labelledby="full-article-heading"
          >
            <div className="simple-news-summary-heading">
              <h2 id="full-article-heading">Nội dung đầy đủ</h2>
              <span>{articleContents.filter((article) => article.status === "available").length}/{articleContents.length || story.articles.length} bài có toàn văn</span>
            </div>
            {articleContents.length > 1 && (
              <div className="article-source-tabs" role="list" aria-label="Chọn bài nguồn">
                {articleContents.map((article) => (
                  <button
                    type="button"
                    role="listitem"
                    key={article.articleId}
                    className={selectedContent?.articleId === article.articleId ? "active" : ""}
                    onClick={() => setArticleSelection({ slug, articleId: article.articleId })}
                  >
                    {article.sourceName}
                    <small>{articleTabStatus(article)}</small>
                  </button>
                ))}
              </div>
            )}
            {selectedContent?.status === "available" && selectedContent.paragraphs.length ? (
              <div className="article-full-content">
                <div className="article-content-attribution">
                  {contentOriginLabel(selectedContent.source)} bởi{" "}
                  <strong>{selectedContent.sourceName}</strong>.
                </div>
                {selectedContent.paragraphs.map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 40)}`}>{paragraph}</p>
                ))}
                <a
                  className="article-inline-source"
                  href={selectedContent.originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Xem bài gốc tại {selectedContent.sourceName}
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              </div>
            ) : (
              <div className="article-source-only">
                <strong>{sourceOnlyTitle(selectedContent?.status)}</strong>
                <p>
                  {selectedArticle?.excerpt || "Bạn vẫn có thể mở bài gốc để đọc đầy đủ bối cảnh từ nhà xuất bản."}
                </p>
                {selectedContent?.originalUrl || selectedArticle?.originalUrl ? (
                  <a
                    className="primary-button"
                    href={selectedContent?.originalUrl ?? selectedArticle?.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Đọc đầy đủ tại nguồn
                    <ExternalLink size={16} aria-hidden="true" />
                  </a>
                ) : null}
                <small>NewsPeek ưu tiên hiển thị nội dung công khai và luôn giữ link bài gốc để đối chiếu.</small>
              </div>
            )}
          </section>
        ) : (
          <section
            className={`simple-news-summary article-ai-summary font-size-${readerFontSize}`}
            aria-labelledby="ai-summary-heading"
          >
            <div className="simple-news-summary-heading">
              <h2 id="ai-summary-heading">Tóm tắt bằng AI</h2>
              <span>{publisherCount} nguồn để đối chiếu</span>
            </div>
            {aiRequestState === "loading" ? (
              <div className="article-ai-loading" role="status">
                <LoaderCircle className="spin" size={22} aria-hidden="true" />
                AI đang gộp thông tin chung và loại bỏ đoạn trùng lặp…
              </div>
            ) : summaryStory.aiGenerated ? (
              <div>
                {summaryParagraphs.map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 40)}`}>{paragraph}</p>
                ))}
              </div>
            ) : (
              <div className="article-source-only">
                <strong>{aiRequestState === "error" ? "Chưa thể tạo bản tóm tắt lúc này." : "Bản tóm tắt AI chỉ được tạo khi bạn yêu cầu."}</strong>
                <p>AI sẽ gộp các dữ kiện chung từ nhiều nguồn thành một nội dung liền mạch và giữ riêng các điểm chưa thống nhất.</p>
                <button type="button" className="primary-button" onClick={() => void openAISummary()}>
                  <Sparkles size={17} aria-hidden="true" />
                  {aiRequestState === "error" ? "Thử tóm tắt lại" : "Tóm tắt bài này"}
                </button>
              </div>
            )}
          </section>
        )}
        <section
          className="simple-news-sources"
          aria-labelledby="source-links-heading"
        >
          <h2 id="source-links-heading">Nguồn gốc bài viết</h2>
          <p className="simple-news-sources-intro">
            Mở bài gốc để đọc đầy đủ ngữ cảnh và kiểm tra thông tin tại nhà xuất
            bản.
          </p>
          {sourceLinks.length ? (
            <ul>
              {sourceLinks.map((article) => (
                <li key={article.originalUrl}>
                  <a
                    href={article.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span>
                      <strong>
                        {article.sourceName}
                        {article.isOfficialSource ? " · Nguồn chính thức" : ""}
                      </strong>
                      <em>{article.title}</em>
                      <small>
                        {formatDateTime(article.publishedAt)}
                        {article.author ? ` · ${article.author}` : ""}
                      </small>
                    </span>
                    <ExternalLink size={17} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>Chưa có liên kết nguồn hợp lệ.</p>
          )}
        </section>
        {readerState.data.relatedStories.length > 0 && (
          <section className="article-related" aria-labelledby="related-stories-heading">
            <div className="article-related-heading">
              <span>Đọc tiếp</span>
              <h2 id="related-stories-heading">Tin liên quan</h2>
            </div>
            <div className="article-related-grid">
              {readerState.data.relatedStories.slice(0, 4).map((related) => (
                <Link href={`/news/${related.slug}`} key={related.id}>
                  <span>{related.category}</span>
                  <strong>{related.title}</strong>
                  <small>{related.sourceCount} nguồn</small>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
