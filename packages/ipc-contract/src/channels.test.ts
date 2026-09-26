import { resolve } from "node:path";
import type { Diagnostic } from "@dsdude/project-format";
import { loadProject } from "@dsdude/project-format/node";
import { describe, expect, it } from "vitest";
import {
  AssetPathSchema,
  EVENT_CHANNELS,
  type EventChannel,
  eventChannels,
  INVOKE_CHANNELS,
  type InvokeChannel,
  invokeChannels,
  isSafeRelativePath,
  LearnPathSchema,
  ProjectSchema,
  SettingsSchema,
  TemplateIndexSchema,
} from "./channels.ts";

const diag: Diagnostic = {
  severity: "error",
  code: "E290",
  message: "project.json is missing.",
  hint: null,
  file: "project.json",
  line: null,
  col: null,
  endLine: null,
  endCol: null,
  source: "project",
};
const buildResult = { ok: true, ndsPath: "C:/b/game.nds", diagnostics: [], timings: { compile: 12, pack: 40 } };
const preview = {
  palette: [0, 0xff0000],
  indices: new Uint8Array(64),
  colorCount: 2,
  colorMode: "16",
  frames: [{ offset: 0, paddedWidth: 8, paddedHeight: 8 }],
};
const project = {
  dir: "C:/p",
  project: { formatVersion: 0, name: "p", title: "P", firstRoom: "rm_a", rooms: ["rm_a"] },
  sprites: [],
  backgrounds: [],
  sounds: [],
  objects: [{ name: "obj_a", events: { step: "x += 1;\n" }, functions: null }],
  rooms: [{ name: "rm_a", width: 256, height: 192 }],
  scripts: [],
};

/** One valid request/response and one invalid request per invoke channel (every channel must appear). */
const INVOKE_SAMPLES: { [C in InvokeChannel]: { req: unknown; res: unknown; badReq: unknown } } = {
  "project.open": { req: { dir: "C:/p" }, res: { project, diagnostics: [diag] }, badReq: { dir: "" } },
  "project.save": { req: { dir: "C:/p", project }, res: { ok: true }, badReq: { dir: "C:/p", project: {} } },
  "project.create": {
    req: { dir: "C:/p", name: "my_game", template: "flappy" },
    res: { dir: "C:/p/my_game" },
    badReq: { dir: "C:/p", name: "my game" },
  },
  "project.templates": {
    req: {},
    res: { templates: [{ id: "empty", title: "Empty", description: "One room, nothing in it." }] },
    badReq: [],
  },
  "app.info": {
    req: {},
    res: {
      version: "0.1.0",
      packaged: false,
      defaultProjectsDir: "C:/Users/me/DSDudeProjects",
      oneDriveDirs: ["C:/Users/me/OneDrive"],
      supportedKeys: ["a", "Enter", "ArrowUp"],
    },
    badReq: 0,
  },
  "dialog.readPicked": { req: { path: "C:/art/bird.png" }, res: { bytes: new Uint8Array(8) }, badReq: { path: "" } },
  "assets.import": {
    req: {
      projectDir: "C:/p",
      kind: "sprite",
      sourcePath: "C:/x.png",
      name: "spr_x",
      sprite: {
        frames: 3,
        frameWidth: 16,
        frameHeight: 16,
        origin: { x: 8, y: 8 },
        bbox: { left: 0, top: 0, right: 15, bottom: 15 },
      },
    },
    res: { name: "spr_x", diagnostics: [] },
    badReq: { projectDir: "C:/p", kind: "tileset", sourcePath: "C:/x.png", name: "spr_x" },
  },
  "assets.preview": {
    req: {
      projectDir: "C:/p",
      sourcePath: "C:/x.png",
      options: { frameWidth: 16, frameHeight: 16, colorMode: "auto", transparent: "#ff00ff" },
    },
    res: preview,
    badReq: { projectDir: "C:/p", sprite: "spr_a", sourcePath: "C:/x.png" },
  },
  "build.play": {
    req: { projectDir: "C:/p", emulator: "melonds", skipCompile: true, debug: true },
    res: { ...buildResult, emulator: { kind: "melonds", pid: 1234 } },
    badReq: { projectDir: "C:/p", emulator: "no$gba" },
  },
  "build.build": { req: { projectDir: "C:/p", jobs: 4 }, res: buildResult, badReq: { projectDir: "C:/p", jobs: 0 } },
  "build.compileOnly": {
    req: { projectDir: "C:/p", seed: 7 },
    res: { ...buildResult, ndsPath: null },
    badReq: { projectDir: 1 },
  },
  "build.cancel": { req: {}, res: { ok: true }, badReq: null },
  "build.manifest": {
    req: { projectDir: "C:/p" },
    res: {
      manifest: {
        contract: "C3",
        sounds: { snd_flap: { id: 0, ramBytes: 8840 } },
        rooms: { rm_game: { top: { objVramBytes: 1152, obj16Palettes: 2 }, bottom: null, soundRamBytes: 26520 } },
      },
    },
    badReq: { projectDir: "" },
  },
  "emulator.stop": { req: {}, res: { ok: true }, badReq: "stop" },
  "emulator.status": { req: {}, res: { running: true, kind: "melonds", pid: 99 }, badReq: undefined },
  "emulator.install": { req: { kind: "desmume" }, res: { exe: "C:/e/DeSmuME.exe" }, badReq: { kind: "mame" } },
  "settings.get": { req: { key: "emulator" }, res: { value: "melonds" }, badReq: { key: "nope" } },
  "settings.set": {
    req: { key: "recentProjects", value: ["C:/p"] },
    res: { ok: true },
    badReq: { key: "emulator", value: "mame" },
  },
  "settings.getAll": { req: {}, res: { settings: SettingsSchema.parse({}) }, badReq: [] },
  "toolchain.status": {
    req: {},
    res: { installed: false, blocksdsVersion: null, diagnostics: [] },
    badReq: 3,
  },
  "toolchain.install": { req: {}, res: { installed: true, diagnostics: [] }, badReq: "x" },
  "doctor.run": {
    req: {},
    res: {
      checks: [
        { name: "BlocksDS", ok: true, detail: "1.24.0" },
        { name: "OneDrive", ok: true, detail: "The project is under OneDrive", status: "warn" },
      ],
    },
    badReq: false,
  },
  "project.readFile": {
    req: { dir: "C:/p", path: "sprites/spr_bird/sheet.png" },
    res: { bytes: new Uint8Array([137, 80, 78, 71]) },
    badReq: { dir: "C:/p", path: "../secrets/sheet.png" },
  },
  "project.writeFile": {
    req: { dir: "C:/p", path: "sprites/spr_bird/sheet.png", bytes: new Uint8Array(4) },
    res: { ok: true },
    badReq: { dir: "C:/p", path: "objects/obj_bird/step.dss", bytes: new Uint8Array(4) },
  },
  "learn.list": {
    req: {},
    res: { docs: [{ path: "docs/tutorial/flappy-bird.md", title: "Flappy Bird", section: "tutorial" }] },
    badReq: 1,
  },
  "learn.read": {
    req: { path: "docs/manual/sprites.md" },
    res: {
      path: "docs/manual/sprites.md",
      markdown: "# Sprites\n![bird](assets/bird.png)\n",
      images: { "assets/bird.png": "data:image/png;base64,iVBORw0KGgo=" },
    },
    badReq: { path: "C:/Windows/win.ini" },
  },
  "learn.openAssets": { req: {}, res: { path: "C:/DSDude/resources/docs/tutorial/assets" }, badReq: "open" },
  "dialog.open": {
    req: { kind: "file", filters: [{ name: "Images", extensions: ["png"] }] },
    res: { paths: [] },
    badReq: { kind: "file", filters: [{ name: "Bad", extensions: ["../x"] }] },
  },
};

const EVENT_SAMPLES: { [C in EventChannel]: { ok: unknown; bad: unknown } } = {
  "build.log": { ok: { lines: ["compiling"] }, bad: { lines: "compiling" } },
  "build.progress": { ok: { phase: "compile", progress: 0.5 }, bad: { phase: "linking", progress: 0.5 } },
  "build.diagnostics": { ok: { diagnostics: [diag] }, bad: { diagnostics: [{ code: "X1" }] } },
  "emulator.log": { ok: { lines: ["DSD|LOG|hello"] }, bad: {} },
  "emulator.exit": { ok: { code: null }, bad: { code: 0.5 } },
  "project.changed": { ok: { paths: ["objects/obj_bird/step.dss"] }, bad: { paths: [1] } },
};

describe("C5 channel map", () => {
  it("lists the PLAN.md 5.2 C5 channels plus the 0.2.0 and 0.4.0-0.10.0 additions", () => {
    expect(INVOKE_CHANNELS).toEqual([
      "project.open",
      "project.save",
      "project.create",
      "project.templates",
      "app.info",
      "assets.import",
      "assets.preview",
      "build.play",
      "build.build",
      "build.compileOnly",
      "build.cancel",
      "build.manifest",
      "emulator.stop",
      "emulator.status",
      "emulator.install",
      "settings.get",
      "settings.set",
      "settings.getAll",
      "toolchain.status",
      "toolchain.install",
      "doctor.run",
      "project.readFile",
      "project.writeFile",
      "learn.list",
      "learn.read",
      "learn.openAssets",
      "dialog.readPicked",
      "dialog.open",
    ]);
    expect(EVENT_CHANNELS).toEqual([
      "build.log",
      "build.progress",
      "build.diagnostics",
      "emulator.log",
      "emulator.exit",
      "project.changed",
    ]);
  });

  describe.each(INVOKE_CHANNELS)("invoke %s", (channel) => {
    const s = INVOKE_SAMPLES[channel];
    const schema = invokeChannels[channel];
    it("accepts a valid request and response", () => {
      const req = schema.request.safeParse(s.req);
      expect(req.error?.issues ?? []).toEqual([]);
      const res = schema.response.safeParse(s.res);
      expect(res.error?.issues ?? []).toEqual([]);
    });
    it("rejects an invalid request", () => {
      expect(schema.request.safeParse(s.badReq).success).toBe(false);
    });
  });

  describe.each(EVENT_CHANNELS)("event %s", (channel) => {
    it("accepts a valid payload and rejects an invalid one", () => {
      expect(eventChannels[channel].safeParse(EVENT_SAMPLES[channel].ok).success).toBe(true);
      expect(eventChannels[channel].safeParse(EVENT_SAMPLES[channel].bad).success).toBe(false);
    });
  });
});

describe("payload schemas", () => {
  it("carries samples/flappy as loaded by project-format, unchanged", async () => {
    const { project: loaded, diagnostics } = await loadProject(resolve(import.meta.dirname, "../../../samples/flappy"));
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const parsed = ProjectSchema.parse(structuredClone(loaded));
    expect(parsed).toEqual(loaded);
  });

  it("fills settings defaults, including the PLAN Controls mapping", () => {
    const s = SettingsSchema.parse({});
    expect(s.emulator).toBe("melonds");
    expect(s.controls).toMatchObject({ a: "x", b: "z", x: "s", y: "a", l: "q", r: "w", start: "Enter" });
  });

  it("assets.preview needs exactly one source, and options with sourcePath", () => {
    const req = invokeChannels["assets.preview"].request;
    expect(req.safeParse({ projectDir: "C:/p", sprite: "spr_a" }).success).toBe(true);
    expect(req.safeParse({ projectDir: "C:/p" }).success).toBe(false);
    expect(req.safeParse({ projectDir: "C:/p", sourcePath: "C:/x.png" }).success).toBe(false);
  });

  it("accepts only safe relative asset and docs paths", () => {
    for (const bad of ["", "/abs.png", "C:/x.png", "a\\b.png", "a/../b.png", "./a.png", "a//b.png", "a/b.png\u0000"])
      expect(isSafeRelativePath(bad), bad).toBe(false);
    expect(isSafeRelativePath("sprites/spr_bird/sheet.png")).toBe(true);
    expect(AssetPathSchema.safeParse("sounds/snd_flap/flap.WAV").success).toBe(true);
    expect(AssetPathSchema.safeParse("project.json").success).toBe(false);
    expect(LearnPathSchema.safeParse("docs/reference/errors.md").success).toBe(true);
    expect(LearnPathSchema.safeParse("docs/status/ws6.md").success).toBe(false);
    expect(LearnPathSchema.safeParse("docs/manual/../../PLAN.md").success).toBe(false);
    const images = invokeChannels["learn.read"].response.shape.images;
    expect(images.safeParse({ a: "https://example.com/x.png" }).success).toBe(false);
    expect(images.safeParse({ a: "data:image/svg+xml;base64,PHN2Zz4=" }).success).toBe(false);
  });

  it("reads templates/index.json entries and refuses unsafe folders", () => {
    const ok = TemplateIndexSchema.parse({ templates: [{ id: "flappy", title: "Flappy Bird", dir: "flappy" }] });
    expect(ok.templates[0]?.description).toBe("");
    expect(
      TemplateIndexSchema.safeParse({ templates: [{ id: "x", title: "X", dir: "../samples/flappy" }] }).success,
    ).toBe(false);
    expect(TemplateIndexSchema.safeParse({ templates: [] }).success).toBe(false);
  });

  it("settings.set refuses undefined values and unknown keys", () => {
    const req = invokeChannels["settings.set"].request;
    expect(req.safeParse({ key: "firstRunDone" }).success).toBe(false);
    expect(req.safeParse({ key: "firstRunDone", value: true }).success).toBe(true);
    expect(req.safeParse({ key: "__proto__", value: 1 }).success).toBe(false);
  });
});
