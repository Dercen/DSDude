import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createLocalBridge } from "@dsdude/ipc-contract";
import { projectBuildDir } from "@dsdude/toolchain";
import { afterEach, describe, expect, it } from "vitest";
import { createBuildHandlers, createCoreHandlers, type DialogLike } from "./handlers.ts";
import { SettingsStore } from "./settings.ts";

const repo = resolve(import.meta.dirname, "../../../..");
const flappy = resolve(repo, "samples/flappy");
const dirs: string[] = [];
function temp(): string {
  const d = mkdtempSync(join(tmpdir(), "dsdude-handlers-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(dialogResult = { canceled: false, filePaths: ["C:/picked"] }) {
  const calls: unknown[] = [];
  const dialog: DialogLike = {
    showOpenDialog: async (o) => {
      calls.push(o);
      return dialogResult;
    },
  };
  const settings = new SettingsStore(join(temp(), "settings.json"));
  return { ...createLocalBridge(createCoreHandlers({ settings, dialog, learnRoot: repo })), calls };
}

describe("build.manifest", () => {
  it("reads the project's C3 manifest from its build folder, or null", async () => {
    const home = temp();
    const projectDir = join(temp(), "flappy");
    const { bridge } = createLocalBridge(createBuildHandlers({} as never, {} as never, home));
    await expect(bridge.invoke("build.manifest", { projectDir })).resolves.toEqual({ manifest: null });
    const buildDir = projectBuildDir(projectDir, home);
    mkdirSync(buildDir, { recursive: true });
    const manifest = { contract: "C3", rooms: { rm_game: { top: { obj16Palettes: 2 }, soundRamBytes: 100 } } };
    writeFileSync(join(buildDir, "assets.manifest.json"), JSON.stringify(manifest));
    await expect(bridge.invoke("build.manifest", { projectDir })).resolves.toEqual({ manifest });
    writeFileSync(join(buildDir, "assets.manifest.json"), "{ not json");
    await expect(bridge.invoke("build.manifest", { projectDir })).resolves.toEqual({ manifest: null });
  });
});

describe("learn.openAssets", () => {
  it("opens docs/tutorial/assets under the learn root, or says it is missing", async () => {
    const root = temp();
    const opened: string[] = [];
    const shell = {
      openPath: async (p: string) => {
        opened.push(p);
        return "";
      },
    };
    const settings = new SettingsStore(join(root, "settings.json"));
    const dialog: DialogLike = { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) };
    const { bridge } = createLocalBridge(createCoreHandlers({ settings, dialog, shell, learnRoot: root }));
    await expect(bridge.invoke("learn.openAssets", {})).rejects.toThrow("not installed");
    mkdirSync(join(root, "docs", "tutorial", "assets"), { recursive: true });
    const { path } = await bridge.invoke("learn.openAssets", {});
    expect(opened).toEqual([path]);
    expect(path).toBe(join(root, "docs", "tutorial", "assets"));
  });
});

describe("core handlers over the C5 validation path", () => {
  it("opens samples/flappy, edits an event and saves it back through project-format", async () => {
    const dir = join(temp(), "flappy");
    cpSync(flappy, dir, { recursive: true });
    const { bridge } = setup();
    const opened = await bridge.invoke("project.open", { dir });
    expect(opened.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const project = opened.project;
    if (!project) throw new Error("flappy did not load");
    expect(project.project.name).toBeTruthy();
    const obj = project.objects[0];
    if (!obj) throw new Error("flappy has no objects");
    const [stem] = Object.keys(obj.events);
    if (!stem) throw new Error("no events");
    obj.events[stem] = `${obj.events[stem]}// edited\n`;
    await expect(bridge.invoke("project.save", { dir, project })).resolves.toEqual({ ok: true });
    expect(readFileSync(join(dir, "objects", obj.name, `${stem}.dss`), "utf8")).toMatch(/\/\/ edited\n$/);
  });

  it("reads and writes settings", async () => {
    const { bridge } = setup();
    await bridge.invoke("settings.set", { key: "firstRunDone", value: true });
    await expect(bridge.invoke("settings.get", { key: "firstRunDone" })).resolves.toEqual({ value: true });
    const { settings } = await bridge.invoke("settings.getAll", {});
    expect(settings.firstRunDone).toBe(true);
    await expect(bridge.invoke("settings.set", { key: "emulator", value: "mame" as never })).rejects.toThrow(
      "[bad-request]",
    );
  });

  it("maps dialog.open to showOpenDialog and a cancel to no paths", async () => {
    const a = setup();
    await expect(a.bridge.invoke("dialog.open", { kind: "directory", title: "Open project" })).resolves.toEqual({
      paths: ["C:/picked"],
    });
    expect(a.calls[0]).toMatchObject({ properties: ["openDirectory", "createDirectory"], filters: undefined });
    const b = setup({ canceled: true, filePaths: [] });
    await expect(b.bridge.invoke("dialog.open", { kind: "file" })).resolves.toEqual({ paths: [] });
  });
});
