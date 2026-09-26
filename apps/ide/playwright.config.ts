// Playwright `_electron` suite (PLAN.md 2.5): tests/*.spec.ts build the app with electron-vite, then launch it.
// Skips itself when DSDUDE_SKIP_ELECTRON=1 (cloud clones have no Electron binary).
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
});
