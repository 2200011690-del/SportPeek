import { getHealthSnapshot, type HealthSnapshot } from "@/lib/health";
import { createAdminClient } from "@/lib/supabase/admin";

export type SourceOperationalRow = {
  id: string;
  name: string;
  label: "Chính thức" | "Nhà xuất bản" | "Tổng hợp";
  country: string | null;
  language: string;
  reliability: number;
  articleCount24h: number;
  lastFetchedAt: string | null;
  lastError: string | null;
  state: "healthy" | "stale" | "error";
};

export type OperationsDashboard = {
  health: HealthSnapshot;
  sources: SourceOperationalRow[];
  recentJobs: Array<{
    id: string;
    type: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    errorCode: string | null;
  }>;
};

function sourceLabel(source: { is_official: boolean; name: string; base_url: string | null }): SourceOperationalRow["label"] {
  if (source.is_official) return "Chính thức";
  if (/google news|aggregat|tổng hợp/i.test(`${source.name} ${source.base_url ?? ""}`)) return "Tổng hợp";
  return "Nhà xuất bản";
}

export async function loadOperationsDashboard(): Promise<OperationsDashboard> {
  const client = createAdminClient();
  const health = await getHealthSnapshot();
  if (!client) return { health, sources: [], recentJobs: [] };

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const [sourcesResult, articlesResult, jobsResult] = await Promise.all([
    client
      .from("news_sources")
      .select("id,name,base_url,language,country,is_official,reliability_score,last_fetched_at,last_error,fetch_interval_minutes")
      .eq("is_active", true)
      .order("name"),
    client
      .from("raw_articles")
      .select("source_id")
      .gte("fetched_at", since)
      .limit(10_000),
    client
      .from("ingestion_jobs")
      .select("id,job_type,status,started_at,completed_at,error_code")
      .order("started_at", { ascending: false })
      .limit(30),
  ]);

  const countBySource = new Map<string, number>();
  for (const article of articlesResult.data ?? []) {
    countBySource.set(article.source_id, (countBySource.get(article.source_id) ?? 0) + 1);
  }
  const now = Date.now();
  const sources = (sourcesResult.data ?? []).map((source): SourceOperationalRow => {
    const fetchedAt = source.last_fetched_at ? Date.parse(source.last_fetched_at) : 0;
    const staleAfterMs = Math.max(30, (source.fetch_interval_minutes ?? 15) * 4) * 60_000;
    const stale = !Number.isFinite(fetchedAt) || !fetchedAt || now - fetchedAt > staleAfterMs;
    return {
      id: source.id,
      name: source.name,
      label: sourceLabel(source),
      country: source.country,
      language: source.language,
      reliability: source.reliability_score,
      articleCount24h: countBySource.get(source.id) ?? 0,
      lastFetchedAt: source.last_fetched_at,
      lastError: source.last_error,
      state: source.last_error ? "error" : stale ? "stale" : "healthy",
    };
  }).sort((left, right) =>
    (left.state === "healthy" ? 1 : 0) - (right.state === "healthy" ? 1 : 0)
    || right.articleCount24h - left.articleCount24h,
  );

  return {
    health,
    sources,
    recentJobs: (jobsResult.data ?? []).map((job) => ({
      id: job.id,
      type: job.job_type,
      status: job.status,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      errorCode: job.error_code,
    })),
  };
}

