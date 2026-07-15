"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, Check, Languages, ShieldCheck, Sparkles } from "lucide-react";
import { useRuntimeData } from "@/components/SportPeekApp";
import { HotnessBadge, ReliabilityBadge, NewsVisual, SectionHeading, DataLoadingState, EmptyState, Pagination, TeamMark } from "@/components/ui/badges";
import { FilterBar } from "@/components/ui/Search";
import { filterNewsItems, paginateItems, personalizedNewsItems, isTransferNews } from "@/lib/ui-logic";
import type { NewsItem, TransferRecord } from "@/lib/types";

const storyStatusLabels = {
  official: "Nguồn chính thức",
  reported: "Nhiều nguồn đưa tin",
  rumor: "Tin đồn",
  unverified: "Chưa kiểm chứng",
  developing: "Đang phát triển",
  disputed: "Có điểm mâu thuẫn",
  completed: "Đã hoàn tất",
  correction: "Đính chính",
};

export function NewsCard({ item, featured = false, bookmarked, onBookmark }: { item: NewsItem; featured?: boolean; bookmarked: boolean; onBookmark: (id: string) => void }) {
  const articleCount = item.sourceDetails?.length ?? item.sources.length;
  const officialCount = item.sourceDetails?.filter((source) => source.isOfficialSource).length ?? 0;
  return <article className={`news-card ${featured ? "featured" : ""}`}>
    <Link href={`/news/${item.slug}`} className="card-link" aria-label={`Mở tin: ${item.title}`} />
    <NewsVisual item={item} />
    <div className="news-card-body">
      <div className="meta-row"><HotnessBadge score={item.hotness} />{item.storyStatus && <span className={`story-status story-status-${item.storyStatus}`}>{storyStatusLabels[item.storyStatus as keyof typeof storyStatusLabels]}</span>}<span>{item.publishedAt}</span></div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      {item.personalization?.reasons.length ? <div className="why-recommended"><Sparkles size={14} /><span><strong>Vì sao bạn thấy tin này</strong>{item.personalization.reasons.join(" · ")}</span></div> : null}
      <div className="news-card-footer"><span className="source-line"><span className="source-avatar">SP</span>{articleCount} bài · {item.sources.length} nguồn độc lập{officialCount ? ` · ${officialCount} chính thức` : ""}</span><button className={`icon-button ${bookmarked ? "active" : ""}`} onClick={(event) => { event.preventDefault(); onBookmark(item.id); }} aria-label={bookmarked ? "Bỏ lưu tin" : "Lưu tin"}><Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} /></button></div>
    </div>
  </article>;
}

export function NewsListItem({ item }: { item: NewsItem }) {
  return <article className="news-list-item"><NewsVisual item={item} compact /><div><div className="meta-row"><span className="category-label">{item.category}</span><span>{item.publishedAt}</span></div><Link href={`/news/${item.slug}`}><h3>{item.title}</h3></Link><div className="list-badges"><HotnessBadge score={item.hotness} /><ReliabilityBadge score={item.reliability} /></div></div></article>;
}

export function NewsPage({ bookmarks, onBookmark }: { bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, newsReal, newsSources, aiTranslation, aiStatus, loading } = useRuntimeData();
  const [query, setQuery] = useState("");
  const [competition, setCompetition] = useState("");
  const [team, setTeam] = useState("");
  const [minHotness, setMinHotness] = useState(0);
  const [page, setPage] = useState(1);
  const [archiveItems, setArchiveItems] = useState<NewsItem[]>([]);
  const [archivePagination, setArchivePagination] = useState({ page: 1, pageSize: 12, total: 0, totalPages: 1 });
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState(false);
  const filtered = filterNewsItems(newsItems, { query, competition, team, minHotness });
  const localPagination = paginateItems(filtered, page, 12);
  const filtersActive = Boolean(query.trim() || competition || team || minHotness > 0);
  const updateFilter = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1); };
  const competitionOptions = [...new Set(newsItems.map((item) => item.competition))].sort();
  const teamOptions = [...new Set(newsItems.map((item) => item.team))].filter((value) => !/thể thao|bóng đá|nhiều đội/i.test(value)).sort();
  useEffect(() => {
    if (filtersActive) return;
    let active = true;
    void fetch(`/api/news/archive?page=${page}&pageSize=12`, { cache: "no-store", signal: AbortSignal.timeout(12_000) })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ data: NewsItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>;
      })
      .then((response) => { if (active) { setArchiveItems(response.data); setArchivePagination(response.pagination); setArchiveError(false); } })
      .catch(() => { if (active) setArchiveError(true); })
      .finally(() => { if (active) setArchiveLoading(false); });
    return () => { active = false; };
  }, [filtersActive, page]);
  const displayedItems = filtersActive ? localPagination.items : archiveItems;
  const displayedPage = filtersActive ? localPagination.page : archivePagination.page;
  const displayedTotalPages = filtersActive ? localPagination.totalPages : archivePagination.totalPages;
  const changePage = (nextPage: number) => { if (!filtersActive) setArchiveLoading(true); setPage(nextPage); };
  const aiMessage = aiStatus.state === "ok"
    ? aiTranslation
      ? ["Cloudflare AI đang dịch tin quốc tế sang tiếng Việt", "Bản dịch chỉ dựa trên tiêu đề và trích đoạn của nguồn, không tự thêm dữ kiện."]
      : ["Cloudflare AI đã sẵn sàng", "Chưa có tin tiếng Anh mới cần dịch trong lần cập nhật này."]
    : aiStatus.state === "error"
      ? ["Cloudflare AI đang tạm gián đoạn", "SportPeek vẫn hiển thị bản gốc và không tạo bản dịch giả khi AI lỗi hoặc hết hạn mức."]
      : ["Tin quốc tế đang hiển thị bản gốc", "AI chưa được bật trong môi trường này."];
  const isLoadingNews = filtersActive ? loading : archiveLoading;
  const resultSummary = filtersActive
    ? `Hiển thị ${displayedItems.length} trong ${filtered.length} tin phù hợp gần đây`
    : `Kho lưu trữ có ${archivePagination.total} bài · Trang ${archivePagination.page}/${archivePagination.totalPages}`;
  return <div className="page-content">
    <PageHero eyebrow="NEWSROOM" title="Tin nóng Việt Nam & thế giới" description="Tổng hợp nhiều báo thể thao, gộp các bài cùng sự kiện và lưu lại để bạn có thể đọc lại vào bất cứ ngày nào."><div className="hero-stat"><strong>{newsSources.length || newsItems.length}</strong><span>{loading ? "đang kết nối" : newsReal ? "nguồn đang hoạt động" : "nguồn tạm gián đoạn"}</span></div></PageHero>
    <div className="personalization-banner"><div className="ai-orb"><Languages size={22} /></div><div><strong>{aiMessage[0]}</strong><p>{aiMessage[1]}</p></div><Link href="/sources">Xem phương pháp<ArrowRight size={15} /></Link></div>
    <FilterBar search query={query} onQueryChange={updateFilter(setQuery)} competition={competition} onCompetitionChange={updateFilter(setCompetition)} competitionOptions={competitionOptions} team={team} onTeamChange={updateFilter(setTeam)} teamOptions={teamOptions} minHotness={minHotness} onMinHotnessChange={updateFilter(setMinHotness)} />
    {isLoadingNews ? <DataLoadingState label={filtersActive ? "Đang lọc tin mới" : "Đang mở kho tin lưu trữ"} /> : displayedItems.length ? <>
      <div className="results-summary">{resultSummary}</div>
      <div className="news-page-grid">{displayedItems.map((item) => <NewsCard key={item.id} item={item} bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div>
      <Pagination page={displayedPage} totalPages={displayedTotalPages} onPageChange={changePage} />
    </> : <EmptyState title={archiveError && !filtersActive ? "Chưa mở được kho tin cũ" : newsReal ? "Không có tin phù hợp" : "Nguồn tin đang tạm gián đoạn"} description={archiveError && !filtersActive ? "Hãy tải lại trang sau ít phút; các bài đã lưu không bị xoá." : newsReal ? "Hãy thử bỏ bớt bộ lọc hoặc dùng từ khóa khác." : "SportPeek không chèn dữ liệu giả. Hãy thử tải lại sau khi các nguồn RSS hoạt động."} />}
  </div>;
}

export function ForYouPage({ followed, onFollow, bookmarks, onBookmark }: { followed: Set<string>; onFollow: (id: string) => void; bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, forYouItems, personalized, newsReal, loading, teams } = useRuntimeData();
  const followedNames = teams.filter((team) => followed.has(team.id)).map((team) => team.name);
  const recommendations = (forYouItems.length ? forYouItems : personalizedNewsItems(newsItems, followedNames)).slice(0, 24);
  return <div className="page-content"><PageHero eyebrow="CÁ NHÂN HÓA" title="Dành cho bạn" description="Xếp hạng bằng sở thích, nguồn, độ mới, độ nóng, độ tin cậy, lịch sử đọc và giới hạn lặp chủ đề."><Link className="primary-button" href="/settings"><Sparkles size={17} />Tinh chỉnh sở thích</Link></PageHero><div className="personalization-banner"><div className="ai-orb"><Sparkles size={22} /></div><div><strong>{personalized ? followedNames.length ? `Đang dùng ${followedNames.length} đội bạn theo dõi và lịch sử tài khoản` : "Đang dùng sở thích và lịch sử tài khoản nội bộ" : newsReal ? "Chưa đăng nhập — đang xếp theo độ nóng và tin cậy" : "Nguồn tin đang tạm gián đoạn"}</strong><p>Mỗi card giải thích lý do xuất hiện; diversity penalty tránh feed chỉ toàn một đội.</p></div><Link href="/bookmarks">Tin đã lưu<ArrowRight size={15} /></Link></div><section><SectionHeading eyebrow="SỞ THÍCH" title="Chọn đội để ưu tiên" /><div className="follow-grid">{teams.slice(0, 8).map((team) => <div className="follow-card" key={team.id}><TeamMark name={team.name} size="lg" /><div><strong>{team.name}</strong><span>{team.country}</span></div><button className={followed.has(team.id) ? "following" : ""} onClick={() => onFollow(team.id)}>{followed.has(team.id) ? <><Check size={15} />Đang theo dõi</> : <>+ Theo dõi</>}</button></div>)}</div></section><section><SectionHeading eyebrow={personalized ? "ĐÃ CÁ NHÂN HÓA" : "ĐANG THỊNH HÀNH"} title="Bảng tin đề xuất" />{loading ? <DataLoadingState /> : recommendations.length ? <div className="news-page-grid">{recommendations.map((item) => <NewsCard key={item.id} item={item} bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div> : <EmptyState title="Chưa có tin đề xuất" description="Không dùng dữ liệu giả khi nguồn RSS không khả dụng." />}</section></div>;
}

export function TransfersPage({ bookmarks, onBookmark }: { bookmarks: Set<string>; onBookmark: (id: string) => void }) {
  const { newsItems, newsReal, loading } = useRuntimeData();
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState<TransferRecord[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/transfers", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as { data?: TransferRecord[] };
      })
      .then((payload) => setMarket(payload.data ?? []))
      .catch(() => {
        if (!controller.signal.aborted) setMarket([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setMarketLoading(false);
      });
    return () => controller.abort();
  }, []);
  const transferNews = filterNewsItems(newsItems.filter(isTransferNews), { query });
  const normalizedQuery = query.trim().toLocaleLowerCase("vi");
  const filteredMarket = market.filter((item) =>
    !normalizedQuery ||
    `${item.player} ${item.fromTeam ?? ""} ${item.toTeam ?? ""}`
      .toLocaleLowerCase("vi")
      .includes(normalizedQuery),
  );
  return <div className="page-content">
    <PageHero eyebrow="MARKET WATCH" title="Tin chuyển nhượng" description="Dữ liệu thương vụ xác nhận từ API-Football được tách riêng khỏi tin đồn và bài báo tổng hợp."><div className="window-status"><i />{newsReal ? "Nguồn báo chí đang hoạt động" : "Nguồn tin tạm gián đoạn"}</div></PageHero>
    <div className="personalization-banner"><div className="ai-orb"><ShieldCheck size={22} /></div><div><strong>Phân biệt rõ dữ liệu provider và tin báo chí</strong><p>Thương vụ API-Football mang nhãn xác nhận; bài RSS vẫn giữ trạng thái tin đồn hoặc nguồn đối chiếu.</p></div><Link href="/sources">Nguồn & phương pháp<ArrowRight size={15} /></Link></div>
    <FilterBar search query={query} onQueryChange={setQuery} />
    <section>
      <SectionHeading eyebrow="API-FOOTBALL" title="Thương vụ đã ghi nhận" />
      {marketLoading ? <DataLoadingState label="Đang tải dữ liệu chuyển nhượng" /> : filteredMarket.length ? <div className="transfer-data-grid">{filteredMarket.map((item) => <article key={item.id} className="transfer-data-card"><div><span className="status-pill">ĐÃ XÁC NHẬN</span><time>{item.transferDate ?? "Chưa rõ ngày"}</time></div><Link href={`/players/${item.playerSlug}`}><h3>{item.player}</h3></Link><p><strong>{item.fromTeam ?? "Không rõ đội"}</strong><ArrowRight size={14} /><strong>{item.toTeam ?? "Không rõ đội"}</strong></p><small>{item.fee ?? item.transferType} · {item.provider ?? "provider"}</small></article>)}</div> : <EmptyState title="Chưa có thương vụ API-Football phù hợp" description="Cache sẽ xoay vòng đội bóng mỗi ngày trong giới hạn gói miễn phí." />}
    </section>
    <section>
      <SectionHeading eyebrow="BÁO CHÍ" title="Tin tức và diễn biến thị trường" />
      {loading ? <DataLoadingState /> : transferNews.length ? <><div className="results-summary">Tìm thấy {transferNews.length} tin chuyển nhượng từ các nguồn đang theo dõi</div><div className="news-page-grid">{transferNews.map((item) => <NewsCard item={item} key={item.id} bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div></> : <EmptyState title="Chưa có tin chuyển nhượng phù hợp" description="SportPeek sẽ hiển thị khi các nguồn RSS đăng tin có liên quan; hệ thống không điền dữ liệu giả." />}
    </section>
  </div>;
}

function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-hero"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
