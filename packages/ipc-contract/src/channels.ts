/**
 * Contract C5 v0.1.0: the IPC channel map between the IDE's renderer and main process, as zod stubs.
 * Phase-0 stubs by WS0; owner WS6 from the tag, which completes them. Spec: contracts/ipc.md.
 * How to change me: T0 comments; T1 (minor bump + CHANGELOG) for a new channel or an optional field;
 * T2 (ADR co-signed by WS1/WS8, WS6b and WS7) for a rename, a removal or a required field.
 * No Electron import here: the preload bundle and the browser tests use this module.
 */
import { DiagnosticSchema } from "@dsdude/project-format";
import { z } from "zod";

export const CONTRACT_VERSION = "0.1.0";

const Ok = z.object({ ok: z.literal(true) });
const Diagnostics = z.array(DiagnosticSchema);
const EmulatorKind = z.enum(["melonds", "desmume"]);
const BuildRequest = z.object({
  projectDir: z.string(),
  emulator: EmulatorKind.optional(),
  seed: z.int().optional(),
  runtime: z.string().optional(),
  skipCompile: z.boolean().optional(),
  skipAssets: z.boolean().optional(),
  jobs: z.int().min(1).optional(),
});
const BuildResult = z.object({
  ok: z.boolean(),
  ndsPath: z.string().nullable(),
  diagnostics: Diagnostics,
  timings: z.record(z.string(), z.number()),
});
/** STUB: the project crosses IPC as JSON; WS6 decides whether to send the whole Project or a summary. */
const ProjectPayload = z.unknown();

/** Invoke channels (renderer -> main, one request, one response). */
export const invokeChannels = {
  "project.open": {
    request: z.object({ dir: z.string() }),
    response: z.object({ project: ProjectPayload, diagnostics: Diagnostics }),
  },
  "project.save": { request: z.object({ dir: z.string(), project: ProjectPayload }), response: Ok },
  "project.create": {
    request: z.object({ dir: z.string(), name: z.string(), template: z.string().optional() }),
    response: z.object({ dir: z.string() }),
  },
  "assets.import": {
    request: z.object({
      projectDir: z.string(),
      kind: z.enum(["sprite", "background", "sound"]),
      sourcePath: z.string(),
      name: z.string(),
    }),
    response: z.object({ name: z.string(), diagnostics: Diagnostics }),
  },
  /** STUB: the preview result follows C12 (`previewSprite`, packages/asset-pipeline/src/preview.ts). */
  "assets.preview": { request: z.object({ projectDir: z.string(), sprite: z.string() }), response: z.unknown() },
  "build.play": { request: BuildRequest, response: BuildResult },
  "build.build": { request: BuildRequest, response: BuildResult },
  "build.compileOnly": { request: BuildRequest, response: BuildResult },
  "build.cancel": { request: z.object({}), response: Ok },
  "emulator.stop": { request: z.object({}), response: Ok },
  "emulator.status": {
    request: z.object({}),
    response: z.object({ running: z.boolean(), kind: EmulatorKind.nullable(), pid: z.int().nullable() }),
  },
  "emulator.install": { request: z.object({ kind: EmulatorKind }), response: z.object({ exe: z.string() }) },
  "settings.get": { request: z.object({ key: z.string() }), response: z.object({ value: z.unknown() }) },
  "settings.set": { request: z.object({ key: z.string(), value: z.unknown() }), response: Ok },
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
} as const;

/** Event channels (main -> renderer, fire and forget). */
export const eventChannels = {
  "build.log": z.object({ lines: z.array(z.string()) }),
  "build.progress": z.object({ phase: z.string(), progress: z.number().min(0).max(1) }),
  "build.diagnostics": z.object({ diagnostics: Diagnostics }),
  /** DSD| lines (C8) with the DSD|PAD| flush pad already dropped. */
  "emulator.log": z.object({ lines: z.array(z.string()) }),
  "emulator.exit": z.object({ code: z.int().nullable() }),
  "project.changed": z.object({ paths: z.array(z.string()) }),
} as const;

export type InvokeChannel = keyof typeof invokeChannels;
export type EventChannel = keyof typeof eventChannels;
export type InvokeRequest<C extends InvokeChannel> = z.infer<(typeof invokeChannels)[C]["request"]>;
export type InvokeResponse<C extends InvokeChannel> = z.infer<(typeof invokeChannels)[C]["response"]>;
export type EventPayload<C extends EventChannel> = z.infer<(typeof eventChannels)[C]>;

export const INVOKE_CHANNELS = Object.keys(invokeChannels) as InvokeChannel[];
export const EVENT_CHANNELS = Object.keys(eventChannels) as EventChannel[];

/** What the preload exposes: only invoke/on for the listed channels. Main validates the sender and the schema. */
export interface DsdudeBridge {
  invoke<C extends InvokeChannel>(channel: C, request: InvokeRequest<C>): Promise<InvokeResponse<C>>;
  on<C extends EventChannel>(channel: C, listener: (payload: EventPayload<C>) => void): () => void;
}
