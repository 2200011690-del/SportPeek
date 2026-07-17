"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Clock3,
  Newspaper,
  Radio,
  Rss,
} from "lucide-react";
import { useRuntimeData, SourceFilter } from "@/components/SportPeekApp";
import {
  TeamMark,
  SectionHeading,
  DataLoadingState,
  NewsVisual,
} from "@/components/ui/badges";
import {
  conciseNewsSummary,
  independentSourceCount,
  newsHasSourceLanguage,
  newsStatusLabel,
  newsTimeLabel,
  rankFeaturedNews,
  sortLatestNews,
} from "@/components/news/news-presenter";
import type { NewsItem, Match } from "@/lib/types";

function matchesSourceFilter(item: NewsItem, filter: SourceFilter): boolean {
  if (filter === "all" || filter === "rss") return true;
  if (filter === "vi") return newsHasSourceLanguage(item, "vi");
  if (filter === "international") return newsHasSourceLanguage(item, "en");
  if (filter === "official")
    return item.sources.some((source) => /\b(?:vff|vpf)\b/i.test(source));
  return item.sources.some((source) => /youtube/i.test(source));
}

function HomeHeroNews({
  item,
  bookmarked,
  onBookmark,
}: {
  item: NewsItem;
  bookmarked: boolean;
  onBookmark: (id: string) => void;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const hasImage = Boolean(item.imageUrl && item.imageUrl !== failedImageUrl);
  const sourceCount = independentSourceCount(item);
  return (
    <article
      className={`home-hero-news ${hasImage ? "has-real-image" : "image-fallback"}`}
    >
      {hasImage && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="home-hero-image"
            src={item.imageUrl}
            alt={item.imageAlt ?? item.title}
            width="1280"
            height="720"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailedImageUrl(item.imageUrl)}
          />
        </>
      )}
      {!hasImage && (
        <div className="home-hero-glow" aria-hidden>
          <span>SP</span>
        </div>
      )}
      <div className="home-hero-content">
        <div className="home-hero-kicker">
          <span>{newsStatusLabel(item)}</span>
        </div>
        <h1>{item.title}</h1>
        <p>{conciseNewsSummary(item, 310)}</p>
        <div className="home-hero-meta">
          <span>
            <Newspaper size={15} />
            {item.sourceDetails?.length ?? sourceCount} bài · {sourceCount}{" "}
            nguồn độc lập
          </span>
          <span>
            <Clock3 size={15} />
            {newsTimeLabel(item)}
          </span>
        </div>
        <div className="home-hero-actions">
          <Link href={`/news/${item.slug}`}>
            Xem tin
            <ArrowRight size={17} />
          </Link>
          <button
            type="button"
            className={bookmarked ? "active" : ""}
            onClick={() => onBookmark(item.id)}
            aria-label={bookmarked ? "Bỏ lưu tin" : "Lưu tin"}
          >
            <Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    </article>
  );
}

function HomeNewsRow({ item }: { item: NewsItem }) {
  return (
    <article className="home-news-row">
      <NewsVisual item={item} compact />
      <div className="home-news-copy">
        <div className="meta-row">
          <span className="category-label">{item.category}</span>
          <span>{newsTimeLabel(item)}</span>
        </div>
        <Link href={`/news/${item.slug}`}>
          <h3>{item.title}</h3>
        </Link>
        <p>{conciseNewsSummary(item)}</p>
        <div className="home-news-meta">
          <span>{independentSourceCount(item)} nguồn độc lập</span>
          <span>{newsStatusLabel(item)}</span>
        </div>
      </div>
      <Link
        className="home-news-open"
        href={`/news/${item.slug}`}
        aria-label={`Xem tin ${item.title}`}
      >
        <ArrowRight size={18} />
      </Link>
    </article>
  );
}

function DenseNewsList({
  items,
  numbered = false,
}: {
  items: NewsItem[];
  numbered?: boolean;
}) {
  return (
    <div className="dense-news-list">
      {items.map((item, index) => (
        <Link href={`/news/${item.slug}`} key={item.id}>
          <span className="dense-news-index">
            {numbered ? String(index + 1).padStart(2, "0") : <i />}
          </span>
          <span>
            <strong>{item.title}</strong>
            <small>
              {newsTimeLabel(item)} · {independentSourceCount(item)} nguồn
            </small>
          </span>
        </Link>
      ))}
    </div>
  );
}

function MatchCard({
  match,
  compact = false,
}: {
  match: Match;
  compact?: boolean;
}) {
  const statusLabel =
    match.status === "postponed"
      ? "HOÃN"
      : match.status === "cancelled"
        ? "ĐÃ HỦY"
        : null;
  return (
    <Link
      href={`/matches/${match.id}`}
      className={`match-card ${match.status} ${compact ? "compact" : ""}`}
    >
      <div className="match-head">
        <span>{match.competition}</span>
        {match.status === "live" ? (
          <span className="live-pill">
            <i />
            {match.minute ?? "–"}&apos;
            {match.dataFreshness === "delayed" ||
            match.dataFreshness === "stale"
              ? " · TRỄ"
              : ""}
          </span>
        ) : (
          <span>
            {statusLabel ? `${statusLabel} · ` : ""}
            {match.startTime}
          </span>
        )}
      </div>
      <div className="match-team">
        <span>
          <TeamMark name={match.home} size="sm" />
          {match.home}
        </span>
        <strong>{match.homeScore ?? "–"}</strong>
      </div>
      <div className="match-team">
        <span>
          <TeamMark name={match.away} size="sm" />
          {match.away}
        </span>
        <strong>{match.awayScore ?? "–"}</strong>
      </div>
      {!compact && (
        <div className="match-venue">
          <Radio size={13} />
          {match.venue}
        </div>
      )}
    </Link>
  );
}

export default function HomePage({
  bookmarks,
  onBookmark,
  sourceFilter,
}: {
  bookmarks: Set<string>;
  onBookmark: (id: string) => void;
  sourceFilter: SourceFilter;
}) {
  const { newsItems, matchItems, loading } = useRuntimeData();
  const filteredNews = newsItems.filter((item) =>
    matchesSourceFilter(item, sourceFilter),
  );
  const hotNews = rankFeaturedNews(filteredNews);
  const hero = hotNews[0];
  const feedItems = sortLatestNews(filteredNews)
    .filter((item) => item.id !== hero?.id)
    .slice(0, 12);
  const overallHot = rankFeaturedNews(newsItems)
    .filter((item) => item.id !== hero?.id)
    .slice(0, 6);
  const dateKey = (value?: string) =>
    value
      ? new Intl.DateTimeFormat("en-CA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(new Date(value))
      : "";
  const todayKey = dateKey(new Date().toISOString());
  const todayItems = sortLatestNews(
    newsItems.filter(
      (item) =>
        dateKey(item.updatedTimestamp ?? item.publishedTimestamp) === todayKey,
    ),
  ).slice(0, 5);
  const liveMatches = matchItems.filter((match) => match.status === "live");
  const today = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date());
  return (
    <div className="home-grid">
      <div className="main-feed home-main-feed">
        <div className="home-feed-heading">
          <div>
            <span>{today}</span>
            <h2>Dòng tin thể thao</h2>
          </div>
          <Link href="/news">
            Xem toàn bộ
            <ArrowRight size={15} />
          </Link>
        </div>
        {loading ? (
          <DataLoadingState />
        ) : hero ? (
          <HomeHeroNews
            item={hero}
            bookmarked={bookmarks.has(hero.id)}
            onBookmark={onBookmark}
          />
        ) : (
          <div className="home-filter-empty">
            <Rss size={26} />
            <strong>Chưa có tin từ nhóm nguồn này</strong>
            <p>Chọn một nhóm nguồn khác để tiếp tục theo dõi.</p>
          </div>
        )}
        {feedItems.length > 0 && (
          <section className="home-continuous-feed" aria-label="Tin mới nhất">
            <div className="home-feed-label">
              <span>Tin mới nhất</span>
              <em>{filteredNews.length} tin</em>
            </div>
            {feedItems.map((item) => (
              <HomeNewsRow item={item} key={item.id} />
            ))}
            <Link href="/news" className="home-feed-more">
              Mở bảng tin đầy đủ
              <ArrowRight size={16} />
            </Link>
          </section>
        )}
      </div>
      <aside className="right-rail home-right-rail">
        <section className="rail-card hot-news-rail">
          <SectionHeading
            eyebrow="ĐANG ĐƯỢC QUAN TÂM"
            title="Tin nổi bật"
            action="Tất cả"
          />
          <DenseNewsList items={overallHot} numbered />
        </section>
        <section className="rail-card today-news-rail">
          <SectionHeading eyebrow="CẬP NHẬT TRONG NGÀY" title="Tin hôm nay" />
          <DenseNewsList
            items={(todayItems.length
              ? todayItems
              : sortLatestNews(newsItems)
            ).slice(0, 5)}
          />
        </section>
        <section className="rail-card compact-live-rail">
          <SectionHeading
            eyebrow="DỮ LIỆU TRẬN ĐẤU"
            title="Đang trực tiếp"
            action="Mở live"
            href="/live"
          />
          {liveMatches.length ? (
            liveMatches
              .slice(0, 2)
              .map((match) => (
                <MatchCard key={match.id} match={match} compact />
              ))
          ) : (
            <div className="no-live">
              <Radio size={18} />
              <span>
                <strong>Chưa có trận đang diễn ra</strong>
                <small>Dữ liệu sẽ tự cập nhật khi trận bắt đầu.</small>
              </span>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
