"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Flame,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useRuntimeData } from "@/components/SportPeekApp";
import { hotnessLabel } from "@/lib/scoring";
import type { NewsItem, Standing } from "@/lib/types";

const getInitials = (name: string) =>
  (name?.trim() || "TBD")
    .split(" ")
    .map((word) => word[0])
    .slice(-2)
    .join("")
    .toUpperCase();

export function TeamMark({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const { teams } = useRuntimeData();
  const team = teams.find((item) => item.name === name);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string>();
  const hasLogo = Boolean(team?.logoUrl && team.logoUrl !== failedLogoUrl);
  return (
    <span
      className={`team-mark ${size}`}
      style={
        { "--team-accent": team?.accent ?? "#7cfa4c" } as React.CSSProperties
      }
      aria-label={name}
    >
      {team?.logoUrl && hasLogo ? (
        <>
          {/* Provider crests load directly; failed URLs fall back to initials. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={team.logoUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedLogoUrl(team.logoUrl)}
          />
        </>
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

export function CompetitionMark({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  const { competitions } = useRuntimeData();
  const competition = competitions.find((item) => item.name === name);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string>();
  const hasLogo = Boolean(
    competition?.logoUrl && competition.logoUrl !== failedLogoUrl,
  );
  return (
    <span className={`competition-mark ${size}`} aria-label={name}>
      {competition?.logoUrl && hasLogo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={competition.logoUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedLogoUrl(competition.logoUrl)}
          />
        </>
      ) : (
        getInitials(name)
      )}
    </span>
  );
}

export function HotnessBadge({ score }: { score: number }) {
  return (
    <span
      className={`hotness hotness-${score >= 70 ? "high" : score >= 50 ? "mid" : "low"}`}
    >
      <Flame size={13} aria-hidden />
      {hotnessLabel(score)} · {score}
    </span>
  );
}

export function ReliabilityBadge({ score }: { score: number }) {
  return (
    <span className="reliability">
      <ShieldCheck size={13} aria-hidden />
      Tin cậy {score}%
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
  href = "/news",
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action && (
        <Link className="text-link" href={href}>
          {action}
          <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}

export function DataLoadingState({
  label = "Đang tải dữ liệu thật",
}: {
  label?: string;
}) {
  return (
    <div className="data-loading" role="status">
      <span />
      <div>
        <strong>{label}</strong>
        <small>
          SportPeek đang kết nối các nguồn, vui lòng chờ trong giây lát.
        </small>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <Search size={28} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function ContentNotFound({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="large-empty">
      <EmptyState title={title} description={description} />
      <Link href="/" className="primary-button">
        Về trang chủ
      </Link>
    </div>
  );
}

export function NewsVisual({
  item,
  compact = false,
  priority = false,
}: {
  item: NewsItem;
  compact?: boolean;
  priority?: boolean;
}) {
  const { newsReal } = useRuntimeData();
  const [failedImageUrl, setFailedImageUrl] = useState<string>();
  const hasImage = Boolean(item.imageUrl && item.imageUrl !== failedImageUrl);
  return (
    <div
      className={`news-visual tone-${item.imageTone} ${compact ? "compact" : ""} ${hasImage ? "has-real-image" : "image-fallback"}`}
    >
      {hasImage && (
        <>
          {/* Publisher images are intentionally unproxied to keep this internal, free deployment within quota. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={item.imageAlt ?? item.title}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            referrerPolicy="no-referrer"
            onError={() => setFailedImageUrl(item.imageUrl)}
          />
        </>
      )}
      {!hasImage && (
        <>
          <div className="field-lines" />
          <span className="visual-team">{getInitials(item.team)}</span>
        </>
      )}
      <span className="visual-label">
        {!newsReal
          ? "DỮ LIỆU MINH HỌA"
          : hasImage
            ? `ẢNH · ${item.imageSource ?? item.sources[0]}`
            : "NGUỒN CHƯA CÓ ẢNH"}
      </span>
    </div>
  );
}

export function FormField({
  label,
  value,
  disabled,
  name,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  name?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={value}
        disabled={disabled}
        required={required}
      />
    </label>
  );
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from(
    { length: totalPages },
    (_, index) => index + 1,
  ).filter(
    (value) =>
      value === 1 || value === totalPages || Math.abs(value - page) <= 1,
  );
  return (
    <nav className="pagination" aria-label="Phân trang">
      <button
        disabled={page === 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Trang trước"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((value, index) => (
        <span className="pagination-item" key={value}>
          {index > 0 && value - pages[index - 1] > 1 && <em>…</em>}
          <button
            className={value === page ? "active" : ""}
            onClick={() => onPageChange(value)}
            aria-current={value === page ? "page" : undefined}
          >
            {value}
          </button>
        </span>
      ))}
      <button
        disabled={page === totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Trang sau"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

export function StandingsTable({
  full = false,
  rows,
}: {
  full?: boolean;
  rows?: Standing[];
}) {
  const { standingRows } = useRuntimeData();
  const data = rows ?? standingRows;
  return (
    <div className="table-wrap">
      <table className="standings-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Đội</th>
            <th>Tr</th>
            {full && (
              <>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>HS</th>
              </>
            )}
            <th>Đ</th>
            {full && <th>Phong độ</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={`${row.competitionId ?? "table"}-${row.team}`}>
              <td>
                <span className={`rank rank-${row.position}`}>
                  {row.position}
                </span>
              </td>
              <td>
                <span className="standing-team">
                  <TeamMark name={row.team} size="sm" />
                  {row.team}
                </span>
              </td>
              <td>{row.played}</td>
              {full && (
                <>
                  <td>{row.won}</td>
                  <td>{row.drawn}</td>
                  <td>{row.lost}</td>
                  <td>
                    {row.goalDifference > 0 ? "+" : ""}
                    {row.goalDifference}
                  </td>
                </>
              )}
              <td>
                <strong>{row.points}</strong>
              </td>
              {full && (
                <td>
                  <span className="form-row">
                    {row.form.map((result, i) => (
                      <i key={i} className={result.toLowerCase()}>
                        {result}
                      </i>
                    ))}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
