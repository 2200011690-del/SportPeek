/** Cloudflare Worker entry point for the vinext-starter template. */
import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
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

    return handler.fetch(request, runtimeEnv, ctx);
  },

  async scheduled(
    controller: ScheduledController,
    env?: Env,
    ctx?: ExecutionContext,
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
    const run = async () => {
      let timerId: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error("Timeout: Cron task execution exceeded 50 seconds."));
        }, 50000);
      });

      try {
        await Promise.race([
          (async () => {
            if (task === "rss") {
              // Even invocation: sync RSS feeds
              console.log("[Cron] Running RSS sync...");
              const rssSummary = await syncRss({ maxSources: 6 });
              console.log("[Cron] RSS sync result:", JSON.stringify(rssSummary));
            } else if (task === "stories") {
              // Odd invocation: process one small, atomically-leased story batch.
              console.log("[Cron] Running story processing...");
              const storySummary = await processStories(
                scheduledStoryProcessingOptions(scheduledAt),
              );
              console.log(
                "[Cron] Story processing result:",
                JSON.stringify(storySummary),
              );
            } else {
              // Dedicated backfill phase: keep pending stories receiving remote AI
              // summaries even when fresh RSS never fully drains.
              console.log("[Cron] Running AI summary backfill...");
              const aiBackfill = await summarizePersistedStories({ limit: 1 });
              console.log(
                "[Cron] AI backfill result:",
                JSON.stringify(aiBackfill),
              );
            }
          })(),
          timeoutPromise
        ]);
      } catch (error) {
        console.error("[Cron] Error running scheduled task:", error);
        throw error;
      } finally {
        if (timerId) clearTimeout(timerId);
      }
    };
    if (ctx) ctx.waitUntil(run());
    else await run();
  },
};

export default worker;
