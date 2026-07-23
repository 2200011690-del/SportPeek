import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isAllowedEmail, isInternalMode } from "@/lib/config";

const PUBLIC_AUTH_PATHS = new Set(["/login", "/forgot-password", "/reset-password", "/auth/callback"]);

function continueRequest(request: NextRequest): NextResponse {
  return NextResponse.next({ request: { headers: request.headers } });
}

function withSessionCookies(target: NextResponse, source: NextResponse): NextResponse {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

function loginRedirect(request: NextRequest, response: NextResponse, error?: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  if (error) url.searchParams.set("error", error);
  return withSessionCookies(NextResponse.redirect(url), response);
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return isInternalMode() && !PUBLIC_AUTH_PATHS.has(request.nextUrl.pathname)
    ? loginRedirect(request, continueRequest(request), "configuration_required")
    : continueRequest(request);

  let response = continueRequest(request);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = continueRequest(request);
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getClaims();
  if (!isInternalMode()) return response;

  const pathname = request.nextUrl.pathname;
  if (pathname === "/register") return loginRedirect(request, response, "invitation_only");
  if (PUBLIC_AUTH_PATHS.has(pathname) || pathname.startsWith("/api/cron/") || pathname === "/api/telegram/webhook") return response;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    if (pathname.startsWith("/api/")) return withSessionCookies(NextResponse.json({ status: "unauthorized", error: { code: "AUTHENTICATION_REQUIRED", message: "Bạn cần đăng nhập." } }, { status: 401 }), response);
    return loginRedirect(request, response);
  }

  let allowed = isAllowedEmail(user.email);
  if (!allowed) {
    const membership = await supabase.from("allowed_users").select("id").eq("email", user.email).maybeSingle();
    allowed = Boolean(membership.data);
  }
  if (!allowed) {
    if (pathname.startsWith("/api/")) return withSessionCookies(NextResponse.json({ status: "unauthorized", error: { code: "FORBIDDEN", message: "Tài khoản chưa được mời vào NewsPeek." } }, { status: 403 }), response);
    return loginRedirect(request, response, "not_invited");
  }
  return response;
}
