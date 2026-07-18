import assert from "node:assert/strict";
import test from "node:test";
import {
  CloudflareAIProvider,
  DEFAULT_CLOUDFLARE_AI_MODEL,
  enrichInternationalNewsWithCloudflare,
  setWorkersAIBinding,
} from "../../lib/ai/cloudflare";

test("Cloudflare AI enriches international news with validated Vietnamese output", async () => {
  setWorkersAIBinding({
    async run(model, input) {
      assert.equal(model, DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(input.response_format?.type, "json_schema");
      assert.equal(input.response_format?.json_schema.type, "object");
      assert.equal(input.max_tokens, 900);
      return {
        response: {
          items: [{
            id: "bbc-1",
            titleVi: "Đội tuyển giành chiến thắng",
            summaryVi: "Đội tuyển thắng trận theo thông tin từ nguồn.",
            keyPoints: ["Kết quả được nguồn xác nhận"],
            topic: "Bóng đá quốc tế",
            importance: 78,
          }],
        },
      };
    },
  });
  try {
    const result = await enrichInternationalNewsWithCloudflare([{ id: "bbc-1", title: "Team wins", excerpt: "The team won the match." }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].titleVi, "Đội tuyển giành chiến thắng");
    assert.equal(result[0].importance, 78);
  } finally {
    setWorkersAIBinding(undefined);
  }
});

test("Cloudflare AI cluster summaries use the bounded long-form JSON request", async () => {
  setWorkersAIBinding({
    async run(model, input) {
      assert.equal(model, DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(input.response_format?.type, "json_schema");
      assert.equal(input.max_tokens, 2200);
      return {
        response: {
          title: "Arsenal giành chiến thắng",
          summary: "Arsenal giành chiến thắng theo dữ kiện được các nguồn cung cấp và không bổ sung thông tin ngoài đầu vào.",
          keyPoints: ["Arsenal giành chiến thắng"],
        },
      };
    },
  });
  try {
    const result = await new CloudflareAIProvider().summarizeCluster({
      articles: [{ id: "article-1", title: "Arsenal thắng", excerpt: "Arsenal giành chiến thắng." }],
    });
    assert.deepEqual(result.sourceIds, ["article-1"]);
  } finally {
    setWorkersAIBinding(undefined);
  }
});

test("Cloudflare AI only enables native JSON Schema for allowlisted models", async () => {
  const previousModel = process.env.CLOUDFLARE_AI_MODEL;
  process.env.CLOUDFLARE_AI_MODEL = "@cf/meta/llama-3.2-1b-instruct";
  setWorkersAIBinding({
    async run(_model, input) {
      assert.equal(input.response_format, undefined);
      assert.match(input.messages[0].content, /JSON Schema/);
      return {
        response: JSON.stringify({
          items: [{ id: "bbc-1", titleVi: "Đội thắng", summaryVi: "Đội giành chiến thắng.", keyPoints: ["Đội thắng"], topic: "Bóng đá", importance: 60 }],
        }),
      };
    },
  });
  try {
    const result = await enrichInternationalNewsWithCloudflare([{ id: "bbc-1", title: "Team wins", excerpt: "The team won." }]);
    assert.equal(result[0].id, "bbc-1");
  } finally {
    setWorkersAIBinding(undefined);
    if (previousModel === undefined) delete process.env.CLOUDFLARE_AI_MODEL;
    else process.env.CLOUDFLARE_AI_MODEL = previousModel;
  }
});

test("Cloudflare AI rejects enrichment for unknown article ids", async () => {
  setWorkersAIBinding({
    async run() {
      return { response: JSON.stringify({ items: [{ id: "invented", titleVi: "Sai", summaryVi: "Sai", keyPoints: ["Sai"], topic: "Khác", importance: 10 }] }) };
    },
  });
  try {
    await assert.rejects(
      () => enrichInternationalNewsWithCloudflare([{ id: "real", title: "Real", excerpt: "Real excerpt" }]),
      /đổi article id/,
    );
  } finally {
    setWorkersAIBinding(undefined);
  }
});
