// Task 3 in the built app, against MockBuildService (the default mode until CP-B): open samples/flappy, edit and
// save an event, Play shows the fake log and the Controls line in Output, Stop ends it; a failing build lands in
// Problems with the toast, and a Problems click opens the file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp, copyFlappy, launchApp, openProject, skipElectron } from "./electron.ts";

test.skip(skipElectron, "DSDUDE_SKIP_ELECTRON=1: no Electron binary");

test("open, edit, save, Play and Stop against the mock", async () => {
  buildApp();
  const launched = await launchApp();
  try {
    const page = await launched.app.firstWindow();
    const dir = copyFlappy(launched.home);
    await openProject(launched.app, page, dir);

    await page.getByTestId("tree:object:obj_bird").click();
    await page.getByTestId("tree:objects/obj_bird/step.dss").click();
    const editor = page.getByTestId("code:objects/obj_bird/step.dss");
    await editor.locator(".view-lines").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("// edited in the IDE");
    await expect(page.getByTestId("tree:objects/obj_bird/step.dss")).toContainText("●");
    await page.keyboard.press("Control+S");
    await expect(page.getByTestId("tree:objects/obj_bird/step.dss")).not.toContainText("●");
    expect(readFileSync(join(dir, "objects/obj_bird/step.dss"), "utf8")).toContain("// edited in the IDE");

    await page.getByTestId("play").click();
    const output = page.getByTestId("output");
    await expect(output).toContainText("Controls: Arrows = D-pad, X = A");
    await expect(output).toContainText("Game started (runtime 0.1.0)");
    await expect(output).toContainText("hello");
    await expect(output).not.toContainText("DSD|PAD|");
    await expect(page.getByTestId("status")).toContainText("Game running");
    // The Controls card appears on the first Play of the session.
    const card = page.getByTestId("controls-card");
    await expect(card).toContainText("Arrows");
    await expect(card).toContainText("Touch the bottom screen");
    await page.screenshot({ path: test.info().outputPath("controls-card.png") });
    await page.getByTestId("controls-ok").click();
    await expect(card).toBeHidden();
    await page.screenshot({ path: test.info().outputPath("play-running.png") });

    await page.getByTestId("stop").click();
    await expect(output).toContainText("Game ended (exit code 0)");
    await expect(page.getByTestId("play")).toBeVisible();
    // Help > Controls shows the card again; Escape closes it.
    await page.getByTestId("help-menu").click();
    await page.getByTestId("help-controls").click();
    await expect(card).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
    expect(launched.stdout.filter((l) => /renderer\|error\|/.test(l))).toEqual([]);
  } finally {
    await launched.close();
  }
});

test("a failing build shows the toast, fills Problems and a click opens the line", async () => {
  buildApp();
  const diag = {
    severity: "error",
    code: "E101",
    message: "A ')' is missing.",
    hint: "Add ')' before the end of the line.",
    file: "objects/obj_bird/step.dss",
    line: 2,
    col: 3,
    endLine: null,
    endCol: null,
    source: "compiler",
  };
  const launched = await launchApp({ DSDUDE_MOCK_DIAGNOSTICS: JSON.stringify([diag]) });
  try {
    const page = await launched.app.firstWindow();
    await openProject(launched.app, page, copyFlappy(launched.home));
    await page.getByTestId("play").click();
    await expect(page.getByTestId("toast")).toContainText("Fix 1 problem to play");
    const problem = page.getByTestId("problem");
    await expect(problem).toHaveCount(1);
    await expect(problem).toContainText("A ')' is missing.");
    await expect(problem).toContainText("objects/obj_bird/step.dss:2");
    await problem.click();
    const editor = page.getByTestId("code:objects/obj_bird/step.dss");
    await expect(editor).toBeVisible();
    // The error is a Monaco marker (squiggle) in that file.
    await expect(editor.locator(".squiggly-error")).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath("play-failed.png") });
  } finally {
    await launched.close();
  }
});

test("fake-toolchain mode runs the real LocalBuildService in the utilityProcess worker", async () => {
  buildApp();
  const launched = await launchApp({ DSDUDE_FAKE_TOOLCHAIN: "1" });
  try {
    const page = await launched.app.firstWindow();
    await openProject(launched.app, page, copyFlappy(launched.home));
    await page.getByTestId("play").click();
    // No compiler is wired yet (WS4/WS5 land later), so LocalBuildService reports E641 from the worker.
    await expect(page.getByTestId("toast")).toContainText("Fix 1 problem to play");
    await expect(page.getByTestId("problem")).toContainText("E641");
  } finally {
    await launched.close();
  }
});
