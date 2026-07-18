"use client";

import React from "react";
import { Check } from "lucide-react";
import { useRuntimeData } from "@/components/runtime/RuntimeDataContext";
import { DataLoadingState } from "@/components/ui/badges";

const getInitials = (name: string) => (name?.trim() || "NP").split(" ").map((word) => word[0]).slice(-2).join("").toUpperCase();

function formatStoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

export function LegalPage({ type }: { type: string }) {
  const titles: Record<string, string> = { terms: "Điều khoản sử dụng", privacy: "Chính sách quyền riêng tư", copyright: "Bản quyền & nội dung", sources: "Nguồn tin & phương pháp" };
  return <div className="legal-page"><span className="eyebrow">NEWSPEEK · MINH BẠCH</span><h1>{titles[type] ?? "Thông tin"}</h1><p className="legal-lead">Cập nhật lần cuối: 17/07/2026. Phương pháp này áp dụng cho bảng tin tổng hợp Việt Nam và quốc tế.</p><section><h2>Mạng lưới nguồn</h2><p>NewsPeek đọc RSS công khai từ các nhà xuất bản Việt Nam và quốc tế như VnExpress, Tuổi Trẻ, Thanh Niên, Dân trí, VietNamNet, BBC, The Guardian, Al Jazeera, NPR và DW. Nguồn có thể tạm dừng nếu feed lỗi hoặc chính sách của nhà xuất bản thay đổi.</p></section><section><h2>Dịch và tóm tắt</h2><p>AI gộp các dữ kiện chung, loại bỏ câu lặp, dịch bài quốc tế sang tiếng Việt và giữ riêng những điểm chưa thống nhất. Hệ thống chỉ dùng dữ kiện trong bài nguồn, giữ tên riêng và không tự bổ sung thông tin.</p></section><section><h2>Điểm nổi bật</h2><p>Điểm nổi bật được ước tính từ độ mới, số nguồn độc lập, uy tín nguồn và mức ảnh hưởng của sự kiện. Đây không phải lượt đọc, lượt chia sẻ hoặc số người xem thật của các tòa soạn.</p></section><section><h2>Quyền của nguồn tin</h2><p>NewsPeek không đăng lại toàn văn, không vượt paywall và không tải lại video. Mỗi bản tóm tắt luôn giữ liên kết để người đọc mở bài gốc.</p></section></div>;
}

export function SourcesPage({ followed, onFollow }: { followed: Set<string>; onFollow: (id: string, type?: "source") => void }) {
  const { sourceCatalog, loading } = useRuntimeData();
  return <div className="legal-page sources-page"><span className="eyebrow">NEWSPEEK · MINH BẠCH</span><h1>Nguồn tin & phương pháp</h1><p className="legal-lead">Danh mục nguồn được đồng bộ trực tiếp từ hệ thống. Theo dõi nguồn sẽ trở thành một tín hiệu trong bảng tin cá nhân nhưng không thay đổi điểm tin cậy.</p>{loading ? <DataLoadingState label="Đang tải danh mục nguồn" /> : <div className="source-catalog-grid">{sourceCatalog.map((source) => <article className="content-card" key={source.id}><div className="story-source-heading"><span className="source-avatar">{getInitials(source.name)}</span><div><strong>{source.name}</strong><small>{source.language === "en" ? "Quốc tế · Tiếng Anh" : "Việt Nam · Tiếng Việt"}{source.official ? " · Chính thức" : ""}</small></div></div><dl className="profile-list"><div><dt>Độ tin cậy cấu hình</dt><dd>{source.reliability}/100</dd></div><div><dt>Cập nhật cuối</dt><dd>{source.lastFetchedAt ? formatStoryTime(source.lastFetchedAt) : "Chưa đồng bộ"}</dd></div><div><dt>Trạng thái</dt><dd className={source.active && !source.lastError ? "active-text" : ""}>{!source.active ? "Đã tắt" : source.lastError ? "Có lỗi gần nhất" : "Đang hoạt động"}</dd></div></dl><button className={`follow-button ${followed.has(source.id) ? "following" : ""}`} onClick={() => onFollow(source.id, "source")}>{followed.has(source.id) ? <><Check size={16} />Đang theo dõi</> : <>+ Theo dõi nguồn</>}</button></article>)}</div>}<section><h2>Phương pháp tổng hợp</h2><p>NewsPeek lưu metadata và trích đoạn ngắn từ RSS, gom các bài cùng sự kiện thành một câu chuyện, gộp dữ kiện trùng và luôn dẫn về bài gốc. Hệ thống không đăng lại toàn văn, không vượt paywall và không tải lại video.</p></section><section><h2>Giới hạn của điểm nổi bật</h2><p>Điểm nổi bật là ước tính từ độ mới, số nguồn, độ uy tín và mức ảnh hưởng; không phải lượt xem thật của tòa soạn. Bảng tin cá nhân còn dùng nguồn theo dõi, bài đã lưu và lịch sử đọc.</p></section></div>;
}
