import type { Metadata } from "next";
import type { StoryCluster } from "./schema";
import { storyMaterialTimestamp } from "./persisted-repository";

const DEFAULT_BASE_URL = "http://localhost:3000";

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function description(value: string, maxLength = 180): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  const shortened = clean.slice(0, maxLength - 1).replace(/\s+\S*$/, "").trim();
  return `${shortened || clean.slice(0, maxLength - 1)}…`;
}

export function getSiteBaseUrl(value = process.env.NEXT_PUBLIC_APP_URL): URL {
  try {
    const url = new URL(value || DEFAULT_BASE_URL);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return new URL(DEFAULT_BASE_URL);
  }
}

export function absoluteStoryUrl(story: Pick<StoryCluster, "slug">, baseUrl = getSiteBaseUrl()): string {
  return new URL(`/news/${encodeURIComponent(story.slug)}`, baseUrl).toString();
}

function absoluteUrl(value: string, baseUrl: URL): string {
  try { return new URL(value, baseUrl).toString(); }
  catch { return new URL("/og.png", baseUrl).toString(); }
}

export function buildStoryMetadata(story: StoryCluster, baseUrl = getSiteBaseUrl()): Metadata {
  const canonical = absoluteStoryUrl(story, baseUrl);
  const summary = description(story.summaryLong || story.summary);
  const image = absoluteUrl(story.imageUrl ?? "/og.png", baseUrl);
  const publishedTime = story.firstPublishedAt ?? story.publishedAt;
  const modifiedTime = storyMaterialTimestamp(story);
  const tags = unique([story.category, ...story.sourceNames]);
  return {
    title: story.title,
    description: summary,
    authors: [{ name: "NewsPeek" }],
    keywords: tags,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      siteName: "NewsPeek",
      locale: story.language === "vi" ? "vi_VN" : "en_US",
      title: story.title,
      description: summary,
      publishedTime,
      modifiedTime,
      section: story.category,
      tags,
      images: [{ url: image, alt: story.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: story.title,
      description: summary,
      images: [image],
    },
  };
}

export function buildNewsArticleJsonLd(story: StoryCluster, baseUrl = getSiteBaseUrl()): Record<string, unknown> {
  const canonical = absoluteStoryUrl(story, baseUrl);
  const contributorNames = unique(story.articles.map((article) => article.author));
  const sources = story.articles.map((article) => ({
    "@type": "CreativeWork",
    name: article.title,
    url: article.canonicalUrl ?? article.originalUrl,
    datePublished: article.publishedAt,
    publisher: { "@type": "Organization", name: article.sourceName },
  }));
  const about = unique([story.category, ...story.sourceNames]).map((name) => ({
    "@type": "Thing",
    name,
  }));
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "@id": `${canonical}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
    url: canonical,
    headline: story.title,
    description: description(story.summaryLong || story.summary, 260),
    image: [absoluteUrl(story.imageUrl ?? "/og.png", baseUrl)],
    datePublished: story.firstPublishedAt ?? story.publishedAt,
    dateModified: storyMaterialTimestamp(story),
    inLanguage: story.language,
    articleSection: story.category,
    author: [{ "@type": "Organization", name: "NewsPeek", url: baseUrl.toString() }],
    contributor: contributorNames.map((name) => ({ "@type": "Person", name })),
    publisher: { "@type": "Organization", name: "NewsPeek", url: baseUrl.toString() },
    isAccessibleForFree: true,
    about,
    citation: unique(story.articles.map((article) => article.canonicalUrl ?? article.originalUrl)),
    isBasedOn: sources,
  };
}

export function serializeJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
