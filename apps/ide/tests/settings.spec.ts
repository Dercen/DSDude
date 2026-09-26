// Settings > Controls (ADR-0007): rebinding a DS button changes the Controls line of the next launch.
import { expect, test } from "@playwright/test";
import { buildApp, copyFlappy, launchApp, openProject, skipElectron } from "./electron.ts";

test.skip(skipElectron, "DSDUDE_SKIP_ELECTRON=1: no Electron binary");

test("rebinding A to K shows on the Controls line of the next Play", async () => {
  buildApp();
  const launched = await launchApp();
  try {
    const page = await launched.app.firstWindow();
    await openProject(launched.app, page, copyFlappy(launched.home));
    await page.getByTestId("help-menu").click();
    await page.getByTestId("help-settings").click();
    const dialog = page.getByTestId("settings");
    await expect(page.getByTestId("key:a")).toHaveText("X");
    await page.getByTestId("rebind:a").click();
    await expect(page.getByTestId("key:a")).toHaveText("Press a key…");
    await page.keyboard.press("F2");
    await expect(dialog).toContainText("can't be used");
    await page.keyboard.press("k");
    await expect(page.getByTestId("key:a")).toHaveText("K");
    // Two buttons on one key: a warning, still allowed.
    await page.getByTestId("rebind:b").click();
    await page.keyboard.press("k");
    await expect(page.getByTestId("settings-shared")).toContainText("K is used by A and B");
    await page.screenshot({ path: test.info().outputPath("settings.png") });
    await page.getByTestId("rebind:b").click();
    await page.keyboard.press("z");
    await page.getByTestId("settings-close").click();

    await page.getByTestId("play").click();
    await expect(page.getByTestId("output")).toContainText("K = A, Z = B");
    await expect(page.getByTestId("controls-card")).toContainText("K");
  } finally {
    await launched.close();
  }
});
