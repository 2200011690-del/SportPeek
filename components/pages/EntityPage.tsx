"use client";

import React from "react";
import Link from "next/link";
import { Check, ChevronRight, Trophy } from "lucide-react";
import { useRuntimeData } from "@/components/SportPeekApp";
import { TeamMark, SectionHeading, DataLoadingState, ContentNotFound, StandingsTable, EmptyState } from "@/components/ui/badges";
import { MatchCard, useSportsDetail } from "@/components/pages/LivePage";
import { NewsListItem } from "@/components/pages/NewsPage";
import { relatedNewsItems, isTransferNews } from "@/lib/ui-logic";
import type { TeamDetailData, CompetitionDetailData, PlayerDetailData } from "@/lib/types";

const getInitials = (name: string) => (name?.trim() || "TBD").split(" ").map((word) => word[0]).slice(-2).join("").toUpperCase();

function formatStoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

export default function EntityPage({ type, slug, followed, onFollow }: { type: "team" | "player" | "competition"; slug: string; followed: Set<string>; onFollow: (id: string, type?: "team" | "player" | "competition" | "source") => void }) {
  const { newsItems, loading } = useRuntimeData();
  const state = useSportsDetail<TeamDetailData | CompetitionDetailData | PlayerDetailData>(`/api/${type === "team" ? "teams" : type === "competition" ? "competitions" : "players"}/${encodeURIComponent(slug)}`);
  if (state.status === "loading") return <DataLoadingState label="Đang tải hồ sơ từ sports cache" />;
  if (state.status === "not_found") return <ContentNotFound title="Không tìm thấy hồ sơ" description="Thực thể này chưa tồn tại trong sports cache hiện tại." />;
  if (state.status === "error" || !state.data) return <ContentNotFound title="Không thể tải hồ sơ" description="Supabase sports cache đang lỗi hoặc chưa được cấu hình." />;
  const teamData = type === "team" ? state.data as TeamDetailData : null; const competitionData = type === "competition" ? state.data as CompetitionDetailData : null; const playerData = type === "player" ? state.data as PlayerDetailData : null;
  const entity = teamData?.team ?? competitionData?.competition ?? playerData!.player; const title = entity.name; const id = entity.id;
  const fixtures = teamData?.fixtures ?? competitionData?.fixtures ?? []; const results = teamData?.results ?? competitionData?.results ?? []; const entityStandings = teamData?.standings ?? competitionData?.standings ?? [];
  const playerTeam = playerData?.player.teamName; const newsTerms = playerData ? [title, playerTeam ?? ""].filter(Boolean) : [title]; const entityNews = relatedNewsItems(newsItems, newsTerms, undefined, 8);
  const transferStories = playerData ? entityNews.filter(isTransferNews) : [];
  const country = teamData?.team.country ?? competitionData?.competition.country ?? playerData?.player.nationality ?? "Chưa xác định";
  const detail = teamData?.team.stadium || (competitionData ? `Mùa ${competitionData.competition.season}` : `${playerData?.player.position || "Chưa rõ vị trí"}${playerTeam ? ` · ${playerTeam}` : ""}`);
  const updatedAt = teamData?.updatedAt ?? competitionData?.updatedAt ?? playerData?.updatedAt;
  return <div className="page-content"><div className="entity-hero"><div className="entity-mark">{teamData ? <TeamMark name={title} size="lg" /> : competitionData ? <Trophy size={38} /> : <span className="player-avatar large">{getInitials(title)}</span>}</div><div><span className="eyebrow">{type === "team" ? "CÂU LẠC BỘ" : type === "competition" ? "GIẢI ĐẤU" : "CẦU THỦ"} · {country}</span><h1>{title}</h1><p>{detail}</p></div><button className={`follow-button ${followed.has(id) ? "following" : ""}`} onClick={() => onFollow(id, type)}>{followed.has(id) ? <><Check size={16} />Đang theo dõi</> : <>+ Theo dõi</>}</button></div><div className="entity-layout"><div>{!playerData && <section><SectionHeading eyebrow="SẮP TỚI" title="Trận tiếp theo" />{fixtures.length ? fixtures.slice(0, 6).map((match) => <MatchCard key={match.id} match={match} />) : <EmptyState title="Chưa có lịch phù hợp" description={`Sports cache chưa có trận sắp tới của ${title}.`} />}</section>}{!playerData && <section><SectionHeading eyebrow="KẾT QUẢ" title="Trận gần đây" />{results.length ? results.slice(0, 6).map((match) => <MatchCard key={match.id} match={match} />) : <EmptyState title="Chưa có kết quả" description="Không có kết quả thật trong cửa sổ cache." />}</section>}{competitionData && <section><SectionHeading eyebrow="THÀNH VIÊN" title={`${competitionData.teams.length} đội đã đồng bộ`} /><div className="follow-grid">{competitionData.teams.map((team) => <Link className="follow-card" href={`/teams/${team.slug}`} key={team.id}><TeamMark name={team.name} size="md" /><div><strong>{team.name}</strong><span>{team.country}</span></div><ChevronRight size={17} /></Link>)}</div></section>}{playerData && transferStories.length > 0 && <section><SectionHeading eyebrow="CHUYỂN NHƯỢNG" title={`Tin chuyển nhượng về ${title}`} /><div className="news-stack">{transferStories.map((item) => <NewsListItem item={item} key={item.id} />)}</div></section>}<section><SectionHeading eyebrow="CẬP NHẬT" title={`Tin về ${title}`} />{loading ? <DataLoadingState label="Đang tìm tin liên quan" /> : entityNews.length ? <div className="news-stack">{entityNews.map((item) => <NewsListItem item={item} key={item.id} />)}</div> : <EmptyState title="Chưa có tin đúng chủ đề" description={`Không chèn tin không liên quan vào hồ sơ ${title}.`} />}</section></div><aside><div className="rail-card"><SectionHeading eyebrow="THÔNG TIN" title="Hồ sơ cache" /><dl className="profile-list"><div><dt>Quốc gia</dt><dd>{country}</dd></div><div><dt>{teamData ? "Sân vận động" : playerData ? "Vị trí" : "Mùa hiện tại"}</dt><dd>{teamData?.team.stadium || playerData?.player.position || competitionData?.competition.season || "Chưa có"}</dd></div>{playerData?.player.teamName && <div><dt>Đội hiện tại</dt><dd>{playerData.player.teamSlug ? <Link href={`/teams/${playerData.player.teamSlug}`}>{playerData.player.teamName}</Link> : playerData.player.teamName}</dd></div>}<div><dt>Cập nhật cache</dt><dd>{updatedAt ? formatStoryTime(updatedAt) : "Chưa rõ"}</dd></div></dl></div>{entityStandings.length > 0 && <div className="rail-card"><SectionHeading eyebrow="XẾP HẠNG" title={teamData?.competitions[0]?.name ?? competitionData?.competition.name ?? "Bối cảnh"} /><StandingsTable rows={entityStandings} /></div>}{competitionData && <div className="rail-card"><SectionHeading eyebrow="COVERAGE" title="Nguồn theo capability" /><div className="entity-chips">{competitionData.providerCoverage.map((entry) => <span key={entry.capability}>{entry.capability} · {entry.provider}</span>)}</div></div>}</aside></div></div>;
}
