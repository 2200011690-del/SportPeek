import type { User } from "@supabase/supabase-js";
import { isAllowedEmail, isInternalMode } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export type MemberContext = { user: User; role: "owner" | "member" };

export async function getMemberContext(): Promise<MemberContext | null> {
  const client = await createClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  if (!user?.email) return null;
  if (!isInternalMode()) return { user, role: "member" };
  if (isAllowedEmail(user.email)) {
    const admins = (process.env.ADMIN_EMAILS ?? "").toLowerCase().split(",").map((value) => value.trim());
    return { user, role: admins.includes(user.email.toLowerCase()) ? "owner" : "member" };
  }
  const { data } = await client.from("allowed_users").select("role").eq("email", user.email).maybeSingle();
  return data ? { user, role: data.role } : null;
}

