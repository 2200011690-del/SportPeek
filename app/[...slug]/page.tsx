import type { Metadata } from "next";
import SportPeekApp from "@/components/SportPeekApp";

type PageProps = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const route = slug.join("/");
  const labels: Record<string, string> = {
    news: "Tin mới nhất", live: "Trận đấu trực tiếp", fixtures: "Lịch thi đấu", results: "Kết quả",
    standings: "Bảng xếp hạng", transfers: "Chuyển nhượng", search: "Tìm kiếm", bookmarks: "Tin đã lưu",
    settings: "Cài đặt", admin: "Quản trị", login: "Đăng nhập", register: "Đăng ký", "reset-password": "Đặt lại mật khẩu",
  };
  return { title: `${labels[slug[0]] ?? route.replaceAll("-", " ")} | SportPeek`, robots: ["settings", "admin", "bookmarks"].includes(slug[0]) ? { index: false, follow: false } : undefined };
}

export default async function CatchAllPage({ params }: PageProps) {
  const { slug } = await params;
  return <SportPeekApp route={`/${slug.join("/")}`} />;
}
