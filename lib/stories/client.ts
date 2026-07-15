import {
  storyClusterSchema,
  storyDetailEnvelopeSchema,
  type StoryCluster,
  type StoryDetailEnvelope,
  type StoryDetailPayload,
  type StoryResponseMeta,
} from "./schema";

export type StoryReaderState =
  | { status: "idle" | "loading"; data: null; meta: null; message: null }
  | { status: "success" | "stale"; data: StoryDetailPayload; meta: StoryResponseMeta; message: string | null }
  | { status: "empty" | "not_found" | "configuration_required" | "unauthorized" | "error"; data: null; meta: StoryResponseMeta | null; message: string };

export const initialStoryReaderState: StoryReaderState = { status: "idle", data: null, meta: null, message: null };
export const loadingStoryReaderState: StoryReaderState = { status: "loading", data: null, meta: null, message: null };
const configuredTimeoutMs = Number(process.env.NEXT_PUBLIC_STORY_DETAIL_TIMEOUT_MS ?? 12_000);
const configuredRetries = Number(process.env.NEXT_PUBLIC_STORY_DETAIL_RETRY_COUNT ?? 1);
export const storyDetailTimeoutMs = Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs >= 1_000 ? configuredTimeoutMs : 12_000;
export const storyDetailRetryCount = Number.isFinite(configuredRetries) ? Math.min(1, Math.max(0, configuredRetries)) : 1;

export function mapStoryEnvelopeToState(envelope: StoryDetailEnvelope): StoryReaderState {
  if ((envelope.status === "success" || envelope.status === "stale") && envelope.data) {
    return {
      status: envelope.status,
      data: envelope.data,
      meta: envelope.meta,
      message: envelope.status === "stale" ? "Đang hiển thị bản lưu gần nhất vì nguồn tin tạm thời gián đoạn." : null,
    };
  }
  const messages = {
    empty: "Cụm tin chưa có bài nguồn để hiển thị.",
    not_found: "Bài viết không tồn tại hoặc đường dẫn không còn hợp lệ.",
    configuration_required: "Nguồn tin thật chưa được cấu hình.",
    unauthorized: "Bạn không có quyền xem nội dung này.",
    error: "Không thể tải bài viết lúc này.",
  } as const;
  const status = envelope.status === "success" || envelope.status === "stale" ? "error" : envelope.status;
  return {
    status,
    data: null,
    meta: envelope.meta,
    message: envelope.error?.message ?? messages[status],
  };
}

type FetchStoryOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
};

export async function requestStoryAISummary(slug: string, options: Pick<FetchStoryOptions, "fetcher"> = {}): Promise<StoryCluster | null> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(`/api/stories/${encodeURIComponent(slug)}/summarize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object") return null;
    const data = "data" in body && body.data && typeof body.data === "object" ? body.data : null;
    const candidate = data && "story" in data ? data.story : data;
    const parsed = storyClusterSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function fetchStoryDetail(slug: string, options: FetchStoryOptions = {}): Promise<StoryReaderState> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? storyDetailTimeoutMs;
  const retries = Math.min(1, Math.max(0, options.retries ?? storyDetailRetryCount));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`/api/stories/${encodeURIComponent(slug)}`, { cache: "no-store", signal: controller.signal });
      const body: unknown = await response.json().catch(() => null);
      const parsed = storyDetailEnvelopeSchema.safeParse(body);
      if (parsed.success) return mapStoryEnvelopeToState(parsed.data);
      if (response.status === 401 || response.status === 403) {
        return { status: "unauthorized", data: null, meta: null, message: "Bạn không có quyền xem nội dung này." };
      }
      if (response.status === 404) {
        return { status: "not_found", data: null, meta: null, message: "Bài viết không tồn tại hoặc đường dẫn không còn hợp lệ." };
      }
      if (response.status < 500 || attempt === retries) {
        return { status: "error", data: null, meta: null, message: "Phản hồi bài viết không hợp lệ." };
      }
    } catch (error) {
      if (attempt === retries) {
        return {
          status: "error",
          data: null,
          meta: null,
          message: error instanceof Error && error.name === "AbortError"
            ? "Quá thời gian tải bài viết. Vui lòng thử lại."
            : "Mất kết nối khi tải bài viết. Vui lòng thử lại.",
        };
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return { status: "error", data: null, meta: null, message: "Không thể tải bài viết lúc này." };
}
