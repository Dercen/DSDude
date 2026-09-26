/**
 * Messages between the IDE main process and its utilityProcess build worker (PLAN.md 3.2 step 2). Internal to
 * apps/ide: the C5 schemas validate what reaches the renderer, so these stay plain types.
 */
import type { BuildEvent, BuildRequest, BuildResult } from "@dsdude/toolchain";

/** Which BuildService the worker runs and which EmulatorManager main uses (see modes.ts). */
export type BuildServiceMode = "mock" | "fake" | "real";

export type WorkerRequest =
  | { type: "run"; id: number; mode: "build" | "compileOnly"; request: BuildRequest }
  | { type: "cancel" };

export type WorkerMessage =
  | { type: "event"; event: BuildEvent }
  | { type: "result"; id: number; result: BuildResult }
  | { type: "error"; id: number; message: string };
