// Learn panel host in the built app (task 4): opens on first launch, renders repo markdown under the real CSP,
// and is the target of Problems code links and F1.
import { expect, test } from "@playwright/test";
import { buildApp, copyFlappy, launchApp, openProject, skipElectron } from "./electron.ts";

test.skip(skipElectron, "DSDUDE_SKIP_ELECTRON=1: no Electron binary");

test("Learn opens on first launch and renders a manual page", async () => {
  buildApp();
  const launched = await launchApp();
  try {
    const page = await launched.app.firstWindow();
    const learn = page.getByTestId("learn");
    await expect(learn).toBeVisible();
    await learn.getByTestId("learn-doc:docs/manual/runtime-build.md").click();
    await expect(learn.getByTestId("learn-doc").locator("h1")).toBeVisible();
    await expect(learn.locator(".learn-copy").first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("learn.png") });
    expect(launched.stdout.filter((l) => /renderer\|error\||Refused to|Content Security Policy/.test(l))).toEqual([]);
  } finally {
    await launched.close();
  }
});

test("Problems code links and F1 open the reference in Learn", async () => {
  buildApp();
  const diag = {
    severity: "error",
    code: "E101",
    message: "A ')' is missing.",
    hint: null,
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
    await page.getByTestId("problem-code").click();
    // WS7's docs/reference/errors.md does not exist yet: the panel says which page it tried.
    const learn = page.getByTestId("learn");
    await expect(learn).toContainText("docs/reference/errors.md");

    await page.getByTestId("problem").click();
    const editor = page.getByTestId("code:objects/obj_bird/step.dss");
    await editor.locator(".view-lines").click();
    // Line 2 is "if (!alive) exit;": put the cursor inside "alive".
    await page.keyboard.press("Control+Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("F1");
    await expect(learn).toContainText("docs/reference/functions.md");
    // The toolbar button (outside Monaco) opens the contents.
    await page.getByTestId("learn-button").click();
    await expect(learn).toContainText("Start with the tutorial");
  } finally {
    await launched.close();
  }
});
