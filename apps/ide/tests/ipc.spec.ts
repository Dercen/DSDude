// C5 end to end: renderer -> sandboxed preload bridge -> main sender check + zod -> handler, in the built app.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { appDir, buildApp, launchApp, skipElectron } from "./electron.ts";

test.skip(skipElectron, "DSDUDE_SKIP_ELECTRON=1: no Electron binary");

test("IPC round trips through the preload with validation on both ends", async () => {
  buildApp();
  const launched = await launchApp();
  try {
    const page = await launched.app.firstWindow();
    await page.waitForFunction(() => typeof window.dsdude?.invoke === "function");

    const all = await page.evaluate(() => window.dsdude.invoke("settings.getAll", {}));
    expect(all.settings).toMatchObject({ emulator: "melonds", firstRunDone: true });

    await page.evaluate(() => window.dsdude.invoke("settings.set", { key: "emulator", value: "desmume" }));
    const file = join(launched.home, "userData", "settings.json");
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, "utf8")).emulator).toBe("desmume");

    const flappy = resolve(appDir, "../../samples/flappy");
    const opened = await page.evaluate((dir) => window.dsdude.invoke("project.open", { dir }), flappy);
    expect(opened.project?.objects.length).toBeGreaterThan(0);

    const errors = await page.evaluate(async () => {
      const grab = (p: Promise<unknown>) =>
        p.then(
          () => "resolved",
          (e: Error) => e.message,
        );
      return {
        badRequest: await grab(window.dsdude.invoke("settings.set", { key: "emulator", value: "mame" } as never)),
        unknown: await grab(window.dsdude.invoke("shell.exec" as never, {} as never)),
        notYet: await grab(window.dsdude.invoke("toolchain.install", {})),
      };
    });
    expect(errors.badRequest).toContain("[bad-request]");
    expect(errors.unknown).toContain("unknown IPC channel");
    expect(errors.notYet).toContain("[not-implemented]");
  } finally {
    await launched.close();
  }
});
