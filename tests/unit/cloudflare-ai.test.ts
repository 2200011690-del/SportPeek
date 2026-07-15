import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CLOUDFLARE_AI_MODEL,
  enrichInternationalNewsWithCloudflare,
  setWorkersAIBinding,
} from "../../lib/ai/cloudflare";

test("Cloudflare AI enriches international news with validated Vietnamese output", async () => {
  setWorkersAIBinding({
    async run(model, input) {
      assert.equal(model, DEFAULT_CLOUDFLARE_AI_MODEL);
      assert.equal(input.response_format, undefined);
      assert.match(input.messages[0].content, /JSON Schema/);
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
