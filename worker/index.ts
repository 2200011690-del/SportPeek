/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  runScheduledPipelineTask,
  scheduledPipelineTask,
  scheduledStoryProcessingOptions,
} from "../lib/cron/schedule";
import { syncRss } from "../lib/rss/sync";
import {
  processStories,
  summarizePersistedStories,
} from "../lib/stories/processor";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  AI: Ai;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: {
          format: string;
          quality: number;
        }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledController {
  scheduledTime?: number;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(
    request: Request,
    env?: Env,
    ctx?: ExecutionContext,
  ): Promise<Response> {
    // Vinext server modules read configuration through `process.env`, while
    // Cloudflare supplies runtime variables and secrets through the Worker
    // `env` binding. Bridge string bindings before dispatching the request so
    // server-only secrets remain runtime-only and are never bundled. Vinext's
    // Node production adapter and Sites may omit the Cloudflare env argument,
    // so keep the entry compatible with both invocation shapes.
    const runtimeEnv = env ?? ({} as Env);
    for (const [key, value] of Object.entries(
      runtimeEnv as unknown as Record<string, unknown>,
    )) {
      if (typeof value === "string") process.env[key] = value;
    }
    globalThis.__SPORTPEEK_WORKERS_AI__ = runtimeEnv.AI;

    const url = new URL(request.url);
    if (
      url.hostname === "sportpeek.2200011690.workers.dev" &&
      request.headers.get("x-newspeek-proxy") !== "1"
    ) {
      url.hostname = "newspeek.2200011690.workers.dev";
      return new Response(null, {
        status: 308,
        headers: {
          location: url.toString(),
          "cache-control": "public, max-age=3600",
          "strict-transport-security":
            "max-age=31536000; includeSubDomains; preload",
          "x-content-type-options": "nosniff",
        },
      });
    }

    if (
      url.pathname === "/_vinext/image" &&
      runtimeEnv.ASSETS &&
      runtimeEnv.IMAGES
    ) {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            runtimeEnv.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await runtimeEnv.IMAGES.input(body)
              .transform(width > 0 ? { width } : {})
              .output({ format, quality });
            return result.response();
          },
        },
        allowedWidths,
      );
    }

    const response = await handler.fetch(request, runtimeEnv, ctx);
    const newHeaders = new Headers(response.headers);
    newHeaders.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
    newHeaders.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },

  async scheduled(
    controller: ScheduledController,
    env?: Env,
  ): Promise<void> {
    const runtimeEnv = env ?? ({} as Env);
    for (const [key, value] of Object.entries(
      runtimeEnv as unknown as Record<string, unknown>,
    )) {
      if (typeof value === "string") process.env[key] = value;
    }
    globalThis.__SPORTPEEK_WORKERS_AI__ = runtimeEnv.AI;

    // The trigger runs every minute. Rotate isolated phases to stay within
    // Cloudflare Workers' subrequest limit without starving RSS, clustering, or
    // the AI summary backlog.
    const scheduledAt = controller.scheduledTime ?? Date.now();
    const task = scheduledPipelineTask(scheduledAt);
    try {
      // A scheduled handler's returned promise is already awaited by
      // Cloudflare for up to 15 minutes. Do not race it against a short timer:
      // that would abandon the database job in "processing" with no chance to
      // run its own failure finalizer.
      await runScheduledPipelineTask(task, {
        rss: async () => {
          console.log("[Cron] Running RSS sync...");
          const rssSummary = await syncRss({ maxSources: 6 });
          console.log("[Cron] RSS sync result:", JSON.stringify(rssSummary));
        },
        stories: async () => {
          console.log("[Cron] Running story processing...");
          const storySummary = await processStories(
            scheduledStoryProcessingOptions(scheduledAt),
          );
          console.log(
            "[Cron] Story processing result:",
            JSON.stringify(storySummary),
          );
        },
        ai: async () => {
          console.log("[Cron] Running AI summary backfill...");
          const aiBackfill = await summarizePersistedStories({ limit: 1 });
          console.log("[Cron] AI backfill result:", JSON.stringify(aiBackfill));
        },
      });
    } catch (error) {
      console.error("[Cron] Error running scheduled task:", error);
      throw error;
    }
  },
};

export default worker;
