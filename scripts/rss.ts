import { ensureRssSources, rssReport, syncRss } from "../lib/rss/sync";

try { process.loadEnvFile?.(".env.local"); } catch { /* Host may inject environment variables. */ }
const command = process.argv[2] ?? "report"; const source = process.argv.find((value) => value.startsWith("--source="))?.split("=")[1]; const force = process.argv.includes("--force"); const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (command === "test") { const sources = await ensureRssSources(); console.log(JSON.stringify({ configured: sources.length, active: sources.filter((item) => item.active).length, sources: sources.map((item) => ({ name: item.name, language: item.language, active: item.active })) }, null, 2)); return; }
  if (command === "report") { console.log(JSON.stringify(await rssReport(), null, 2)); return; }
  if (command === "sync" || command === "sync-source") { const result = await syncRss({ source, force, dryRun }); console.log(JSON.stringify(result, null, 2)); if (result.failed) process.exitCode = 2; return; }
  throw new Error(`Lệnh RSS không hợp lệ: ${command}`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "RSS command failed"); process.exitCode = 1; });
