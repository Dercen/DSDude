// The room editor in the built app: 60 fps (55+ measured) while panning a 1024x512 room with 200 instances at 4x
// zoom, rendered by PixiJS on the GPU. The browser test only reports this number (headless Chromium may render
// WebGL in software); this test enforces it.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp, copyFlappy, launchApp, openProject, skipElectron } from "./electron.ts";

test.skip(skipElectron, "DSDUDE_SKIP_ELECTRON=1: no Electron binary");

test("room editor pans a 1024x512 room with 200 instances at 4x zoom at 60 fps", async () => {
  buildApp();
  const launched = await launchApp();
  try {
    const page = await launched.app.firstWindow();
    const dir = copyFlappy(launched.home);
    const file = join(dir, "rooms/rm_game/room.json");
    const room = JSON.parse(readFileSync(file, "utf8"));
    room.width = 1024;
    room.height = 512;
    room.instances = Array.from({ length: 200 }, (_, i) => ({
      object: i % 2 ? "obj_pipe" : "obj_bird",
      x: (i * 37) % 1024,
      y: (i * 53) % 512,
      ...(i % 3 === 0 ? { screen: "bottom" } : {}),
    }));
    writeFileSync(file, `${JSON.stringify(room, null, 2)}\n`);
    await openProject(launched.app, page, dir);

    await page.getByTestId("tree:room:rm_game").click();
    await expect(page.getByTestId("room-editor:rm_game")).toBeVisible();
    const canvas = page.getByTestId("room-canvas");
    await expect(canvas).toBeVisible();
    await page.getByTestId("room-zoom-in").click(); // 2x -> 4x
    await expect(page.getByTestId("room-editor:rm_game")).toContainText("4x");

    // Pan every animation frame for ~2.2 s; data-fps holds the frames rendered in the last whole second.
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          const el = document.querySelector("[data-testid=room-canvas]") as HTMLCanvasElement;
          const t0 = performance.now();
          const step = () => {
            el.dispatchEvent(new WheelEvent("wheel", { deltaX: 3, deltaY: 1, bubbles: true, cancelable: true }));
            if (performance.now() - t0 < 2200) requestAnimationFrame(step);
            else done();
          };
          requestAnimationFrame(step);
        }),
    );
    const fps = Number(await page.getByTestId("room-canvas-box").getAttribute("data-fps"));
    console.info(`room editor (Electron): ${fps} fps`);
    await page.screenshot({ path: test.info().outputPath("room-editor.png") });
    expect(fps).toBeGreaterThanOrEqual(55);
    expect(launched.stdout.filter((l) => /renderer\|error\|/.test(l))).toEqual([]);
  } finally {
    await launched.close();
  }
});
