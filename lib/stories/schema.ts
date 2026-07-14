import { z } from "zod";

const externalUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "URL must use http or https");

const nullableExternalUrlSchema = externalUrlSchema.nullable();

export const rawArticleSchema = z.object({
  id: z.string().min(1).max(160),
  sourceId: z.string().min(1).max(160),
  sourceName: z.string().min(1).max(160),
  sourceLogoUrl: nullableExternalUrlSchema,
  originalUrl: externalUrlSchema,
  canonicalUrl: nullableExternalUrlSchema,
  title: z.string().min(1).max(500),
  excerpt: z.string().max(2_000).nullable(),
  imageUrl: nullableExternalUrlSchema,
  author: z.string().max(200).nullable(),
  publishedAt: z.string().datetime(),
  fetchedAt: z.string().datetime(),
  isOfficialSource: z.boolean(),
  isSyndicated: z.boolean().default(false),
  language: z.enum(["vi", "en"]),
  processingStatus: z.enum(["pending", "processing", "completed", "failed"]),
});

export const storyFactSchema = z.object({
  text: z.string().min(1).max(1_000),
  sourceArticleIds: z.array(z.string().min(1)).min(1),
});

export const disputedPointSchema = z.object({
  topic: z.string().min(1).max(500),
  positions: z.array(z.object({
    claim: z.string().min(1).max(1_000),
    sourceArticleIds: z.array(z.string().min(1)).min(1),
  })).min(2),
});

export const storyTimelineEntrySchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().datetime(),
  description: z.string().min(1).max(1_000),
  sourceArticleIds: z.array(z.string().min(1)).min(1),
});

export const linkedMatchSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  href: z.string().startsWith("/matches/"),
});

export const storyClusterSchema = z.object({
  id: z.string().min(1).max(160),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  legacySlugs: z.array(z.string().min(1).max(180)).default([]),
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(2_000),
  summaryLong: z.string().min(1).max(12_000),
  category: z.string().min(1).max(160),
  language: z.enum(["vi", "en"]),
  status: z.enum(["official", "reported", "rumor", "unverified", "developing", "disputed", "completed", "correction"]),
  sourceCount: z.number().int().nonnegative(),
  sourceNames: z.array(z.string().min(1)),
  officialSources: z.array(rawArticleSchema),
  hasOfficialSource: z.boolean(),
  hotnessScore: z.number().min(0).max(100).nullable(),
  reliabilityScore: z.number().min(0).max(100).nullable(),
  publishedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  imageUrl: nullableExternalUrlSchema,
  agreedFacts: z.array(storyFactSchema),
  disputedPoints: z.array(disputedPointSchema),
  timeline: z.array(storyTimelineEntrySchema),
  linkedMatch: linkedMatchSchema.nullable(),
  competition: z.string().max(160).nullable(),
  teams: z.array(z.string().min(1)),
  players: z.array(z.string().min(1)),
  articles: z.array(rawArticleSchema).min(1),
  aiGenerated: z.boolean(),
  reviewStatus: z.enum(["pending", "auto", "reviewed"]),
});

export const storyApiStatusSchema = z.enum([
  "success",
  "empty",
  "not_found",
  "stale",
  "configuration_required",
  "unauthorized",
  "error",
]);

export const storyResponseMetaSchema = z.object({
  source: z.enum(["supabase", "aggregated-rss", "development-fixture"]),
  cached: z.boolean(),
  stale: z.boolean(),
  lastUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  canonicalSlug: z.string().nullable().optional(),
});

export const storyApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
}).nullable().optional();

export const storyFeedEnvelopeSchema = z.object({
  status: storyApiStatusSchema,
  data: z.array(storyClusterSchema),
  meta: storyResponseMetaSchema,
  error: storyApiErrorSchema,
});

export const storyDetailPayloadSchema = z.object({
  story: storyClusterSchema,
  relatedStories: z.array(storyClusterSchema),
});

export const storyDetailEnvelopeSchema = z.object({
  status: storyApiStatusSchema,
  data: storyDetailPayloadSchema.nullable(),
  meta: storyResponseMetaSchema,
  error: storyApiErrorSchema,
});

export type RawArticle = z.infer<typeof rawArticleSchema>;
export type StoryFact = z.infer<typeof storyFactSchema>;
export type DisputedPoint = z.infer<typeof disputedPointSchema>;
export type StoryTimelineEntry = z.infer<typeof storyTimelineEntrySchema>;
export type StoryCluster = z.infer<typeof storyClusterSchema>;
export type StoryApiStatus = z.infer<typeof storyApiStatusSchema>;
export type StoryResponseMeta = z.infer<typeof storyResponseMetaSchema>;
export type StoryFeedEnvelope = z.infer<typeof storyFeedEnvelopeSchema>;
export type StoryDetailPayload = z.infer<typeof storyDetailPayloadSchema>;
export type StoryDetailEnvelope = z.infer<typeof storyDetailEnvelopeSchema>;

export function isSafeExternalUrl(value: string | null | undefined): value is string {
  return externalUrlSchema.safeParse(value).success;
}
