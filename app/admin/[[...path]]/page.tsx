import { redirect } from "next/navigation";
import SportPeekApp from "@/components/SportPeekApp";
import { getCurrentUserRole } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quản trị | SportPeek", robots: { index: false, follow: false } };

export default async function AdminPage({ params }: { params: Promise<{ path?: string[] }> }) {
  const auth = await getCurrentUserRole();
  if (auth.mode === "supabase" && !auth.user) redirect("/login?next=/admin");
  if (auth.mode === "supabase" && auth.role !== "admin") redirect("/?error=admin_required");
  const { path } = await params;
  return <SportPeekApp route={`/admin${path?.length ? `/${path.join("/")}` : ""}`} />;
}
