// Browser tests in headless Chromium (@vitest/browser-playwright): the C12 mock host and the views mounted in it
// (WS6b's editors, WS7's Learn content). No Electron, so it runs with DSDUDE_SKIP_ELECTRON=1 in cloud sessions after
// `npx playwright install chromium`. Run: `npm run test:browser -w apps/ide` (part of `npm test -w apps/ide`).
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/** Vitest browser mode uses base+1 (CLAUDE.md: the dev server has the base, tests base+1..base+9). */
const port = Number(process.env.DSDUDE_PORT_BASE ?? 5160) + 1;

export default defineConfig({
  plugins: [react()],
  test: {
    name: "ide-browser",
    include: ["src/**/*.browser.test.{ts,tsx}"],
    testTimeout: 30_000,
    api: { port, strictPort: true },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      viewport: { width: 1280, height: 800 },
    },
  },
});
