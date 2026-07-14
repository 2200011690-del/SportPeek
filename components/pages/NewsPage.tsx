"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, Check, Languages, Newspaper, Rss, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useRuntimeData } from "@/components/SportPeekApp";
import { HotnessBadge, ReliabilityBadge, NewsVisual, SectionHeading, DataLoadingState, EmptyState, Pagination, TeamMark } from "@/components/ui/badges";
import { FilterBar } from "@/components/ui/Search";
import { filterNewsItems, paginateItems, personalizedNewsItems, isTransferNews } from "@/lib/ui-logic";
import type { NewsItem } from "@/lib/types";

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
  const filtered = filterNewsItems(newsItems, { query, competition, team, minHotness });
  const pagination = paginateItems(filtered, page, 12);
  const updateFilter = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1); };
  const competitionOptions = [...new Set(newsItems.map((item) => item.competition))].sort();
  const teamOptions = [...new Set(newsItems.map((item) => item.team))].filter((value) => !/thể thao|bóng đá|nhiều đội/i.test(value)).sort();
  const aiMessage = aiStatus.state === "ok"
    ? aiTranslation
      ? ["Cloudflare AI đang dịch tin quốc tế sang tiếng Việt", "Bản dịch chỉ dựa trên tiêu đề và trích đoạn của nguồn, không tự thêm dữ kiện."]
      : ["Cloudflare AI đã sẵn sàng", "Chưa có tin tiếng Anh mới cần dịch trong lần cập nhật này."]
    : aiStatus.state === "error"
      ? ["Cloudflare AI đang tạm gián đoạn", "SportPeek vẫn hiển thị bản gốc và không tạo bản dịch giả khi AI lỗi hoặc hết hạn mức."]
      : ["Tin quốc tế đang hiển thị bản gốc", "AI chưa được bật trong môi trường này."];
  return <div className="page-content"><PageHero eyebrow="NEWSROOM" title="Tin nóng Việt Nam & thế giới" description="Tổng hợp nhiều báo thể thao, gộp các bài cùng sự kiện và xếp hạng mức quan tâm bằng tín hiệu minh bạch."><div className="hero-stat"><strong>{newsSources.length || newsItems.length}</strong><span>{loading ? "đang kết nối" : newsReal ? "nguồn đang hoạt động" : "nguồn tạm gián đoạn"}</span></div></PageHero><div className="personalization-banner"><div className="ai-orb"><Languages size={22} /></div><div><strong>{aiMessage[0]}</strong><p>{aiMessage[1]}</p></div><Link href="/sources">Xem phương pháp<ArrowRight size={15} /></Link></div><FilterBar search query={query} onQueryChange={updateFilter(setQuery)} competition={competition} onCompetitionChange={updateFilter(setCompetition)} competitionOptions={competitionOptions} team={team} onTeamChange={updateFilter(setTeam)} teamOptions={teamOptions} minHotness={minHotness} onMinHotnessChange={updateFilter(setMinHotness)} />{loading ? <DataLoadingState /> : pagination.items.length ? <><div className="results-summary">Hiển thị {pagination.items.length} trong {filtered.length} tin phù hợp</div><div className="news-page-grid">{pagination.items.map((item) => <NewsCard key={item.id} item={item} bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div><Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} /></> : <EmptyState title={newsReal ? "Không có tin phù hợp" : "Nguồn tin đang tạm gián đoạn"} description={newsReal ? "Hãy thử bỏ bớt bộ lọc hoặc dùng từ khóa khác." : "SportPeek không chèn dữ liệu giả. Hãy thử tải lại sau khi các nguồn RSS hoạt động."} />}</div>;
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
  const transferNews = filterNewsItems(newsItems.filter(isTransferNews), { query });
  return <div className="page-content"><PageHero eyebrow="MARKET WATCH" title="Tin chuyển nhượng" description="Chỉ hiển thị bài từ mạng lưới RSS; SportPeek không tự tạo cầu thủ, mức phí hay trạng thái thương vụ."><div className="window-status"><i />{newsReal ? "Nguồn báo chí đang hoạt động" : "Nguồn tin tạm gián đoạn"}</div></PageHero><div className="personalization-banner"><div className="ai-orb"><ShieldCheck size={22} /></div><div><strong>Phân biệt rõ tin đồn và xác nhận chính thức</strong><p>Hãy mở các nguồn đối chiếu trong từng bài trước khi xem một thương vụ là hoàn tất.</p></div><Link href="/sources">Nguồn & phương pháp<ArrowRight size={15} /></Link></div><FilterBar search query={query} onQueryChange={setQuery} />{loading ? <DataLoadingState /> : transferNews.length ? <><div className="results-summary">Tìm thấy {transferNews.length} tin chuyển nhượng từ các nguồn đang theo dõi</div><div className="news-page-grid">{transferNews.map((item) => <NewsCard item={item} key={item.id} bookmarked={bookmarks.has(item.id)} onBookmark={onBookmark} />)}</div></> : <EmptyState title="Chưa có tin chuyển nhượng phù hợp" description="SportPeek sẽ hiển thị khi các nguồn RSS đăng tin có liên quan; hệ thống không điền dữ liệu giả." />}</div>;
}

function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-hero"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
