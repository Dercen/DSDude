/** MockBuildService (C4, Phase 0): fake log, fake diagnostics, a fake emulator that waits until stop(). */
import type { Diagnostic } from "@dsdude/project-format";
import type { BuildEvent, BuildRequest, BuildResult, BuildService, EmulatorHandle, PlayResult } from "./api.ts";

export interface MockBuildOptions {
  /** Diagnostics every request reports; any error makes the build fail. */
  diagnostics?: Diagnostic[];
  /** Lines the fake emulator prints before it waits (DSD| protocol, C8). */
  emulatorLines?: string[];
}

export class MockBuildService implements BuildService {
  readonly opts: MockBuildOptions;
  readonly #listeners = new Set<(e: BuildEvent) => void>();
  #running: EmulatorHandle | null = null;
  #cancelled = false;

  constructor(opts: MockBuildOptions = {}) {
    this.opts = opts;
  }

  onEvent(listener: (e: BuildEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async compileOnly(req: BuildRequest): Promise<BuildResult> {
    return this.#run(req, ["compile"], false);
  }

  async build(req: BuildRequest): Promise<BuildResult> {
    return this.#run(req, ["compile", "assets", "pack"], true);
  }

  async play(req: BuildRequest): Promise<PlayResult> {
    const result = await this.build(req);
    if (!result.ok) return { ...result, emulator: null };
    await this.stop();
    this.#running = fakeEmulator(this.opts.emulatorLines ?? ["DSD|READY|0.1.0|00000000", "DSD|LOG|hello"]);
    this.#emit({ phase: "running", progress: 1, diagnostics: result.diagnostics, log: [], timings: result.timings });
    return { ...result, emulator: this.#running };
  }

  async stop(): Promise<void> {
    const running = this.#running;
    this.#running = null;
    if (running) await running.stop();
  }

  cancel(): void {
    this.#cancelled = true;
  }

  async #run(req: BuildRequest, phases: BuildEvent["phase"][], rom: boolean): Promise<BuildResult> {
    this.#cancelled = false;
    const diagnostics = this.opts.diagnostics ?? [];
    const timings: BuildResult["timings"] = {};
    for (const [i, phase] of phases.entries()) {
      await Promise.resolve();
      if (this.#cancelled) {
        this.#emit({ phase: "cancelled", progress: i / phases.length, diagnostics: [], log: [], timings });
        return { ok: false, ndsPath: null, diagnostics: [], timings };
      }
      timings[phase] = 1;
      this.#emit({ phase, progress: (i + 1) / phases.length, diagnostics, log: [`mock ${phase}`], timings });
    }
    const ok = !diagnostics.some((d) => d.severity === "error");
    this.#emit({ phase: ok ? "done" : "failed", progress: 1, diagnostics, log: [], timings });
    return { ok, ndsPath: ok && rom ? `${req.projectDir}/build/mock.nds` : null, diagnostics, timings };
  }

  #emit(e: BuildEvent): void {
    for (const l of this.#listeners) l(e);
  }
}

/** A fake EmulatorHandle: replays `lines` to each subscriber, then waits; stop() prints DSD|EXIT|0 and exits. */
export function fakeEmulator(lines: string[]): EmulatorHandle {
  const listeners = new Set<(line: string) => void>();
  let resolveExit: (code: number | null) => void = () => {};
  const exited = new Promise<number | null>((r) => {
    resolveExit = r;
  });
  let stopped = false;
  return {
    kind: "melonds",
    pid: null,
    exited,
    onLine(listener) {
      listeners.add(listener);
      for (const line of lines) listener(line);
      return () => listeners.delete(listener);
    },
    async stop() {
      if (!stopped) {
        stopped = true;
        for (const l of listeners) l("DSD|EXIT|0");
        resolveExit(0);
      }
      await exited;
    },
  };
}
