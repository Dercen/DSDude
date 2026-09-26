// New Project in the built app: the wizard lists templates (the repo's samples until WS7's templates/index.json),
// warns under OneDrive, creates the project and opens it.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp, launchApp, skipElectron } from "./electron.ts";

test.skip(skipElectron, "DSDUDE_SKIP_ELECTRON=1: no Electron binary");

test("New Project creates a project from a template and opens it", async () => {
  buildApp();
  const launched = await launchApp({ OneDrive: "C:\\FakeOneDrive" });
  try {
    const page = await launched.app.firstWindow();
    await page.getByTestId("new").click();
    const dialog = page.getByTestId("new-project");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("np-template:empty")).toBeVisible();

    await page.getByTestId("np-folder").fill("C:\\FakeOneDrive\\Games");
    await expect(page.getByTestId("np-onedrive")).toBeVisible();

    await page.getByTestId("np-folder").fill(launched.home);
    await expect(page.getByTestId("np-onedrive")).toBeHidden();
    await page.getByTestId("np-name").fill("bad name");
    await expect(page.getByTestId("np-create")).toBeDisabled();
    await page.getByTestId("np-name").fill("bird_game");
    await page.getByTestId("np-template:sample-flappy").check();
    await page.screenshot({ path: test.info().outputPath("new-project.png") });
    await page.getByTestId("np-create").click();

    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("project-tree")).toContainText("bird_game");
    await expect(page.getByTestId("tree:object:obj_bird")).toBeVisible();
    expect(existsSync(join(launched.home, "bird_game", "project.json"))).toBe(true);

    // Creating it again refuses the folder that now exists.
    await page.getByTestId("new").click();
    await page.getByTestId("np-folder").fill(launched.home);
    await page.getByTestId("np-name").fill("bird_game");
    await page.getByTestId("np-create").click();
    await expect(page.getByTestId("np-error")).toContainText("not empty");
  } finally {
    await launched.close();
  }
});
