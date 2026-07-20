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
        <p>NewsPeek chỉ hiển thị toàn văn khi nhà xuất bản chủ động cấp nội dung đó qua RSS. Nếu nguồn chỉ cấp metadata, chặn truy cập hoặc có paywall, NewsPeek hiển thị trích đoạn và liên kết bài gốc; hệ thống không vượt chặn và không tải lại video.</p>
      </section>
    </div>
  );
}

export function SourcesPage({ followed, onFollow }: { followed: Set<string>; onFollow: (id: string, type?: "source") => void }) {
  const { sourceCatalog, loading } = useRuntimeData();
  return <div className="legal-page sources-page"><span className="eyebrow">NEWSPEEK · MINH BẠCH</span><h1>Nguồn tin & phương pháp</h1><p className="legal-lead">Danh mục nguồn được đồng bộ trực tiếp từ hệ thống. Theo dõi nguồn sẽ trở thành một tín hiệu trong bảng tin cá nhân nhưng không thay đổi điểm tin cậy.</p>{loading ? <DataLoadingState label="Đang tải danh mục nguồn" /> : <div className="source-catalog-grid">{sourceCatalog.map((source) => <article className="content-card" key={source.id}><div className="story-source-heading"><span className="source-avatar">{getInitials(source.name)}</span><div><strong>{source.name}</strong><small>{source.language === "en" ? "Quốc tế · Tiếng Anh" : "Việt Nam · Tiếng Việt"}{source.official ? " · Chính thức" : ""}</small></div></div><dl className="profile-list"><div><dt>Độ tin cậy cấu hình</dt><dd>{source.reliability}/100</dd></div><div><dt>Cập nhật cuối</dt><dd>{source.lastFetchedAt ? formatStoryTime(source.lastFetchedAt) : "Chưa đồng bộ"}</dd></div><div><dt>Trạng thái</dt><dd className={source.active && !source.lastError ? "active-text" : ""}>{!source.active ? "Đã tắt" : source.lastError ? "Có lỗi gần nhất" : "Đang hoạt động"}</dd></div></dl><button className={`follow-button ${followed.has(source.id) ? "following" : ""}`} onClick={() => onFollow(source.id, "source")}>{followed.has(source.id) ? <><Check size={16} />Đang theo dõi</> : <>+ Theo dõi nguồn</>}</button></article>)}</div>}<section><h2>Phương pháp tổng hợp</h2><p>NewsPeek lưu metadata, trích đoạn và toàn văn do nhà xuất bản cấp qua RSS; gom các bài cùng sự kiện, gộp dữ kiện trùng và luôn dẫn về bài gốc. Với nguồn không cấp toàn văn, người đọc được chuyển đến trang báo; hệ thống không vượt paywall và không tải lại video.</p></section><section><h2>Giới hạn của điểm nổi bật</h2><p>Điểm nổi bật là ước tính từ độ mới, số nguồn, độ uy tín và mức ảnh hưởng; không phải lượt xem thật của tòa soạn. Bảng tin cá nhân còn dùng nguồn theo dõi, bài đã lưu và lịch sử đọc.</p></section></div>;
}
