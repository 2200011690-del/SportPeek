import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "browser.spec.ts",
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL:
      process.env.E2E_BASE_URL
      ?? "https://newspeek.2200011690.workers.dev",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
