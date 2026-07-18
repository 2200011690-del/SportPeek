import { XMLParser } from "fast-xml-parser";
import { decode } from "html-entities";
import { normalizePublishedDate, normalizeNewsImageUrl, extractImageFromMarkup } from "@/lib/ingestion/official-feed";
import { normalizeSearchText } from "@/lib/ui-logic";
import { parsedRssArticleSchema, type ParsedRssArticle } from "./types";

type Value = string | number | Record<string, unknown> | Value[] | null | undefined;
const parser = new XMLParser({ ignoreAttributes: false, processEntities: false, trimValues: true, allowBooleanAttributes: false });

function text(value: Value): string {
  if (typeof value === "string" || typeof value === "number") return decode(String(value)).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (value && !Array.isArray(value) && typeof value === "object") return text(value["#text"] as Value);
  return "";
}

function markup(value: Value): string { return typeof value === "string" || typeof value === "number" ? String(value) : value && !Array.isArray(value) && typeof value === "object" ? String(value["#text"] ?? "") : ""; }
function record(value: Value): Record<string, unknown> { return value && !Array.isArray(value) && typeof value === "object" ? value as Record<string, unknown> : {}; }
function list(value: Value): Value[] { return Array.isArray(value) ? value : value ? [value] : []; }

function linkOf(value: Value, fallback: string): string {
  if (typeof value === "string") return value;
  for (const entry of list(value)) { const row = record(entry); const rel = String(row["@_rel"] ?? "alternate"); const href = String(row["@_href"] ?? row["#text"] ?? ""); if (href && rel === "alternate") return href; }
  return fallback;
}

export function safeHttpUrl(value: string, base?: string): string | null {
  try { const url = new URL(decode(value), base); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}

export function canonicalizeArticleUrl(value: string): string | null {
  const safe = safeHttpUrl(value); if (!safe) return null; const url = new URL(safe); url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}

function mediaImage(item: Record<string, unknown>, articleUrl: string): string | null {
  for (const key of ["media:content", "media:thumbnail", "enclosure", "image"]) {
    for (const value of list(item[key] as Value)) { const row = record(value); const type = String(row["@_type"] ?? ""); if (type && !type.startsWith("image/")) continue; const candidate = String(row["@_url"] ?? row["@_href"] ?? row["@_src"] ?? row["#text"] ?? ""); const image = normalizeNewsImageUrl(candidate, articleUrl); if (image) return image; }
  }
  const content = markup((item["content:encoded"] ?? item.content ?? item.description ?? item.summary) as Value);
  return extractImageFromMarkup(content, articleUrl) ?? null;
}

export function parseRssXml(xml: string, source: { feedUrl: string; language: "vi" | "en" }, now = new Date()): ParsedRssArticle[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("RSS chứa khai báo XML không được hỗ trợ.");
  const document = parser.parse(xml) as Record<string, unknown>;
  const rss = record(document.rss as Value); const channel = record(rss.channel as Value); const atom = record(document.feed as Value);
  const entries = list((channel.item ?? atom.entry) as Value).slice(0, 50);
  return entries.flatMap((value): ParsedRssArticle[] => {
    const item = record(value); const title = text(item.title as Value); const rawUrl = linkOf(item.link as Value, source.feedUrl); const originalUrl = safeHttpUrl(rawUrl, source.feedUrl); const canonicalUrl = originalUrl ? canonicalizeArticleUrl(originalUrl) : null;
    if (!title || !originalUrl || !canonicalUrl) return [];
    const published = normalizePublishedDate(String(item.pubDate ?? item.published ?? item.updated ?? ""), now, source.language === "vi"); if (!published) return [];
    const descriptionMarkup = markup((item["content:encoded"] ?? item.content ?? item.description ?? item.summary) as Value); const excerpt = text(descriptionMarkup as Value).slice(0, 1000);
    const guid = text((item.guid ?? item.id) as Value) || canonicalUrl;
    const author = text((item.author ?? item["dc:creator"] ?? item.creator) as Value).slice(0, 200) || null;
    const categories = list(item.category as Value).map(text).filter(Boolean).slice(0, 10);
    const parsed = parsedRssArticleSchema.safeParse({ externalId: guid, originalUrl, canonicalUrl, title, normalizedTitle: normalizeSearchText(title), excerpt, author, imageUrl: mediaImage(item, originalUrl), publishedAt: published.toISOString(), language: source.language, rawMetadata: { categories } });
    return parsed.success ? [parsed.data] : [];
  });
}

export async function readResponseText(response: Response, maxBytes = 2_000_000): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("RSS vượt giới hạn kích thước.");
  if (!response.body) return "";
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw new Error("RSS vượt giới hạn kích thước."); } chunks.push(value); }
  const merged = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}
