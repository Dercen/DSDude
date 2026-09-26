// The first-run wizard in the built app (fake-toolchain mode: canned doctor results, fake emulator install).
import { expect, test } from "@playwright/test";
import { buildApp, launchApp, skipElectron } from "./electron.ts";

test.skip(skipElectron, "DSDUDE_SKIP_ELECTRON=1: no Electron binary");

test("the first-run wizard checks the computer, sets up melonDS and finishes once", async () => {
  buildApp();
  const launched = await launchApp({ DSDUDE_FAKE_TOOLCHAIN: "1" }, { firstRun: true });
  try {
    const page = await launched.app.firstWindow();
    const wizard = page.getByTestId("first-run");
    await expect(wizard).toBeVisible();
    await expect(page.getByTestId("fr-checks")).toContainText("Build service");
    await page.getByTestId("fr-melonds").click();
    await expect(page.getByTestId("fr-melonds-done")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("first-run.png") });
    await expect(page.getByTestId("fr-done")).toHaveText("Start making games");
    await page.getByTestId("fr-done").click();
    await expect(wizard).toBeHidden();
    // Learn opens on the first launch too (behind the wizard).
    await expect(page.getByTestId("learn")).toBeVisible();
  } finally {
    await launched.close();
  }
});
