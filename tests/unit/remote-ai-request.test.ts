import assert from "node:assert/strict";
import test from "node:test";
import { GeminiAIProvider } from "../../lib/ai/gemini";
import { GroqAIProvider } from "../../lib/ai/groq";

const classification = {
  category: "Công nghệ",
  topics: ["trí tuệ nhân tạo"],
  people: [],
  organizations: ["OpenAI"],
  locations: ["San Francisco"],
  countries: ["Hoa Kỳ"],
  articleType: "news",
  language: "vi",
};

test("Gemini requests schema-constrained JSON with enough output capacity", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  let body: Record<string, unknown> | undefined;
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const json = JSON.stringify(classification);
    return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: json.slice(0, 40) }, { text: json.slice(40) }] } }] });
  }) as typeof fetch;

  try {
    const result = await new GeminiAIProvider().classifyArticle({ title: "OpenAI công bố sản phẩm mới", excerpt: "Thông báo được đưa ra tại San Francisco." });
    assert.equal(result.organizations[0], "OpenAI");
    const config = body?.generationConfig as Record<string, unknown>;
    assert.equal(config.responseMimeType, "application/json");
    assert.ok(config.responseJsonSchema);
    assert.equal(config.maxOutputTokens, 2600);
    assert.equal(config.temperature, 0.1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("Gemini reports a token-limited response before parsing truncated JSON", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = (async () => Response.json({
    candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"category":"Công nghệ"' }] } }],
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => new GeminiAIProvider().classifyArticle({ title: "Tin công nghệ", excerpt: "Một sản phẩm mới được công bố." }),
      /chạm giới hạn độ dài đầu ra/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("Groq uses strict JSON Schema and current completion-token field", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GROQ_API_KEY;
  let body: Record<string, unknown> | undefined;
  process.env.GROQ_API_KEY = "test-key";
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(classification) } }] });
  }) as typeof fetch;

  try {
    const result = await new GroqAIProvider().classifyArticle({ title: "OpenAI công bố sản phẩm mới", excerpt: "Thông báo được đưa ra tại San Francisco." });
    assert.equal(result.category, "Công nghệ");
    const responseFormat = body?.response_format as { type?: string; json_schema?: Record<string, unknown> };
    assert.equal(responseFormat.type, "json_schema");
    assert.equal(responseFormat.json_schema?.strict, true);
    assert.equal(responseFormat.json_schema?.name, "newspeek_structured_output");
    assert.ok(responseFormat.json_schema?.schema);
    assert.equal(body?.max_tokens, undefined);
    assert.equal(body?.max_completion_tokens, 2600);
    assert.equal(body?.reasoning_effort, "low");
    assert.equal(body?.temperature, 0.1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
  }
});

test("Groq reports a length-limited response before parsing truncated JSON", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = "test-key";
  globalThis.fetch = (async () => Response.json({
    choices: [{ finish_reason: "length", message: { content: '{"category":"Công nghệ"' } }],
  })) as typeof fetch;

  try {
    await assert.rejects(
      () => new GroqAIProvider().classifyArticle({ title: "Tin công nghệ", excerpt: "Một sản phẩm mới được công bố." }),
      /chạm giới hạn độ dài đầu ra/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousKey;
  }
});
