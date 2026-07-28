export function publicPageCacheControl(request: Request, response: Response): string | null {
  if (request.method !== "GET" || response.status !== 200) return null;
  if (request.headers.has("authorization") || request.headers.has("cookie")) return null;
  if (response.headers.has("set-cookie")) return null;
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  const publicPage = pathname === "/"
    || pathname === "/news"
    || pathname.startsWith("/category/");
  const contentType = response.headers.get("content-type") ?? "";
  return publicPage && contentType.includes("text/html")
    ? "public, s-maxage=90, stale-while-revalidate=300"
    : null;
}

