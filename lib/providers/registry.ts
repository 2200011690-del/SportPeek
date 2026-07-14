import { getAIProvider, type AIProvider } from "@/lib/ai";
import { developmentFixturesEnabled } from "@/lib/config";
import { getSportsDataProvider, type SportsDataProvider } from "@/lib/sports-data";
import { getNotificationProvider, type NotificationProvider } from "@/lib/telegram";

export type ProviderKind = "sports" | "news" | "ai" | "notification";
export type ProviderDescriptor = {
  kind: ProviderKind;
  name: string;
  state: "configured" | "configuration_required" | "development_mock";
  capabilities: string[];
};

export class ProviderRegistry {
  resolveSports(): SportsDataProvider { return getSportsDataProvider(); }
  resolveAI(): AIProvider { return getAIProvider(); }
  resolveNotification(): NotificationProvider { return getNotificationProvider(); }

  describe(): ProviderDescriptor[] {
    const sports = this.resolveSports();
    const ai = this.resolveAI();
    const fixtures = developmentFixturesEnabled();
    return [
      { kind: "sports", name: sports.name, state: sports.name === "disabled" ? "configuration_required" : sports.name === "mock" ? "development_mock" : "configured", capabilities: ["fixtures", "results", "standings", "live_score", "teams"] },
      { kind: "news", name: process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) ? "rss-supabase" : "disabled", state: process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) ? "configured" : fixtures ? "development_mock" : "configuration_required", capabilities: ["rss", "raw_articles", "story_clusters"] },
      { kind: "ai", name: ai.name, state: ai.name === "disabled" ? "configuration_required" : ai.name === "mock" ? "development_mock" : "configured", capabilities: ["classification", "entities", "summary", "agreements", "disputes", "timeline"] },
      { kind: "notification", name: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET ? "telegram" : "disabled", state: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET ? "configured" : "configuration_required", capabilities: ["breaking_news", "match_alert", "daily_digest"] },
    ];
  }
}

export const providerRegistry = new ProviderRegistry();
