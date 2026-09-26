// The smoke test (docs/kickoff/ws6.md task 6, definition of done): a fresh profile in fake-toolchain mode, from the
// first-run wizard to a playing game and back, with no Windows tools, no emulator window and no network.
import { expect, test } from "@playwright/test";
import { buildApp, launchApp, skipElectron } from "./electron.ts";

test.skip(skipElectron, "DSDUDE_SKIP_ELECTRON=1: no Electron binary");

test("smoke: first run, New Project (Flappy), edit, Play, Stop", async () => {
  buildApp();
  const launched = await launchApp({ DSDUDE_FAKE_TOOLCHAIN: "1" }, { firstRun: true });
  try {
    const page = await launched.app.firstWindow();

    // First run: the checks pass and melonDS is set up.
    await expect(page.getByTestId("first-run")).toBeVisible();
    await page.getByTestId("fr-melonds").click();
    await expect(page.getByTestId("fr-melonds-done")).toBeVisible();
    await page.getByTestId("fr-done").click();

    // Learn opened on the first launch.
    await expect(page.getByTestId("learn")).toBeVisible();

    // New Project from the Flappy template (the repo sample until WS7's templates/).
    await page.getByTestId("new").click();
    await page.getByTestId("np-folder").fill(launched.home);
    await page.getByTestId("np-name").fill("smoke_bird");
    await page.getByTestId("np-template:sample-flappy").check();
    await page.getByTestId("np-create").click();
    await expect(page.getByTestId("project-tree")).toContainText("smoke_bird");

    // The object editor opens with the object; an edit is saved before Play.
    await page.getByTestId("tree:object:obj_bird").click();
    await expect(page.getByTestId("object-editor:obj_bird")).toBeVisible();
    await page.getByTestId("tree:objects/obj_bird/step.dss").click();
    const editor = page.getByTestId("code:objects/obj_bird/step.dss");
    await editor.locator(".view-lines").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("// smoke");

    // Play: compile (real), pack (fake), launch (fake emulator); the Controls card, then the game's lines.
    await page.getByTestId("play").click();
    await expect(page.getByTestId("controls-card")).toBeVisible();
    await page.getByTestId("controls-ok").click();
    const output = page.getByTestId("output");
    await expect(output).toContainText("Controls: Arrows = D-pad");
    await expect(output).toContainText("hello");
    await expect(page.getByTestId("status")).toContainText("Game running");
    await expect(page.getByTestId("meter:top")).toContainText("/128 sprites");
    await page.screenshot({ path: test.info().outputPath("smoke.png") });

    await page.getByTestId("stop").click();
    await expect(output).toContainText("Game ended (exit code 0)");
    await expect(page.getByTestId("play")).toBeVisible();
    expect(launched.stdout.filter((l) => /renderer\|error\||Refused to|Content Security Policy/.test(l))).toEqual([]);
  } finally {
    await launched.close();
  }
});
