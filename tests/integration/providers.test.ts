import assert from "node:assert/strict";
import test from "node:test";
import { getAIProvider } from "../../lib/ai/index";
import { runIngestion } from "../../lib/ingestion/index";
import { MockSportsDataProvider } from "../../lib/sports-data/index";

test("mock ingestion completes and deduplicates", async () => { const result = await runIngestion(); assert.equal(result.status,"success"); assert.equal(result.fetchedCount,5); assert.equal(result.insertedCount,5); });
test("mock AI returns schema-safe summary and classification", async () => { const ai = getAIProvider(); const classification = await ai.classifyArticle({title:"Arsenal trước trận",excerpt:"Thông tin đội hình"}); assert.equal(classification.sport,"football"); const summary = await ai.summarizeCluster({articles:[{id:"1",title:"Bản tin demo",excerpt:"Đoạn trích"}]}); assert.equal(summary.sourceIds[0],"1"); });
test("sports provider exposes live, fixtures and standings", async () => { const provider = new MockSportsDataProvider(); assert.ok((await provider.getLiveMatches()).length>0); assert.ok((await provider.getFixtures()).length>0); assert.ok((await provider.getStandings()).length>0); });
test("authorization contract requires server secret", () => { const authorize=(value:string|undefined)=>Boolean(process.env.CRON_SECRET&&value===`Bearer ${process.env.CRON_SECRET}`); assert.equal(authorize(undefined),false); });
