import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright drives the real UI end-to-end (no wallet, no signing — that needs a
 * browser-extension harness with a funded key, which is out of scope here; the
 * devnet signing pipeline is covered by the proof/verify scripts). It builds and
 * serves the app, then exercises every operator surface and asserts no console
 * errors — a regression net for the wiring the unit tests can't see.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : "line",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- -p 3000",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
