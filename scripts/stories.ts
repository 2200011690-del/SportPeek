import { processStories, storyProcessingReport, summarizePersistedStories } from "../lib/stories/processor";

try { process.loadEnvFile?.(".env.local"); } catch { /* Host may inject environment variables. */ }
const command = process.argv[2] ?? "report"; const dryRun = process.argv.includes("--dry-run") || (command === "recluster" && !process.argv.includes("--apply")); const limit = Number(process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1] ?? "1000");
async function main() {
  if (command === "report") { console.log(JSON.stringify(await storyProcessingReport(), null, 2)); return; }
  if (command === "summarize") { console.log(JSON.stringify(await summarizePersistedStories({ dryRun, limit }), null, 2)); return; }
  const result = await processStories({ dryRun, includeFailed: command === "retry-failed", recluster: command === "recluster", useAi: process.argv.includes("--ai"), limit }); console.log(JSON.stringify(result, null, 2)); if (result.errors.length) process.exitCode = 2;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Stories command failed"); process.exitCode = 1; });
