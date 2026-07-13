import { z } from "zod";

export const searchSchema = z.object({ q: z.string().trim().min(2).max(80), type: z.enum(["all", "news", "teams", "players", "competitions"]).default("all") });
export const bookmarkSchema = z.object({ newsClusterId: z.string().min(1).max(80), action: z.enum(["save", "remove"]) });
export const followSchema = z.object({ entityType: z.enum(["sport", "competition", "team", "player"]), entityId: z.string().min(1).max(80), action: z.enum(["follow", "unfollow"]) });
export const profileSchema = z.object({ displayName: z.string().trim().min(2).max(60), language: z.enum(["vi", "en"]), timezone: z.string().min(3).max(64) });

export function slugify(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
