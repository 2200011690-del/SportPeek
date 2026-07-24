"use client";

import { createContext, useContext } from "react";
import { Cpu, Globe2, Home, Landmark, Newspaper, Sparkles } from "lucide-react";
import type { HealthSnapshot, ServiceHealth } from "@/lib/health";
import type { NewsItem, NewsSourceCatalogItem } from "@/lib/types";

export type SourceFilter = "all" | "vi" | "international" | "official" | "rss";

export type NewsAIStatus = {
  provider: string;
  state: "ok" | "off" | "error";
  translatedCount: number;
};

export type RuntimeData = {
  newsItems: NewsItem[];
  forYouItems: NewsItem[];
  personalized: boolean;
  sourceCatalog: NewsSourceCatalogItem[];
  newsReal: boolean;
  newsSources: string[];
  aiTranslation: boolean;
  aiStatus: NewsAIStatus;
  loading: boolean;
  lastUpdated: string | null;
  health: HealthSnapshot;
};

const loadingService = (label: string): ServiceHealth => ({
  state: "unavailable",
  label,
  message: "Đang tải trạng thái từ server.",
  provider: null,
  lastUpdatedAt: null,
  count: null,
});

const loadingHealth: HealthSnapshot = {
  state: "unavailable",
  generatedAt: new Date(0).toISOString(),
  services: {
    rss: loadingService("Đang tải RSS"),
    stories: loadingService("Đang tải stories"),
    ai: loadingService("Đang tải AI"),
    telegram: loadingService("Đang tải Telegram"),
  },
};

export const emptyRuntimeData: RuntimeData = {
  newsItems: [],
  forYouItems: [],
  personalized: false,
  sourceCatalog: [],
  newsReal: false,
  newsSources: [],
  aiTranslation: false,
  aiStatus: { provider: "off", state: "off", translatedCount: 0 },
  loading: true,
  lastUpdated: null,
  health: loadingHealth,
};

export const RuntimeDataContext = createContext<RuntimeData>(emptyRuntimeData);
export const useRuntimeData = () => useContext(RuntimeDataContext);

export const STORAGE_KEYS = {
  theme: "newspeek.theme",
  legacyTheme: "sportpeek.theme",
} as const;

export type StoredSettings = {
  displayName: string;
  language: "vi" | "en";
  timezone: string;
  notifications: boolean[];
  quietHoursStart: string;
  quietHoursEnd: string;
};

export const DEFAULT_DEVICE_SETTINGS: StoredSettings = {
  displayName: "Độc giả",
  language: "vi",
  timezone: "Asia/Ho_Chi_Minh",
  notifications: [true, true, true, false, false, false],
  quietHoursStart: "",
  quietHoursEnd: "",
};

export const navItems = [
  { href: "/", label: "Trang chủ", icon: Home },
  { href: "/news", label: "Mới nhất", icon: Newspaper },
  { href: "/for-you", label: "Dành cho bạn", icon: Sparkles },
  { href: "/category/viet-nam", label: "Việt Nam", icon: Landmark },
  { href: "/category/the-gioi", label: "Thế giới", icon: Globe2 },
  { href: "/category/cong-nghe", label: "Công nghệ", icon: Cpu },
];
