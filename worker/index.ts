/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { scheduledPipelineTask, scheduledStoryProcessingOptions } from "../lib/cron/schedule";
import { syncRss } from "../lib/rss/sync";
import { processStories, summarizePersistedStories } from "../lib/stories/processor";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  AI: Ai;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
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
  async fetch(request: Request, env?: Env, ctx?: ExecutionContext): Promise<Response> {
    // Vinext server modules read configuration through `process.env`, while
    // Cloudflare supplies runtime variables and secrets through the Worker
    // `env` binding. Bridge string bindings before dispatching the request so
    // server-only secrets remain runtime-only and are never bundled. Vinext's
    // Node production adapter and Sites may omit the Cloudflare env argument,
    // so keep the entry compatible with both invocation shapes.
    const runtimeEnv = env ?? ({} as Env);
    for (const [key, value] of Object.entries(runtimeEnv as unknown as Record<string, unknown>)) {
      if (typeof value === "string") process.env[key] = value;
    }
    globalThis.__SPORTPEEK_WORKERS_AI__ = runtimeEnv.AI;

    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image" && runtimeEnv.ASSETS && runtimeEnv.IMAGES) {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => runtimeEnv.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await runtimeEnv.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, runtimeEnv, ctx);
  },

  async scheduled(controller: ScheduledController, env?: Env, ctx?: ExecutionContext): Promise<void> {
    const runtimeEnv = env ?? ({} as Env);
    for (const [key, value] of Object.entries(runtimeEnv as unknown as Record<string, unknown>)) {
      if (typeof value === "string") process.env[key] = value;
    }
    globalThis.__SPORTPEEK_WORKERS_AI__ = runtimeEnv.AI;

    // The trigger runs every minute. Alternate the two isolated phases to stay
    // within Cloudflare Workers' subrequest limit without starving either one.
    const task = scheduledPipelineTask(controller.scheduledTime ?? Date.now());

    const run = async () => {
      try {
        if (task === "rss") {
          // Even invocation: sync RSS feeds
          console.log("[Cron] Running RSS sync...");
          const rssSummary = await syncRss();
          console.log("[Cron] RSS sync result:", JSON.stringify(rssSummary));
        } else {
          // Odd invocation: finish one new story with AI. When the queue is
          // empty, translate one older unprocessed story (international first).
          console.log("[Cron] Running story processing...");
          const storySummary = await processStories(scheduledStoryProcessingOptions());
          console.log("[Cron] Story processing result:", JSON.stringify(storySummary));
          if (storySummary.inputArticles === 0) {
            const aiBackfill = await summarizePersistedStories({ limit: 1 });
            console.log("[Cron] AI backfill result:", JSON.stringify(aiBackfill));
          }
        }
      } catch (error) {
        console.error("[Cron] Error running scheduled task:", error);
      }
    };
    if (ctx) ctx.waitUntil(run());
    else await run();
  }
};

export default worker;
