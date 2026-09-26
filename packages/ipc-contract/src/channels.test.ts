import { resolve } from "node:path";
import type { Diagnostic } from "@dsdude/project-format";
import { loadProject } from "@dsdude/project-format/node";
import { describe, expect, it } from "vitest";
import {
  EVENT_CHANNELS,
  type EventChannel,
  eventChannels,
  INVOKE_CHANNELS,
  type InvokeChannel,
  invokeChannels,
  ProjectSchema,
  SettingsSchema,
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
  "assets.import": {
    req: { projectDir: "C:/p", kind: "sprite", sourcePath: "C:/x.png", name: "spr_x" },
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
    req: { projectDir: "C:/p", emulator: "melonds", skipCompile: true },
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
  "doctor.run": { req: {}, res: { checks: [{ name: "BlocksDS", ok: true, detail: "1.24.0" }] }, badReq: false },
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
  it("lists the PLAN.md 5.2 C5 channels plus the 0.2.0 additions", () => {
    expect(INVOKE_CHANNELS).toEqual([
      "project.open",
      "project.save",
      "project.create",
      "assets.import",
      "assets.preview",
      "build.play",
      "build.build",
      "build.compileOnly",
      "build.cancel",
      "emulator.stop",
      "emulator.status",
      "emulator.install",
      "settings.get",
      "settings.set",
      "settings.getAll",
      "toolchain.status",
      "toolchain.install",
      "doctor.run",
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

  it("settings.set refuses undefined values and unknown keys", () => {
    const req = invokeChannels["settings.set"].request;
    expect(req.safeParse({ key: "firstRunDone" }).success).toBe(false);
    expect(req.safeParse({ key: "firstRunDone", value: true }).success).toBe(true);
    expect(req.safeParse({ key: "__proto__", value: 1 }).success).toBe(false);
  });
});
