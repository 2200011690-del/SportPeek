"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useRuntimeData } from "@/components/SportPeekApp";
import { DataLoadingState } from "@/components/ui/badges";

const getInitials = (name: string) => (name?.trim() || "TBD").split(" ").map((word) => word[0]).slice(-2).join("").toUpperCase();

function formatStoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

export function LegalPage({ type }: { type: string }) {
  const titles: Record<string, string> = { terms: "Điều khoản sử dụng", privacy: "Chính sách quyền riêng tư", copyright: "Bản quyền & nội dung", sources: "Nguồn tin & phương pháp" };
  return <div className="legal-page"><span className="eyebrow">SPORTPEEK · MINH BẠCH</span><h1>{titles[type] ?? "Thông tin"}</h1><p className="legal-lead">Cập nhật lần cuối: 13/07/2026. Phương pháp này áp dụng cho bảng tin tổng hợp đang hoạt động.</p><section><h2>Mạng lưới nguồn</h2><p>SportPeek đọc RSS công khai của VFF, VPF, VnExpress, Tuổi Trẻ, Thanh Niên, VietNamNet, Dân trí, VOV, BBC Sport, The Guardian, ESPN và Sky Sports. Nguồn có thể tạm dừng nếu feed lỗi hoặc chính sách của nhà xuất bản thay đổi.</p></section><section><h2>Dịch và tóm tắt</h2><p>Với bài tiếng Anh, AI chỉ dịch và tóm tắt từ tiêu đề cùng trích đoạn mà RSS cung cấp. Hệ thống được yêu cầu giữ tên riêng, không thêm dữ kiện và luôn giữ liên kết về bài gốc.</p></section><section><h2>Điểm nóng</h2><p>Điểm nóng là chỉ số quan tâm ước tính từ độ mới, số nguồn độc lập cùng đưa, uy tín nguồn và tầm quan trọng của sự kiện. Đây không phải lượt đọc, lượt chia sẻ hoặc số người xem thật của các tòa soạn.</p></section><section><h2>Quyền của nguồn tin</h2><p>SportPeek không đăng lại toàn văn, không vượt paywall và không tải lại video. Người dùng được dẫn về nguồn gốc để đọc đầy đủ. Yêu cầu chỉnh sửa hoặc gỡ nội dung sẽ được bổ sung kênh tiếp nhận trước khi phát hành thương mại.</p></section></div>;
}

export function SourcesPage({ followed, onFollow }: { followed: Set<string>; onFollow: (id: string, type?: "team" | "player" | "competition" | "source") => void }) {
  const { sourceCatalog, loading } = useRuntimeData();
  return <div className="legal-page sources-page"><span className="eyebrow">SPORTPEEK · MINH BẠCH</span><h1>Nguồn tin & phương pháp</h1><p className="legal-lead">Danh mục này đọc trực tiếp từ Supabase. Theo dõi nguồn sẽ trở thành một tín hiệu trong feed cá nhân, nhưng không ghi đè độ tin cậy và diversity penalty.</p>{loading ? <DataLoadingState label="Đang tải source catalog" /> : <div className="source-catalog-grid">{sourceCatalog.map((source) => <article className="content-card" key={source.id}><div className="story-source-heading"><span className="source-avatar">{getInitials(source.name)}</span><div><strong>{source.name}</strong><small>{source.language === "en" ? "Quốc tế · Tiếng Anh" : "Việt Nam · Tiếng Việt"}{source.official ? " · Chính thức" : ""}</small></div></div><dl className="profile-list"><div><dt>Độ tin cậy cấu hình</dt><dd>{source.reliability}/100</dd></div><div><dt>Cập nhật cuối</dt><dd>{source.lastFetchedAt ? formatStoryTime(source.lastFetchedAt) : "Chưa đồng bộ"}</dd></div><div><dt>Trạng thái</dt><dd className={source.active && !source.lastError ? "active-text" : ""}>{!source.active ? "Đã tắt" : source.lastError ? "Có lỗi gần nhất" : "Đang hoạt động"}</dd></div></dl><button className={`follow-button ${followed.has(source.id) ? "following" : ""}`} onClick={() => onFollow(source.id, "source")}>{followed.has(source.id) ? <><Check size={16} />Đang theo dõi</> : <>+ Theo dõi nguồn</>}</button></article>)}</div>}<section><h2>Phương pháp tổng hợp</h2><p>SportPeek lưu metadata và trích đoạn ngắn từ RSS, gom các bài cùng sự kiện thành một story, ghi rõ nguồn độc lập, nguồn chính thức, điểm chưa thống nhất và liên kết về bài gốc. Hệ thống không đăng lại toàn văn, không vượt paywall và không tải lại video.</p></section><section><h2>Giới hạn của điểm nóng</h2><p>Điểm nóng là ước tính từ độ mới, số nguồn, độ uy tín và tầm quan trọng sự kiện; không phải lượt xem thật của tòa soạn. Feed cá nhân còn dùng follow, bookmark, reading history và phạt lặp chủ đề, nhưng mỗi card luôn giải thích lý do.</p></section></div>;
}
