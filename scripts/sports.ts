import { getSportsAdapterDescriptors } from "../lib/sports-data/adapters";
import { sportsCoverage, syncSports, type SportsSyncCommand } from "../lib/sports-data/sync";
import type { SportsProviderName } from "../lib/sports-data/models";

try { process.loadEnvFile?.(".env.local"); } catch { /* Environment may already be supplied by the host. */ }

const command = process.argv[2] ?? "providers";
const providerFlag = process.argv.find((value) => value.startsWith("--provider="))?.split("=")[1] as SportsProviderName | undefined;
const competitions = process.argv.find((value) => value.startsWith("--competitions="))?.split("=")[1]?.split(",").filter(Boolean);
const date = process.argv.find((value) => value.startsWith("--date="))?.split("=")[1];
const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (command === "providers") {
    console.log(JSON.stringify({ providers: getSportsAdapterDescriptors() }, null, 2));
    return;
  }
  if (command === "coverage") { console.log(JSON.stringify(await sportsCoverage(), null, 2)); return; }
  const aliases: Record<string, SportsSyncCommand> = { competitions: "competitions", teams: "teams", fixtures: "fixtures", results: "results", matches: "matches", daily: "daily", standings: "standings", live: "live", details: "details", transfers: "transfers" };
  const syncCommand = aliases[command];
  if (!syncCommand) throw new Error(`Lệnh không hợp lệ: ${command}`);
  const result = await syncSports(syncCommand, { provider: providerFlag, competitionIds: competitions, date, dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length) process.exitCode = 2;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Sports command failed"); process.exitCode = 1; });
