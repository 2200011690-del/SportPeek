import { createHash, randomUUID } from "node:crypto";
import { getAIProvider } from "@/lib/ai";
import { HeuristicAIProvider } from "@/lib/ai/heuristic";
import type { AIProvider, ClusterArticleInput } from "@/lib/ai/types";
import { ConfigurationError, ProviderError, toSafeError } from "@/lib/core/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEntityName } from "@/lib/sports-data/matching";
import { normalizeSearchText } from "@/lib/ui-logic";
import { calculateHotness, calculateReliability } from "@/lib/scoring";
import { createStorySlug } from "./slug";
import { clusterSimilarity, storyEventType, type ClusterableArticle } from "./clustering";
import { storyClusterSchema, type StoryCluster } from "./schema";

type SourceJoin = { name: string; logo_url: string | null; is_official: boolean; reliability_score: number } | Array<{ name: string; logo_url: string | null; is_official: boolean; reliability_score: number }> | null;
type RawRow = { id: string; source_id: string; external_id: string | null; original_url: string; canonical_url: string | null; title: string; normalized_title: string | null; excerpt: string | null; author: string | null; image_url: string | null; published_at: string; fetched_at: string; content_hash: string; language: "vi" | "en"; processing_status: string; raw_metadata: Record<string, unknown>; news_sources: SourceJoin };
type ArticleRecord = ClusterableArticle & { sourceName: string; sourceLogoUrl: string | null; reliability: number; isOfficial: boolean; originalUrl: string; canonicalUrl: string | null; author: string | null; imageUrl: string | null; fetchedAt: string; language: "vi" | "en"; contentHash: string; rawMetadata: Record<string, unknown> };
type EntityRecord = { id: string; name: string; slug: string };
type Draft = { id: string; clusterKey: string; articles: ArticleRecord[]; existing: boolean; touched: boolean };
export type StoryProcessingSummary = { jobId: string; dryRun: boolean; inputArticles: number; createdClusters: number; updatedClusters: number; mergedArticles: number; failedArticles: number; aiProvider: string; errors: string[] };

function admin() { const client = createAdminClient(); if (!client) throw new ConfigurationError("Thiếu Supabase service role cho story processor.", "supabase"); return client; }
function one<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }
function words(value: string) { return value.trim().split(/\s+/).filter(Boolean); }
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }

function toArticle(row: RawRow): ArticleRecord {
  const source = one(row.news_sources);
  return { id: row.id, sourceId: row.source_id, sourceName: source?.name ?? "Nguồn chưa xác định", sourceLogoUrl: source?.logo_url ?? null, reliability: source?.reliability_score ?? 50, isOfficial: Boolean(source?.is_official), title: row.title, excerpt: row.excerpt ?? "", originalUrl: row.original_url, canonicalUrl: row.canonical_url, author: row.author, imageUrl: row.image_url, publishedAt: new Date(row.published_at).toISOString(), fetchedAt: new Date(row.fetched_at).toISOString(), language: row.language, contentHash: row.content_hash, rawMetadata: row.raw_metadata ?? {} };
}

function articleFromStory(article: StoryCluster["articles"][number], reliability: number): ArticleRecord {
  return { id: article.id, sourceId: article.sourceId, sourceName: article.sourceName, sourceLogoUrl: article.sourceLogoUrl, reliability, isOfficial: article.isOfficialSource, title: article.title, excerpt: article.excerpt ?? "", originalUrl: article.originalUrl, canonicalUrl: article.canonicalUrl, author: article.author, imageUrl: article.imageUrl, publishedAt: article.publishedAt, fetchedAt: article.fetchedAt, language: article.language, contentHash: article.id, rawMetadata: {} };
}

function stableClusterKey(article: ArticleRecord) { return createHash("sha256").update(`${article.contentHash}\0${storyEventType(`${article.title} ${article.excerpt}`)}`).digest("hex"); }

function entityMatches(text: string, entities: EntityRecord[]): EntityRecord[] {
  const normalized = ` ${normalizeEntityName(text)} `;
  return entities.filter((entity) => { const name = normalizeEntityName(entity.name); return name.length >= 4 && normalized.includes(` ${name} `); }).slice(0, 8);
}

function transparentSummary(articles: ArticleRecord[], suggested?: string): string {
  const candidates = unique([suggested ?? "", ...articles.map((article) => article.excerpt)]); let result = "";
  for (const candidate of candidates) { const next = `${result} ${candidate}`.trim(); if (words(next).length > 180) break; result = next; if (words(result).length >= 100) break; }
  const sourceNames = unique(articles.map((article) => article.sourceName));
  if (words(result).length < 80) result = `${result} SportPeek ghi nhận thông tin này từ ${sourceNames.join(", ")}. Bản tổng hợp chỉ dựa trên tiêu đề và mô tả ngắn do các nguồn phát hành qua RSS; các chi tiết chưa xuất hiện trong metadata không được bổ sung. ${sourceNames.length >= 2 ? `Có ${sourceNames.length} nhà xuất bản cùng đề cập sự kiện và từng bài gốc vẫn được giữ để đối chiếu.` : "Hiện mới có một nhà xuất bản trong cụm nên thông tin cần tiếp tục được đối chiếu khi có cập nhật mới."}`.trim();
  return words(result).slice(0, 180).join(" ");
}

async function buildStory(draft: Draft, provider: AIProvider, teams: EntityRecord[], competitions: EntityRecord[], useRemoteAi: boolean): Promise<{ story: StoryCluster; teamIds: string[]; competitionId: string | null }> {
  const articles = [...draft.articles].sort((a, b) => Number(b.isOfficial) - Number(a.isOfficial) || b.reliability - a.reliability || Date.parse(b.publishedAt) - Date.parse(a.publishedAt)); const lead = articles[0];
  const input: ClusterArticleInput[] = articles.map((article) => ({ id: article.id, title: article.title, excerpt: article.excerpt, publishedAt: article.publishedAt, sourceName: article.sourceName })); const heuristic = new HeuristicAIProvider();
  let generated = false; let generatedSummary = await heuristic.summarizeCluster({ articles: input });
  if (useRemoteAi && !["heuristic", "disabled", "mock"].includes(provider.name)) {
    const candidate = await provider.summarizeCluster({ articles: input });
    const allowed = new Set(input.map((article) => article.id));
    if (candidate.sourceIds.every((id) => allowed.has(id))) {
      generatedSummary = candidate;
      generated = true;
    } else {
      throw new Error("AI returned unknown source IDs");
    }
  }
  const agreements = generated ? await provider.identifyAgreements({ articles: input }).catch(() => heuristic.identifyAgreements({ articles: input })) : await heuristic.identifyAgreements({ articles: input });
  const disputes = generated ? await provider.identifyDisputes({ articles: input }).catch(() => heuristic.identifyDisputes({ articles: input })) : await heuristic.identifyDisputes({ articles: input });
  const timeline = generated ? await provider.generateTimeline({ articles: input }).catch(() => heuristic.generateTimeline({ articles: input })) : await heuristic.generateTimeline({ articles: input });
  const sourceNames = unique(articles.map((article) => article.sourceName)); const official = articles.some((article) => article.isOfficial); const speculative = /tin đồn|có thể|được cho là|reportedly|rumou?r|could|may\b/i.test(articles.map((article) => `${article.title} ${article.excerpt}`).join(" ")); const type = storyEventType(`${lead.title} ${lead.excerpt}`);
  const reliability = calculateReliability({ sourceScores: unique(articles.map((article) => String(article.reliability))).map(Number), independentSources: sourceNames.length, official, speculativeLanguage: speculative, contradictionPenalty: disputes.length ? 8 : 0 }); const ageHours = Math.max(0, (Date.now() - Math.max(...articles.map((article) => Date.parse(article.publishedAt)))) / 3_600_000); const hotness = calculateHotness({ ageHours, sourceCount: sourceNames.length, averageSourceReliability: articles.reduce((sum, article) => sum + article.reliability, 0) / articles.length, entityPopularity: 60, readVelocity: 0, eventImportance: /world cup|chung kết|final|vô địch/i.test(lead.title) ? 90 : 60, verified: official || sourceNames.length >= 2 });
  const title = generated ? generatedSummary.title : lead.title; const matchedTeams = entityMatches(`${title} ${articles.map((article) => article.title).join(" ")}`, teams); const matchedCompetitions = entityMatches(`${title} ${articles.map((article) => article.title).join(" ")}`, competitions);
  let categoryValue = articles.flatMap((article) => Array.isArray(article.rawMetadata.categories) ? article.rawMetadata.categories : []).find((value): value is string => typeof value === "string");
  if (!categoryValue || /^(thể thao|tin tức|news story|news|sports|general|chưa phân loại)$/i.test(categoryValue)) {
    const isFootballSource = articles.some(article =>
      /\b(vff|vpf|football|soccer|premier league|champions league|la liga|serie a)\b/i.test(article.sourceName)
    );
    const hasFootballKeywords = articles.some(article =>
      /\b(bong da|cau thu|hlv|san co|tran dau|ban thang|cup|vo dich|football|soccer|match|player|coach|manager|league)\b/i.test(
        normalizeSearchText(article.title + " " + article.excerpt)
      )
    );
    categoryValue = isFootballSource || hasFootballKeywords ? "Bóng đá" : "Thể thao";
  }
  const publishedAt = new Date(Math.min(...articles.map((article) => Date.parse(article.publishedAt)))).toISOString(); const updatedAt = new Date(Math.max(...articles.map((article) => Date.parse(article.publishedAt)))).toISOString(); const rawArticles = articles.map((article) => ({ id: article.id, sourceId: article.sourceId, sourceName: article.sourceName, sourceLogoUrl: article.sourceLogoUrl, originalUrl: article.originalUrl, canonicalUrl: article.canonicalUrl, title: article.title, excerpt: article.excerpt || null, imageUrl: article.imageUrl, author: article.author, publishedAt: article.publishedAt, fetchedAt: article.fetchedAt, isOfficialSource: article.isOfficial, isSyndicated: false, language: article.language, processingStatus: "completed" as const })); const summary = transparentSummary(articles, generatedSummary.summary);
  const story = storyClusterSchema.parse({ id: draft.id, slug: createStorySlug(title, draft.id), legacySlugs: [], title, summary, summaryLong: unique([...articles.map((article) => article.excerpt), sourceNames.length > 1 ? `SportPeek giữ ${articles.length} bài từ ${sourceNames.length} nhà xuất bản trong cùng cụm để người đọc đối chiếu.` : "Bản tin chưa được xử lý bởi AI; nội dung đang hiển thị từ metadata nguồn."]).filter(Boolean).join("\n\n").slice(0, 12_000), category: String(categoryValue).slice(0, 160), language: generated ? "vi" : lead.language, status: type === "correction" ? "correction" : official ? "official" : disputes.length ? "disputed" : speculative ? "rumor" : sourceNames.length >= 2 ? "reported" : ageHours <= 12 ? "developing" : "unverified", sourceCount: sourceNames.length, sourceNames, officialSources: rawArticles.filter((article) => article.isOfficialSource), hasOfficialSource: official, hotnessScore: hotness, reliabilityScore: reliability, publishedAt, updatedAt, imageUrl: articles.find((article) => article.imageUrl)?.imageUrl ?? null, agreedFacts: agreements.map((item) => ({ text: item.text, sourceArticleIds: item.sourceArticleIds })), disputedPoints: disputes, timeline: timeline.map((item, index) => ({ id: `timeline-${draft.id}-${index}`, occurredAt: item.occurredAt, description: item.content, sourceArticleIds: item.supportingArticleIds })), linkedMatch: null, competition: matchedCompetitions[0]?.name ?? null, teams: matchedTeams.map((team) => team.name), players: [], articles: rawArticles, aiGenerated: generated, reviewStatus: generated ? "auto" : "pending" });
  return { story, teamIds: matchedTeams.map((team) => team.id), competitionId: matchedCompetitions[0]?.id ?? null };
}

async function loadExistingDrafts(): Promise<Draft[]> {
  const { data, error } = await admin().from("story_clusters").select("id,cluster_key,payload").order("last_updated_at", { ascending: false }).limit(1000); if (error) throw new ProviderError("Không thể đọc cluster hiện có.", "supabase");
  return (data ?? []).flatMap((row): Draft[] => { const parsed = storyClusterSchema.safeParse(row.payload); return parsed.success ? [{ id: row.id, clusterKey: row.cluster_key, articles: parsed.data.articles.map((article) => articleFromStory(article, parsed.data.reliabilityScore ?? 70)), existing: true, touched: false }] : []; });
}

async function loadEntities() { const client = admin(); const [teams, competitions] = await Promise.all([client.from("teams").select("id,name,slug").limit(1000), client.from("competitions").select("id,name,slug").limit(500)]); if (teams.error || competitions.error) throw new ProviderError("Không thể đọc entity dictionary.", "supabase"); return { teams: (teams.data ?? []) as EntityRecord[], competitions: (competitions.data ?? []) as EntityRecord[] }; }

async function persistDrafts(drafts: Array<{ draft: Draft; story: StoryCluster; teamIds: string[]; competitionId: string | null }>, summary: StoryProcessingSummary) {
  const client = admin();
  for (let index = 0; index < drafts.length; index += 50) {
    const batch = drafts.slice(index, index + 50); const rows = batch.map(({ draft, story, teamIds, competitionId }) => ({ id: draft.id, cluster_key: draft.clusterKey, slug: story.slug, title: story.title, summary: story.summary, key_points: story.agreedFacts.map((item) => item.text).slice(0, 5), agreed_facts: story.agreedFacts, disputed_points: story.disputedPoints, status: story.status, hotness_score: story.hotnessScore, reliability_score: story.reliabilityScore, competition_id: competitionId, primary_team_id: teamIds[0] ?? null, first_published_at: story.publishedAt, last_updated_at: story.updatedAt, ai_generated: story.aiGenerated, ai_provider: story.aiGenerated ? summary.aiProvider : null, review_status: story.reviewStatus, payload: story })); const { error } = await client.from("story_clusters").upsert(rows, { onConflict: "cluster_key" }); if (error) throw new ProviderError(`Không thể lưu story cluster (${error.code}).`, "supabase");
  }
  const clusterIds = drafts.map(({ draft }) => draft.id); const links = drafts.flatMap(({ draft }) => draft.articles.map((article, index) => ({ cluster_id: draft.id, raw_article_id: article.id, similarity_score: index === 0 ? 1 : clusterSimilarity(article, { articles: [draft.articles[0]] }).score, is_primary_source: index === 0, is_syndicated: false }))) ;
  for (let index = 0; index < links.length; index += 200) { const { error } = await client.from("story_cluster_articles").upsert(links.slice(index, index + 200), { onConflict: "cluster_id,raw_article_id" }); if (error) throw new ProviderError("Không thể lưu cluster article links.", "supabase"); }
  if (clusterIds.length) { await client.from("story_timeline").delete().in("cluster_id", clusterIds); await client.from("story_entities").delete().in("cluster_id", clusterIds); }
  const timeline = drafts.flatMap(({ draft, story }) => story.timeline.map((item) => ({ cluster_id: draft.id, occurred_at: item.occurredAt, update_type: "source_update", content: item.description, supporting_article_ids: item.sourceArticleIds }))) ;
  for (let index = 0; index < timeline.length; index += 200) { const { error } = await client.from("story_timeline").insert(timeline.slice(index, index + 200)); if (error) throw new ProviderError("Không thể lưu story timeline.", "supabase"); }
  const entityRows = drafts.flatMap(({ draft, story, teamIds, competitionId }) => [...teamIds.map((id, index) => ({ cluster_id: draft.id, entity_type: "team", entity_id: id, label: story.teams[index] ?? null, relevance_score: index === 0 ? 1 : 0.8 })), ...(competitionId ? [{ cluster_id: draft.id, entity_type: "competition", entity_id: competitionId, label: story.competition, relevance_score: 1 }] : [])]);
  for (let index = 0; index < entityRows.length; index += 200) { const { error } = await client.from("story_entities").insert(entityRows.slice(index, index + 200)); if (error) throw new ProviderError("Không thể lưu story entities.", "supabase"); }
  const articleIds = [...new Set(drafts.flatMap(({ draft }) => draft.articles.map((article) => article.id)))]; for (let index = 0; index < articleIds.length; index += 200) { const { error } = await client.from("raw_articles").update({ processing_status: "completed" }).in("id", articleIds.slice(index, index + 200)); if (error) throw new ProviderError("Không thể hoàn tất raw articles.", "supabase"); }
}

export async function processStories(options: { dryRun?: boolean; includeFailed?: boolean; recluster?: boolean; useAi?: boolean; limit?: number } = {}): Promise<StoryProcessingSummary> {
  const client = admin(); const jobId = randomUUID(); const provider = getAIProvider(); const summary: StoryProcessingSummary = { jobId, dryRun: Boolean(options.dryRun), inputArticles: 0, createdClusters: 0, updatedClusters: 0, mergedArticles: 0, failedArticles: 0, aiProvider: provider.name, errors: [] };
  if (options.recluster && !options.dryRun) { await client.from("story_cluster_articles").delete().not("cluster_id", "is", null); await client.from("story_clusters").delete().not("id", "is", null); await client.from("raw_articles").update({ processing_status: "pending" }).neq("processing_status", "pending"); }
  let query = client.from("raw_articles").select("id,source_id,external_id,original_url,canonical_url,title,normalized_title,excerpt,author,image_url,published_at,fetched_at,content_hash,language,processing_status,raw_metadata,news_sources(name,logo_url,is_official,reliability_score)").order("published_at", { ascending: true }).limit(options.limit ?? 1000); query = options.recluster ? query : query.in("processing_status", ["pending", "failed"]);
  const { data, error } = await query; if (error) throw new ProviderError("Không thể đọc raw articles pending.", "supabase"); const incoming = ((data ?? []) as unknown as RawRow[]).map(toArticle); summary.inputArticles = incoming.length;
  const drafts = options.recluster ? [] : await loadExistingDrafts();
  for (const article of incoming) {
    let best: { draft: Draft; score: number } | null = null; for (const draft of drafts) { const result = clusterSimilarity(article, draft); if (result.compatible && result.score > (best?.score ?? 0)) best = { draft, score: result.score }; }
    let merge = Boolean(best && best.score >= 0.58);
    if (best && best.score >= 0.4 && best.score < 0.58 && !["heuristic", "disabled", "mock"].includes(provider.name)) { try { const evaluation = await provider.evaluateClusterMatch({ article, candidate: best.draft.articles }); merge = evaluation.sameEvent && evaluation.confidence >= 0.7; } catch { merge = false; } }
    if (merge && best) { if (!best.draft.articles.some((item) => item.id === article.id)) { best.draft.articles.push(article); best.draft.touched = true; summary.mergedArticles += 1; } }
    else { drafts.push({ id: randomUUID(), clusterKey: stableClusterKey(article), articles: [article], existing: false, touched: true }); summary.createdClusters += 1; }
  }
  const touched = drafts.filter((draft) => draft.touched); const entities = await loadEntities(); const built = [] as Array<{ draft: Draft; story: StoryCluster; teamIds: string[]; competitionId: string | null }>;
  for (const draft of touched) { try { built.push({ draft, ...(await buildStory(draft, provider, entities.teams, entities.competitions, Boolean(options.useAi))) }); if (draft.existing) summary.updatedClusters += 1; } catch (error) { const message = error instanceof Error ? error.message.slice(0, 600) : toSafeError(error).message; summary.errors.push(`${draft.id}: ${message}`); summary.failedArticles += draft.articles.length; const failedIds = draft.articles.map((a) => a.id); try { await client.from("raw_articles").update({ processing_status: "failed" }).in("id", failedIds); } catch { /* ignore */ } } }
  if (!summary.dryRun && built.length) { await client.from("ingestion_jobs").insert({ id: jobId, job_type: "stories:process", provider: provider.name, status: "processing", fetched_count: incoming.length, metadata: { useAi: Boolean(options.useAi), recluster: Boolean(options.recluster) } }); try { await persistDrafts(built, summary); await client.from("ingestion_jobs").update({ status: summary.errors.length ? "failed" : "completed", fetched_count: incoming.length, inserted_count: summary.createdClusters, updated_count: summary.updatedClusters, skipped_count: summary.failedArticles, error_code: summary.errors.length ? "PARTIAL_FAILURE" : null, error_message: summary.errors.join("; ").slice(0, 1000) || null, completed_at: new Date().toISOString() }).eq("id", jobId); } catch (error) { const safe = toSafeError(error); await client.from("ingestion_jobs").update({ status: "failed", error_code: safe.code, error_message: safe.message, completed_at: new Date().toISOString() }).eq("id", jobId); throw error; } }
  return summary;
}

export async function summarizePersistedStories(options: { dryRun?: boolean; limit?: number } = {}) {
  const provider = getAIProvider(); if (["disabled", "heuristic", "mock"].includes(provider.name)) throw new ConfigurationError("Chưa có remote AI provider để chạy AI summary.", "ai"); const client = admin(); const { data, error } = await client.from("story_clusters").select("id,payload").order("last_updated_at", { ascending: false }).limit(options.limit ?? 20); if (error) throw new ProviderError("Không thể đọc story cần tóm tắt.", "supabase"); let updated = 0; const errors: string[] = [];
  for (const row of data ?? []) { const parsed = storyClusterSchema.safeParse(row.payload); if (!parsed.success) { errors.push(`${row.id}: invalid payload`); continue; } const story = parsed.data; const input = story.articles.map((article) => ({ id: article.id, title: article.title, excerpt: article.excerpt ?? "", publishedAt: article.publishedAt, sourceName: article.sourceName })); const jobId = randomUUID(); if (!options.dryRun) await client.from("ai_jobs").insert({ id: jobId, job_type: "summarize_cluster", input_reference: story.id, provider: provider.name, model: process.env.OPENAI_MODEL ?? process.env.GEMINI_MODEL ?? process.env.CLOUDFLARE_AI_MODEL ?? null, status: "processing" }); try { const output = await provider.summarizeCluster({ articles: input }); const allowed = new Set(input.map((article) => article.id)); if (!output.sourceIds.every((id) => allowed.has(id))) throw new Error("AI returned unknown source IDs"); const next = storyClusterSchema.parse({ ...story, title: output.title, summary: transparentSummary(story.articles.map((article) => articleFromStory(article, story.reliabilityScore ?? 70)), output.summary), agreedFacts: output.keyPoints.map((text) => ({ text, sourceArticleIds: output.sourceIds })), aiGenerated: true, reviewStatus: "auto" }); if (!options.dryRun) { await client.from("story_clusters").update({ title: next.title, summary: next.summary, key_points: output.keyPoints, ai_generated: true, ai_provider: provider.name, review_status: "auto", payload: next }).eq("id", story.id); await client.from("ai_jobs").update({ status: "completed", result: output, completed_at: new Date().toISOString() }).eq("id", jobId); } updated += 1; } catch (error) { const safe = toSafeError(error); errors.push(`${story.id}: ${safe.message}`); if (!options.dryRun) await client.from("ai_jobs").update({ status: "failed", error_message: safe.message, completed_at: new Date().toISOString() }).eq("id", jobId); }
  }
  return { provider: provider.name, dryRun: Boolean(options.dryRun), updated, errors };
}

export async function storyProcessingReport() { const client = admin(); const [raw, clusters, links, aiJobs, jobs] = await Promise.all([client.from("raw_articles").select("processing_status"), client.from("story_clusters").select("id,status,ai_generated,ai_provider,last_updated_at"), client.from("story_cluster_articles").select("cluster_id,raw_article_id"), client.from("ai_jobs").select("id,status,provider,error_message,created_at,completed_at").order("created_at", { ascending: false }).limit(20), client.from("ingestion_jobs").select("id,status,fetched_count,inserted_count,updated_count,skipped_count,error_code,started_at,completed_at").eq("job_type", "stories:process").order("started_at", { ascending: false }).limit(10)]); const error = raw.error ?? clusters.error ?? links.error ?? aiJobs.error ?? jobs.error; if (error) throw new ProviderError("Không thể tạo stories report.", "supabase"); const rawCounts = Object.groupBy(raw.data ?? [], (item) => item.processing_status); return { generatedAt: new Date().toISOString(), rawArticles: Object.fromEntries(Object.entries(rawCounts).map(([key, values]) => [key, values?.length ?? 0])), clusters: clusters.data?.length ?? 0, clusteredArticleLinks: links.data?.length ?? 0, aiGeneratedClusters: clusters.data?.filter((item) => item.ai_generated).length ?? 0, recentAiJobs: aiJobs.data ?? [], recentJobs: jobs.data ?? [] }; }
