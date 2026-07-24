import type { NewsItem } from "@/lib/types";

export const NEWS_CATEGORIES = [
  {
    slug: "viet-nam",
    label: "Việt Nam",
    kind: "region",
    keywords: [
      "viet nam",
      "vietnam",
      "trong nuoc",
      "domestic",
      "thoi su",
      "xa hoi",
      "doi song",
      "giao duc",
      "phap luat",
    ],
  },
  {
    slug: "the-gioi",
    label: "Thế giới",
    kind: "region",
    keywords: ["the gioi", "quoc te", "international", "global", "world"],
  },
  {
    slug: "kinh-te",
    label: "Kinh tế",
    kind: "topic",
    keywords: [
      "kinh te",
      "kinh doanh",
      "tai chinh",
      "thi truong",
      "doanh nghiep",
      "chung khoan",
      "ngan hang",
      "thuong mai",
      "economy",
      "business",
      "finance",
      "market",
    ],
  },
  {
    slug: "cong-nghe",
    label: "Công nghệ",
    kind: "topic",
    keywords: [
      "cong nghe",
      "so hoa",
      "tri tue nhan tao",
      "ai",
      "internet",
      "phan mem",
      "an ninh mang",
      "technology",
      "tech",
      "software",
      "chip",
      "smartphone",
      "cyber",
    ],
  },
  {
    slug: "chinh-tri",
    label: "Chính trị",
    kind: "topic",
    keywords: [
      "chinh tri",
      "chinh sach",
      "quoc hoi",
      "chinh phu",
      "bau cu",
      "ngoai giao",
      "politics",
      "political",
      "election",
      "government",
      "diplomacy",
    ],
  },
  {
    slug: "suc-khoe",
    label: "Sức khỏe",
    kind: "topic",
    keywords: [
      "suc khoe",
      "y te",
      "benh vien",
      "bac si",
      "vaccine",
      "health",
      "medical",
      "hospital",
    ],
  },
  {
    slug: "khoa-hoc",
    label: "Khoa học",
    kind: "topic",
    keywords: [
      "khoa hoc",
      "nghien cuu khoa hoc",
      "moi truong",
      "khong gian",
      "vu tru",
      "science",
      "research",
      "environment",
      "space",
    ],
  },
  {
    slug: "van-hoa-giai-tri",
    label: "Văn hóa & Giải trí",
    kind: "topic",
    keywords: [
      "van hoa",
      "giai tri",
      "am nhac",
      "dien anh",
      "nghe si",
      "phim",
      "culture",
      "entertainment",
      "music",
      "movie",
    ],
  },
  {
    slug: "the-thao",
    label: "Thể thao",
    kind: "topic",
    keywords: [
      "the thao",
      "bong da",
      "doi tuyen",
      "cau thu",
      "tran dau",
      "giai dau",
      "sports",
      "football",
      "soccer",
      "tennis",
      "olympic",
    ],
  },
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

const GENERIC_CATEGORY_PATTERN = /^(tin tuc|news|general|chua phan loai)$/;
const VIETNAM_TERMS = ["viet nam", "vietnam", "vn"] as const;

function containsPhrase(value: string, phrase: string): boolean {
  const normalizedPhrase = normalize(phrase);
  return (
    Boolean(normalizedPhrase) && ` ${value} `.includes(` ${normalizedPhrase} `)
  );
}

function matchesKeywords(value: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => containsPhrase(value, keyword));
}

function categoryMatchesText(
  value: string,
  category: (typeof NEWS_CATEGORIES)[number],
): boolean {
  return (
    containsPhrase(value, category.label) ||
    containsPhrase(value, category.slug.replaceAll("-", " ")) ||
    matchesKeywords(value, category.keywords)
  );
}

function declaredCategory(value: string) {
  return (
    NEWS_CATEGORIES.find((category) => categoryMatchesText(value, category)) ??
    null
  );
}

function isVietnam(value: string): boolean {
  return VIETNAM_TERMS.some((term) => containsPhrase(value, term));
}

function matchesRegion(item: NewsItem, slug: NewsCategorySlug): boolean {
  const region = normalize(item.region ?? "");
  const countries = (item.countries ?? []).map(normalize).filter(Boolean);
  if (slug === "viet-nam")
    return isVietnam(region) || countries.some(isVietnam);
  if (slug === "the-gioi") {
    if (
      matchesKeywords(region, [
        "the gioi",
        "quoc te",
        "international",
        "global",
        "world",
      ])
    )
      return true;
    return countries.some((country) => !isVietnam(country));
  }
  return false;
}

export function newsCategory(slug?: string | null) {
  return NEWS_CATEGORIES.find((category) => category.slug === slug) ?? null;
}

export function matchesNewsCategory(
  item: NewsItem,
  slug?: string | null,
): boolean {
  const category = newsCategory(slug);
  if (!category) return true;
  const declared = normalize(item.category);
  if (categoryMatchesText(declared, category)) return true;

  // A story has two useful dimensions: where it happened and what it is about.
  // Keep both searchable even when the primary `category` stores only one.
  if (category.kind === "region" && matchesRegion(item, category.slug))
    return true;
  const structured = normalize(
    [
      item.primaryTopic,
      ...(item.topics ?? []),
      item.region,
      ...(item.locations ?? []),
      ...(item.countries ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  if (categoryMatchesText(structured, category)) return true;

  const assigned = declaredCategory(declared);
  if (
    assigned?.kind === category.kind ||
    (declared && !GENERIC_CATEGORY_PATTERN.test(declared) && !assigned)
  )
    return false;

  const fallback = normalize(`${item.title} ${item.summary}`);
  return categoryMatchesText(fallback, category);
}
