import { getAIProvider } from "@/lib/ai";
import { developmentFixturesEnabled } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";

export type HealthState = "operational" | "degraded" | "stale" | "unavailable" | "configuration_required" | "development_mock";
export type ServiceHealth = { state: HealthState; label: string; message: string; provider: string | null; lastUpdatedAt: string | null; count: number | null };
export type HealthSnapshot = { state: HealthState; generatedAt: string; services: { rss: ServiceHealth; stories: ServiceHealth; sports: ServiceHealth; ai: ServiceHealth; telegram: ServiceHealth } };

const service = (state: HealthState, label: string, message: string, provider: string | null, lastUpdatedAt: string | null, count: number | null): ServiceHealth => ({ state, label, message, provider, lastUpdatedAt, count });
const ageState = (value: string | null, staleAfterMs: number): HealthState => !value ? "unavailable" : Date.now() - Date.parse(value) > staleAfterMs ? "stale" : "operational";
const priority: HealthState[] = ["unavailable", "degraded", "stale", "configuration_required", "development_mock", "operational"];
export function overallHealthState(states: HealthState[]): HealthState { return priority.find((candidate) => states.includes(candidate)) ?? "operational"; }

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const generatedAt = new Date().toISOString(); const client = createAdminClient();
  if (!client) {
    const unavailable = service("configuration_required", "Supabase chưa cấu hình", "Thiếu server credentials để đọc cache.", "supabase", null, null);
    return { state: "configuration_required", generatedAt, services: { rss: unavailable, stories: unavailable, sports: unavailable, ai: service("configuration_required", "AI chưa cấu hình", "Pipeline vẫn có thể dùng heuristic.", null, null, null), telegram: service("configuration_required", "Telegram chưa cấu hình", "Bot đang tắt an toàn.", null, null, null) } };
  }
  const [sources, rssJob, storyJob, clusters, aiClusters, sportsSync, matches, standings] = await Promise.all([
    client.from("news_sources").select("id,last_error", { count: "exact" }).eq("is_active", true),
    client.from("ingestion_jobs").select("status,completed_at,error_code").eq("job_type", "rss:sync").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("ingestion_jobs").select("status,completed_at,error_code").eq("job_type", "stories:process").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("story_clusters").select("id,last_updated_at", { count: "exact" }).order("last_updated_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("story_clusters").select("ai_provider,last_updated_at", { count: "exact" }).eq("ai_generated", true).order("last_updated_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("provider_sync_state").select("provider,last_attempt_at,last_success_at,last_error_code").order("last_success_at", { ascending: false }).limit(20),
    client.from("matches").select("id", { count: "exact", head: true }),
    client.from("standings").select("id", { count: "exact", head: true }),
  ]);
  const sourceErrors = (sources.data ?? []).filter((item) => item.last_error).length; const rssUpdated = rssJob.data?.completed_at ?? null; let rssState = ageState(rssUpdated, 60 * 60_000); if (rssJob.error || sources.error) rssState = "unavailable"; else if (rssJob.data?.status === "failed" || sourceErrors > 0) rssState = "degraded";
  const storyUpdated = storyJob.data?.completed_at ?? null; const newestStoryAt = clusters.data?.last_updated_at ?? null;
  let storyState = overallHealthState([ageState(storyUpdated, 15 * 60_000), ageState(newestStoryAt, 24 * 60 * 60_000)]);
  if (storyJob.error || clusters.error) storyState = "unavailable"; else if (storyJob.data?.status === "failed") storyState = "degraded";
  const sportsRows = sportsSync.data ?? []; const sportsUpdated = sportsRows.map((item) => item.last_success_at).filter(Boolean).sort().at(-1) ?? null; let sportsState = ageState(sportsUpdated, 24 * 60 * 60_000); const allSportsProvidersFailing = sportsRows.length > 0 && sportsRows.every((item) => item.last_error_code && item.last_attempt_at && Date.now() - Date.parse(item.last_attempt_at) <= 2 * 60 * 60_000); if (sportsSync.error || matches.error || standings.error) sportsState = "unavailable"; else if (allSportsProvidersFailing) sportsState = "degraded";
  const ai = getAIProvider(); const aiCount = aiClusters.count ?? 0;
  const aiState: HealthState = aiClusters.error ? "unavailable" : ai.name === "mock" ? "development_mock" : ai.name === "heuristic" || ai.name === "disabled" ? "configuration_required" : aiCount > 0 ? "operational" : "degraded";
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET);
  const services = {
    rss: service(rssState, rssState === "operational" ? `RSS · ${sources.count ?? 0} nguồn` : rssState === "degraded" ? `RSS lỗi ${sourceErrors} nguồn` : "RSS chưa mới", sourceErrors ? `${sourceErrors} nguồn có lỗi gần nhất.` : "Raw article được đồng bộ vào Supabase.", "rss", rssUpdated, sources.count ?? 0),
    stories: service(storyState, storyState === "operational" ? `Stories · ${clusters.count ?? 0} cụm` : "Story pipeline cần kiểm tra", newestStoryAt ? `Tin mới nhất trong kho: ${newestStoryAt}.` : "Chưa có story đã xử lý.", "supabase", storyUpdated, clusters.count ?? 0),
    sports: service(sportsState, sportsState === "operational" ? `Sports · ${(matches.count ?? 0) + (standings.count ?? 0)} bản ghi` : "Sports cache cần kiểm tra", "Trình duyệt không gọi sports provider trực tiếp.", sportsRows[0]?.provider ?? null, sportsUpdated, (matches.count ?? 0) + (standings.count ?? 0)),
    ai: service(aiState, aiState === "operational" ? `AI · ${ai.name} · ${aiCount} cụm` : aiState === "development_mock" ? "AI · fixture phát triển" : aiState === "degraded" ? "AI chưa tạo được nội dung" : "AI remote chưa bật", aiState === "operational" ? "Đã xác nhận kết quả AI được lưu trong story." : "Tin vẫn lên bằng summary heuristic; trạng thái chỉ xanh khi có kết quả AI thật.", aiClusters.data?.ai_provider ?? ai.name, aiClusters.data?.last_updated_at ?? null, aiCount),
    telegram: service(telegramConfigured ? "operational" : "configuration_required", telegramConfigured ? "Telegram đã cấu hình" : "Telegram chưa bật", telegramConfigured ? "Bot sẵn sàng nhận webhook." : "Website vẫn hoạt động; bot tắt an toàn.", telegramConfigured ? "telegram" : null, null, null),
  };
  const considered = [services.rss.state, services.stories.state, services.sports.state, services.ai.state]; const state = overallHealthState(considered);
  if (developmentFixturesEnabled() && considered.every((value) => value !== "unavailable")) return { state: "development_mock", generatedAt, services };
  return { state, generatedAt, services };
}
