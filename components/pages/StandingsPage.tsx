"use client";

import React, { useState } from "react";
import { Trophy } from "lucide-react";
import { useRuntimeData } from "@/components/SportPeekApp";
import { StandingsTable, DataLoadingState, EmptyState } from "@/components/ui/badges";

export default function StandingsPage() {
  const { sportsReal, loading, standingRows } = useRuntimeData();
  const competitionNames = [...new Set(standingRows.map((row) => row.competition).filter((value): value is string => Boolean(value)))];
  const [competition, setCompetition] = useState("");
  const selected = competition || competitionNames[0] || "";
  const rows = selected ? standingRows.filter((row) => row.competition === selected) : standingRows;
  const season = rows[0]?.season ?? "Chưa xác định";
  return <div className="page-content"><PageHero eyebrow="MÙA GIẢI HIỆN TẠI" title="Bảng xếp hạng" description={sportsReal ? "Thứ hạng, mùa giải và độ mới lấy từ sports cache đã đồng bộ." : "Bảng xếp hạng chỉ xuất hiện khi có dữ liệu thật đã được đồng bộ."}><label className="season-select"><Trophy size={18} /><select value={selected} onChange={(event) => setCompetition(event.target.value)} aria-label="Chọn giải đấu">{competitionNames.map((name) => <option value={name} key={name}>{name}</option>)}</select><span>Mùa {season}</span></label></PageHero>{loading ? <DataLoadingState label="Đang tải bảng xếp hạng" /> : sportsReal && rows.length > 0 && <div className="standings-panel"><div className="panel-tabs"><strong>{selected}</strong><span>{rows[0]?.provider ?? "Provider cache"} · {rows[0]?.dataFreshness ?? "unknown"}</span></div><StandingsTable full rows={rows} /><div className="table-legend"><span><i className="champions" />Nhóm dẫn đầu</span><span><i className="europa" />Nhóm giữa</span><span><i className="relegation" />Nhóm cuối</span></div></div>}{!loading && (!sportsReal || !rows.length) && <EmptyState title="Chưa có bảng xếp hạng thật" description="SportPeek không dùng bảng xếp hạng minh họa trong production." />}</div>;
}

function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-hero"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
