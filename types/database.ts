export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type AppRole = "user" | "editor" | "admin";
export interface Database {
  public: {
    Tables: {
      profiles: { Row: { id: string; display_name: string | null; avatar_url: string | null; role: AppRole; preferred_language: string; timezone: string; created_at: string; updated_at: string }; Insert: { id: string; display_name?: string | null; role?: AppRole; preferred_language?: string; timezone?: string }; Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]> };
      bookmarks: { Row: { id: string; user_id: string; news_cluster_id: string; created_at: string }; Insert: { id?: string; user_id: string; news_cluster_id: string; created_at?: string }; Update: never };
      user_follows: { Row: { id: string; user_id: string; entity_type: "sport"|"competition"|"team"|"player"; entity_id: string; created_at: string }; Insert: { id?: string; user_id: string; entity_type: "sport"|"competition"|"team"|"player"; entity_id: string }; Update: never };
      news_clusters: { Row: { id: string; title: string; slug: string; summary: string | null; hotness_score: number; reliability_score: number; status: string; first_published_at: string }; Insert: Record<string, unknown>; Update: Record<string, unknown> };
    };
    Views: Record<string, never>; Functions: { is_admin: { Args: Record<string, never>; Returns: boolean } }; Enums: { app_role: AppRole };
  };
}
