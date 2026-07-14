import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NewsSourceCatalogItem } from "@/lib/types";

export async function readNewsSourceCatalog(): Promise<NewsSourceCatalogItem[]> {
  const client = createAdminClient(); if (!client) throw new ConfigurationError("Supabase chưa cấu hình cho source catalog.", "supabase");
  const { data, error } = await client.from("news_sources").select("id,name,language,reliability_score,is_official,is_active,last_fetched_at,last_error").order("name");
  if (error) throw new ProviderError("Không thể đọc source catalog.", "supabase");
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, language: row.language === "en" ? "en" as const : "vi" as const, reliability: row.reliability_score, official: row.is_official, active: row.is_active, lastFetchedAt: row.last_fetched_at, lastError: row.last_error }));
}
