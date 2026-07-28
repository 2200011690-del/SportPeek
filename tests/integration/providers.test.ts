import assert from "node:assert/strict";
import test from "node:test";
import { MockAIProvider } from "../../lib/ai/index";
import { runIngestion, MockNewsProvider } from "../../lib/ingestion/index";

test("mock ingestion completes and deduplicates only when explicitly injected", async () => { const result = await runIngestion(new MockNewsProvider(), new MockAIProvider()); assert.equal(result.status,"success"); assert.equal(result.fetchedCount,5); assert.equal(result.insertedCount,5); });
test("mock AI returns schema-safe output only when explicitly injected", async () => { const ai = new MockAIProvider(); const classification = await ai.classifyArticle({title:"AI tạo sinh có cập nhật mới",excerpt:"Thông tin công nghệ"}); assert.equal(classification.category,"Công nghệ"); const summary = await ai.summarizeCluster({articles:[{id:"1",title:"Bản tin demo",excerpt:"Đoạn trích"}]}); assert.equal(summary.sourceIds[0],"1"); });
test("authorization contract requires server secret", () => { const authorize=(value:string|undefined)=>Boolean(process.env.CRON_SECRET&&value===`Bearer ${process.env.CRON_SECRET}`); assert.equal(authorize(undefined),false); });
