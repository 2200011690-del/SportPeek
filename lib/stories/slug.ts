import { z } from "zod";

export const storySlugSchema = z.string()
  .min(1)
  .max(180)
  .refine((val) => !/[\/\s\\]/.test(val), "Slug must not contain path delimiters or whitespace");

function slugToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Previous ID-only route, retained for redirects from already shared links. */
export function createLegacyStorySlug(id: string): string {
  const stableId = slugToken(id).replace(/^rss-/, "").slice(0, 120);
  return stableId ? `story-${stableId}` : "story-unknown";
}

/** Search-friendly route with a stable ID suffix to avoid title collisions. */
export function createStorySlug(title: string, id: string): string {
  // Imported and fixture-backed stories may use human-readable provider IDs;
  // keep their established links stable. Production clusters use UUIDs.
  if (!UUID_PATTERN.test(id)) return createLegacyStorySlug(id);
  const stableId = slugToken(id).replace(/^rss-/, "").slice(-40);
  const titleToken = slugToken(title).slice(0, 130);
  if (titleToken && stableId) return `${titleToken}-${stableId}`.slice(0, 180);
  if (stableId) return `story-${stableId}`;
  return titleToken || "story-unknown";
}
