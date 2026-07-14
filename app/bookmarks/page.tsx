import SportPeekApp from "@/components/SportPeekApp";
import { isPublicSignupAllowed } from "@/lib/config";

export const metadata = { title: "Tin đã lưu | SportPeek", robots: { index: false, follow: false } };

export default function BookmarksPage() {
  return <SportPeekApp route="/bookmarks" signupAllowed={isPublicSignupAllowed()} />;
}
