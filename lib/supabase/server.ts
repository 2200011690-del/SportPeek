import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          /* Server Components cannot always refresh cookies. */
        }
      },
    },
  });
}

export async function getCurrentUserRole() {
  const client = await createClient();
  if (!client)
    return { mode: "demo" as const, user: null, role: "admin" as const };
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { mode: "supabase" as const, user: null, role: null };
  const { data } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  return { mode: "supabase" as const, user, role: data?.role ?? "user" };
}
