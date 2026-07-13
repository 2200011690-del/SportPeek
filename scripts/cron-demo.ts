export {};
const url = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const secret = process.env.CRON_SECRET ?? "demo-secret-change-me";
const response = await fetch(`${url}/api/cron/ingest`, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: "{}" });
console.log(response.status, await response.text());
