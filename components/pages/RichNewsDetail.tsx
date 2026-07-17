"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock3, ExternalLink, Newspaper } from "lucide-react";
import { EmptyState } from "@/components/ui/badges";
import {
  fetchStoryDetail,
  loadingStoryReaderState,
  type StoryReaderState,
} from "@/lib/stories/client";
import { getHighResolutionStoryImageUrl } from "@/lib/stories/images";
import { isSafeExternalUrl } from "@/lib/stories/schema";
import type { StoryDetailPayload } from "@/lib/stories/schema";
import { storyDisplaySummaryParagraphs } from "@/lib/stories/summary";

const storyStatusLabels = {
  official: "Đã xác nhận",
  reported: "Nhiều nguồn đưa tin",
  rumor: "Chưa xác nhận",
  unverified: "Chưa kiểm chứng",
  developing: "Đang cập nhật",
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
  if (status === "reported" && sourceCount < 2) return "Một nguồn đưa tin";
  if (
    status === "rumor" &&
    /chuyển nhượng|thương vụ|transfer|gia nhập|đàm phán/i.test(
      `${category} ${title}`,
    )
  ) {
    return "Tin đồn chuyển nhượng";
  }
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

export default function RichNewsDetail({
  slug,
  initialData,
}: {
  slug: string;
  bookmarks: Set<string>;
  onBookmark: (id: string) => void;
  initialData?: StoryDetailPayload | null;
}) {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
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

  useEffect(() => {
    let active = true;
    void fetchStoryDetail(slug).then((next) => {
      if (active) setReaderResult({ slug, reloadToken, state: next });
    });
    return () => {
      active = false;
    };
  }, [slug, reloadToken]);

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
  const summaryParagraphs = readableSummaryParagraphs(
    storyDisplaySummaryParagraphs(story),
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
  const sourceByArticleId = new Map(
    story.articles.map((article) => [article.id, article.sourceName]),
  );
  const publisherCount = story.sourceCount;
  const publishedAt = story.firstPublishedAt ?? story.publishedAt;
  const updatedAt = story.lastMaterialUpdateAt ?? story.updatedAt;
  const hasMaterialUpdate =
    Date.parse(updatedAt) - Date.parse(publishedAt) >= 5 * 60_000;

  return (
    <main className="article-page simple-news-detail">
      <Link className="simple-news-back" href="/news">
        ← Quay lại tin tức
      </Link>
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
        <section
          className="simple-news-summary"
          aria-labelledby="full-summary-heading"
        >
          <div className="simple-news-summary-heading">
            <h2 id="full-summary-heading">Tóm tắt đầy đủ</h2>
            <span>{publisherCount} nguồn để đối chiếu</span>
          </div>
          <div>
            {summaryParagraphs.map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 40)}`}>{paragraph}</p>
            ))}
          </div>
        </section>
        {story.disputedPoints.length > 0 && (
          <section
            className="simple-news-disputes"
            aria-labelledby="disputed-points-heading"
          >
            <div className="simple-news-section-title">
              <AlertTriangle size={19} aria-hidden="true" />
              <div>
                <h2 id="disputed-points-heading">Các nguồn chưa thống nhất</h2>
                <p>
                  SportPeek giữ riêng từng cách tường thuật, không tự chọn một
                  phía làm sự thật.
                </p>
              </div>
            </div>
            <div className="simple-news-dispute-list">
              {story.disputedPoints.map((point) => (
                <article key={point.topic}>
                  <h3>{point.topic}</h3>
                  <ul>
                    {point.positions.map((position, index) => {
                      const sourceNames = [
                        ...new Set(
                          position.sourceArticleIds
                            .map((id) => sourceByArticleId.get(id))
                            .filter((name): name is string => Boolean(name)),
                        ),
                      ];
                      return (
                        <li key={`${point.topic}-${index}`}>
                          <p>{position.claim}</p>
                          {sourceNames.length > 0 && (
                            <small>Nguồn: {sourceNames.join(", ")}</small>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
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
      </article>
    </main>
  );
}
