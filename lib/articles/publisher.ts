import { decode } from "html-entities";

export type PublisherArticleContent = {
  content: string;
  wordCount: number;
  error?: string;
};

type FetchOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
};

const MIN_PUBLISHER_WORDS = 120;
const DEFAULT_TIMEOUT_MS = 6_000;
const DEFAULT_MAX_BYTES = 1_500_000;
const BLOCK_BOUNDARY_PATTERN =
  /<(?:br\s*\/?|\/p|\/div|\/section|\/article|\/li|\/h[1-6]|\/blockquote|\/figcaption)>/gi;
const REMOVABLE_BLOCK_PATTERN =
  /<(script|style|noscript|svg|canvas|iframe|form|button|nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi;
const NOISE_PARAGRAPH_PATTERN =
  /^(?:advertisement|quang cao|quảng cáo|doc them|đọc thêm|xem them|xem thêm|theo doi|theo dõi|share this|subscribe|sign up|all rights reserved|copyright)\b/i;

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function textFromHtml(markup: string): string {
  const withBoundaries = markup
    .replace(REMOVABLE_BLOCK_PATTERN, " ")
    .replace(BLOCK_BOUNDARY_PATTERN, "\n\n")
    .replace(/<[^>]+>/g, " ");
  const paragraphs = decode(withBoundaries)
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[\t\f\v ]+/g, " ").trim())
    .filter((paragraph) => words(paragraph).length >= 7)
    .filter((paragraph) => !NOISE_PARAGRAPH_PATTERN.test(paragraph));
  return paragraphs.join("\n\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 100_000);
}

function robotMetaContent(html: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return tags
    .filter((tag) => /\b(?:name|property)=["']?(?:robots|googlebot)["']?/i.test(tag))
    .map((tag) => tag.match(/\bcontent=["']([^"']+)["']/i)?.[1] ?? "")
    .join(",");
}

function allowsReaderExtraction(html: string): boolean {
  const robots = robotMetaContent(html).toLowerCase();
  return !/(?:nosnippet|noarchive|none)\b/.test(robots);
}

function jsonLdScriptBodies(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => decode(match[1]).trim())
    .filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function collectJsonLdNodes(value: unknown): Record<string, unknown>[] {
  const record = asRecord(value);
  if (Array.isArray(value)) return value.flatMap(collectJsonLdNodes);
  if (!record) return [];
  return [
    record,
    ...collectJsonLdNodes(record["@graph"]),
    ...collectJsonLdNodes(record.mainEntity),
  ];
}

function isArticleNode(node: Record<string, unknown>): boolean {
  const rawType = node["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  return types.some((type) => /(?:NewsArticle|Article|BlogPosting)$/i.test(String(type ?? "")));
}

function articleBodyFromJsonLd(html: string): string | null {
  for (const body of jsonLdScriptBodies(html)) {
    try {
      const nodes = collectJsonLdNodes(JSON.parse(body));
      for (const node of nodes) {
        if (!isArticleNode(node)) continue;
        const articleBody = typeof node.articleBody === "string" ? node.articleBody : "";
        const content = textFromHtml(articleBody);
        if (words(content).length >= MIN_PUBLISHER_WORDS) return content;
      }
    } catch {
      // Invalid publisher JSON-LD is common; continue with HTML extraction.
    }
  }
  return null;
}

function candidateBlocks(html: string): string[] {
  const articleBlocks = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((match) => match[0]);
  if (articleBlocks.length) return articleBlocks;
  const mainBlocks = [...html.matchAll(/<main\b[\s\S]*?<\/main>/gi)].map((match) => match[0]);
  if (mainBlocks.length) return mainBlocks;
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  return [body ?? html];
}

export function extractPublisherArticleContent(html: string): PublisherArticleContent | null {
  if (!allowsReaderExtraction(html)) return null;
  const PAYWALL_PATTERN = /\b(dang nhap de doc tiep|đăng nhập để đọc tiếp|dang nhap de tiep tuc|đăng nhập để tiếp tục|danh cho thanh vien|dành cho thành viên|membership required|please log\s*in|subscription required|premium article|membership is required)\b/i;
  if (PAYWALL_PATTERN.test(html)) return null;
  const fromJsonLd = articleBodyFromJsonLd(html);
  const candidates = [
    ...(fromJsonLd ? [fromJsonLd] : []),
    ...candidateBlocks(html).map(textFromHtml),
  ];
  const best = candidates
    .map((content) => ({ content, wordCount: words(content).length }))
    .filter((candidate) => candidate.wordCount >= MIN_PUBLISHER_WORDS)
    .sort((left, right) => right.wordCount - left.wordCount)[0];
  return best ?? null;
}

async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Publisher page is too large.");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Publisher page is too large.");
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export async function fetchPublisherArticleContent(
  url: string,
  options: FetchOptions = {},
): Promise<PublisherArticleContent | null> {
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.2",
        "user-agent": `NewsPeek/1.0 (+${process.env.NEXT_PUBLIC_APP_URL ?? "https://newspeek.local"})`,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Publisher page returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) return null;
    const html = await readBoundedResponseText(response, options.maxBytes ?? DEFAULT_MAX_BYTES);
    if (!allowsReaderExtraction(html)) {
      return { content: "", wordCount: 0, error: "Extraction blocked by robots noarchive directive." };
    }
    const PAYWALL_PATTERN = /\b(dang nhap de doc tiep|đăng nhập để đọc tiếp|dang nhap de tiep tuc|đăng nhập để tiếp tục|danh cho thanh vien|dành cho thành viên|membership required|please log\s*in|subscription required|premium article|membership is required)\b/i;
    if (PAYWALL_PATTERN.test(html)) {
      return { content: "", wordCount: 0, error: "Extraction blocked by paywall restriction." };
    }
    return extractPublisherArticleContent(html);
  } finally {
    clearTimeout(timeout);
  }
}
