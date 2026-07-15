import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import SportPeekApp from "@/components/SportPeekApp";
import { isInternalMode, isPublicSignupAllowed } from "@/lib/config";

type PageProps = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const route = slug.join("/");
  const labels: Record<string, string> = {
    "for-you": "Dành cho bạn", news: "Tin mới nhất", live: "Trận đấu trực tiếp", fixtures: "Lịch thi đấu", results: "Kết quả",
    standings: "Bảng xếp hạng", transfers: "Chuyển nhượng", search: "Tìm kiếm", bookmarks: "Tin đã lưu",
    settings: "Cài đặt", sources: "Nguồn tin & phương pháp", terms: "Điều khoản sử dụng",
    privacy: "Chính sách quyền riêng tư", copyright: "Bản quyền & nội dung", admin: "Quản trị",
    login: "Đăng nhập", register: "Đăng ký", "forgot-password": "Khôi phục mật khẩu", "reset-password": "Đặt lại mật khẩu",
  };
  const detailLabels: Record<string, string> = {
    news: "Chi tiết tin", matches: "Chi tiết trận đấu", teams: "Hồ sơ đội bóng",
    players: "Hồ sơ cầu thủ", competitions: "Hồ sơ giải đấu",
  };
  const title = slug.length > 1 ? detailLabels[slug[0]] ?? labels[slug[0]] : labels[slug[0]];
  const privateRoutes = ["settings", "admin", "bookmarks", "search", "login", "register", "forgot-password", "reset-password"];
  return {
    title: title ?? route.replaceAll("-", " "),
    alternates: { canonical: `/${route}` },
    robots: isInternalMode() || privateRoutes.includes(slug[0]) ? { index: false, follow: false } : undefined,
  };
}

export default async function CatchAllPage({ params }: PageProps) {
  const { slug } = await params;
  const staticRoutes = new Set([
    "for-you", "news", "live", "fixtures", "results", "standings", "transfers", "search", "bookmarks",
    "settings", "sources", "terms", "privacy", "copyright", "login", "register", "forgot-password", "reset-password",
  ]);
  const dynamicRoutes = new Set(["news", "matches", "teams", "players", "competitions"]);
  const validRoute = slug.length === 1 ? staticRoutes.has(slug[0]) : slug.length === 2 && dynamicRoutes.has(slug[0]) && Boolean(slug[1]);
  if (!validRoute) notFound();
  if (slug[0] === "register" && isInternalMode()) redirect("/login?error=invitation_only");
  return <SportPeekApp route={`/${slug.join("/")}`} signupAllowed={isPublicSignupAllowed()} />;
}
