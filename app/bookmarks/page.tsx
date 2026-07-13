import { redirect } from "next/navigation";
import SportPeekApp from "@/components/SportPeekApp";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin đã lưu | SportPeek", robots: { index: false, follow: false } };

export default async function BookmarksPage() {
  const client = await createClient();
  if (client) { const { data: { user } } = await client.auth.getUser(); if (!user) redirect("/login?next=/bookmarks"); }
  return <SportPeekApp route="/bookmarks" />;
}
