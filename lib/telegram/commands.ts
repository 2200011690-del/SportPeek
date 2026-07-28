import { ConfigurationError, ProviderError } from "@/lib/core/errors";
import { storyService } from "@/lib/application/story-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNotificationProvider } from "./index";

type TelegramUpdate = { update_id?: number; message?: { text?: string; chat?: { id?: number }; from?: { id?: number } } };

const help = ["NewsPeek nội bộ", "/link CODE — liên kết tài khoản", "/today — tin đáng chú ý hôm nay", "/following — danh sách nguồn đang theo dõi", "/stop — tắt thông báo"].join("\n");

async function followingText(userId: string): Promise<string> {
  const client = createAdminClient(); if (!client) throw new ConfigurationError("Supabase chưa cấu hình.", "supabase");
  const { data, error } = await client.from("user_follows").select("entity_type,entity_id").eq("user_id", userId).limit(50); if (error) throw new ProviderError("Không thể đọc danh sách theo dõi.", "supabase");
  if (!data?.length) return "Bạn chưa theo dõi nguồn tin nào.";
  const tableByType: Record<string, string> = { source: "news_sources" }; const labels = new Map<string, string>();
  for (const [type, table] of Object.entries(tableByType)) {
    const ids = data.filter((row) => row.entity_type === type).map((row) => row.entity_id); if (!ids.length) continue;
    const result = await client.from(table).select("id,name").in("id", ids); for (const row of result.data ?? []) labels.set(row.id, row.name);
  }
  return ["Bạn đang theo dõi:", ...data.map((row) => `• ${labels.get(row.entity_id) ?? `${row.entity_type} ${row.entity_id.slice(0, 8)}`}`)].join("\n");
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  const provider = getNotificationProvider(); if (!provider.configured) return { status: "configuration_required" as const };
  const updateId = update.update_id; const chatIdValue = update.message?.chat?.id; const text = update.message?.text?.trim() ?? "";
  if (!Number.isSafeInteger(updateId) || !Number.isSafeInteger(chatIdValue) || !text.startsWith("/")) return { status: "ignored" as const };
  const chatId = String(chatIdValue); const [rawCommand, argument = ""] = text.split(/\s+/, 2); const command = rawCommand.toLowerCase().split("@")[0];
  const client = createAdminClient(); if (!client) throw new ConfigurationError("Supabase chưa cấu hình.", "supabase");
  const { error: dedupeError } = await client.from("telegram_updates").insert({ update_id: updateId, telegram_chat_id: chatId, command, status: "processing" });
  if (dedupeError?.code === "23505") return { status: "duplicate" as const }; if (dedupeError) throw new ProviderError("Không thể ghi nhận Telegram update.", "supabase");
  let response = help; let status: "completed" | "ignored" | "failed" = "completed";
  try {
    if (command === "/start") response = help;
    else if (command === "/link") {
      const code = argument.toUpperCase();
      if (!/^[A-Z0-9]{8}$/.test(code)) response = "Mã liên kết không hợp lệ. Hãy tạo mã mới trong Cài đặt > Telegram.";
      else {
        const { data: connection, error } = await client.from("telegram_connections").select("id,user_id,verification_expires_at").eq("verification_code", code).maybeSingle();
        if (error) throw new ProviderError("Không thể kiểm tra mã liên kết.", "supabase");
        if (!connection || !connection.verification_expires_at || Date.parse(connection.verification_expires_at) < Date.now()) response = "Mã liên kết không tồn tại hoặc đã hết hạn.";
        else {
          const now = new Date().toISOString(); const { error: linkError } = await client.from("telegram_connections").update({ telegram_chat_id: chatId, verified_at: now, verification_code: null, verification_expires_at: null, stopped_at: null, last_update_id: updateId }).eq("id", connection.id);
          if (linkError) throw new ProviderError("Không thể liên kết Telegram.", "supabase");
          await client.from("notification_preferences").upsert({ user_id: connection.user_id, telegram_enabled: true }, { onConflict: "user_id" }); response = "Đã liên kết Telegram với NewsPeek. Dùng /following để kiểm tra nguồn theo dõi.";
        }
      }
    } else {
      const { data: connection, error } = await client.from("telegram_connections").select("id,user_id").eq("telegram_chat_id", chatId).not("verified_at", "is", null).maybeSingle();
      if (error) throw new ProviderError("Không thể kiểm tra liên kết Telegram.", "supabase");
      if (!connection) response = "Telegram chưa được liên kết. Tạo mã trong website rồi gửi /link CODE.";
      else if (command === "/today") {
        const stories = await storyService.getFeed(); const top = (stories.data ?? []).slice().sort((a, b) => (b.hotnessScore ?? 0) - (a.hotnessScore ?? 0)).slice(0, 5);
        response = top.length ? ["Tin đáng chú ý hôm nay:", ...top.map((story, index) => `${index + 1}. ${story.title} (${story.sourceCount} nguồn)`)].join("\n") : "Chưa có story đã xử lý trong cache.";
      } else if (command === "/following") response = await followingText(connection.user_id);
      else if (command === "/stop") {
        await client.from("notification_preferences").upsert({ user_id: connection.user_id, telegram_enabled: false }, { onConflict: "user_id" }); await client.from("telegram_connections").update({ stopped_at: new Date().toISOString(), last_update_id: updateId }).eq("id", connection.id); response = "Đã tắt toàn bộ thông báo Telegram. Bạn vẫn có thể dùng các lệnh tra cứu.";
      } else { response = help; status = "ignored"; }
    }
    const sent = await provider.sendText(chatId, response); if (!sent) status = "failed";
    await client.from("telegram_updates").update({ status, processed_at: new Date().toISOString(), error_code: sent ? null : "SEND_FAILED" }).eq("update_id", updateId);
    return { status: sent ? status : "failed" as const };
  } catch (error) {
    await client.from("telegram_updates").update({ status: "failed", processed_at: new Date().toISOString(), error_code: "COMMAND_FAILED" }).eq("update_id", updateId); throw error;
  }
}
