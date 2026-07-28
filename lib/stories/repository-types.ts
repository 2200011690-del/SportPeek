import type { AggregatedNews } from "@/lib/ingestion/official-feed";
import type { StoryResponseMeta } from "./schema";

export type StoryRepositoryStatus =
  | "success"
  | "empty"
  | "not_found"
  | "stale"
  | "configuration_required"
  | "error";

export type StoryRepositoryResult<T> = {
  status: StoryRepositoryStatus;
  data: T | null;
  meta: StoryResponseMeta;
  error?: { code: string; message: string } | null;
  diagnostics?: Pick<AggregatedNews, "sources" | "aiTranslation" | "aiStatus">;
};
