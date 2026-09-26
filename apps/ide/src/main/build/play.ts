/**
 * Play/Stop in the main process (PLAN.md 3.2): the build worker runs steps 3-6, main runs step 7 (launch) with its
 * EmulatorManager, and BuildEvents and emulator lines become C5 events: build.progress, build.log (batched),
 * build.diagnostics (when they change), emulator.log (batched, DSD|PAD| dropped) and emulator.exit.
 */
import type { InvokeResponse } from "@dsdude/ipc-contract";
import {
  type BuildEvent,
  type BuildRequest,
  type BuildResult,
  type DsButton,
  type EmulatorHandle,
  type EmulatorKind,
  errorDiagnostics,
} from "@dsdude/toolchain";
import type { SendEvent } from "../ipc.ts";
import { LineBatcher } from "./batcher.ts";
import type { IdeEmulatorManager } from "./modes.ts";

const PAD = "DSD|PAD|";

export interface BuildRunner {
  run(mode: "build" | "compileOnly", request: BuildRequest): Promise<BuildResult>;
  cancel(): void;
}

export interface PlayControllerDeps {
  worker: BuildRunner;
  emulators: IdeEmulatorManager;
  send: SendEvent;
  /** The Controls line printed first at every launch (settings may rebind the keys). */
  controlsLine: () => Promise<string>;
  /** Default emulator when the request names none. */
  defaultEmulator: () => Promise<EmulatorKind>;
  /** The runtime's arm9-debug.elf (C8 runtime artifact), named in the Debug attach command. */
  debugElf?: () => string;
  /** The user's keys per DS button (settings.controls), passed as C4 LaunchOptions.keys (ADR-0007). */
  keys?: () => Promise<Partial<Record<DsButton, string>>>;
}

/** What Output says when Debug starts melonDS with its GDB stub (C4 LaunchOptions.debug: ports 3333 / 3334). */
export function debugLines(elf: string): string[] {
  return [
    "Debug: melonDS is waiting for a debugger on port 3333 (ARM9) and 3334 (ARM7).",
    `Attach with: arm-none-eabi-gdb "${elf}" -ex "target remote localhost:3333"`,
  ];
}

type PlayResponse = InvokeResponse<"build.play">;

export class PlayController {
  readonly #d: PlayControllerDeps;
  readonly #buildLog: LineBatcher;
  readonly #emuLog: LineBatcher;
  #lastProgress = "";
  #lastDiagnostics = "";
  #running: EmulatorHandle | null = null;

  constructor(deps: PlayControllerDeps) {
    this.#d = deps;
    this.#buildLog = new LineBatcher((lines) => deps.send("build.log", { lines }));
    this.#emuLog = new LineBatcher((lines) => deps.send("emulator.log", { lines }));
  }

  /** Feed for the worker host's BuildEvents. */
  onBuildEvent = (e: BuildEvent): void => {
    this.#progress(e.phase, e.progress);
    this.#buildLog.push(...e.log);
    this.#diagnostics(e.diagnostics);
  };

  async build(mode: "build" | "compileOnly", request: BuildRequest): Promise<BuildResult> {
    this.#lastDiagnostics = "";
    try {
      return await this.#d.worker.run(mode, request);
    } catch (err) {
      // The worker died or timed out: no catalog code applies, so say it in the log and fail the request.
      this.#buildLog.push(`Build stopped: ${err instanceof Error ? err.message : String(err)}`);
      this.#progress("failed", 1);
      return { ok: false, ndsPath: null, diagnostics: [], timings: {} };
    } finally {
      this.#buildLog.flush();
    }
  }

  async play(request: BuildRequest): Promise<PlayResponse> {
    const result = await this.build("build", request);
    if (!result.ok || result.ndsPath === null) return { ...result, emulator: null };
    const kind = request.emulator ?? (await this.#d.defaultEmulator());
    this.#progress("launch", 1);
    this.#buildLog.push(await this.#d.controlsLine());
    if (request.debug) this.#buildLog.push(...debugLines(this.#d.debugElf?.() ?? "arm9-debug.elf"));
    this.#buildLog.flush();
    try {
      await this.stop();
      const keys = await this.#d.keys?.();
      const handle = await this.#d.emulators.launch(result.ndsPath, {
        kind,
        debug: request.debug,
        ...(keys ? { keys } : {}),
      });
      this.#attach(handle);
      this.#progress("running", 1);
      // Launch warnings (C4 E625: a key the emulator cannot use) join the build's diagnostics.
      const diagnostics = [...result.diagnostics, ...(handle.diagnostics ?? [])];
      if (diagnostics.length > result.diagnostics.length) this.#diagnostics(diagnostics);
      return { ...result, diagnostics, emulator: { kind: handle.kind, pid: handle.pid } };
    } catch (err) {
      const diagnostics = [...result.diagnostics, ...errorDiagnostics(err)];
      this.#diagnostics(diagnostics);
      this.#progress("failed", 1);
      return { ...result, ok: false, diagnostics, emulator: null };
    }
  }

  /** Graceful stop (taskkill, then /F after 2 s in the real manager); resolves once the emulator has exited. */
  async stop(): Promise<void> {
    const running = this.#running;
    if (running) await running.stop();
  }

  cancel(): void {
    this.#d.worker.cancel();
  }

  status(): InvokeResponse<"emulator.status"> {
    const r = this.#running;
    return r ? { running: true, kind: r.kind, pid: r.pid } : { running: false, kind: null, pid: null };
  }

  #attach(handle: EmulatorHandle): void {
    this.#running = handle;
    handle.onLine((line) => {
      if (!line.startsWith(PAD)) this.#emuLog.push(line);
    });
    void handle.exited.then((code) => {
      this.#emuLog.flush();
      if (this.#running === handle) this.#running = null;
      this.#d.send("emulator.exit", { code: Number.isInteger(code) ? code : null });
    });
  }

  #progress(phase: BuildEvent["phase"], progress: number): void {
    const key = `${phase}:${progress}`;
    if (key === this.#lastProgress) return;
    this.#lastProgress = key;
    this.#d.send("build.progress", { phase, progress: Math.min(1, Math.max(0, progress)) });
  }

  #diagnostics(diagnostics: BuildEvent["diagnostics"]): void {
    const key = JSON.stringify(diagnostics);
    if (key === this.#lastDiagnostics) return;
    this.#lastDiagnostics = key;
    this.#d.send("build.diagnostics", { diagnostics });
  }
}
