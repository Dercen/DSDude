import { defineProject } from "vitest/config";

// Node unit tests only. Browser tests (*.browser.test.*: the mock host, WS6b's editor views) run from
// vitest.browser.config.ts in headless Chromium; tests/*.spec.ts is the Playwright `_electron` suite.
export default defineProject({
  test: { name: "ide", include: ["src/**/*.test.{ts,tsx}"], exclude: ["src/**/*.browser.test.{ts,tsx}"] },
});
