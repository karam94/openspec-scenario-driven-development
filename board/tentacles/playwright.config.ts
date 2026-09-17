import { defineConfig } from "@playwright/test";

// Drives the REAL compiled Electron app via _electron.launch (build/main/main.js).
// No browser projects — Electron brings its own Chromium. Serial (workers: 1):
// each test launches its own app instance and asserts against a real window, so
// parallel GUI instances buy nothing and risk contention. testDir is e2e/ only,
// so `npm test` (vitest, scoped to src/**) and this runner never overlap.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
});
