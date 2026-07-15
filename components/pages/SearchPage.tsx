"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Command, ChevronRight, Search, UserRound } from "lucide-react";
import { useRuntimeData } from "@/components/SportPeekApp";
import {
  CompetitionMark,
  TeamMark,
  SectionHeading,
  DataLoadingState,
  EmptyState,
} from "@/components/ui/badges";
import { NewsListItem } from "@/components/pages/NewsPage";
import { filterNewsItems, normalizeSearchText } from "@/lib/ui-logic";

export default function SearchPage() {
  const { newsItems, loading, teams, competitions, players } = useRuntimeData();
  const [query, setQuery] = useState("");
  const normalized = normalizeSearchText(query);
  const newsResults =
    normalized.length >= 2 ? filterNewsItems(newsItems, { query }) : [];
  const teamResults =
    normalized.length >= 2
      ? teams.filter((team) =>
          normalizeSearchText(team.name).includes(normalized),
        )
      : [];
  const competitionResults =
    normalized.length >= 2
      ? competitions.filter((competition) =>
          normalizeSearchText(competition.name).includes(normalized),
        )
      : [];
  const playerResults =
    normalized.length >= 2
      ? players.filter((player) =>
          normalizeSearchText(player.name).includes(normalized),
        )
      : [];
  const total =
    newsResults.length +
    teamResults.length +
    competitionResults.length +
    playerResults.length;
  return (
    <div className="page-content">
      <PageHero
        eyebrow="TÌM KIẾM HỢP NHẤT"
        title="Tìm mọi thứ về bóng đá"
        description="Tin tức, đội bóng, cầu thủ và giải đấu trong cùng một nơi."
      />
      <label className="search-page-input">
        <Search size={22} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nhập ít nhất 2 ký tự..."
          aria-label="Từ khóa tìm kiếm"
        />
        <kbd>
          <Command size={12} />K
        </kbd>
      </label>
      {loading ? (
        <DataLoadingState />
      ) : normalized.length < 2 ? (
        <div className="large-empty compact-empty">
          <EmptyState
            title="Nhập từ khóa để bắt đầu"
            description="Có thể tìm theo tên đội, cầu thủ, giải đấu hoặc nội dung tin."
          />
        </div>
      ) : total ? (
        <div className="search-sections">
          {teamResults.length > 0 && (
            <section>
              <SectionHeading
                eyebrow="ĐỘI BÓNG"
                title={`${teamResults.length} kết quả`}
              />
              <div className="follow-grid">
                {teamResults.map((team) => (
                  <Link
                    className="follow-card"
                    href={`/teams/${team.slug}`}
                    key={team.id}
                  >
                    <TeamMark name={team.name} size="lg" />
                    <div>
                      <strong>{team.name}</strong>
                      <span>{team.country}</span>
                    </div>
                    <ChevronRight size={18} />
                  </Link>
                ))}
              </div>
            </section>
          )}
          {competitionResults.length > 0 && (
            <section>
              <SectionHeading
                eyebrow="GIẢI ĐẤU"
                title={`${competitionResults.length} kết quả`}
              />
              <div className="entity-chips result-chips">
                {competitionResults.map((competition) => (
                  <Link
                    href={`/competitions/${competition.slug}`}
                    key={competition.id}
                  >
                    <CompetitionMark name={competition.name} size="sm" />
                    {competition.name}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {playerResults.length > 0 && (
            <section>
              <SectionHeading
                eyebrow="CẦU THỦ"
                title={`${playerResults.length} kết quả`}
              />
              <div className="entity-chips result-chips">
                {playerResults.map((player) => (
                  <Link href={`/players/${player.slug}`} key={player.id}>
                    <UserRound size={15} />
                    {player.name}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {newsResults.length > 0 && (
            <section>
              <SectionHeading
                eyebrow="TIN TỨC"
                title={`${newsResults.length} kết quả`}
              />
              <div className="news-stack">
                {newsResults.slice(0, 20).map((item) => (
                  <NewsListItem item={item} key={item.id} />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="large-empty compact-empty">
          <EmptyState
            title="Không tìm thấy kết quả"
            description={`Không có dữ liệu phù hợp với “${query.trim()}”.`}
          />
        </div>
      )}
    </div>
  );
}

function PageHero({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-hero">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
