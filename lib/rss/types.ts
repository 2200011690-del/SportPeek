import { z } from "zod";

export const rssSourceSchema = z.object({
  id: z.string().uuid(), name: z.string().min(1), baseUrl: z.string().url(), feedUrl: z.string().url(), language: z.enum(["vi", "en"]),
  country: z.string().nullable(), official: z.boolean(), reliability: z.number().int().min(0).max(100), active: z.boolean(),
  defaultCategory: z.string().min(1).max(160).nullable().default(null),
  fetchIntervalMinutes: z.number().int().min(5).max(1440), lastFetchedAt: z.string().datetime({ offset: true }).nullable(), lastError: z.string().nullable(), etag: z.string().nullable(), lastModified: z.string().nullable(),
});
export type RssSource = z.infer<typeof rssSourceSchema>;

export const parsedRssArticleSchema = z.object({
  externalId: z.string().min(1).max(1000), originalUrl: z.string().url(), canonicalUrl: z.string().url(), title: z.string().min(1).max(500), normalizedTitle: z.string().min(1),
  excerpt: z.string().max(1000), author: z.string().max(200).nullable(), imageUrl: z.string().url().nullable(), publishedAt: z.string().datetime(), language: z.enum(["vi", "en"]), rawMetadata: z.record(z.string(), z.unknown()),
});
export type ParsedRssArticle = z.infer<typeof parsedRssArticleSchema>;
