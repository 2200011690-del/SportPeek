import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vận hành | SportPeek", robots: { index: false, follow: false } };

export default function AdminPage() {
  redirect("/settings?notice=operations_use_cli");
}
