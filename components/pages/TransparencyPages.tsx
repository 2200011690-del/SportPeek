"use client";

import React, { useMemo, useState } from "react";
import { Check, Globe2, Search, ShieldCheck } from "lucide-react";
import { useRuntimeData } from "@/components/runtime/RuntimeDataContext";
import { DataLoadingState } from "@/components/ui/badges";

const getInitials = (name: string) => (name?.trim() || "NP").split(" ").map((word) => word[0]).slice(-2).join("").toUpperCase();

function formatStoryTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Không rõ thời gian";
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

export function LegalPage({ type }: { type: string }) {
  const titles: Record<string, string> = {
    terms: "Điều khoản sử dụng",
    privacy: "Chính sách quyền riêng tư",
    copyright: "Bản quyền & nội dung",
    sources: "Nguồn tin & phương pháp",
    about: "Giới thiệu NewsPeek",
    methodology: "Phương pháp tổng hợp tin tức",
    "ai-policy": "Chính sách sử dụng AI & Dẫn nguồn",
    "correction-policy": "Chính sách đính chính & Báo lỗi",
  };

  if (type === "about") {
    return (
      <div className="legal-page">
        <span className="eyebrow">NEWSPEEK · TỔNG QUAN</span>
        <h1>Giới thiệu NewsPeek</h1>
        <p className="legal-lead">
          “Bản tin đa nguồn dành cho người Việt — cho biết điều gì đã được xác nhận, điều gì còn khác biệt và mỗi dữ kiện đến từ đâu.”
        </p>
        <section>
          <h2>Sứ mệnh</h2>
          <p>
            NewsPeek biến trải nghiệm đọc tin tức hỗn loạn thành một dòng thông tin minh bạch, liền mạch. Hệ thống tự động thu thập từ hàng chục nguồn báo chí uy tín tại Việt Nam và quốc tế, gộp các bài nói về cùng một sự kiện và viết lại thành bản tổng hợp ngắn gọn, chính xác.
          </p>
        </section>
        <section>
          <h2>Các trạng thái xác thực tin tức</h2>
          <ul>
            <li><strong>Chính thức (Official):</strong> Đã có phát ngôn hoặc văn bản chính thức từ cơ quan nhà nước, tổ chức hoặc nhân vật liên quan.</li>
            <li><strong>Nhiều nguồn (Reported):</strong> Đã được độc lập xác nhận bởi ít nhất 2 nhà xuất bản báo chí khác nhau.</li>
            <li><strong>Một nguồn (Developing):</strong> Mới được đưa tin bởi 1 nguồn tin đơn lẻ, đang tiếp tục theo dõi diễn biến.</li>
            <li><strong>Tin đồn / Chưa xác minh (Unverified/Rumor):</strong> Tin tức mang tính dự đoán, dẫn nguồn ẩn danh hoặc có ý kiến mâu thuẫn.</li>
          </ul>
        </section>
      </div>
    );
  }

  if (type === "methodology") {
    return (
      <div className="legal-page">
        <span className="eyebrow">NEWSPEEK · PHƯƠNG PHÁP</span>
        <h1>Phương pháp tổng hợp tin tức</h1>
        <p className="legal-lead">
          NewsPeek áp dụng thuật toán gom cụm đa tầng (Deterministic Clustering Strategy) ưu tiên tính chính xác và hiệu năng tài nguyên.
        </p>
        <section>
          <h2>Quy trình xử lý dữ liệu</h2>
          <ol>
            <li><strong>Chuẩn hóa & Nhận diện thực thể:</strong> Tách thực thể tên người, tổ chức, địa danh, con số, mốc thời gian và hành động chính trong tiêu đề.</li>
            <li><strong>Cửa sổ thời gian & Phân loại sự kiện:</strong> Giới hạn sự kiện trùng trong cửa sổ thời gian từ 24h đến 72h tùy theo loại tin (breaking news vs. điều tra).</li>
            <li><strong>Tín hiệu tách sự kiện:</strong> Các bài báo khác ngày, khác con số thực tế (t số thứ tự, kết quả), khác địa điểm hoặc hành động sẽ được ngăn gộp nhầm tuyệt đối.</li>
            <li><strong>Đánh giá độ tin cậy:</strong> Mỗi cụm tin nhận điểm Hotness và Reliability dựa trên uy tín nguồn, số nguồn độc lập và nguồn chính thức.</li>
          </ol>
        </section>
      </div>
    );
  }

  if (type === "ai-policy") {
    return (
      <div className="legal-page">
        <span className="eyebrow">NEWSPEEK · TRÍ TUỆ NHÂN TẠO</span>
        <h1>Chính sách sử dụng AI & Dẫn nguồn</h1>
        <p className="legal-lead">
          AI tại NewsPeek là công cụ hỗ trợ tổng hợp thông tin, không phải tác giả sáng tác độc lập và không tự bịa đặt dữ kiện ngoài nguồn tin gốc.
        </p>
        <section>
          <h2>Nguyên tắc hoạt động của AI</h2>
          <ul>
            <li><strong>100% Căn cứ nguồn (Evidence-Grounded):</strong> Mọi dữ kiện trong bản tổng hợp AI đều có thể truy ngược đến bài báo gốc hỗ trợ claim đó.</li>
            <li><strong>Tôn trọng bản quyền & Paywall:</strong> AI không vượt tường phí (paywall), không bẻ khóa CAPTCHA và chỉ sử dụng nội dung do nguồn cung cấp hợp lệ.</li>
            <li><strong>Phân định rõ ràng:</strong> Phân biệt điểm các nguồn thống nhất (agreedFacts) và điểm chưa thống nhất hoặc thông tin trái chiều (disputedPoints).</li>
            <li><strong>Kiểm soát Prompt Injection:</strong> Nội dung bài báo được xử lý qua lớp lọc an toàn để ngăn lệnh độc hại làm sai lệch kết quả AI.</li>
          </ul>
        </section>
      </div>
    );
  }

  if (type === "correction-policy") {
    return (
      <div className="legal-page">
        <span className="eyebrow">NEWSPEEK · MINH BẠCH</span>
        <h1>Chính sách đính chính & Đóng góp</h1>
        <p className="legal-lead">
          Chúng tôi coi trọng tính chính xác của thông tin và cam kết cập nhật công khai khi có đính chính từ nguồn báo chí gốc.
        </p>
        <section>
          <h2>Quy trình đính chính</h2>
          <p>
            Khi một tòa soạn phát hành tin đính chính hoặc cập nhật thông tin mới, hệ thống NewsPeek sẽ tự động gắn nhãn <strong>Correction</strong> và cập nhật bản tóm tắt để phản ánh thông tin chính xác nhất.
          </p>
        </section>
        <section>
          <h2>Báo lỗi nội dung</h2>
          <p>
            Nếu bạn phát hiện tin tức bị gộp sai cụm, bản tóm tắt AI có lỗi hoặc thông tin chưa chính xác, xin vui lòng gửi phản hồi qua mục Cài đặt hoặc kênh hỗ trợ chính thức.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="legal-page">
      <span className="eyebrow">NEWSPEEK · MINH BẠCH</span>
      <h1>{titles[type] ?? "Thông tin"}</h1>
      <p className="legal-lead">Cập nhật lần cuối: 20/07/2026. Phương pháp này áp dụng cho bảng tin tổng hợp Việt Nam và quốc tế.</p>
      <section>
        <h2>Mạng lưới nguồn</h2>
        <p>NewsPeek đọc RSS công khai từ các nhà xuất bản Việt Nam và quốc tế như VnExpress, Tuổi Trẻ, Thanh Niên, Dân trí, VietNamNet, BBC, The Guardian, Al Jazeera, NPR và DW. Nguồn có thể tạm dừng nếu feed lỗi hoặc chính sách của nhà xuất bản thay đổi.</p>
      </section>
      <section>
        <h2>Dịch và tóm tắt</h2>
        <p>AI gộp các dữ kiện chung, loại bỏ câu lặp, dịch bài quốc tế sang tiếng Việt và giữ riêng những điểm chưa thống nhất. Bản tóm tắt chỉ được tạo khi người đọc yêu cầu hoặc khi newsroom đã xử lý trước; hệ thống không tự bổ sung dữ kiện ngoài nguồn.</p>
      </section>
      <section>
        <h2>Điểm nổi bật</h2>
        <p>Điểm nổi bật được ước tính từ độ mới, số nguồn độc lập, uy tín nguồn và mức ảnh hưởng của sự kiện. Đây không phải lượt đọc, lượt chia sẻ hoặc số người xem thật của các tòa soạn.</p>
      </section>
      <section>
        <h2>Quyền của nguồn tin</h2>
        <p>NewsPeek hiển thị toàn văn khi nhà xuất bản cấp nội dung qua RSS hoặc cho phép đọc công khai trên trang bài viết. Nếu nguồn chặn trích xuất, đặt paywall hoặc yêu cầu đăng nhập, NewsPeek chỉ hiển thị trích đoạn và liên kết bài gốc; hệ thống không vượt chặn và không tải lại video.</p>
      </section>
    </div>
  );
}

export function SourcesPage({ followed, onFollow }: { followed: Set<string>; onFollow: (id: string, type?: "source") => void }) {
  type SourceTab = "all" | "vietnam" | "international" | "official" | "following";
  const { sourceCatalog, loading } = useRuntimeData();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SourceTab>("all");
  const [language, setLanguage] = useState<"all" | "vi" | "en">("all");
  const [status, setStatus] = useState<"all" | "active" | "issues">("active");
  const filteredSources = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return sourceCatalog.filter((source) => {
      if (normalized && !source.name.toLocaleLowerCase("vi").includes(normalized)) return false;
      if (tab === "vietnam" && source.language !== "vi") return false;
      if (tab === "international" && source.language !== "en") return false;
      if (tab === "official" && !source.official) return false;
      if (tab === "following" && !followed.has(source.id)) return false;
      if (language !== "all" && source.language !== language) return false;
      if (status === "active" && (!source.active || source.lastError)) return false;
      if (status === "issues" && source.active && !source.lastError) return false;
      return true;
    });
  }, [followed, language, query, sourceCatalog, status, tab]);
  const tabs: Array<[SourceTab, string]> = [
    ["all", "Tất cả"],
    ["vietnam", "Việt Nam"],
    ["international", "Quốc tế"],
    ["official", "Chính thức"],
    ["following", "Đang theo dõi"],
  ];
  return (
    <div className="legal-page sources-page">
      <header className="source-directory-header">
        <span className="eyebrow">MẠNG LƯỚI NEWSPEEK</span>
        <h1>Nguồn tin</h1>
        <p className="legal-lead">
          Khám phá các nhà xuất bản đang cung cấp dữ liệu cho NewsPeek. Theo dõi nguồn chỉ điều chỉnh bảng tin cá nhân, không thay đổi đánh giá nội dung.
        </p>
        <label className="source-search">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only">Tìm nguồn tin</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên nguồn…" />
        </label>
      </header>
      <div className="source-directory-controls">
        <div className="source-tabs" role="tablist" aria-label="Nhóm nguồn tin">
          {tabs.map(([value, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "active" : ""}
              key={value}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="source-selects">
          <label>
            <span>Ngôn ngữ</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
              <option value="all">Tất cả</option>
              <option value="vi">Tiếng Việt</option>
              <option value="en">Tiếng Anh</option>
            </select>
          </label>
          <label>
            <span>Trạng thái</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="active">Đang hoạt động</option>
              <option value="issues">Đang tắt hoặc có lỗi</option>
              <option value="all">Tất cả</option>
            </select>
          </label>
        </div>
      </div>
      {loading ? (
        <DataLoadingState label="Đang tải danh mục nguồn" />
      ) : filteredSources.length ? (
        <>
          <p className="source-result-count" aria-live="polite">{filteredSources.length} nguồn phù hợp</p>
          <div className="source-directory-list">
            {filteredSources.map((source) => {
              const healthy = source.active && !source.lastError;
              return (
                <article className="source-row" key={source.id}>
                  <span className="source-row-logo" aria-hidden="true">{getInitials(source.name)}</span>
                  <div className="source-row-main">
                    <div className="source-row-heading">
                      <h2>{source.name}</h2>
                      {source.official && <span title="Nguồn thuộc cơ quan hoặc tổ chức chính thức"><ShieldCheck size={14} />Chính thức</span>}
                    </div>
                    <p>
                      {source.language === "vi" ? "Nhà xuất bản tiếng Việt" : "Nhà xuất bản quốc tế bằng tiếng Anh"}
                      {" · "}
                      <span className={healthy ? "active-text" : "warning-text"}>{healthy ? "Đang hoạt động" : "Cần kiểm tra"}</span>
                    </p>
                    <details>
                      <summary>Thông tin kỹ thuật</summary>
                      <dl>
                        <div><dt>Điểm cấu hình</dt><dd>{source.reliability}/100</dd></div>
                        <div><dt>Cập nhật cuối</dt><dd>{source.lastFetchedAt ? formatStoryTime(source.lastFetchedAt) : "Chưa đồng bộ"}</dd></div>
                        <div><dt>Ngôn ngữ</dt><dd>{source.language === "vi" ? "Tiếng Việt" : "Tiếng Anh"}</dd></div>
                      </dl>
                    </details>
                  </div>
                  <button
                    className={`follow-button ${followed.has(source.id) ? "following" : ""}`}
                    onClick={() => onFollow(source.id, "source")}
                  >
                    {followed.has(source.id) ? <><Check size={16} />Đang theo dõi</> : <><Globe2 size={16} />Theo dõi</>}
                  </button>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="source-empty">
          <Search size={24} />
          <strong>Không có nguồn phù hợp</strong>
          <p>Thử đổi từ khóa hoặc bộ lọc trạng thái.</p>
        </div>
      )}
      <div className="source-methodology">
        <section>
          <h2>Phương pháp tổng hợp</h2>
          <p>NewsPeek gom các bài cùng sự kiện, loại bỏ phần trùng và luôn giữ liên kết tới nhà xuất bản. Hệ thống chỉ sử dụng nội dung công khai hoặc nội dung nguồn cung cấp hợp lệ.</p>
        </section>
        <section>
          <h2>Điểm cấu hình có ý nghĩa gì?</h2>
          <p>Điểm này phản ánh cấu hình vận hành của nguồn, không phải phán quyết về độ đúng của từng bài và không thay thế việc đối chiếu thông tin gốc.</p>
        </section>
      </div>
    </div>
  );
}
