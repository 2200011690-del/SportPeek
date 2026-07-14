import { createAdminClient } from "../lib/supabase/admin";
import { getHealthSnapshot } from "../lib/health";
import { ProviderRegistry } from "../lib/providers/registry";
import { getSportsAdapterDescriptors } from "../lib/sports-data/adapters";
import { processStories, summarizePersistedStories } from "../lib/stories/processor";
import { syncRss } from "../lib/rss/sync";
import { syncSports, type SportsSyncCommand } from "../lib/sports-data/sync";
import type { SportsProviderName } from "../lib/sports-data/models";

try { process.loadEnvFile?.(".env.local"); } catch { /* Host may already supply environment variables. */ }

const command = process.argv[2] ?? "help"; const apply = process.argv.includes("--apply");
const flag = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const limit = Math.min(100, Math.max(1, Number(flag("limit") ?? "20")));
const timeoutMs = Math.min(120_000, Math.max(5_000, Number(flag("timeout") ?? "60000")));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function admin() { const client = createAdminClient(); if (!client) throw new Error("Thiếu cấu hình Supabase server-side."); return client; }
function output(value: unknown) { console.log(JSON.stringify(value, null, 2)); }
function mutationPlan(action: string, details: Record<string, unknown>) { output({ dryRun: !apply, action, ...details, hint: apply ? "Đã yêu cầu áp dụng thay đổi." : "Kiểm tra kế hoạch; thêm --apply để thực thi." }); }

async function health() { const snapshot = await getHealthSnapshot(); output(snapshot); if (["unavailable", "degraded"].includes(snapshot.state)) process.exitCode = 2; }
async function providers() { const registry = new ProviderRegistry().describe(); output({ application: registry, sportsAdapters: getSportsAdapterDescriptors() }); }

async function failedJobs() {
  const client = admin(); const [ingestion, ai] = await Promise.all([
    client.from("ingestion_jobs").select("id,job_type,provider,status,error_code,started_at,completed_at").eq("status", "failed").order("started_at", { ascending: false }).limit(limit),
    client.from("ai_jobs").select("id,job_type,provider,status,created_at,completed_at").eq("status", "failed").order("created_at", { ascending: false }).limit(limit),
  ]);
  if (ingestion.error || ai.error) throw new Error("Không thể đọc job lỗi."); output({ ingestion: ingestion.data ?? [], ai: ai.data ?? [], limit });
}

async function staleData() {
  const client = admin(); const sixHours = new Date(Date.now() - 6 * 60 * 60_000).toISOString(); const oneDay = new Date(Date.now() - 24 * 60 * 60_000).toISOString(); const twoHours = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  const [sources, matches, standings, stories] = await Promise.all([
    client.from("news_sources").select("id,name,last_fetched_at,last_error").eq("is_active", true).or(`last_fetched_at.is.null,last_fetched_at.lt.${twoHours}`).limit(limit),
    client.from("matches").select("id", { count: "exact", head: true }).lt("updated_at", sixHours),
    client.from("standings").select("id", { count: "exact", head: true }).lt("updated_at", oneDay),
    client.from("story_clusters").select("id", { count: "exact", head: true }).lt("last_updated_at", oneDay),
  ]);
  if (sources.error || matches.error || standings.error || stories.error) throw new Error("Không thể kiểm tra dữ liệu stale."); const report = { staleSources: sources.data ?? [], staleMatches: matches.count ?? 0, staleStandings: standings.count ?? 0, storiesOlderThanOneDay: stories.count ?? 0, thresholds: { rssHours: 2, matchHours: 6, standingsHours: 24 } }; output(report); if (report.staleSources.length || report.staleMatches || report.staleStandings) process.exitCode = 2;
}

async function conflicts() {
  const { data, error } = await admin().from("provider_conflicts").select("id,entity_type,internal_id,capability,providers,status,values,created_at").eq("status", "open").order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Không thể đọc conflict."); output({ open: data ?? [], limit }); if (data?.length) process.exitCode = 2;
}

async function members() {
  const client = admin(); const action = flag("action") ?? "list"; const email = flag("email")?.trim().toLowerCase(); const role = flag("role") ?? "member";
  if (action === "list") { const { data, error } = await client.from("allowed_users").select("id,email,role,user_id,created_at,last_signed_in_at").order("created_at"); if (error) throw new Error("Không thể đọc allowlist."); output({ members: data ?? [] }); return; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Cần --email hợp lệ."); if (!['owner','member'].includes(role)) throw new Error("--role chỉ nhận owner hoặc member.");
  mutationPlan(`member:${action}`, { email, role }); if (!apply) return;
  if (action === "add" || action === "role") { const { error } = await client.from("allowed_users").upsert({ email, role }, { onConflict: "email" }); if (error) throw new Error("Không thể cập nhật thành viên."); }
  else if (action === "remove") { const { error } = await client.from("allowed_users").delete().eq("email", email); if (error) throw new Error("Không thể xóa khỏi allowlist."); }
  else throw new Error("--action hỗ trợ list, add, role, remove.");
}

async function sourceStatus() {
  const client = admin(); const source = flag("source"); const active = flag("active"); if (!source || !["true", "false"].includes(active ?? "")) throw new Error("Cần --source=<uuid|tên> và --active=true|false.");
  mutationPlan("source-status", { source, active: active === "true" }); if (!apply) return; let query = client.from("news_sources").update({ is_active: active === "true" }); query = uuid.test(source) ? query.eq("id", source) : query.eq("name", source); const { error } = await query; if (error) throw new Error("Không thể đổi trạng thái RSS.");
}

async function sourceAdd() {
  const client = admin(); const name = flag("name")?.trim(); const url = flag("url")?.trim(); const language = flag("language") === "en" ? "en" : "vi"; const reliability = Math.min(100, Math.max(0, Number(flag("reliability") ?? "80"))); const official = flag("official") === "true";
  if (!name || !url || !/^https?:\/\//i.test(url)) throw new Error("Cần --name và --url HTTP(S) hợp lệ."); const parsed = new URL(url);
  mutationPlan("source-add", { name, url: `${parsed.origin}${parsed.pathname}`, language, reliability, official }); if (!apply) return;
  const { error } = await client.from("news_sources").upsert({ name, base_url: parsed.origin, rss_url: url, language, reliability_score: reliability, is_official: official, is_active: true }, { onConflict: "name" }); if (error) throw new Error("Không thể thêm nguồn RSS.");
}

async function aliasAdd() {
  const client = admin(); const entityType = flag("type"); const internalId = flag("id"); const alias = flag("alias")?.trim(); if (!entityType || !["competition", "team", "player", "coach"].includes(entityType) || !internalId || !uuid.test(internalId) || !alias) throw new Error("Cần --type, --id UUID và --alias.");
  const normalized = alias.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim(); mutationPlan("alias-add", { entityType, internalId, alias, normalized }); if (!apply) return; const { error } = await client.from("entity_aliases").upsert({ entity_type: entityType, internal_id: internalId, alias, normalized_alias: normalized }, { onConflict: "entity_type,normalized_alias,internal_id" }); if (error) throw new Error("Không thể thêm alias.");
}

async function mappingSet() {
  const client = admin(); const provider = flag("provider"); const entityType = flag("type"); const externalId = flag("external"); const internalId = flag("internal"); const season = flag("season") ?? ""; if (!provider || !entityType || !externalId || !internalId || !uuid.test(internalId)) throw new Error("Cần --provider --type --external --internal UUID [--season].");
  mutationPlan("mapping-set", { provider, entityType, externalId, internalId, season }); if (!apply) return; const { error } = await client.from("provider_entity_mappings").upsert({ provider, entity_type: entityType, external_id: externalId, internal_id: internalId, season, confidence: 1, metadata: { manuallyReviewed: true } }, { onConflict: "provider,entity_type,external_id,season" }); if (error) throw new Error("Không thể lưu mapping.");
}

async function retryJobs() {
  const client = admin(); const { data, error } = await client.from("ingestion_jobs").select("job_type,provider,metadata").eq("status", "failed").order("started_at", { ascending: false }).limit(limit); if (error) throw new Error("Không thể đọc job cần retry."); const types = [...new Set((data ?? []).map((job) => job.job_type))]; mutationPlan("retry-jobs", { failedTypes: types, limit }); if (!apply || !types.length) return;
  const results: unknown[] = [];
  if (types.some((type) => type.startsWith("rss:"))) results.push(await syncRss({ force: true, dryRun: false }));
  if (types.some((type) => type.startsWith("stories:"))) results.push(await processStories({ dryRun: false, includeFailed: true, limit }));
  const sportsTypes = types.filter((type) => type.startsWith("sports:")).map((type) => type.split(":")[1] as SportsSyncCommand).filter((type) => ["competitions", "teams", "fixtures", "results", "standings", "live"].includes(type));
  for (const type of [...new Set(sportsTypes)].slice(0, 2)) { const provider = data?.find((job) => job.job_type === `sports:${type}`)?.provider as SportsProviderName | undefined; results.push(await syncSports(type, { provider, dryRun: false })); }
  output({ retried: results.length, results });
}

async function retryAi() { mutationPlan("retry-ai-summary", { limit }); if (!apply) return; output(await summarizePersistedStories({ dryRun: false, limit })); }

function help() { output({ usage: "npm run ops -- <command> [flags]", commands: ["health", "providers", "failed-jobs", "retry-jobs", "retry-ai", "stale", "conflicts", "members", "source-add", "source-status", "alias-add", "mapping-set"], safety: "Các thao tác ghi chỉ chạy khi có --apply; --limit mặc định 20; --timeout mặc định 60000ms." }); }

async function main() {
  const commands: Record<string, () => Promise<void> | void> = { health, providers, "failed-jobs": failedJobs, "retry-jobs": retryJobs, "retry-ai": retryAi, stale: staleData, conflicts, unmapped: conflicts, members, "source-add": sourceAdd, "source-status": sourceStatus, "alias-add": aliasAdd, "mapping-set": mappingSet, help };
  const handler = commands[command]; if (!handler) throw new Error(`Lệnh không hợp lệ: ${command}`); await handler();
}

async function runWithTimeout() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([main(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Hết thời gian sau ${timeoutMs}ms.`)), timeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
}
runWithTimeout().catch((error) => { console.error(error instanceof Error ? error.message : "Operations command failed"); process.exitCode = 1; });
