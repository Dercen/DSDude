/**
 * Contract C5 v0.2.0: the IPC channel map between the IDE's renderer and main process. Spec: contracts/ipc.md.
 * Phase-0 stubs by WS0; completed by WS6 (owner from the tag).
 * How to change me: T0 comments; T1 (minor bump + CHANGELOG) for a new channel or an optional field;
 * T2 (ADR co-signed by WS1/WS8, WS6b and WS7) for a rename, a removal or a required field.
 * No Electron or Node import here (type-only imports are erased): the sandboxed preload bundle, the mock host and
 * the browser tests use this module.
 */
import type { SpritePreview } from "@dsdude/asset-pipeline";
import {
  BackgroundJsonSchema,
  DiagnosticSchema,
  NameSchema,
  ObjectJsonSchema,
  type Project,
  ProjectJsonSchema,
  RoomJsonSchema,
  SoundJsonSchema,
  SpriteJsonSchema,
} from "@dsdude/project-format";
import type { BuildPhase, BuildRequest, BuildResult } from "@dsdude/toolchain";
import { z } from "zod";

export const CONTRACT_VERSION = "0.5.0";

// ---------------------------------------------------------------------------------------------------------
// Shared payload schemas

const Ok = z.object({ ok: z.literal(true) });
const Diagnostics = z.array(DiagnosticSchema);

export const EmulatorKindSchema = z.enum(["melonds", "desmume"]);

/** C4 `BuildPhase`, in pipeline order. */
export const BuildPhaseSchema = z.enum([
  "load",
  "compile",
  "assets",
  "budgets",
  "runtime",
  "pack",
  "launch",
  "running",
  "done",
  "failed",
  "cancelled",
]);

/** C4 `BuildRequest`. */
export const BuildRequestSchema = z.object({
  projectDir: z.string().min(1),
  emulator: EmulatorKindSchema.optional(),
  seed: z.int().optional(),
  runtime: z.string().optional(),
  skipCompile: z.boolean().optional(),
  skipAssets: z.boolean().optional(),
  jobs: z.int().min(1).optional(),
  /** play only: start the emulator's GDB stub (C4 0.3.0; melonDS only). C5 0.3.0. */
  debug: z.boolean().optional(),
});

/** C4 `BuildResult` as JSON. */
export const BuildResultSchema = z.object({
  ok: z.boolean(),
  ndsPath: z.string().nullable(),
  diagnostics: Diagnostics,
  timings: z.partialRecord(BuildPhaseSchema, z.number()),
});

/** `build.play`: C4 `PlayResult` with the emulator handle reduced to plain data. */
export const PlayResultSchema = BuildResultSchema.extend({
  emulator: z.object({ kind: EmulatorKindSchema, pid: z.int().nullable() }).nullable(),
});

/**
 * The whole in-memory C1 `Project` crosses IPC (JSON files and DSS sources only; images and sounds never do).
 * Mirrors `Project` from @dsdude/project-format; channels.test.ts keeps the two in step.
 */
export const ProjectSchema = z.object({
  dir: z.string(),
  project: ProjectJsonSchema,
  sprites: z.array(SpriteJsonSchema.extend({ name: NameSchema })),
  backgrounds: z.array(BackgroundJsonSchema.extend({ name: NameSchema })),
  sounds: z.array(SoundJsonSchema.extend({ name: NameSchema })),
  objects: z.array(
    ObjectJsonSchema.extend({
      name: NameSchema,
      events: z.record(z.string(), z.string()),
      functions: z.string().nullable(),
    }),
  ),
  rooms: z.array(RoomJsonSchema.extend({ name: NameSchema })),
  scripts: z.array(z.object({ name: NameSchema, source: z.string() })),
});

/** Binary payloads (`assets.preview` indices, `project.readFile`/`writeFile` bytes). */
const Bytes = z.custom<Uint8Array>((v) => v instanceof Uint8Array, "expected a Uint8Array");

/** C12 `SpritePreview`. */
export const SpritePreviewSchema = z.object({
  palette: z.array(z.int()),
  indices: Bytes,
  colorCount: z.int().min(0),
  colorMode: z.enum(["16", "256"]),
  frames: z.array(z.object({ offset: z.int().min(0), paddedWidth: z.int().min(1), paddedHeight: z.int().min(1) })),
});

export const PreviewSpriteOptionsSchema = z.object({
  frameWidth: z.int().min(1),
  frameHeight: z.int().min(1),
  colorMode: z.enum(["auto", "16", "256"]),
  transparent: z.union([z.literal("alpha"), z.templateLiteral(["#", z.string()])]),
});

/**
 * A safe relative path: "/" separators, no leading "/", no drive or ":" , no "." or ".." segment, no backslash.
 * Main resolves it inside the project (or docs) folder only.
 */
export function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.length > 240 || path.startsWith("/") || /[\\:]/.test(path) || path.includes("\0"))
    return false;
  return path.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

/** Asset files editors read and write (0.4.0); JSON and DSS files go through `project.save` (C1) instead. */
export const ASSET_FILE_EXTENSIONS = ["png", "wav", "mp3", "xm", "mod", "it", "s3m"] as const;
export const AssetPathSchema = z
  .string()
  .refine(isSafeRelativePath, "expected a project-relative path without '..'")
  .refine(
    (p) => (ASSET_FILE_EXTENSIONS as readonly string[]).includes(p.slice(p.lastIndexOf(".") + 1).toLowerCase()),
    `expected a .${ASSET_FILE_EXTENSIONS.join("/.")} file`,
  );

/** Learn documents: repo-relative markdown under docs/tutorial, docs/manual or docs/reference (0.4.0). */
export const LEARN_SECTIONS = ["tutorial", "manual", "reference"] as const;
export const LearnPathSchema = z
  .string()
  .refine(isSafeRelativePath, "expected a relative docs path")
  .regex(/^docs\/(tutorial|manual|reference)\/.+\.md$/, "expected docs/<tutorial|manual|reference>/....md");
export const LearnDocSchema = z.object({
  path: LearnPathSchema,
  /** The first "# " heading, else the file name. */
  title: z.string(),
  section: z.enum(LEARN_SECTIONS),
});

/** Emulator key names per DS button (KeyboardEvent.key values); defaults are PLAN.md 6 WS6 "Controls card". */
export const ControlsSchema = z.object({
  up: z.string().default("ArrowUp"),
  down: z.string().default("ArrowDown"),
  left: z.string().default("ArrowLeft"),
  right: z.string().default("ArrowRight"),
  a: z.string().default("x"),
  b: z.string().default("z"),
  x: z.string().default("s"),
  y: z.string().default("a"),
  l: z.string().default("q"),
  r: z.string().default("w"),
  start: z.string().default("Enter"),
  select: z.string().default("Shift"),
});

/** `settings.json` under userData. Every key has a default, so `{}` parses to the defaults. */
export const SettingsSchema = z.object({
  emulator: EmulatorKindSchema.default("melonds"),
  /** Where New Project puts projects; null = %USERPROFILE%\DSDudeProjects. */
  projectsDir: z.string().nullable().default(null),
  /** Most recent first, at most 10 absolute project folders. */
  recentProjects: z.array(z.string()).max(10).default([]),
  /** The first-run wizard finished (the Learn panel opens on first launch until then). */
  firstRunDone: z.boolean().default(false),
  /** The Learn panel has opened once (it opens on first launch). 0.4.0. */
  learnOpened: z.boolean().default(false),
  controls: ControlsSchema.default(ControlsSchema.parse({})),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type SettingKey = keyof Settings;
export const SETTING_KEYS = Object.keys(SettingsSchema.shape) as SettingKey[];
const SettingKeySchema = z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]);

// ---------------------------------------------------------------------------------------------------------
// Channels

/** Invoke channels (renderer -> main, one request, one response). */
export const invokeChannels = {
  /** `project` is null only when project.json itself is missing or unusable (C1 `LoadResult`). */
  "project.open": {
    request: z.object({ dir: z.string().min(1) }),
    response: z.object({ project: ProjectSchema.nullable(), diagnostics: Diagnostics }),
  },
  /** Writes every JSON and DSS file of the project (C1 `save`); never deletes files. */
  "project.save": { request: z.object({ dir: z.string().min(1), project: ProjectSchema }), response: Ok },
  "project.create": {
    request: z.object({ dir: z.string().min(1), name: NameSchema, template: z.string().optional() }),
    response: z.object({ dir: z.string() }),
  },
  "assets.import": {
    request: z.object({
      projectDir: z.string().min(1),
      kind: z.enum(["sprite", "background", "sound"]),
      sourcePath: z.string().min(1),
      name: NameSchema,
    }),
    response: z.object({ name: z.string(), diagnostics: Diagnostics }),
  },
  /**
   * C12 `previewSprite` run in main over a PNG on disk: an existing sprite (`sprite`, its sprite.json options unless
   * `options` is given) or an import source (`sourcePath` + `options`). Exactly one of `sprite` and `sourcePath`.
   */
  "assets.preview": {
    request: z
      .object({
        projectDir: z.string().min(1),
        sprite: NameSchema.optional(),
        sourcePath: z.string().min(1).optional(),
        options: PreviewSpriteOptionsSchema.optional(),
      })
      .refine((r) => (r.sprite === undefined) !== (r.sourcePath === undefined), {
        message: "give exactly one of sprite and sourcePath",
      })
      .refine((r) => r.sourcePath === undefined || r.options !== undefined, {
        message: "sourcePath needs options",
      }),
    response: SpritePreviewSchema,
  },
  "build.play": { request: BuildRequestSchema, response: PlayResultSchema },
  "build.build": { request: BuildRequestSchema, response: BuildResultSchema },
  "build.compileOnly": { request: BuildRequestSchema, response: BuildResultSchema },
  "build.cancel": { request: z.object({}), response: Ok },
  "emulator.stop": { request: z.object({}), response: Ok },
  "emulator.status": {
    request: z.object({}),
    response: z.object({ running: z.boolean(), kind: EmulatorKindSchema.nullable(), pid: z.int().nullable() }),
  },
  "emulator.install": { request: z.object({ kind: EmulatorKindSchema }), response: z.object({ exe: z.string() }) },
  "settings.get": {
    request: z.object({ key: SettingKeySchema }),
    response: z.object({ value: z.unknown() }),
  },
  /** The value is validated against the key's field of SettingsSchema. */
  "settings.set": {
    request: z.object({ key: SettingKeySchema, value: z.unknown() }).superRefine((r, ctx) => {
      const field = SettingsSchema.shape[r.key];
      const res = field.safeParse(r.value);
      if (!res.success || r.value === undefined)
        ctx.addIssue({ code: "custom", path: ["value"], message: `invalid value for setting ${r.key}` });
    }),
    response: Ok,
  },
  /** (0.2.0) Every setting at once, defaults filled in. */
  "settings.getAll": { request: z.object({}), response: z.object({ settings: SettingsSchema }) },
  "toolchain.status": {
    request: z.object({}),
    response: z.object({ installed: z.boolean(), blocksdsVersion: z.string().nullable(), diagnostics: Diagnostics }),
  },
  "toolchain.install": {
    request: z.object({}),
    response: z.object({ installed: z.boolean(), diagnostics: Diagnostics }),
  },
  "doctor.run": {
    request: z.object({}),
    response: z.object({ checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string() })) }),
  },
  /** (0.4.0) Reads an asset file of the project (sprite sheets, background images, sounds). */
  "project.readFile": {
    request: z.object({ dir: z.string().min(1), path: AssetPathSchema }),
    response: z.object({ bytes: Bytes }),
  },
  /** (0.4.0) Writes an asset file of the project (creating its folder); editors save images and sounds this way. */
  "project.writeFile": {
    request: z.object({ dir: z.string().min(1), path: AssetPathSchema, bytes: Bytes }),
    response: Ok,
  },
  /** (0.4.0) The Learn documents that exist, tutorial first, then manual, then reference. */
  "learn.list": { request: z.object({}), response: z.object({ docs: z.array(LearnDocSchema) }) },
  /**
   * (0.4.0) One Learn document. `images` maps each relative image path the markdown uses (as written) to a data:
   * URL, so the renderer shows local images under its CSP (img-src 'self' data:) and never loads remote ones.
   */
  "learn.read": {
    request: z.object({ path: LearnPathSchema }),
    response: z.object({
      path: LearnPathSchema,
      markdown: z.string(),
      images: z.record(z.string(), z.string().regex(/^data:image\/(png|jpeg|gif|webp);base64,/)),
    }),
  },
  /** (0.5.0) Opens docs/tutorial/assets/ (the tutorial's images and sounds) in the file manager (Help menu). */
  "learn.openAssets": { request: z.object({}), response: z.object({ path: z.string() }) },
  /** (0.2.0) Native open dialog; `paths` is empty when the user cancels. */
  "dialog.open": {
    request: z.object({
      kind: z.enum(["directory", "file"]),
      title: z.string().optional(),
      defaultPath: z.string().optional(),
      /** File dialogs only, e.g. [{name: "Images", extensions: ["png"]}]. */
      filters: z.array(z.object({ name: z.string(), extensions: z.array(z.string().regex(/^[\w*]+$/)) })).optional(),
    }),
    response: z.object({ paths: z.array(z.string()) }),
  },
} as const;

/** Event channels (main -> renderer, fire and forget). */
export const eventChannels = {
  /** New build-output lines since the previous event (C4 `BuildEvent.log` before phase "running"). */
  "build.log": z.object({ lines: z.array(z.string()) }),
  "build.progress": z.object({ phase: BuildPhaseSchema, progress: z.number().min(0).max(1) }),
  /** Every diagnostic of the current request so far (cumulative, like C4 `BuildEvent`): replace, do not append. */
  "build.diagnostics": z.object({ diagnostics: Diagnostics }),
  /** DSD| lines (C8) with the DSD|PAD| flush pad already dropped, batched ~30 ms. */
  "emulator.log": z.object({ lines: z.array(z.string()) }),
  /** The emulator process ended; code is null when it was killed. */
  "emulator.exit": z.object({ code: z.int().nullable() }),
  /** Project-relative paths with "/" separators that changed on disk (chokidar, coalesced). */
  "project.changed": z.object({ paths: z.array(z.string()) }),
} as const;

// ---------------------------------------------------------------------------------------------------------
// Types

export type InvokeChannel = keyof typeof invokeChannels;
export type EventChannel = keyof typeof eventChannels;
/** What the caller passes (defaults may be omitted). */
export type InvokeRequest<C extends InvokeChannel> = z.input<(typeof invokeChannels)[C]["request"]>;
/** What a handler receives after validation. */
export type InvokeRequestParsed<C extends InvokeChannel> = z.output<(typeof invokeChannels)[C]["request"]>;
export type InvokeResponse<C extends InvokeChannel> = z.output<(typeof invokeChannels)[C]["response"]>;
export type EventPayload<C extends EventChannel> = z.output<(typeof eventChannels)[C]>;

export const INVOKE_CHANNELS = Object.keys(invokeChannels) as InvokeChannel[];
export const EVENT_CHANNELS = Object.keys(eventChannels) as EventChannel[];

/** What the preload exposes: only invoke/on for the listed channels. Main validates the sender and the schema. */
export interface DsdudeBridge {
  invoke<C extends InvokeChannel>(channel: C, request: InvokeRequest<C>): Promise<InvokeResponse<C>>;
  on<C extends EventChannel>(channel: C, listener: (payload: EventPayload<C>) => void): () => void;
}

// Compile-time links to C1, C4 and C12: a drift in either direction fails `tsc -b`. Mutual assignability alone
// misses an optional field present on one side only, so the key sets are compared as well.
type Keys<A, B> = [keyof A] extends [keyof B] ? ([keyof B] extends [keyof A] ? true : false) : false;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? Keys<A, B> : false) : false;
const check = <T extends true>(): T => true as T;
check<Same<z.output<typeof ProjectSchema>, Project>>();
check<Same<z.output<typeof BuildPhaseSchema>, BuildPhase>>();
check<Same<z.output<typeof BuildRequestSchema>, BuildRequest>>();
check<Same<z.output<typeof BuildResultSchema>, BuildResult>>();
check<Same<Omit<z.output<typeof SpritePreviewSchema>, "indices">, Omit<SpritePreview, "indices">>>();
