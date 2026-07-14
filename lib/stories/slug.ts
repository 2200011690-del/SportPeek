import { z } from "zod";

export const storySlugSchema = z.string()
  .min(1)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

function slugToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The route is deliberately ID-based so a title translation cannot break old links. */
export function createStorySlug(title: string, id: string): string {
  const stableId = slugToken(id).replace(/^rss-/, "").slice(0, 120);
  if (stableId) return `story-${stableId}`;
  const titleFallback = slugToken(title).slice(0, 150);
  return titleFallback ? `story-${titleFallback}` : "story-unknown";
}
