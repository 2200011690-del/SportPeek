import type { NewsItem } from "@/lib/types";

const normalizedRegion = (value: string | null | undefined) =>
  value?.trim().toLocaleLowerCase("vi-VN") ?? "";

export function newsIsInternational(item: NewsItem): boolean {
  const region = normalizedRegion(item.region);
  if (region) return region === "thế giới" || region === "quốc tế";
  return item.originalLanguage === "en";
}

export function newsIsVietnamese(item: NewsItem): boolean {
  const region = normalizedRegion(item.region);
  if (region) return region === "việt nam";
  return item.originalLanguage !== "en";
}
