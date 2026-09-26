// Spike 13 (PLAN.md 7.1): Monaco 0.57 through its 0.56+ entry points under sandbox: true + CSP, dockview-react,
// in the built app launched with `_electron.launch`. Results go to docs/status/ws6.md.
import { expect, test } from "@playwright/test";
import { buildApp, type LaunchedApp, launchApp, skipElectron } from "./electron.ts";

test.skip(skipElectron, "DSDUDE_SKIP_ELECTRON=1: no Electron binary");

for (const mode of ["app", "file"] as const) {
  test(`Monaco + dockview mount in the sandboxed window (${mode}://)`, async () => {
    const testInfo = test.info();
    buildApp();
    const launched: LaunchedApp = await launchApp(mode === "file" ? { DSDUDE_RENDERER_FILE: "1" } : {});
    try {
      const page = await launched.app.firstWindow();
      expect(page.url()).toMatch(mode === "app" ? /^app:\/\/ide\/index\.html$/ : /^file:\/\/.*index\.html$/);

      await expect(page.locator(".dv-dockview")).toBeVisible();
      await expect(page.locator(".monaco-editor")).toBeVisible();

      // The renderer has no Node: only the preload's bridge.
      const probe = await page.evaluate(() => ({
        require: typeof (globalThis as { require?: unknown }).require,
        process: typeof (globalThis as { process?: unknown }).process,
        bridge: Object.keys(window.dsdude ?? {}).sort(),
      }));
      expect(probe).toEqual({ require: "undefined", process: "undefined", bridge: ["invoke", "on"] });

      // Word-based suggestions run in the editor worker: typing + Ctrl+Space forces a dedicated worker.
      await page.locator(".monaco-editor .view-lines").first().click();
      await page.keyboard.press("Control+End");
      await page.keyboard.type("xylophone xy");
      await expect(page.locator(".monaco-editor .view-lines")).toContainText("xylophone xy");
      await page.keyboard.press("Control+Space");
      await expect(page.locator(".monaco-editor .suggest-widget")).toBeVisible();
      await expect.poll(() => page.workers().length).toBeGreaterThan(0);
      await expect.poll(() => launched.stdout.some((l) => l.includes("monaco|worker|"))).toBe(true);

      await page.screenshot({ path: testInfo.outputPath(`spike13-${mode}.png`) });
      const bad = launched.stdout.filter((l) =>
        /Could not create web worker|getWorker|Refused to|Content Security Policy|renderer\|error\|/.test(l),
      );
      expect(bad).toEqual([]);
    } finally {
      await launched.close();
    }
  });
}
