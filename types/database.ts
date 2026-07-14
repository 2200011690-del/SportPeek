export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type AppRole = "user" | "editor" | "admin";
export type InternalRole = "owner" | "member";
export type FollowEntityType = "sport" | "competition" | "team" | "player" | "coach" | "source" | "journalist" | "topic";
export interface Database {
  public: {
    Tables: {
      profiles: { Row: { id: string; display_name: string | null; avatar_url: string | null; role: AppRole; internal_role: InternalRole; preferred_language: string; timezone: string; created_at: string; updated_at: string }; Insert: { id: string; display_name?: string | null; role?: AppRole; internal_role?: InternalRole; preferred_language?: string; timezone?: string }; Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]> };
      allowed_users: { Row: { id: string; email: string; role: InternalRole; user_id: string | null; created_at: string; last_signed_in_at: string | null }; Insert: { id?: string; email: string; role?: InternalRole; user_id?: string | null }; Update: { role?: InternalRole; user_id?: string | null; last_signed_in_at?: string | null } };
      bookmarks: { Row: { id: string; user_id: string; news_cluster_id: string | null; story_cluster_id: string | null; created_at: string }; Insert: { id?: string; user_id: string; news_cluster_id?: string | null; story_cluster_id?: string | null; created_at?: string }; Update: never };
      reading_history: { Row: { id: string; user_id: string; news_cluster_id: string | null; story_cluster_id: string | null; read_at: string; reading_duration_seconds: number }; Insert: { id?: string; user_id: string; news_cluster_id?: string | null; story_cluster_id?: string | null; read_at?: string; reading_duration_seconds?: number }; Update: { reading_duration_seconds?: number } };
      user_follows: { Row: { id: string; user_id: string; entity_type: FollowEntityType; entity_id: string; created_at: string }; Insert: { id?: string; user_id: string; entity_type: FollowEntityType; entity_id: string }; Update: never };
      notification_preferences: { Row: { id: string; user_id: string; breaking_news: boolean; match_start: boolean; goal_alert: boolean; match_result: boolean; transfer_news: boolean; daily_digest: boolean; telegram_enabled: boolean; browser_enabled: boolean; email_enabled: boolean; quiet_hours_start: string | null; quiet_hours_end: string | null }; Insert: { id?: string; user_id: string; breaking_news?: boolean; match_start?: boolean; goal_alert?: boolean; match_result?: boolean; transfer_news?: boolean; daily_digest?: boolean }; Update: Partial<Database["public"]["Tables"]["notification_preferences"]["Insert"]> };
      story_clusters: { Row: { id: string; cluster_key: string; slug: string; title: string; summary: string | null; payload: Json; last_updated_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown> };
      news_clusters: { Row: { id: string; title: string; slug: string; summary: string | null; hotness_score: number; reliability_score: number; status: string; first_published_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown> };
    };
    Views: Record<string, never>; Functions: { is_admin: { Args: Record<string, never>; Returns: boolean }; is_internal_member: { Args: Record<string, never>; Returns: boolean }; is_owner: { Args: Record<string, never>; Returns: boolean } }; Enums: { app_role: AppRole; follow_entity_type: FollowEntityType };
  };
}
