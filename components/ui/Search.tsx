"use client";

import React, { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { Command, Flame, Search, Trophy, Users, ChevronDown, X } from "lucide-react";
import { useRuntimeData } from "@/components/SportPeekApp";
import { EmptyState } from "@/components/ui/badges";
import { filterNewsItems, normalizeSearchText } from "@/lib/ui-logic";

type FilterBarProps = {
  search?: boolean;
  query?: string;
  onQueryChange?: (value: string) => void;
  competition?: string;
  onCompetitionChange?: (value: string) => void;
  competitionOptions?: string[];
  team?: string;
  onTeamChange?: (value: string) => void;
  teamOptions?: string[];
  minHotness?: number;
  onMinHotnessChange?: (value: number) => void;
};

export function FilterBar({ search = false, query = "", onQueryChange, competition = "", onCompetitionChange, competitionOptions = [], team = "", onTeamChange, teamOptions = [], minHotness = 0, onMinHotnessChange }: FilterBarProps) {
  return <div className="filter-bar">
    {search && <label className="inline-search"><Search size={17} /><input value={query} onChange={(event) => onQueryChange?.(event.target.value)} placeholder="Tìm trong bảng tin..." aria-label="Tìm trong bảng tin" /></label>}
    {onCompetitionChange && <label className="filter-select"><Trophy size={16} /><select value={competition} onChange={(event) => onCompetitionChange(event.target.value)} aria-label="Lọc theo giải đấu"><option value="">Tất cả giải</option>{competitionOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select><ChevronDown size={15} /></label>}
    {onTeamChange && <label className="filter-select"><Users size={16} /><select value={team} onChange={(event) => onTeamChange(event.target.value)} aria-label="Lọc theo đội bóng"><option value="">Tất cả đội</option>{teamOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select><ChevronDown size={15} /></label>}
    {onMinHotnessChange && <label className="filter-select"><Flame size={16} /><select value={minHotness} onChange={(event) => onMinHotnessChange(Number(event.target.value))} aria-label="Lọc theo độ nóng"><option value={0}>Mọi độ nóng</option><option value={50}>Từ 50 điểm</option><option value={70}>Từ 70 điểm</option><option value={85}>Từ 85 điểm</option></select><ChevronDown size={15} /></label>}
  </div>;
}

export function SearchCommand({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const { newsItems, teams, competitions, players } = useRuntimeData();
  const results = useMemo(() => {
    const normalized = normalizeSearchText(query);
    if (normalized.length < 2) return [];
    return [
      ...filterNewsItems(newsItems, { query }).slice(0, 5).map((item) => ({ label: item.title, href: `/news/${item.slug}`, type: "Tin tức" })),
      ...teams.filter((team) => normalizeSearchText(team.name).includes(normalized)).slice(0, 3).map((team) => ({ label: team.name, href: `/teams/${team.slug}`, type: "Đội bóng" })),
      ...competitions.filter((competition) => normalizeSearchText(competition.name).includes(normalized)).slice(0, 2).map((competition) => ({ label: competition.name, href: `/competitions/${competition.slug}`, type: "Giải đấu" })),
      ...players.filter((player) => normalizeSearchText(player.name).includes(normalized)).slice(0, 2).map((player) => ({ label: player.name, href: `/players/${player.slug}`, type: "Cầu thủ" })),
    ];
  }, [query, newsItems, teams, competitions, players]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); } if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose]);
  if (!open) return null;
  return <div className="command-backdrop" onMouseDown={onClose}><div className="command-dialog" role="dialog" aria-modal="true" aria-label="Tìm kiếm" onMouseDown={(event) => event.stopPropagation()}><div className="command-input"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập ít nhất 2 ký tự..." aria-label="Nội dung tìm kiếm" /><button onClick={onClose} aria-label="Đóng tìm kiếm"><X size={19} /></button></div><div className="command-results">{normalizeSearchText(query).length < 2 ? <div className="command-hint"><Command size={28} /><p>Tìm kiếm hợp nhất trên tin tức, đội bóng và giải đấu.</p></div> : results.length ? results.map((result) => <Link key={`${result.type}-${result.href}`} href={result.href} onClick={onClose}><span>{result.label}</span><small>{result.type}</small></Link>) : <EmptyState title="Không tìm thấy kết quả" description="Thử từ khóa khác hoặc kiểm tra lại chính tả." />}</div><div className="command-footer"><span>Nhấp vào kết quả để mở</span><span>Esc để đóng</span></div></div></div>;
}
