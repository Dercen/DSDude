import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createLocalBridge } from "@dsdude/ipc-contract";
import { loadProject } from "@dsdude/project-format/node";
import { afterEach, describe, expect, it } from "vitest";
import { createCoreHandlers, type DialogLike } from "./handlers.ts";
import { importAsset, oneFrameSprite } from "./imports.ts";
import { SettingsStore } from "./settings.ts";

const repo = resolve(import.meta.dirname, "../../../..");
const assets = join(repo, "fixtures/assets");
const dirs: string[] = [];
function flappyCopy(): string {
  const d = mkdtempSync(join(tmpdir(), "dsdude-import-"));
  dirs.push(d);
  cpSync(join(repo, "samples/flappy"), join(d, "flappy"), { recursive: true });
  return join(d, "flappy");
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("importAsset", () => {
  it("imports a sprite with the dialog's settings, a background and sounds, loadable by C1", async () => {
    const dir = flappyCopy();
    const sprite = { ...oneFrameSprite(16, 16), frames: 3, origin: { x: 8, y: 15 } };
    await importAsset({
      projectDir: dir,
      kind: "sprite",
      sourcePath: join(assets, "sprite16x16x3.png"),
      name: "spr_coin",
      sprite,
    });
    await importAsset({
      projectDir: dir,
      kind: "background",
      sourcePath: join(assets, "background256x192.png"),
      name: "bg_sky",
    });
    await importAsset({ projectDir: dir, kind: "sound", sourcePath: join(assets, "blip.wav"), name: "snd_blip" });
    await importAsset({ projectDir: dir, kind: "sound", sourcePath: join(assets, "tune.xm"), name: "snd_tune" });
    const { project, diagnostics } = await loadProject(dir);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(project?.sprites.find((s) => s.name === "spr_coin")).toMatchObject({ frames: 3, origin: { x: 8, y: 15 } });
    expect(project?.backgrounds.find((b) => b.name === "bg_sky")?.file).toBe("background.png");
    expect(project?.sounds.find((s) => s.name === "snd_blip")).toMatchObject({ kind: "effect", file: "blip.wav" });
    expect(project?.sounds.find((s) => s.name === "snd_tune")).toMatchObject({ kind: "music", file: "tune.xm" });
    expect(readFileSync(join(dir, "sprites/spr_coin/sheet.png"))).toEqual(
      readFileSync(join(assets, "sprite16x16x3.png")),
    );
  });

  it("refuses taken names, wrong file types and broken PNGs", async () => {
    const dir = flappyCopy();
    const png = join(assets, "sprite16x16x3.png");
    await expect(importAsset({ projectDir: dir, kind: "sprite", sourcePath: png, name: "obj_bird" })).rejects.toThrow(
      "already called obj_bird",
    );
    await expect(
      importAsset({ projectDir: dir, kind: "sprite", sourcePath: join(assets, "blip.wav"), name: "spr_x" }),
    ).rejects.toThrow("PNG");
    await expect(importAsset({ projectDir: dir, kind: "sound", sourcePath: png, name: "snd_x" })).rejects.toThrow(
      ".wav",
    );
    await expect(
      importAsset({ projectDir: dir, kind: "background", sourcePath: join(assets, "README.md"), name: "bg_x" }),
    ).rejects.toThrow();
    expect(existsSync(join(dir, "sprites/spr_x"))).toBe(false);
  });
});

describe("dialog.readPicked", () => {
  it("reads only files picked through dialog.open this session", async () => {
    const png = join(assets, "sprite16x16x3.png");
    const dialog: DialogLike = { showOpenDialog: async () => ({ canceled: false, filePaths: [png] }) };
    const settings = new SettingsStore(join(mkdtempSync(join(tmpdir(), "dsdude-pick-")), "s.json"));
    const { bridge } = createLocalBridge(createCoreHandlers({ settings, dialog, learnRoot: repo }));
    await expect(bridge.invoke("dialog.readPicked", { path: png })).rejects.toThrow("only a file you picked");
    await bridge.invoke("dialog.open", { kind: "file" });
    const { bytes } = await bridge.invoke("dialog.readPicked", { path: png });
    expect(Buffer.from(bytes)).toEqual(readFileSync(png));
    await expect(bridge.invoke("dialog.readPicked", { path: join(assets, "blip.wav") })).rejects.toThrow();
  });
});
