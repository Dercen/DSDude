// Import dialogs in the built app: a picked PNG becomes a sprite with an edited frame count and origin, previewed as
// on the DS; a picked WAV becomes a sound effect. Electron's file dialog is stubbed in main.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { appDir, buildApp, copyFlappy, launchApp, openProject, skipElectron } from "./electron.ts";

test.skip(skipElectron, "DSDUDE_SKIP_ELECTRON=1: no Electron binary");

const assets = resolve(appDir, "../../fixtures/assets");

test("import a sprite and a sound through the dialogs", async () => {
  buildApp();
  const launched = await launchApp();
  try {
    const page = await launched.app.firstWindow();
    const dir = copyFlappy(launched.home);
    await openProject(launched.app, page, dir);

    const pick = (file: string) =>
      launched.app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog;
      }, file);

    // Sprite: 48x16 strip -> 3 frames of 16x16, origin moved to the bottom.
    await pick(join(assets, "sprite16x16x3.png"));
    await page.getByTestId("import:sprite").click();
    const dialog = page.getByTestId("import-dialog");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("import-name")).toHaveValue("spr_sprite16x16x3");
    await page.getByTestId("import-name").fill("spr_coin");
    await expect(page.getByTestId("import-frames")).toHaveValue("3");
    await expect(dialog).toContainText("3 frames of 16x16 pixels");
    await dialog.getByRole("button", { name: "Bottom" }).click();
    await expect(dialog).toContainText("(8, 15)");
    const preview = page.getByTestId("import-preview");
    await expect(preview).toHaveAttribute("width", /\d+/);
    await page.screenshot({ path: test.info().outputPath("import-sprite.png") });
    await page.getByTestId("import-ok").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("tree:sprite:spr_coin")).toBeVisible();
    const json = JSON.parse(readFileSync(join(dir, "sprites/spr_coin/sprite.json"), "utf8"));
    expect(json).toMatchObject({ frames: 3, frameWidth: 16, frameHeight: 16, origin: { x: 8, y: 15 } });

    // The new sprite opens in its property form (the fallback editor until a visual sprite editor lands).
    await page.getByTestId("tree:sprite:spr_coin").click();
    await expect(page.getByTestId("properties:sprite:spr_coin")).toBeVisible();
    await expect(page.getByTestId("pf-frames")).toHaveValue("3");
    await page.screenshot({ path: test.info().outputPath("properties.png") });

    // Sound: a WAV becomes an effect.
    await pick(join(assets, "blip.wav"));
    await page.getByTestId("import:sound").click();
    await expect(page.getByTestId("import-name")).toHaveValue("snd_blip");
    await expect(page.getByTestId("import-sound-kind")).toHaveValue("effect");
    await expect(page.getByTestId("import-play")).toBeVisible();
    await page.getByTestId("import-ok").click();
    await expect(page.getByTestId("tree:sound:snd_blip")).toBeVisible();
    expect(JSON.parse(readFileSync(join(dir, "sounds/snd_blip/sound.json"), "utf8"))).toEqual({
      kind: "effect",
      file: "blip.wav",
    });
    expect(launched.stdout.filter((l) => /renderer\|error\|/.test(l))).toEqual([]);
  } finally {
    await launched.close();
  }
});
