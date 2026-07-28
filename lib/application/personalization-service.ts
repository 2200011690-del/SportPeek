import { AuthenticationError, NotFoundError, ProviderError } from "@/lib/core/errors";
import { getMemberContext } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import type { FollowEntityType } from "@/types/database";
import type { StoryCluster } from "@/lib/stories/schema";
import { rankPersonalizedFeed } from "@/lib/personalization/ranking";
import { createLinkCode } from "@/lib/telegram";

const DEFAULT_NOTIFICATIONS = [true, true, true, true, false, false];

async function memberClient() {
  const [member, client] = await Promise.all([getMemberContext(), createClient()]);
  if (!member || !client) throw new AuthenticationError();
  return { member, client };
}

export class PersonalizationApplicationService {
  async snapshot() {
    const { member, client } = await memberClient();
    const [profile, bookmarks, follows, notifications, telegram] = await Promise.all([
      client.from("profiles").select("display_name,preferred_language,timezone").eq("id", member.user.id).maybeSingle(),
      client.from("bookmarks").select("story_cluster_id").eq("user_id", member.user.id).not("story_cluster_id", "is", null),
      client.from("user_follows").select("entity_type,entity_id").eq("user_id", member.user.id),
      client.from("notification_preferences").select("breaking_news,match_start,goal_alert,match_result,transfer_news,daily_digest,telegram_enabled,quiet_hours_start,quiet_hours_end").eq("user_id", member.user.id).maybeSingle(),
      client.from("telegram_connections").select("telegram_chat_id,verified_at").eq("user_id", member.user.id).maybeSingle(),
    ]);
    const errors = [profile.error, bookmarks.error, follows.error, notifications.error, telegram.error].filter(Boolean);
    if (errors.length) throw new ProviderError("Không thể tải dữ liệu cá nhân.", "supabase", true);
    const storyIds = (bookmarks.data ?? []).map((item) => item.story_cluster_id).filter((value): value is string => Boolean(value));
    const stories = storyIds.length ? await client.from("story_clusters").select("id,cluster_key").in("id", storyIds) : { data: [], error: null };
    if (stories.error) throw new ProviderError("Không thể tải tin đã lưu.", "supabase", true);
    const notificationRow = notifications.data;
    return {
      email: member.user.email ?? "",
      role: member.role,
      profile: {
        displayName: profile.data?.display_name ?? member.user.user_metadata?.display_name ?? member.user.email?.split("@")[0] ?? "Thành viên",
        language: profile.data?.preferred_language === "en" ? "en" as const : "vi" as const,
        timezone: profile.data?.timezone ?? "Asia/Ho_Chi_Minh",
      },
      bookmarks: (stories.data ?? []).map((story) => story.id),
      follows: (follows.data ?? []).map((follow) => ({ entityType: follow.entity_type, entityId: follow.entity_id })),
      notifications: notificationRow ? [notificationRow.breaking_news, notificationRow.match_start, notificationRow.goal_alert, notificationRow.match_result, notificationRow.transfer_news, notificationRow.daily_digest] : DEFAULT_NOTIFICATIONS,
      quietHoursStart: notificationRow?.quiet_hours_start?.slice(0, 5) ?? "",
      quietHoursEnd: notificationRow?.quiet_hours_end?.slice(0, 5) ?? "",
      telegram: { configured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET), connected: Boolean(telegram.data?.telegram_chat_id && telegram.data.verified_at), enabled: notificationRow?.telegram_enabled ?? false, botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null },
    };
  }

  async bookmark(storyId: string, action: "save" | "remove") {
    const { member, client } = await memberClient();
    const { data: story } = await client.from("story_clusters").select("id").eq("id", storyId).maybeSingle();
    if (!story) throw new NotFoundError("Story chưa tồn tại trong kho dữ liệu.");
    if (action === "remove") {
      const { error } = await client.from("bookmarks").delete().eq("user_id", member.user.id).eq("story_cluster_id", story.id);
      if (error) throw new ProviderError("Không thể bỏ lưu story.", "supabase");
    } else {
      const { data: existing, error: lookupError } = await client.from("bookmarks").select("id").eq("user_id", member.user.id).eq("story_cluster_id", story.id).maybeSingle();
      if (lookupError) throw new ProviderError("Không thể kiểm tra story đã lưu.", "supabase");
      if (!existing) {
        const { error } = await client.from("bookmarks").insert({ user_id: member.user.id, story_cluster_id: story.id });
        if (error) throw new ProviderError("Không thể lưu story.", "supabase");
      }
    }
    return { ok: true, persisted: true, storage: "supabase" as const };
  }

  async recordReading(storyId: string, durationSeconds: number) {
    const { member, client } = await memberClient();
    const { data: story, error: storyError } = await client.from("story_clusters").select("id").eq("id", storyId).maybeSingle();
    if (storyError) throw new ProviderError("Không thể kiểm tra story.", "supabase");
    if (!story) throw new NotFoundError("Story chưa tồn tại trong kho dữ liệu.");
    const { data: latest, error: latestError } = await client.from("reading_history").select("id,reading_duration_seconds,read_at").eq("user_id", member.user.id).eq("story_cluster_id", story.id).order("read_at", { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw new ProviderError("Không thể đọc lịch sử.", "supabase");
    if (latest && Date.now() - Date.parse(latest.read_at) < 24 * 60 * 60_000) {
      const { error } = await client.from("reading_history").update({ reading_duration_seconds: Math.max(latest.reading_duration_seconds, durationSeconds) }).eq("id", latest.id);
      if (error) throw new ProviderError("Không thể cập nhật thời lượng đọc.", "supabase");
    } else {
      const { error } = await client.from("reading_history").insert({ user_id: member.user.id, story_cluster_id: story.id, reading_duration_seconds: durationSeconds });
      if (error) throw new ProviderError("Không thể lưu lịch sử đọc.", "supabase");
    }
    return { ok: true, persisted: true, storage: "supabase" as const };
  }

  async personalizedFeed(stories: StoryCluster[]) {
    const { member, client } = await memberClient(); const ids = stories.map((story) => story.id);
    if (!ids.length) return [];
    const [follows, bookmarks, history, entities] = await Promise.all([
      client.from("user_follows").select("entity_type,entity_id").eq("user_id", member.user.id),
      client.from("bookmarks").select("story_cluster_id").eq("user_id", member.user.id).not("story_cluster_id", "is", null),
      client.from("reading_history").select("story_cluster_id,read_at").eq("user_id", member.user.id).not("story_cluster_id", "is", null).order("read_at", { ascending: false }).limit(250),
      client.from("story_entities").select("cluster_id,entity_id").in("cluster_id", ids),
    ]);
    if (follows.error || bookmarks.error || history.error || entities.error) throw new ProviderError("Không thể tính feed cá nhân.", "supabase", true);
    const followedEntityIds = new Set((follows.data ?? []).filter((row) => row.entity_type !== "source").map((row) => row.entity_id));
    const followedSourceIds = new Set((follows.data ?? []).filter((row) => row.entity_type === "source").map((row) => row.entity_id));
    const bookmarkedStoryIds = new Set((bookmarks.data ?? []).map((row) => row.story_cluster_id).filter((value): value is string => Boolean(value)));
    const readStoryIds = new Set((history.data ?? []).map((row) => row.story_cluster_id).filter((value): value is string => Boolean(value)));
    const entityMap = new Map<string, string[]>();
    for (const row of entities.data ?? []) entityMap.set(row.cluster_id, [...(entityMap.get(row.cluster_id) ?? []), row.entity_id]);
    const readEntityIds = new Set([...readStoryIds].flatMap((id) => entityMap.get(id) ?? []));
    return rankPersonalizedFeed(stories.map((story) => ({ value: story, id: story.id, publishedAt: story.updatedAt, hotness: story.hotnessScore ?? 0, reliability: story.reliabilityScore ?? 0, entityIds: entityMap.get(story.id) ?? [], sourceIds: story.articles.map((article) => article.sourceId), diversityKey: story.teams[0] ?? story.competition ?? story.category })), { followedEntityIds, followedSourceIds, bookmarkedStoryIds, readStoryIds, readEntityIds });
  }

  async follow(entityType: FollowEntityType, entityId: string, action: "follow" | "unfollow") {
    const { member, client } = await memberClient();
    if (action === "unfollow") {
      const { error } = await client.from("user_follows").delete().eq("user_id", member.user.id).eq("entity_type", entityType).eq("entity_id", entityId);
      if (error) throw new ProviderError("Không thể bỏ theo dõi.", "supabase");
    } else {
      const { error } = await client.from("user_follows").upsert({ user_id: member.user.id, entity_type: entityType, entity_id: entityId }, { onConflict: "user_id,entity_type,entity_id" });
      if (error) throw new ProviderError("Không thể theo dõi.", "supabase");
    }
    return { ok: true, persisted: true, storage: "supabase" as const };
  }

  async updateProfile(input: { displayName: string; language: "vi" | "en"; timezone: string; notifications?: boolean[]; quietHoursStart?: string; quietHoursEnd?: string }) {
    const { member, client } = await memberClient();
    const { error } = await client.from("profiles").update({ display_name: input.displayName, preferred_language: input.language, timezone: input.timezone }).eq("id", member.user.id);
    if (error) throw new ProviderError("Không thể lưu hồ sơ.", "supabase");
    if (input.notifications) {
      const values = input.notifications;
      const { error: notificationError } = await client.from("notification_preferences").upsert({ user_id: member.user.id, breaking_news: values[0], match_start: values[1], goal_alert: values[2], match_result: values[3], transfer_news: values[4], daily_digest: values[5], quiet_hours_start: input.quietHoursStart || null, quiet_hours_end: input.quietHoursEnd || null }, { onConflict: "user_id" });
      if (notificationError) throw new ProviderError("Không thể lưu cài đặt thông báo.", "supabase");
    }
    return { ok: true, persisted: true, storage: "supabase" as const };
  }

  async createTelegramLinkCode() {
    const { member, client } = await memberClient();
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET) return { configured: false, code: null, expiresAt: null, botUsername: null };
    const code = createLinkCode(); const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const { error } = await client.from("telegram_connections").upsert({ user_id: member.user.id, verification_code: code, verification_expires_at: expiresAt }, { onConflict: "user_id" });
    if (error) throw new ProviderError("Không thể tạo mã liên kết Telegram.", "supabase");
    return { configured: true, code, expiresAt, botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null };
  }

  async reset() {
    const { member, client } = await memberClient();
    const results = await Promise.all([
      client.from("bookmarks").delete().eq("user_id", member.user.id),
      client.from("user_follows").delete().eq("user_id", member.user.id),
      client.from("reading_history").delete().eq("user_id", member.user.id),
      client.from("notification_preferences").delete().eq("user_id", member.user.id),
    ]);
    if (results.some((result) => result.error)) throw new ProviderError("Không thể xóa toàn bộ dữ liệu cá nhân hóa.", "supabase");
    return { ok: true, persisted: true, storage: "supabase" as const };
  }
}

export const personalizationService = new PersonalizationApplicationService();
