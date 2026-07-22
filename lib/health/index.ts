import { getAIProvider } from "@/lib/ai";
import { developmentFixturesEnabled } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";

export type HealthState =
  | "operational"
  | "degraded"
  | "stale"
  | "unavailable"
  | "configuration_required"
  | "development_mock";

export type ServiceHealth = {
  state: HealthState;
  label: string;
  message: string;
  provider: string | null;
  lastUpdatedAt: string | null;
  count: number | null;
};

export type HealthSnapshot = {
  state: HealthState;
  generatedAt: string;
  services: {
    rss: ServiceHealth;
    stories: ServiceHealth;
    ai: ServiceHealth;
    telegram: ServiceHealth;
  };
  metrics?: {
    latestArticleAgeMinutes: number | null;
    latestStoryAgeMinutes: number | null;
    queue: {
      pending: number;
      processing: number;
      failed: number;
      deadLetter: number;
      longestPendingAgeMinutes: number | null;
    };
    aiBacklog: number;
    lastSuccessfulAiProvider: string | null;
    successRate1h: number | null;
    failureRate1h: number | null;
    successRate24h: number | null;
    failureRate24h: number | null;
    noNewArticlesWarning: boolean;
  };
};

export type AIJobHealthRecord = {
  status: string;
  provider: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AIHealthEvaluation = {
  state: HealthState;
  provider: string | null;
  lastUpdatedAt: string | null;
  latestStatus: string | null;
};

export type PipelineJobHealthRecord = {
  status: string;
  started_at: string;
  completed_at: string | null;
  error_code?: string | null;
};

export type PipelineHealthEvaluation = {
  state: HealthState;
  lastUpdatedAt: string | null;
  latestStatus: string | null;
};

export const AI_HEALTH_SUCCESS_MAX_AGE_MS = 30 * 60_000;
const AI_JOB_STALL_AFTER_MS = 10 * 60_000;
export const PIPELINE_JOB_STALL_AFTER_MS = 2 * 60_000;

const service = (
  state: HealthState,
  label: string,
  message: string,
  provider: string | null,
  lastUpdatedAt: string | null,
  count: number | null,
): ServiceHealth => ({
  state,
  label,
  message,
  provider,
  lastUpdatedAt,
  count,
});

const parsedTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const ageState = (value: string | null, staleAfterMs: number): HealthState => {
  const timestamp = parsedTimestamp(value);
  if (timestamp === null) return "unavailable";
  return Date.now() - timestamp > staleAfterMs ? "stale" : "operational";
};

const priority: HealthState[] = [
  "unavailable",
  "degraded",
  "stale",
  "configuration_required",
  "development_mock",
  "operational",
];

export function overallHealthState(states: HealthState[]): HealthState {
  return priority.find((candidate) => states.includes(candidate)) ?? "operational";
}

function jobTimestamp(job: AIJobHealthRecord): number | null {
  return parsedTimestamp(job.completed_at) ?? parsedTimestamp(job.created_at);
}

export function evaluateAIHealth(input: {
  providerName: string;
  jobs: readonly AIJobHealthRecord[];
  backlogCount: number;
  queryFailed?: boolean;
  now?: number;
}): AIHealthEvaluation {
  const { providerName, jobs, queryFailed = false } = input;
  const now = input.now ?? Date.now();
  if (queryFailed) {
    return {
      state: "unavailable",
      provider: providerName || null,
      lastUpdatedAt: null,
      latestStatus: null,
    };
  }
  if (providerName === "mock") {
    return {
      state: "development_mock",
      provider: providerName,
      lastUpdatedAt: null,
      latestStatus: null,
    };
  }
  if (providerName === "heuristic" || providerName === "disabled") {
    return {
      state: "configuration_required",
      provider: providerName,
      lastUpdatedAt: null,
      latestStatus: null,
    };
  }

  const ordered = jobs
    .map((job) => ({ job, timestamp: jobTimestamp(job) }))
    .filter(
      (entry): entry is { job: AIJobHealthRecord; timestamp: number } =>
        entry.timestamp !== null,
    )
    .sort((left, right) => right.timestamp - left.timestamp);
  const latest = ordered[0] ?? null;
  const latestSuccess =
    ordered.find((entry) => entry.job.status === "completed") ?? null;
  const latestTerminal =
    ordered.find((entry) =>
      ["completed", "failed"].includes(entry.job.status),
    ) ?? null;
  const active =
    ordered.find((entry) =>
      ["pending", "processing"].includes(entry.job.status),
    ) ?? null;
  const result = (state: HealthState): AIHealthEvaluation => ({
    state,
    provider:
      latestTerminal?.job.provider ?? latest?.job.provider ?? providerName ?? null,
    lastUpdatedAt:
      latestTerminal?.job.completed_at ??
      latestTerminal?.job.created_at ??
      latest?.job.created_at ??
      null,
    latestStatus: latest?.job.status ?? null,
  });

  if (
    latestTerminal?.job.status === "failed" &&
    (!latestSuccess || latestTerminal.timestamp >= latestSuccess.timestamp)
  ) {
    return result("degraded");
  }
  if (
    active &&
    now - active.timestamp > AI_JOB_STALL_AFTER_MS &&
    (!latestSuccess || active.timestamp >= latestSuccess.timestamp)
  ) {
    return result("degraded");
  }
  if (
    latestSuccess &&
    now - latestSuccess.timestamp <= AI_HEALTH_SUCCESS_MAX_AGE_MS
  ) {
    return result("operational");
  }
  if (latestSuccess) return result("stale");

  // A configured provider with historical AI content but no successful job in
  // the observable queue is unverified, not healthy. Backlog size is reported
  // separately in the service message and must never turn this state green.
  return result("degraded");
}

export function evaluatePipelineHealth(input: {
  jobs: readonly PipelineJobHealthRecord[];
  successMaxAgeMs: number;
  queryFailed?: boolean;
  stallAfterMs?: number;
  now?: number;
}): PipelineHealthEvaluation {
  const {
    jobs,
    successMaxAgeMs,
    queryFailed = false,
    stallAfterMs = PIPELINE_JOB_STALL_AFTER_MS,
  } = input;
  const now = input.now ?? Date.now();
  if (queryFailed) {
    return { state: "unavailable", lastUpdatedAt: null, latestStatus: null };
  }

  const ordered = jobs
    .map((job) => ({
      job,
      startedAt: parsedTimestamp(job.started_at),
      completedAt: parsedTimestamp(job.completed_at),
    }))
    .filter(
      (entry): entry is typeof entry & { startedAt: number } =>
        entry.startedAt !== null,
    )
    .sort((left, right) => right.startedAt - left.startedAt);
  const latest = ordered[0] ?? null;
  const latestSuccess = ordered.find(
    (entry) => entry.job.status === "completed" && entry.completedAt !== null,
  ) ?? null;
  const latestFailure = ordered.find(
    (entry) => entry.job.status === "failed",
  ) ?? null;
  const latestActive = ordered.find((entry) =>
    ["pending", "processing"].includes(entry.job.status),
  ) ?? null;
  const result = (
    state: HealthState,
    lastUpdatedAt: string | null =
      latestSuccess?.job.completed_at ?? latest?.job.started_at ?? null,
  ): PipelineHealthEvaluation => ({
    state,
    lastUpdatedAt,
    latestStatus: latest?.job.status ?? null,
  });

  if (
    latestFailure &&
    (!latestSuccess || latestFailure.startedAt >= latestSuccess.startedAt)
  ) {
    return result(
      "degraded",
      latestFailure.job.completed_at ?? latestFailure.job.started_at,
    );
  }
  if (
    latestActive &&
    now - latestActive.startedAt > stallAfterMs &&
    (!latestSuccess || latestActive.startedAt >= latestSuccess.startedAt)
  ) {
    return result("degraded", latestActive.job.started_at);
  }
  if (
    latestSuccess?.completedAt !== null &&
    latestSuccess?.completedAt !== undefined &&
    now - latestSuccess.completedAt <= successMaxAgeMs
  ) {
    return result("operational", latestSuccess.job.completed_at);
  }
  if (latestSuccess) return result("stale", latestSuccess.job.completed_at);
  return result("degraded", latestActive?.job.started_at ?? null);
}

function aiHealthMessage(
  evaluation: AIHealthEvaluation,
  backlogCount: number,
): string {
  if (evaluation.state === "operational") {
    return backlogCount > 0
      ? `Tác vụ AI gần nhất đã hoàn tất; còn ${backlogCount} bản tin trong hàng đợi.`
      : "Tác vụ AI gần nhất đã hoàn tất và hàng đợi đã sạch.";
  }
  if (evaluation.state === "stale") {
    return "AI đã từng hoàn tất tác vụ nhưng chưa có lần thành công đủ gần để xác nhận trạng thái hiện tại.";
  }
  if (evaluation.state === "degraded") {
    return evaluation.latestStatus === "failed"
      ? `Tác vụ AI gần nhất thất bại; còn ${backlogCount} bản tin trong hàng đợi.`
      : `Chưa xác nhận được tác vụ AI thành công gần đây; còn ${backlogCount} bản tin trong hàng đợi.`;
  }
  if (evaluation.state === "unavailable") {
    return "Không đọc được trạng thái hàng đợi AI.";
  }
  if (evaluation.state === "development_mock") {
    return "AI đang dùng fixture phát triển.";
  }
  return "Tin vẫn có bản tóm tắt dự phòng nhưng AI remote chưa được cấu hình.";
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const generatedAt = new Date().toISOString();
  const client = createAdminClient();
  if (!client) {
    const unavailable = service(
      "configuration_required",
      "Supabase chưa cấu hình",
      "Thiếu server credentials để đọc cache.",
      "supabase",
      null,
      null,
    );
    return {
      state: "configuration_required",
      generatedAt,
      services: {
        rss: unavailable,
        stories: unavailable,
        ai: service(
          "configuration_required",
          "AI chưa cấu hình",
          "Pipeline vẫn có thể dùng heuristic.",
          null,
          null,
          null,
        ),
        telegram: service(
          "configuration_required",
          "Telegram chưa cấu hình",
          "Bot đang tắt an toàn.",
          null,
          null,
          null,
        ),
      },
    };
  }

  const [
    sources,
    rssJob,
    storyJob,
    clusters,
    aiClusters,
    aiJobs,
    aiBacklog,
    latestArticleRow,
    latestStoryRow,
    pendingArticleCount,
    processingArticleCount,
    failedArticleCount,
    deadLetterArticleCount,
    longestPendingArticleRow,
    jobs1h,
    jobs24h,
  ] = await Promise.all([
    client
      .from("news_sources")
      .select("id,last_error", { count: "exact" })
      .eq("is_active", true),
    client
      .from("ingestion_jobs")
      .select("status,started_at,completed_at,error_code")
      .eq("job_type", "rss:sync")
      .order("started_at", { ascending: false })
      .limit(20),
    client
      .from("ingestion_jobs")
      .select("status,started_at,completed_at,error_code")
      .eq("job_type", "stories:process")
      .order("started_at", { ascending: false })
      .limit(20),
    client
      .from("story_clusters")
      .select("id,last_updated_at", { count: "exact" })
      .order("last_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("story_clusters")
      .select("ai_provider", { count: "exact" })
      .eq("ai_generated", true)
      .order("last_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("ai_jobs")
      .select("status,provider,created_at,completed_at")
      .eq("job_type", "summarize_cluster")
      .order("created_at", { ascending: false })
      .limit(20),
    client
      .from("story_clusters")
      .select("id", { count: "exact", head: true })
      .eq("review_status", "pending"),
    client
      .from("raw_articles")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("story_clusters")
      .select("first_published_at")
      .order("first_published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("raw_articles")
      .select("id", { count: "exact", head: true })
      .eq("processing_status", "pending"),
    client
      .from("raw_articles")
      .select("id", { count: "exact", head: true })
      .eq("processing_status", "processing"),
    client
      .from("raw_articles")
      .select("id", { count: "exact", head: true })
      .eq("processing_status", "failed")
      .lt("processing_attempts", 5),
    client
      .from("raw_articles")
      .select("id", { count: "exact", head: true })
      .eq("processing_status", "failed")
      .gte("processing_attempts", 5),
    client
      .from("raw_articles")
      .select("published_at")
      .eq("processing_status", "pending")
      .order("published_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    client
      .from("ingestion_jobs")
      .select("status")
      .gte("started_at", new Date(Date.now() - 3600_000).toISOString()),
    client
      .from("ingestion_jobs")
      .select("status")
      .gte("started_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
  ]);

  const sourceErrors = (sources.data ?? []).filter(
    (item) => item.last_error,
  ).length;
  const rssEvaluation = evaluatePipelineHealth({
    jobs: (rssJob.data ?? []) as PipelineJobHealthRecord[],
    successMaxAgeMs: 60 * 60_000,
    queryFailed: Boolean(rssJob.error || sources.error),
  });
  const rssUpdated = rssEvaluation.lastUpdatedAt;
  const rssState = sourceErrors > 0 && rssEvaluation.state === "operational"
    ? "degraded"
    : rssEvaluation.state;

  const storyEvaluation = evaluatePipelineHealth({
    jobs: (storyJob.data ?? []) as PipelineJobHealthRecord[],
    successMaxAgeMs: 15 * 60_000,
    queryFailed: Boolean(storyJob.error || clusters.error),
  });
  const storyUpdated = storyEvaluation.lastUpdatedAt;
  const newestStoryAt = clusters.data?.last_updated_at ?? null;
  const storyState = overallHealthState([
    storyEvaluation.state,
    newestStoryAt ? ageState(newestStoryAt, 24 * 60 * 60_000) : "degraded",
  ]);

  const ai = getAIProvider();
  const aiCount = aiClusters.count ?? 0;
  const backlogCount = aiBacklog.count ?? 0;
  const aiEvaluation = evaluateAIHealth({
    providerName: ai.name,
    jobs: (aiJobs.data ?? []) as AIJobHealthRecord[],
    backlogCount,
    queryFailed: Boolean(aiClusters.error || aiJobs.error || aiBacklog.error),
  });
  const telegramConfigured = Boolean(
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET,
  );
  const services = {
    rss: service(
      rssState,
      rssState === "operational"
        ? `RSS · ${sources.count ?? 0} nguồn`
        : rssState === "degraded"
          ? `RSS lỗi ${sourceErrors} nguồn`
          : "RSS chưa mới",
      sourceErrors
        ? `${sourceErrors} nguồn có lỗi gần nhất.`
        : "Raw article được đồng bộ vào Supabase.",
      "rss",
      rssUpdated,
      sources.count ?? 0,
    ),
    stories: service(
      storyState,
      storyState === "operational"
        ? `Stories · ${clusters.count ?? 0} cụm`
        : "Story pipeline cần kiểm tra",
      newestStoryAt
        ? `Tin mới nhất trong kho: ${newestStoryAt}.`
        : "Chưa có story đã xử lý.",
      "supabase",
      storyUpdated,
      clusters.count ?? 0,
    ),
    ai: service(
      aiEvaluation.state,
      aiEvaluation.state === "operational"
        ? `AI · ${aiEvaluation.provider ?? ai.name} · ${aiCount} cụm`
        : aiEvaluation.state === "development_mock"
          ? "AI · fixture phát triển"
          : aiEvaluation.state === "stale"
            ? "AI chưa có xác nhận mới"
            : aiEvaluation.state === "degraded"
              ? "AI cần kiểm tra"
              : aiEvaluation.state === "unavailable"
                ? "AI không đọc được trạng thái"
                : "AI remote chưa bật",
      aiHealthMessage(aiEvaluation, backlogCount),
      aiEvaluation.provider ?? aiClusters.data?.ai_provider ?? ai.name,
      aiEvaluation.lastUpdatedAt,
      aiCount,
    ),
    telegram: service(
      telegramConfigured ? "operational" : "configuration_required",
      telegramConfigured ? "Telegram đã cấu hình" : "Telegram chưa bật",
      telegramConfigured
        ? "Bot sẵn sàng nhận webhook."
        : "Website vẫn hoạt động; bot tắt an toàn.",
      telegramConfigured ? "telegram" : null,
      null,
      null,
    ),
  };

  const latestArticleFetchedAt = latestArticleRow.data?.fetched_at ?? null;
  const latestArticleAgeMinutes = latestArticleFetchedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(latestArticleFetchedAt)) / 60_000))
    : null;

  const latestStoryPublishedAt = latestStoryRow.data?.first_published_at ?? null;
  const latestStoryAgeMinutes = latestStoryPublishedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(latestStoryPublishedAt)) / 60_000))
    : null;

  const longestPendingPublishedAt = longestPendingArticleRow.data?.published_at ?? null;
  const longestPendingAgeMinutes = longestPendingPublishedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(longestPendingPublishedAt)) / 60_000))
    : null;

  const latestSuccessAiJob = (aiJobs.data ?? []).find(job => job.status === "completed");
  const lastSuccessfulAiProvider = latestSuccessAiJob?.provider ?? null;

  const jobs1hList = jobs1h.data ?? [];
  const successRate1h = jobs1hList.length
    ? jobs1hList.filter(j => j.status === "completed").length / jobs1hList.length
    : null;
  const failureRate1h = jobs1hList.length
    ? jobs1hList.filter(j => j.status === "failed").length / jobs1hList.length
    : null;

  const jobs24hList = jobs24h.data ?? [];
  const successRate24h = jobs24hList.length
    ? jobs24hList.filter(j => j.status === "completed").length / jobs24hList.length
    : null;
  const failureRate24h = jobs24hList.length
    ? jobs24hList.filter(j => j.status === "failed").length / jobs24hList.length
    : null;

  const noNewArticlesWarning = latestArticleAgeMinutes !== null && latestArticleAgeMinutes > 120;

  const considered = [
    services.rss.state,
    services.stories.state,
    services.ai.state,
  ];
  const state = overallHealthState(considered);
  const resultSnapshot: HealthSnapshot = {
    state,
    generatedAt,
    services,
    metrics: {
      latestArticleAgeMinutes,
      latestStoryAgeMinutes,
      queue: {
        pending: pendingArticleCount.count ?? 0,
        processing: processingArticleCount.count ?? 0,
        failed: failedArticleCount.count ?? 0,
        deadLetter: deadLetterArticleCount.count ?? 0,
        longestPendingAgeMinutes,
      },
      aiBacklog: backlogCount,
      lastSuccessfulAiProvider,
      successRate1h,
      failureRate1h,
      successRate24h,
      failureRate24h,
      noNewArticlesWarning,
    },
  };

  if (
    developmentFixturesEnabled() &&
    considered.every((value) => value !== "unavailable")
  ) {
    return { ...resultSnapshot, state: "development_mock" };
  }
  return resultSnapshot;
}
