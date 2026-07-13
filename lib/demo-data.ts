import type { Competition, Match, NewsItem, Standing, Team } from "./types";

export const competitions: Competition[] = [
  { id: "epl", name: "Premier League", slug: "premier-league", country: "Anh", season: "2025/26" },
  { id: "ucl", name: "Champions League", slug: "champions-league", country: "Châu Âu", season: "2025/26" },
  { id: "laliga", name: "La Liga", slug: "la-liga", country: "Tây Ban Nha", season: "2025/26" },
  { id: "seriea", name: "Serie A", slug: "serie-a", country: "Ý", season: "2025/26" },
  { id: "vleague", name: "V.League 1", slug: "v-league-1", country: "Việt Nam", season: "2025/26" },
];

const teamSeeds = [
  ["Arsenal", "ARS", "Anh", "#ef4444", "Emirates"], ["Liverpool", "LIV", "Anh", "#dc2626", "Anfield"],
  ["Manchester City", "MCI", "Anh", "#38bdf8", "Etihad"], ["Chelsea", "CHE", "Anh", "#2563eb", "Stamford Bridge"],
  ["Manchester United", "MUN", "Anh", "#e11d48", "Old Trafford"], ["Tottenham", "TOT", "Anh", "#e2e8f0", "Tottenham Hotspur Stadium"],
  ["Real Madrid", "RMA", "Tây Ban Nha", "#f8fafc", "Santiago Bernabéu"], ["Barcelona", "BAR", "Tây Ban Nha", "#7c3aed", "Camp Nou"],
  ["Atlético Madrid", "ATM", "Tây Ban Nha", "#ef4444", "Metropolitano"], ["Juventus", "JUV", "Ý", "#d4d4d8", "Allianz Stadium"],
  ["Inter Milan", "INT", "Ý", "#0ea5e9", "San Siro"], ["AC Milan", "MIL", "Ý", "#ef4444", "San Siro"],
  ["Bayern Munich", "BAY", "Đức", "#dc2626", "Allianz Arena"], ["Dortmund", "BVB", "Đức", "#facc15", "Signal Iduna Park"],
  ["PSG", "PSG", "Pháp", "#1d4ed8", "Parc des Princes"], ["Marseille", "OM", "Pháp", "#38bdf8", "Vélodrome"],
  ["Hà Nội FC", "HNF", "Việt Nam", "#7c3aed", "Hàng Đẫy"], ["Thể Công Viettel", "TCV", "Việt Nam", "#ef4444", "Mỹ Đình"],
  ["Nam Định", "NĐ", "Việt Nam", "#22c55e", "Thiên Trường"], ["Công An Hà Nội", "CAHN", "Việt Nam", "#dc2626", "Hàng Đẫy"],
] as const;

export const teams: Team[] = teamSeeds.map(([name, shortName, country, accent, stadium], index) => ({
  id: `team-${index + 1}`,
  name,
  shortName,
  slug: name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  country,
  accent,
  stadium,
}));

const demoStamp = "Dữ liệu minh họa";
export const news: NewsItem[] = [
  { id: "n1", title: "Arsenal hoàn tất buổi tập chiến thuật trước trận đại chiến", slug: "arsenal-hoan-tat-buoi-tap-chien-thuat", summary: "Đội ngũ SportPeek tổng hợp các cập nhật từ buổi tập mở, tập trung vào phương án kiểm soát tuyến giữa và tình hình lực lượng trước trận. Đây là nội dung mô phỏng cho trải nghiệm sản phẩm.", keyPoints: ["Đội hình chính tập đầy đủ", "Ưu tiên kiểm soát khu trung tuyến", "Danh sách thi đấu sẽ công bố sau"], category: "Trước trận", competition: "Premier League", team: "Arsenal", publishedAt: "12 phút trước", hotness: 82, reliability: 91, sources: ["Kênh CLB", "Sport Demo Daily"], imageTone: "red", featured: true },
  { id: "n2", title: "Bản tin chiến thuật: khoảng trống nào có thể định đoạt trận đấu?", slug: "ban-tin-chien-thuat-khoang-trong", summary: "Mô phỏng phân tích chiến thuật dựa trên dữ liệu mẫu, nêu ba khu vực có thể ảnh hưởng tới nhịp độ trận đấu.", keyPoints: ["Hai cánh là điểm nóng", "Pressing tầm cao được ưu tiên", "Bóng chết có thể tạo khác biệt"], category: "Phân tích", competition: "Champions League", team: "Real Madrid", publishedAt: "28 phút trước", hotness: 74, reliability: 86, sources: ["Tactical Lab", "Match Data Demo"], imageTone: "blue", featured: true },
  { id: "n3", title: "Câu lạc bộ cập nhật tình trạng hồi phục của tiền vệ trụ cột", slug: "cap-nhat-tinh-trang-hoi-phuc", summary: "Thông báo mẫu cho biết cầu thủ đã trở lại tập riêng và sẽ được đánh giá thêm trước khi thi đấu.", keyPoints: ["Đã trở lại sân tập", "Chưa có ngày tái xuất chính thức", "CLB tiếp tục theo dõi tải vận động"], category: "Chấn thương", competition: "Premier League", team: "Liverpool", publishedAt: "46 phút trước", hotness: 64, reliability: 94, sources: ["Kênh CLB"], imageTone: "amber" },
  { id: "n4", title: "Huấn luyện viên nhấn mạnh sự kiên nhẫn trong cuộc đua đường dài", slug: "hlv-nhan-manh-su-kien-nhan", summary: "Phát biểu minh họa tập trung vào quản trị thể lực, chiều sâu đội hình và sự ổn định trong giai đoạn lịch đấu dày.", keyPoints: ["Xoay tua hợp lý", "Tập trung từng trận", "Ưu tiên sức khỏe cầu thủ"], category: "Phát biểu", competition: "La Liga", team: "Barcelona", publishedAt: "1 giờ trước", hotness: 47, reliability: 88, sources: ["Press Room Demo"], imageTone: "violet" },
  { id: "n5", title: "Tin đồn chuyển nhượng: hai câu lạc bộ bắt đầu thăm dò", slug: "tin-don-chuyen-nhuong-tham-do", summary: "Nguồn mô phỏng cho rằng hai đội mới ở giai đoạn tìm hiểu điều kiện. Chưa có đề nghị chính thức và SportPeek không xem đây là thương vụ đã xác nhận.", keyPoints: ["Chưa có đề nghị chính thức", "Đàm phán chưa bắt đầu", "Độ tin cậy ở mức trung bình"], category: "Chuyển nhượng", competition: "Serie A", team: "Inter Milan", publishedAt: "2 giờ trước", hotness: 58, reliability: 61, sources: ["Transfer Wire Demo", "Sport Demo Daily"], imageTone: "green" },
  { id: "n6", title: "Ban tổ chức công bố điều chỉnh giờ thi đấu vòng kế tiếp", slug: "dieu-chinh-gio-thi-dau", summary: "Lịch thi đấu mẫu được điều chỉnh nhằm phù hợp điều kiện vận hành sân và khung phát sóng.", keyPoints: ["Hai trận đổi giờ", "Vé đã mua vẫn có hiệu lực", "Lịch trong ứng dụng đã cập nhật"], category: "Lịch đấu", competition: "V.League 1", team: "Hà Nội FC", publishedAt: "3 giờ trước", hotness: 41, reliability: 96, sources: ["Ban tổ chức giải"], imageTone: "cyan" },
  { id: "n7", title: "Đội hình dự kiến: cơ hội cho nhóm cầu thủ trẻ", slug: "doi-hinh-du-kien-co-hoi-cau-thu-tre", summary: "Bản dựng đội hình từ dữ liệu demo cho thấy một số vị trí có thể được xoay tua trong trận đấu cúp.", keyPoints: ["Hai cầu thủ trẻ có thể đá chính", "Hàng thủ được xoay tua", "Chưa phải đội hình chính thức"], category: "Đội hình", competition: "Champions League", team: "Manchester City", publishedAt: "4 giờ trước", hotness: 55, reliability: 72, sources: ["Match Data Demo"], imageTone: "sky" },
  { id: "n8", title: "Năm con số đáng chú ý sau vòng đấu", slug: "nam-con-so-dang-chu-y", summary: "Tổng hợp minh họa về số cơ hội, hiệu suất dứt điểm và khả năng kiểm soát bóng của các đội dẫn đầu.", keyPoints: ["Hiệu suất dứt điểm tăng", "Nhiều bàn từ bóng chết", "Các đội đầu bảng giữ phong độ"], category: "Dữ liệu", competition: "Premier League", team: "Manchester City", publishedAt: "5 giờ trước", hotness: 52, reliability: 90, sources: ["Match Data Demo", "Analytics Demo"], imageTone: "indigo" },
  { id: "n9", title: "Câu lạc bộ xác nhận gia hạn với hậu vệ trẻ", slug: "xac-nhan-gia-han-hau-ve-tre", summary: "Thông báo mô phỏng xác nhận hợp đồng mới và kế hoạch phát triển dài hạn cho cầu thủ học viện.", keyPoints: ["Hợp đồng dài hạn", "Cầu thủ tiếp tục ở đội một", "Thông tin từ kênh chính thức"], category: "Câu lạc bộ", competition: "Premier League", team: "Chelsea", publishedAt: "6 giờ trước", hotness: 49, reliability: 98, sources: ["Kênh CLB"], imageTone: "blue" },
  { id: "n10", title: "Phân tích phong độ sân khách trước vòng đấu mới", slug: "phan-tich-phong-do-san-khach", summary: "Dữ liệu mẫu cho thấy sự khác biệt về cường độ pressing và chất lượng cơ hội khi thi đấu xa nhà.", keyPoints: ["Pressing giảm sau phút 70", "Cơ hội rõ rệt vẫn ổn định", "Khả năng chuyển trạng thái là điểm mạnh"], category: "Phân tích", competition: "La Liga", team: "Atlético Madrid", publishedAt: "7 giờ trước", hotness: 38, reliability: 84, sources: ["Tactical Lab"], imageTone: "rose" },
  { id: "n11", title: "Kết quả mô phỏng: bàn thắng muộn tạo khác biệt", slug: "ket-qua-mo-phong-ban-thang-muon", summary: "Bản ghi dữ liệu demo mô tả một trận đấu được quyết định ở những phút cuối sau thế trận cân bằng.", keyPoints: ["Bàn thắng ở phút 88", "Hai đội tạo số cơ hội tương đương", "Thủ môn có bốn pha cứu thua"], category: "Kết quả", competition: "Serie A", team: "AC Milan", publishedAt: "8 giờ trước", hotness: 66, reliability: 92, sources: ["Match Data Demo"], imageTone: "red" },
  { id: "n12", title: "Lịch tập trung và kế hoạch chuẩn bị của đội bóng", slug: "lich-tap-trung-ke-hoach-chuan-bi", summary: "Cập nhật minh họa về thời gian hội quân, lịch kiểm tra thể lực và các buổi tập kín trước trận.", keyPoints: ["Hội quân đúng kế hoạch", "Hai buổi tập kín", "Kiểm tra thể lực toàn đội"], category: "Câu lạc bộ", competition: "V.League 1", team: "Nam Định", publishedAt: "Hôm qua", hotness: 34, reliability: 95, sources: ["Kênh CLB"], imageTone: "green" },
  { id: "n13", title: "Cập nhật công tác trọng tài và VAR cho vòng đấu", slug: "cap-nhat-trong-tai-var", summary: "Ban tổ chức mô phỏng danh sách điều hành trận và quy trình phối hợp VAR cho các trận tâm điểm.", keyPoints: ["Danh sách trọng tài đã công bố", "Kiểm tra thiết bị hoàn tất", "Quy trình phối hợp được nhắc lại"], category: "Giải đấu", competition: "Premier League", team: "Tottenham", publishedAt: "Hôm qua", hotness: 31, reliability: 93, sources: ["Ban tổ chức giải"], imageTone: "slate" },
  { id: "n14", title: "Tiền đạo trẻ dẫn đầu nhóm chỉ số tiến bộ", slug: "tien-dao-tre-chi-so-tien-bo", summary: "Bảng dữ liệu minh họa ghi nhận mức tăng ở số lần chạm bóng trong vùng cấm và chất lượng dứt điểm.", keyPoints: ["Tăng số lần chạm bóng", "Cải thiện chất lượng cơ hội", "Thời lượng thi đấu ổn định"], category: "Cầu thủ", competition: "Champions League", team: "Dortmund", publishedAt: "Hôm qua", hotness: 45, reliability: 87, sources: ["Analytics Demo"], imageTone: "yellow" },
  { id: "n15", title: "Bản tin tổng hợp cuối ngày: những điểm cần nhớ", slug: "ban-tin-tong-hop-cuoi-ngay", summary: "Bản tin demo gom các thay đổi lịch, cập nhật lực lượng và phát biểu đáng chú ý trong ngày.", keyPoints: ["Ba cập nhật lực lượng", "Hai thay đổi lịch", "Một thông báo chính thức"], category: "Tổng hợp", competition: "Nhiều giải", team: "Nhiều đội", publishedAt: "Hôm qua", hotness: 43, reliability: 89, sources: ["SportPeek Demo Desk"], imageTone: "lime" },
].map((item) => ({ ...item, category: `${item.category} · ${demoStamp}` }));

export const matches: Match[] = [
  { id: "m1", competition: "Premier League", home: "Arsenal", away: "Liverpool", homeScore: 2, awayScore: 1, startTime: "20:30", status: "live", minute: 67, venue: "Emirates" },
  { id: "m2", competition: "La Liga", home: "Barcelona", away: "Atlético Madrid", homeScore: 0, awayScore: 0, startTime: "21:00", status: "live", minute: 34, venue: "Camp Nou" },
  { id: "m3", competition: "Champions League", home: "Real Madrid", away: "Manchester City", homeScore: null, awayScore: null, startTime: "02:00", status: "scheduled", venue: "Santiago Bernabéu" },
  { id: "m4", competition: "Serie A", home: "Inter Milan", away: "Juventus", homeScore: null, awayScore: null, startTime: "01:45", status: "scheduled", venue: "San Siro" },
  { id: "m5", competition: "V.League 1", home: "Hà Nội FC", away: "Nam Định", homeScore: null, awayScore: null, startTime: "19:15", status: "scheduled", venue: "Hàng Đẫy" },
  { id: "m6", competition: "Premier League", home: "Chelsea", away: "Tottenham", homeScore: 3, awayScore: 2, startTime: "FT", status: "finished", venue: "Stamford Bridge" },
  { id: "m7", competition: "Serie A", home: "AC Milan", away: "Inter Milan", homeScore: 1, awayScore: 1, startTime: "FT", status: "finished", venue: "San Siro" },
  { id: "m8", competition: "Champions League", home: "Bayern Munich", away: "PSG", homeScore: 2, awayScore: 0, startTime: "FT", status: "finished", venue: "Allianz Arena" },
];

export const standings: Standing[] = [
  { position: 1, team: "Arsenal", played: 24, won: 17, drawn: 5, lost: 2, goalDifference: 31, points: 56, form: ["W", "W", "D", "W", "W"] },
  { position: 2, team: "Manchester City", played: 24, won: 16, drawn: 5, lost: 3, goalDifference: 28, points: 53, form: ["W", "D", "W", "W", "W"] },
  { position: 3, team: "Liverpool", played: 24, won: 15, drawn: 6, lost: 3, goalDifference: 25, points: 51, form: ["D", "W", "W", "L", "W"] },
  { position: 4, team: "Chelsea", played: 24, won: 13, drawn: 6, lost: 5, goalDifference: 17, points: 45, form: ["W", "L", "W", "D", "W"] },
  { position: 5, team: "Tottenham", played: 24, won: 12, drawn: 5, lost: 7, goalDifference: 10, points: 41, form: ["L", "W", "D", "W", "L"] },
  { position: 6, team: "Manchester United", played: 24, won: 11, drawn: 6, lost: 7, goalDifference: 7, points: 39, form: ["W", "D", "L", "W", "D"] },
];

export const players = Array.from({ length: 30 }, (_, index) => ({
  id: `player-${index + 1}`,
  name: ["Minh Quân", "Alex Martin", "Luka Silva", "Noah Williams", "Marco Rossi", "Kai Müller"][index % 6] + ` ${index + 1}`,
  team: teams[index % teams.length].name,
  position: ["Tiền đạo", "Tiền vệ", "Hậu vệ", "Thủ môn"][index % 4],
  nationality: teams[index % teams.length].country,
  goals: (index * 3) % 16,
  assists: (index * 2) % 11,
}));

export const transfers = Array.from({ length: 10 }, (_, index) => ({
  id: `transfer-${index + 1}`,
  player: players[index].name,
  from: teams[index].name,
  to: teams[(index + 6) % teams.length].name,
  status: index % 3 === 0 ? "Đã xác nhận" : index % 3 === 1 ? "Đang đàm phán" : "Tin đồn",
  reliability: index % 3 === 0 ? 94 : 58 + index * 3,
  fee: index % 3 === 0 ? `${20 + index * 4} triệu €` : "Chưa công bố",
  updated: `${index + 1} giờ trước`,
}));
