/**
 * LocalBuildService: the real BuildService (C4) on Windows. Phases: load -> (compile, assets, budgets) -> runtime ->
 * pack -> launch. Output goes to <DSDUDE_HOME>\build\<project-hash>\ (PLAN.md 3.2), never into the project:
 *   nitrofs\      the NitroFS root (a BlocksDS folder's own nitrofs\ is copied here)
 *   game.nds      the ROM
 *   packrom.json  what packRom() found in the header (C14 fixtures/build/)
 *
 * A folder without project.json is a plain BlocksDS C project (samples/hello): it builds only with skipCompile and
 * skipAssets, packs <dir>\nitrofs\ and uses the folder name as the title.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { Diagnostic } from "@dsdude/project-format";
import type {
  BuildEvent,
  BuildPhase,
  BuildRequest,
  BuildResult,
  BuildService,
  BuildServiceDeps,
  EmulatorHandle,
  EmulatorKind,
  EmulatorManager,
  PlayResult,
  RomInfo,
  ToolchainStatus,
} from "./api.ts";
import { detectToolchain } from "./detect.ts";
import { ToolchainError, toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { LocalEmulatorManager } from "./emulator.ts";
import { dsdudeHome, MAX_TOOL_PATH, projectBuildDir, toolEnv, wonderfulLayout } from "./layout.ts";
import { packRom } from "./rom.ts";
import { runMake } from "./runtime.ts";

export const ROM_NAME = "game.nds";
export const PACKROM_JSON = "packrom.json";

export interface LocalBuildServiceOptions {
  /** DSDUDE_HOME; default dsdudeHome(). */
  home?: string;
  /** runtime/ (its Makefile builds dist/arm9.elf); default <cwd>/runtime. */
  runtimeDir?: string;
  /** WS4/WS5 functions, injected by the composition root; null until they land (C4). */
  deps?: BuildServiceDeps | null;
  detect?: () => Promise<ToolchainStatus>;
  emulators?: EmulatorManager & { stopCurrent?: () => Promise<void> };
  env?: Record<string, string | undefined>;
}

/** What packrom.json holds: RomInfo without machine-specific paths. */
export interface PackRomRecord extends RomInfo {
  rom: string;
  title: string;
}

class Cancelled extends Error {}

export class LocalBuildService implements BuildService {
  readonly home: string;
  readonly runtimeDir: string;
  readonly emulators: EmulatorManager & { stopCurrent?: () => Promise<void> };
  readonly #opts: LocalBuildServiceOptions;
  readonly #listeners = new Set<(e: BuildEvent) => void>();
  #abort: AbortController | null = null;
  #running: EmulatorHandle | null = null;

  constructor(opts: LocalBuildServiceOptions = {}) {
    this.#opts = opts;
    this.home = opts.home ?? dsdudeHome(opts.env ?? process.env);
    this.runtimeDir = opts.runtimeDir ?? path.resolve("runtime");
    this.emulators = opts.emulators ?? new LocalEmulatorManager({ home: this.home });
  }

  onEvent(listener: (e: BuildEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** The build folder of a project. */
  buildDir(projectDir: string): string {
    return projectBuildDir(projectDir, this.home);
  }

  /** The ROM the last build of `projectDir` wrote (it may not exist). */
  romPath(projectDir: string): string {
    return path.join(this.buildDir(projectDir), ROM_NAME);
  }

  async compileOnly(req: BuildRequest): Promise<BuildResult> {
    return this.#request(req, "compileOnly");
  }

  async build(req: BuildRequest): Promise<BuildResult> {
    return this.#request(req, "build");
  }

  async play(req: BuildRequest): Promise<PlayResult> {
    const result = await this.#request(req, "build");
    if (!result.ok || result.ndsPath === null) return { ...result, emulator: null };
    return this.launchRom(result.ndsPath, { kind: req.emulator ?? "melonds", debug: req.debug }, result);
  }

  /** Launches an already built ROM (`dsdude play --no-build`). */
  async launchRom(
    ndsPath: string,
    launch: { kind: EmulatorKind; debug?: boolean },
    prior: BuildResult = { ok: true, ndsPath, diagnostics: [], timings: {} },
  ): Promise<PlayResult> {
    const timings = { ...prior.timings };
    const t0 = Date.now();
    this.#emit({ phase: "launch", progress: 1, diagnostics: prior.diagnostics, log: [], timings });
    try {
      await this.stop();
      const emulator = await this.emulators.launch(ndsPath, launch);
      this.#running = emulator;
      timings.launch = Date.now() - t0;
      emulator.onLine((line) =>
        this.#emit({ phase: "running", progress: 1, diagnostics: prior.diagnostics, log: [line], timings }),
      );
      emulator.exited.then(() => {
        if (this.#running === emulator) this.#running = null;
      });
      return { ...prior, ndsPath, timings, emulator };
    } catch (err) {
      const diagnostics = [...prior.diagnostics, ...errorDiagnostics(err)];
      this.#emit({ phase: "failed", progress: 1, diagnostics, log: [], timings });
      return { ok: false, ndsPath, diagnostics, timings, emulator: null };
    }
  }

  async stop(): Promise<void> {
    const running = this.#running;
    this.#running = null;
    if (running) await running.stop();
  }

  cancel(): void {
    this.#abort?.abort();
  }

  async #request(req: BuildRequest, mode: "build" | "compileOnly"): Promise<BuildResult> {
    this.#abort?.abort();
    const abort = new AbortController();
    this.#abort = abort;
    const diagnostics: Diagnostic[] = [];
    const timings: Partial<Record<BuildPhase, number>> = {};
    let progress = 0;
    const phase = async <T>(name: BuildPhase, share: number, work: (log: (l: string) => void) => Promise<T>) => {
      if (abort.signal.aborted) throw new Cancelled();
      const t0 = Date.now();
      const log = (line: string) => this.#emit({ phase: name, progress, diagnostics, log: [line], timings });
      this.#emit({ phase: name, progress, diagnostics, log: [], timings });
      const out = await work(log);
      if (abort.signal.aborted) throw new Cancelled();
      timings[name] = Date.now() - t0;
      progress = Math.min(1, progress + share);
      return out;
    };
    const finish = (ok: boolean, ndsPath: string | null): BuildResult => {
      this.#emit({ phase: ok ? "done" : "failed", progress: 1, diagnostics, log: [], timings });
      return { ok, ndsPath, diagnostics, timings };
    };
    const projectDir = path.resolve(req.projectDir);
    const buildDir = this.buildDir(projectDir);

    try {
      const isProject = existsSync(path.join(projectDir, "project.json"));
      await phase("load", 0.05, async () => {
        if (!existsSync(projectDir))
          diagnostics.push(toolchainDiagnostic("E607", { what: "The folder", path: projectDir }));
        else if (!isProject && (mode === "compileOnly" || !req.skipCompile || !req.skipAssets)) {
          diagnostics.push(toolchainDiagnostic("E608", { dir: projectDir }));
        } else if (isProject && !(req.skipCompile && req.skipAssets) && !this.#opts.deps) {
          // WS1 task 4 wires compile/assets (WS4/WS5, by CP-B); until then only the reuse path exists.
          diagnostics.push(
            toolchainDiagnostic("E605", { what: "Compiling a DSDude project (compile and assets are not wired yet)" }),
          );
        }
        if (buildDir.length + 40 >= MAX_TOOL_PATH) {
          diagnostics.push(toolchainDiagnostic("E606", { path: buildDir, length: buildDir.length }));
        }
      });
      if (hasError(diagnostics)) return finish(false, null);
      if (mode === "compileOnly") return finish(true, null);

      const status = await (this.#opts.detect ?? (() => detectToolchain({ env: this.#opts.env })))();
      if (!status.installed) {
        diagnostics.push(...status.diagnostics);
        return finish(false, null);
      }
      const nitrofsDir = path.join(buildDir, "nitrofs");
      if (!isProject) {
        await phase("assets", 0.1, async () => {
          const source = path.join(projectDir, "nitrofs");
          if (!existsSync(source)) {
            diagnostics.push(toolchainDiagnostic("E607", { what: "The NitroFS folder", path: source }));
            return;
          }
          rmSync(nitrofsDir, { recursive: true, force: true });
          mkdirSync(buildDir, { recursive: true });
          cpSync(source, nitrofsDir, { recursive: true });
        });
      } else if (!existsSync(nitrofsDir)) {
        diagnostics.push(toolchainDiagnostic("E609", { dir: projectDir }));
      }
      if (hasError(diagnostics)) return finish(false, null);

      const arm9Elf = await phase("runtime", 0.6, async (log) => {
        if (req.runtime) {
          const elf = path.resolve(req.runtime);
          if (!existsSync(elf)) diagnostics.push(toolchainDiagnostic("E607", { what: "The runtime", path: elf }));
          return elf;
        }
        const built = await runMake({
          dir: this.runtimeDir,
          elf: path.join("dist", "arm9.elf"),
          jobs: req.jobs,
          paths: status.paths,
          layout: wonderfulLayout(),
          env: this.#opts.env,
          signal: abort.signal,
          onOutput: (text) => {
            for (const line of text.split(/\r?\n/)) if (line.trim() !== "") log(line);
          },
        });
        diagnostics.push(...built.diagnostics);
        return built.arm9Elf;
      });
      if (hasError(diagnostics) || arm9Elf === null) return finish(false, null);

      const ndsPath = path.join(buildDir, ROM_NAME);
      await phase("pack", 0.2, async (log) => {
        const title = path.basename(projectDir);
        const packed = await packRom(
          {
            arm9Elf,
            nitrofsDir,
            outNds: ndsPath,
            title,
            subtitle: "DSDude",
            author: "DSDude",
            iconPng: null,
            gamecode: "####",
          },
          {
            paths: status.paths,
            env: toolEnv(this.#opts.env ?? process.env, wonderfulLayout()),
            signal: abort.signal,
          },
        );
        const record: PackRomRecord = { rom: ROM_NAME, title, ...packed.info };
        writeFileSync(path.join(buildDir, PACKROM_JSON), `${JSON.stringify(record, null, 2)}\n`);
        log(`packed ${ndsPath} (${packed.info.sizeBytes} bytes, ${packed.info.nitrofsFiles} NitroFS files)`);
      });
      return finish(true, ndsPath);
    } catch (err) {
      if (err instanceof Cancelled || abort.signal.aborted) {
        this.#emit({ phase: "cancelled", progress, diagnostics, log: [], timings });
        return { ok: false, ndsPath: null, diagnostics, timings };
      }
      diagnostics.push(...errorDiagnostics(err));
      return finish(false, null);
    } finally {
      if (this.#abort === abort) this.#abort = null;
    }
  }

  #emit(e: BuildEvent): void {
    for (const l of this.#listeners) l({ ...e, diagnostics: [...e.diagnostics], timings: { ...e.timings } });
  }
}

function hasError(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/** A thrown error as diagnostics: ToolchainError keeps its own; anything else is an E603. */
export function errorDiagnostics(err: unknown): Diagnostic[] {
  if (err instanceof ToolchainError) return err.diagnostics;
  const detail = err instanceof Error ? err.message : String(err);
  return [toolchainDiagnostic("E603", { tool: "the build", code: "none", detail })];
}
