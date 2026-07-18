import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationProvider } from "./index";

export type TelegramNotificationType = "breaking_news" | "world_news" | "vietnam_news" | "technology_news" | "economy_news" | "daily_digest";

function minutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value); if (!match) return null; const hour = Number(match[1]); const minute = Number(match[2]); return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
}

export function isQuietTime(now: Date, timezone: string, start: string | null, end: string | null): boolean {
  if (!start || !end) return false; const startMinutes = minutes(start); const endMinutes = minutes(end); if (startMinutes === null || endMinutes === null || startMinutes === endMinutes) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const current = Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return startMinutes < endMinutes ? current >= startMinutes && current < endMinutes : current >= startMinutes || current < endMinutes;
}

export function preferenceAllows(type: TelegramNotificationType, row: Record<string, unknown>): boolean {
  const legacyKeys: Record<TelegramNotificationType, string> = { breaking_news: "breaking_news", world_news: "match_start", vietnam_news: "goal_alert", technology_news: "match_result", economy_news: "transfer_news", daily_digest: "daily_digest" };
  return row.telegram_enabled === true && row[legacyKeys[type]] === true;
}

export async function sendTelegramNotification(input: { userId: string; type: TelegramNotificationType; referenceId: string; versionKey: string; message: string; now?: Date }) {
  const client = createAdminClient(); if (!client) throw new ConfigurationError("Supabase chưa cấu hình cho Telegram.", "supabase");
  const provider = getNotificationProvider(); if (!provider.configured) return { status: "configuration_required" as const };
  const [connection, preferences, profile] = await Promise.all([
    client.from("telegram_connections").select("telegram_chat_id,verified_at").eq("user_id", input.userId).maybeSingle(),
    client.from("notification_preferences").select("breaking_news,match_start,goal_alert,match_result,transfer_news,daily_digest,telegram_enabled,quiet_hours_start,quiet_hours_end").eq("user_id", input.userId).maybeSingle(),
    client.from("profiles").select("timezone").eq("id", input.userId).maybeSingle(),
  ]);
  if (connection.error || preferences.error || profile.error) throw new ProviderError("Không thể đọc cấu hình Telegram.", "supabase");
  if (!connection.data?.telegram_chat_id || !connection.data.verified_at || !preferences.data || !preferenceAllows(input.type, preferences.data)) return { status: "suppressed" as const, reason: "not_connected_or_disabled" };
  if (isQuietTime(input.now ?? new Date(), profile.data?.timezone ?? "Asia/Ho_Chi_Minh", preferences.data.quiet_hours_start, preferences.data.quiet_hours_end)) return { status: "suppressed" as const, reason: "quiet_hours" };
  const delivery = { user_id: input.userId, channel: "telegram", notification_type: input.type, reference_id: input.referenceId, version_key: input.versionKey, status: "pending" };
  const { data: inserted, error: insertError } = await client.from("notification_deliveries").insert(delivery).select("id").maybeSingle();
  if (insertError?.code === "23505") return { status: "duplicate" as const }; if (insertError || !inserted) throw new ProviderError("Không thể tạo notification delivery.", "supabase");
  const sent = await provider.sendText(connection.data.telegram_chat_id, input.message).catch(() => false);
  await client.from("notification_deliveries").update({ status: sent ? "sent" : "failed", sent_at: sent ? new Date().toISOString() : null, error_code: sent ? null : "TELEGRAM_SEND_FAILED" }).eq("id", inserted.id);
  return { status: sent ? "sent" as const : "failed" as const };
}
