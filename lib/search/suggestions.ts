import { normalizeSearchText } from "@/lib/ui-logic";

export type SearchSuggestion = {
  label: string;
  type: "query" | "category" | "source";
  href?: string;
};

type SuggestionInput = {
  query: string;
  newsTitles: string[];
  categories: Array<{ label: string; slug: string }>;
  sources: Array<{ name: string }>;
  limit?: number;
};

function compactTitle(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 76) return clean;
  const shortened = clean.slice(0, 75).replace(/\s+\S*$/, "").trim();
  return `${shortened || clean.slice(0, 75)}…`;
}

/** Builds deterministic, de-duplicated suggestions from reviewed search hits. */
export function buildSearchSuggestions(input: SuggestionInput): SearchSuggestion[] {
  const normalizedQuery = normalizeSearchText(input.query);
  const candidates: SearchSuggestion[] = [
    ...input.categories.map((category) => ({
      label: category.label,
      type: "category" as const,
      href: `/category/${category.slug}`,
    })),
    ...input.sources.map((source) => ({
      label: source.name,
      type: "source" as const,
      href: `/sources?source=${encodeURIComponent(source.name)}`,
    })),
    ...input.newsTitles.map((title) => ({
      label: compactTitle(title),
      type: "query" as const,
    })),
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = normalizeSearchText(candidate.label);
    if (!key || key === normalizedQuery || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, Math.min(10, Math.max(1, input.limit ?? 7)));
}

