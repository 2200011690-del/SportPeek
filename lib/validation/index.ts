import { z } from "zod";

export const searchSchema = z.object({ q: z.string().trim().min(2).max(80), type: z.enum(["all", "news", "categories", "sources"]).default("all") });
export const bookmarkSchema = z.object({ newsClusterId: z.string().uuid(), action: z.enum(["save", "remove"]) });
export const followSchema = z.object({ entityType: z.enum(["source", "journalist", "topic"]), entityId: z.string().uuid(), action: z.enum(["follow", "unfollow"]) });
export const readingHistorySchema = z.object({ storyId: z.string().uuid(), durationSeconds: z.number().int().min(0).max(86_400).default(0) });
const optionalTime = z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).optional();
export const profileSchema = z.object({ displayName: z.string().trim().min(2).max(60), language: z.enum(["vi", "en"]), timezone: z.string().min(3).max(64), notifications: z.array(z.boolean()).length(6).optional(), quietHoursStart: optionalTime, quietHoursEnd: optionalTime });

export function slugify(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
