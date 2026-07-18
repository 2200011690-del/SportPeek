import type { NewsItem } from "@/lib/types";

export const NEWS_CATEGORIES = [
  { slug: "viet-nam", label: "Việt Nam", keywords: ["viet nam", "thoi su", "xa hoi", "doi song", "giao duc", "phap luat"] },
  { slug: "the-gioi", label: "Thế giới", keywords: ["the gioi", "quoc te", "world"] },
  { slug: "kinh-te", label: "Kinh tế", keywords: ["kinh te", "kinh doanh", "tai chinh", "thi truong"] },
  { slug: "cong-nghe", label: "Công nghệ", keywords: ["cong nghe", "so hoa", "ai", "internet"] },
  { slug: "chinh-tri", label: "Chính trị", keywords: ["chinh tri", "chinh sach"] },
  { slug: "suc-khoe", label: "Sức khỏe", keywords: ["suc khoe", "y te"] },
  { slug: "khoa-hoc", label: "Khoa học", keywords: ["khoa hoc", "moi truong"] },
  { slug: "van-hoa-giai-tri", label: "Văn hóa & Giải trí", keywords: ["van hoa", "giai tri", "am nhac", "dien anh"] },
  { slug: "the-thao", label: "Thể thao", keywords: ["the thao", "bong da", "sports", "football"] },
] as const;

export type NewsCategorySlug = (typeof NEWS_CATEGORIES)[number]["slug"];

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function newsCategory(slug?: string | null) {
  return NEWS_CATEGORIES.find((category) => category.slug === slug) ?? null;
}

export function matchesNewsCategory(item: NewsItem, slug?: string | null): boolean {
  const category = newsCategory(slug);
  if (!category) return true;
  const declared = normalize(item.category);
  if (category.keywords.some((keyword) => declared.includes(keyword))) return true;
  if (declared && !/^(tin tuc|news|general|chua phan loai)$/.test(declared)) return false;
  const fallback = normalize(`${item.title} ${item.summary}`);
  return category.keywords.some((keyword) => fallback.includes(keyword));
}
