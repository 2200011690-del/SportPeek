import SportPeekApp from "@/components/SportPeekApp";

export const metadata = { title: "Tin đã lưu | SportPeek", robots: { index: false, follow: false } };

export default function BookmarksPage() {
  return <SportPeekApp route="/bookmarks" />;
}
