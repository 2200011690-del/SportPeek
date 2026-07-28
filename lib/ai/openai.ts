type NewsInput = { id: string; title: string; excerpt: string };
export type NewsEnrichment = { id: string; titleVi: string; summaryVi: string; keyPoints: string[]; topic: string; importance: number };

type ResponsesPayload = { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };

function outputText(payload: ResponsesPayload): string {
  if (payload.output_text) return payload.output_text;
  return payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
}

export async function enrichInternationalNews(articles: NewsInput[]): Promise<NewsEnrichment[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !articles.length) return [];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    signal: AbortSignal.timeout(35_000),
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.4-nano",
      input: [
        { role: "system", content: "Bạn là biên tập viên tin tức trung lập của NewsPeek. Chỉ dùng dữ kiện có trong metadata được cung cấp. Dịch tự nhiên sang tiếng Việt, giữ nguyên tên riêng, không giật tít quá mức, không suy đoán và không sao chép dài. Trả đúng JSON schema." },
        { role: "user", content: JSON.stringify(articles) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "newspeek_news_enrichment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["items"],
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "titleVi", "summaryVi", "keyPoints", "topic", "importance"],
                  properties: {
                    id: { type: "string" },
                    titleVi: { type: "string" },
                    summaryVi: { type: "string" },
                    keyPoints: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
                    topic: { type: "string" },
                    importance: { type: "integer", minimum: 0, maximum: 100 },
                  },
                },
              },
            },
          },
        },
      },
      max_output_tokens: 8000,
    }),
  });
  if (!response.ok) throw new Error(`OpenAI: HTTP ${response.status}`);
  const payload = await response.json() as ResponsesPayload;
  const parsed = JSON.parse(outputText(payload)) as { items?: NewsEnrichment[] };
  const allowed = new Set(articles.map((article) => article.id));
  return (parsed.items ?? []).filter((item) => allowed.has(item.id) && item.titleVi && item.summaryVi);
}
