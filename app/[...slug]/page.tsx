import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import SportPeekApp from "@/components/SportPeekApp";
import { storyService } from "@/lib/application/story-service";
import { isInternalMode, isPublicSignupAllowed } from "@/lib/config";
import { buildNewsArticleJsonLd, buildStoryMetadata, serializeJsonLd } from "@/lib/stories/seo";

type PageProps = { params: Promise<{ slug: string[] }> };

const loadStoryPageData = cache(async (slug: string) => {
  try {
    const result = await storyService.getBySlug(slug);
    return result.data ?? null;
  } catch {
    // SEO enrichment must not take the public route down when the persisted
    // cache is temporarily unavailable or a migration is still rolling out.
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const route = slug.join("/");
  if (slug.length === 2 && slug[0] === "news") {
    const story = (await loadStoryPageData(slug[1]))?.story ?? null;
    if (story) {
      return {
        ...buildStoryMetadata(story),
        robots: isInternalMode() ? { index: false, follow: false, noarchive: true, nosnippet: true } : undefined,
      };
    }
  }
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
  const storyData = slug.length === 2 && slug[0] === "news" ? await loadStoryPageData(slug[1]) : null;
  const story = storyData?.story ?? null;
  if (story && story.slug !== slug[1]) redirect(`/news/${story.slug}`);
  const jsonLd = story ? serializeJsonLd(buildNewsArticleJsonLd(story)) : null;
  return <>
    {jsonLd ? <script id="sportpeek-newsarticle" type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} /> : null}
    <SportPeekApp route={`/${slug.join("/")}`} signupAllowed={isPublicSignupAllowed()} initialStory={storyData} />
  </>;
}
