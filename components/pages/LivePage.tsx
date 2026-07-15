"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, ShieldCheck } from "lucide-react";
import { useRuntimeData } from "@/components/SportPeekApp";
import { TeamMark, SectionHeading, DataLoadingState, EmptyState, ContentNotFound, StandingsTable } from "@/components/ui/badges";
import { FilterBar } from "@/components/ui/Search";
import { NewsListItem } from "@/components/pages/NewsPage";
import { normalizeSearchText } from "@/lib/ui-logic";
import type { Match, MatchDetailData } from "@/lib/types";

export type SportsDetailState<T> = { url: string; status: "loading" | "success" | "not_found" | "error"; data: T | null };

export function useSportsDetail<T>(url: string): SportsDetailState<T> {
  const [state, setState] = useState<SportsDetailState<T>>({ url, status: "loading", data: null });
  useEffect(() => {
    let active = true;
    void fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) }).then(async (response) => {
      if (!active) return; if (response.status === 404) { setState({ url, status: "not_found", data: null }); return; }
      if (!response.ok) throw new Error(`HTTP ${response.status}`); const payload = await response.json() as { data: T }; if (active) setState({ url, status: "success", data: payload.data });
    }).catch(() => { if (active) setState({ url, status: "error", data: null }); });
    return () => { active = false; };
  }, [url]);
  return state.url === url ? state : { url, status: "loading", data: null };
}

function formatStoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

export function MatchCard({ match, compact = false }: { match: Match; compact?: boolean }) {
  const statusLabel = match.status === "postponed" ? "HOÃN" : match.status === "cancelled" ? "ĐÃ HỦY" : null;
  return <Link href={`/matches/${match.id}`} className={`match-card ${match.status} ${compact ? "compact" : ""}`}>
    <div className="match-head"><span>{match.competition}</span>{match.status === "live" ? <span className="live-pill"><i />{match.minute ?? "–"}&apos;{match.dataFreshness === "delayed" || match.dataFreshness === "stale" ? " · TRỄ" : ""}</span> : <span>{statusLabel ? `${statusLabel} · ` : ""}{match.startTime}</span>}</div>
    <div className="match-team"><span><TeamMark name={match.home} size="sm" />{match.home}</span><strong>{match.homeScore ?? "–"}</strong></div>
    <div className="match-team"><span><TeamMark name={match.away} size="sm" />{match.away}</span><strong>{match.awayScore ?? "–"}</strong></div>
    {!compact && <div className="match-venue"><MapPin size={13} />{match.venue}</div>}
  </Link>;
}

export function MatchDetail({ id }: { id: string }) {
  const { newsItems } = useRuntimeData(); const [activeTab, setActiveTab] = useState("overview");
  const state = useSportsDetail<MatchDetailData>(`/api/matches/${encodeURIComponent(id)}`);
  if (state.status === "loading") return <DataLoadingState label="Đang tải chi tiết trận đấu từ cache" />;
  if (state.status === "not_found") return <ContentNotFound title="Không tìm thấy trận đấu" description="Mã trận không tồn tại trong sports cache." />;
  if (state.status === "error" || !state.data) return <ContentNotFound title="Không thể tải trận đấu" description="Sports cache đang lỗi hoặc chưa được cấu hình; không có dữ liệu giả thay thế." />;
  const { match, events, statistics, standings: matchStandings, capabilities, providerCoverage, updatedAt, stale } = state.data;
  // Dynamic import or local helper to avoid circular dependency
  const related = newsItems.filter(item => 
    normalizeSearchText(`${item.title} ${item.summary}`).includes(normalizeSearchText(match.home)) ||
    normalizeSearchText(`${item.title} ${item.summary}`).includes(normalizeSearchText(match.away))
  ).slice(0, 3);
  const tabs = [["overview", "Tổng quan"], ...(capabilities.events ? [["events", "Sự kiện"]] : []), ...(capabilities.statistics ? [["stats", "Thống kê"]] : []), ...(capabilities.standings ? [["standings", "Bảng xếp hạng"]] : [])] as Array<[string, string]>;
  const statusLabel = match.status === "live" ? `${match.minute ?? "–"}' · ${stale ? "DỮ LIỆU TRỄ" : "TRỰC TIẾP"}` : match.status === "finished" ? "ĐÃ KẾT THÚC" : match.status === "postponed" ? "ĐÃ HOÃN" : match.status === "cancelled" ? "ĐÃ HỦY" : "SẮP DIỄN RA";
  return <div className="page-content"><div className="match-detail-hero"><div className="match-detail-top"><Link href={`/competitions/${match.competitionSlug}`}>{match.competition}</Link><span className={match.status === "live" && !stale ? "live-pill" : "status-pill"}>{statusLabel}</span></div><div className="scoreboard"><div><TeamMark name={match.home} size="lg" /><Link href={`/teams/${match.homeTeamSlug}`}><h2>{match.home}</h2></Link><span>Chủ nhà</span></div><strong>{match.homeScore ?? "–"}<em>–</em>{match.awayScore ?? "–"}<small>{match.status === "live" ? `${match.minute ?? "–"}'` : match.status === "finished" ? "FT" : match.startTime}</small></strong><div><TeamMark name={match.away} size="lg" /><Link href={`/teams/${match.awayTeamSlug}`}><h2>{match.away}</h2></Link><span>Đội khách</span></div></div><div className="match-facts"><span><CalendarDays size={15} />{match.startTime}</span>{capabilities.venue && <span><MapPin size={15} />{match.venue}</span>}{capabilities.referee && <span><ShieldCheck size={15} />Trọng tài: {match.referee}</span>}</div>{stale && <p className="inline-status">Dữ liệu cập nhật cuối {formatStoryTime(updatedAt)}; không được gọi là real-time.</p>}</div><div className="panel-tabs match-tabs">{tabs.map(([value, label]) => <button key={value} className={activeTab === value ? "active" : ""} onClick={() => setActiveTab(value)}>{label}</button>)}</div><div className="match-detail-grid"><div><section className="content-card">{activeTab === "overview" && <><SectionHeading eyebrow="TRẠNG THÁI THẬT" title="Thông tin trận đấu" /><dl className="profile-list"><div><dt>Provider</dt><dd>{match.provider ?? "Chưa xác định"}</dd></div><div><dt>Mùa giải</dt><dd>{match.season}</dd></div><div><dt>Cập nhật cache</dt><dd>{formatStoryTime(updatedAt)}</dd></div><div><dt>Độ mới</dt><dd>{stale ? "Stale" : match.dataFreshness ?? "Unknown"}</dd></div></dl>{!capabilities.events && <EmptyState title={match.status === "scheduled" ? "Trận đấu chưa bắt đầu" : "Nguồn chưa cung cấp sự kiện"} description="SportPeek không tự tạo bàn thắng, thẻ phạt hoặc diễn biến." />}</>}{activeTab === "events" && <><SectionHeading eyebrow="DIỄN BIẾN" title={`${events.length} sự kiện từ provider`} /><div className="match-event-list">{events.map((event) => <div key={event.id}><time>{event.minute}{event.extraMinute ? `+${event.extraMinute}` : ""}&apos;</time><strong>{event.type.replaceAll("_", " ")}</strong><span>{[event.player, event.team].filter(Boolean).join(" · ")}</span></div>)}</div></>}{activeTab === "stats" && <><SectionHeading eyebrow="THỐNG KÊ" title="Số liệu do provider cung cấp" /><div className="table-wrap"><table className="standings-table"><thead><tr><th>Đội</th><th>Kiểm soát</th><th>Sút</th><th>Trúng đích</th><th>Phạt góc</th><th>Phạm lỗi</th><th>xG</th></tr></thead><tbody>{statistics.map((stat) => <tr key={stat.team}><td>{stat.team}</td><td>{stat.possession ?? "–"}{stat.possession !== undefined ? "%" : ""}</td><td>{stat.shots ?? "–"}</td><td>{stat.shotsOnTarget ?? "–"}</td><td>{stat.corners ?? "–"}</td><td>{stat.fouls ?? "–"}</td><td>{stat.expectedGoals ?? "–"}</td></tr>)}</tbody></table></div></>}{activeTab === "standings" && <><SectionHeading eyebrow="GIẢI ĐẤU" title="Bối cảnh bảng xếp hạng" /><StandingsTable full rows={matchStandings} /></>}</section></div><aside><div className="rail-card"><SectionHeading eyebrow="PROVIDER COVERAGE" title="Khả năng đã cấu hình" /><div className="entity-chips">{providerCoverage.map((entry) => <span key={entry.capability}>{entry.capability} · {entry.provider}</span>)}</div><p className="muted-copy">Chỉ phần có bản ghi thật mới xuất hiện thành tab.</p></div><div className="rail-card"><SectionHeading eyebrow="TIN TỨC" title="Liên quan" />{related.length ? related.map((item) => <NewsListItem item={item} key={item.id} />) : <EmptyState title="Chưa có tin liên quan" description="Không dùng tin khác chủ đề để lấp nội dung." />}</div></aside></div></div>;
}

export function LivePage({ mode }: { mode: "live" | "fixtures" | "results" }) {
  const { matchItems, sportsReal, loading } = useRuntimeData();
  const [query, setQuery] = useState("");
  const [competition, setCompetition] = useState("");
  const [team, setTeam] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const byMode = matchItems.filter((item) => mode === "live" ? item.status === "live" : mode === "fixtures" ? ["scheduled", "postponed", "cancelled"].includes(item.status) : item.status === "finished");
  const localDateKey = (value?: string) => value ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";
  const filtered = byMode.filter((item) => {
    const haystack = normalizeSearchText(`${item.home} ${item.away} ${item.competition} ${item.venue}`);
    const normalizedQuery = normalizeSearchText(query);
    return (!normalizedQuery || haystack.includes(normalizedQuery)) && (!competition || item.competition === competition) && (!team || item.home === team || item.away === team) && (!dateFilter || localDateKey(item.startTimestamp) === dateFilter);
  });
  const competitionOptions = [...new Set(byMode.map((item) => item.competition))].sort();
  const teamOptions = [...new Set(byMode.flatMap((item) => [item.home, item.away]))].sort();
  const shiftDate = (days: number) => { const base = dateFilter || localDateKey(byMode[0]?.startTimestamp) || new Date().toISOString().slice(0, 10); const date = new Date(`${base}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); setDateFilter(date.toISOString().slice(0, 10)); };
  const labels = mode === "live" ? ["TRUNG TÂM TRẬN ĐẤU", "Trận đấu trực tiếp", "Theo dõi tỉ số, sự kiện và nhịp độ trận đấu từ nhà cung cấp dữ liệu thể thao."] : mode === "fixtures" ? ["LỊCH THI ĐẤU", "Lịch thi đấu", "Múi giờ hiển thị: Asia/Ho_Chi_Minh (GMT+7)."] : ["KẾT QUẢ", "Kết quả trận đấu", "Kết quả và dữ liệu trận đấu đã hoàn tất từ nhà cung cấp dữ liệu."];
  return <div className="page-content"><PageHero eyebrow={labels[0]} title={labels[1]} description={sportsReal ? "Dữ liệu cache thật từ provider; nhãn TRỄ xuất hiện khi nguồn không còn đủ mới để gọi là trực tiếp." : labels[2]}>{mode === "live" && <div className="live-count"><i />{byMode.length} trận đang diễn ra</div>}</PageHero>{mode !== "live" && <div className="scope-note"><CalendarDays size={17} /><span>{mode === "fixtures" ? "Scheduled, postponed và cancelled trong cửa sổ cache" : "Các kết quả gần nhất trong bộ nhớ đệm"}</span><small>Asia/Ho_Chi_Minh · GMT+7</small><div className="date-navigation"><button onClick={() => shiftDate(-1)} aria-label="Ngày trước"><ChevronLeft size={16} /></button><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Chọn ngày" /><button onClick={() => shiftDate(1)} aria-label="Ngày sau"><ChevronRight size={16} /></button>{dateFilter && <button onClick={() => setDateFilter("")}>Mọi ngày</button>}</div></div>}<FilterBar search query={query} onQueryChange={setQuery} competition={competition} onCompetitionChange={setCompetition} competitionOptions={competitionOptions} team={team} onTeamChange={setTeam} teamOptions={teamOptions} />{loading ? <DataLoadingState label="Đang tải dữ liệu trận đấu" /> : filtered.length ? <div className="match-groups">{[...new Set(filtered.map((item)=>item.competition))].map((competitionName) => { const group = filtered.filter((item) => item.competition === competitionName); return <section className="match-group" key={competitionName}><div className="competition-title"><span className="competition-icon">SP</span><div><strong>{competitionName}</strong><span>{group[0]?.provider ?? "Provider cache"} · cập nhật theo nguồn</span></div></div><div className="match-grid">{group.map((match) => <MatchCard key={match.id} match={match} />)}</div></section>; })}</div> : <div className="large-empty compact-empty"><EmptyState title={sportsReal ? mode === "live" ? "Hiện không có trận trực tiếp" : "Không có trận phù hợp" : "Dữ liệu thể thao chưa khả dụng"} description={sportsReal ? mode === "live" ? "Trang này chỉ hiển thị trận thực sự đang diễn ra. Hãy mở Lịch thi đấu để xem các trận sắp tới." : "Hãy thử bỏ bộ lọc ngày, giải hoặc đội." : "SportPeek không chèn trận đấu giả khi provider chưa cấu hình hoặc đang lỗi."} />{mode === "live" && <Link href="/fixtures" className="primary-button">Xem lịch thi đấu</Link>}</div>}</div>;
}

function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-hero"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
