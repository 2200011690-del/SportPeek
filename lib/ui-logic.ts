import type { NewsItem } from "@/lib/types";

export type NewsFilter = {
  query?: string;
  competition?: string;
  team?: string;
  minHotness?: number;
};

export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function newsSearchText(item: NewsItem): string {
  return normalizeSearchText(
    [
      item.title,
      item.summary,
      item.category,
      item.competition,
      item.team,
      ...item.sources,
      ...item.keyPoints,
    ].join(" "),
  );
}

export function filterNewsItems(
  items: NewsItem[],
  filter: NewsFilter,
): NewsItem[] {
  const query = normalizeSearchText(filter.query ?? "");
  return items.filter((item) => {
    if (query && !newsSearchText(item).includes(query)) return false;
    if (filter.competition && item.competition !== filter.competition)
      return false;
    if (filter.team && item.team !== filter.team) return false;
    if (filter.minHotness && item.hotness < filter.minHotness) return false;
    return true;
  });
}

export function relatedNewsItems(
  items: NewsItem[],
  terms: string[],
  excludeId?: string,
  limit = 5,
): NewsItem[] {
  const normalizedTerms = terms
    .map(normalizeSearchText)
    .filter((term) => term.length >= 3);

  return items
    .filter((item) => item.id !== excludeId)
    .map((item) => ({
      item,
      relevance: normalizedTerms.reduce(
        (score, term) => score + (newsSearchText(item).includes(term) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ relevance }) => relevance > 0)
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        b.item.hotness - a.item.hotness ||
        b.item.reliability - a.item.reliability,
    )
    .slice(0, limit)
    .map(({ item }) => item);
}

export function personalizedNewsItems(
  items: NewsItem[],
  followedTeamNames: string[],
): NewsItem[] {
  const followed = followedTeamNames.map(normalizeSearchText);
  return [...items].sort((a, b) => {
    const aText = newsSearchText(a);
    const bText = newsSearchText(b);
    const aFollow = followed.some((team) => aText.includes(team)) ? 120 : 0;
    const bFollow = followed.some((team) => bText.includes(team)) ? 120 : 0;
    return (
      bFollow + b.hotness + b.reliability -
      (aFollow + a.hotness + a.reliability)
    );
  });
}

export function isTransferNews(item: NewsItem): boolean {
  return /(chuyen nhuong|thuong vu|transfer|sign(?:s|ed|ing)?|deal|loan|gia nhap|dam phan|hop dong)/i.test(
    newsSearchText(item),
  );
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
  };
}
