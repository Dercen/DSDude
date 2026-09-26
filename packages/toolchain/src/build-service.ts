/**
 * LocalBuildService: the real BuildService (C4) on Windows. Phases: load -> assets -> compile -> budgets -> runtime
 * -> pack (-> launch -> running for play). Output goes to <DSDUDE_HOME>\build\<project-hash>\ (PLAN.md 3.2), never
 * into the project:
 *   nitrofs\              the NitroFS root: game.dsdb (from the compiler), gfx\, bg\, soundbank.bin (packAssets)
 *   icon.png, cache\      packAssets' icon and conversion cache
 *   assets.manifest.json  packAssets' manifest after checkRoomBudgets
 *   game.nds              the ROM
 *   packrom.json          what packRom() found in the header (C14 fixtures/build/)
 *
 * The compiler and asset pipeline arrive injected (`deps`); without them a DSDude project builds only with both skip
 * flags (E641). A folder without project.json is a plain BlocksDS C project (samples/hello): it builds only with
 * skipCompile and skipAssets, packs <dir>\nitrofs\ and uses the folder name as the title.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { Diagnostic, LoadResult } from "@dsdude/project-format";
import { loadProject } from "@dsdude/project-format/node";
import type {
  BuildEvent,
  BuildPhase,
  BuildRequest,
  BuildResult,
  BuildRuntimeResult,
  BuildService,
  BuildServiceDeps,
  EmulatorHandle,
  EmulatorKind,
  EmulatorManager,
  LaunchOptions,
  PackRomOptions,
  PackRomResult,
  PlayResult,
  RomInfo,
  ToolchainStatus,
} from "./api.ts";
import { detectToolchain } from "./detect.ts";
import { ToolchainError, toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { LocalEmulatorManager } from "./emulator.ts";
import { dsdudeHome, MAX_TOOL_PATH, projectBuildDir, toolEnv, wonderfulLayout } from "./layout.ts";
import {
  DSDB_NAME,
  MANIFEST_JSON,
  provisionalManifest,
  readManifest,
  withDsdbSeed,
  writeManifest,
} from "./project-build.ts";
import { type PackRomDeps, packRom } from "./rom.ts";
import { type MakeOptions, runMake } from "./runtime.ts";

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
  /** Seams for createFakeToolchain() and tests; default the real packRom, runMake and project loader. */
  packRom?: (opts: PackRomOptions, deps: PackRomDeps) => Promise<PackRomResult>;
  make?: (opts: MakeOptions) => Promise<BuildRuntimeResult>;
  loadProject?: (dir: string) => Promise<LoadResult>;
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
    launch: LaunchOptions & { kind: EmulatorKind },
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
      const diagnostics = [...prior.diagnostics, ...(emulator.diagnostics ?? [])];
      emulator.onLine((line) => this.#emit({ phase: "running", progress: 1, diagnostics, log: [line], timings }));
      emulator.exited.then(() => {
        if (this.#running === emulator) this.#running = null;
      });
      return { ...prior, ndsPath, diagnostics, timings, emulator };
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
    const nitrofsDir = path.join(buildDir, "nitrofs");
    const manifestFile = path.join(buildDir, MANIFEST_JSON);
    const dsdbFile = path.join(nitrofsDir, DSDB_NAME);
    const deps = this.#opts.deps ?? null;
    const notWired = (what: string) => toolchainDiagnostic("E641", { what });

    try {
      const isProject = existsSync(path.join(projectDir, "project.json"));
      const project = await phase("load", 0.05, async () => {
        if (!existsSync(projectDir)) {
          diagnostics.push(toolchainDiagnostic("E607", { what: "The folder", path: projectDir }));
          return null;
        }
        if (buildDir.length + 40 >= MAX_TOOL_PATH) {
          diagnostics.push(toolchainDiagnostic("E606", { path: buildDir, length: buildDir.length }));
        }
        if (!isProject) {
          if (mode === "compileOnly" || !req.skipCompile || !req.skipAssets) {
            diagnostics.push(toolchainDiagnostic("E608", { dir: projectDir }));
          }
          return null;
        }
        const loaded = await (this.#opts.loadProject ?? loadProject)(projectDir);
        diagnostics.push(...loaded.diagnostics);
        if (mode === "compileOnly" ? !deps : !deps && !(req.skipCompile && req.skipAssets)) {
          diagnostics.push(notWired("Compiling a DSDude project"));
        }
        return loaded.project;
      });
      if (hasError(diagnostics)) return finish(false, null);

      if (mode === "compileOnly") {
        if (project === null || deps === null) return finish(false, null);
        const manifest = readManifest(manifestFile) ?? provisionalManifest(project);
        const compiled = await phase("compile", 0.8, async () => deps.compile(project, manifest));
        diagnostics.push(...compiled.diagnostics);
        if (!hasError(compiled.diagnostics)) {
          const budgets = await phase("budgets", 0.15, async () => deps.checkRoomBudgets(manifest, compiled.roomSets));
          diagnostics.push(...budgets.diagnostics);
        }
        return finish(!hasError(diagnostics), null);
      }

      const status = await (this.#opts.detect ?? (() => detectToolchain({ env: this.#opts.env })))();
      if (!status.installed) {
        diagnostics.push(...status.diagnostics);
        return finish(false, null);
      }

      if (project === null) {
        // A plain BlocksDS folder: its own nitrofs\ becomes the NitroFS root.
        await phase("assets", 0.3, async () => {
          const source = path.join(projectDir, "nitrofs");
          if (!existsSync(source)) {
            diagnostics.push(toolchainDiagnostic("E607", { what: "The NitroFS folder", path: source }));
            return;
          }
          rmSync(nitrofsDir, { recursive: true, force: true });
          mkdirSync(buildDir, { recursive: true });
          cpSync(source, nitrofsDir, { recursive: true });
        });
      } else {
        mkdirSync(nitrofsDir, { recursive: true });
        let manifest = await phase("assets", 0.15, async () => {
          if (req.skipAssets) {
            const saved = readManifest(manifestFile);
            if (saved === null) diagnostics.push(toolchainDiagnostic("E609", { dir: projectDir }));
            return saved;
          }
          if (deps === null) return null;
          const packed = await deps.packAssets(project, status.paths, buildDir);
          diagnostics.push(...packed.diagnostics);
          return packed.manifest;
        });
        if (hasError(diagnostics) || manifest === null) return finish(false, null);

        const roomSets = await phase("compile", 0.1, async () => {
          if (req.skipCompile) {
            if (!existsSync(dsdbFile)) diagnostics.push(toolchainDiagnostic("E609", { dir: projectDir }));
            else if (req.seed !== undefined) writeFileSync(dsdbFile, withDsdbSeed(readFileSync(dsdbFile), req.seed));
            return null;
          }
          if (deps === null || manifest === null) return null;
          const compiled = deps.compile(project, manifest);
          diagnostics.push(...compiled.diagnostics);
          if (!hasError(compiled.diagnostics)) {
            writeFileSync(dsdbFile, req.seed !== undefined ? withDsdbSeed(compiled.dsdb, req.seed) : compiled.dsdb);
          }
          return compiled.roomSets;
        });
        if (hasError(diagnostics)) return finish(false, null);

        await phase("budgets", 0.05, async () => {
          if (roomSets !== null && deps !== null && manifest !== null) {
            const checked = deps.checkRoomBudgets(manifest, roomSets);
            diagnostics.push(...checked.diagnostics);
            manifest = checked.manifest;
          }
          if (!req.skipAssets && manifest !== null) writeManifest(manifestFile, manifest);
        });
        if (hasError(diagnostics)) return finish(false, null);
      }
      if (hasError(diagnostics)) return finish(false, null);

      const arm9Elf = await phase("runtime", 0.45, async (log) => {
        if (req.runtime) {
          const elf = path.resolve(req.runtime);
          if (!existsSync(elf)) diagnostics.push(toolchainDiagnostic("E607", { what: "The runtime", path: elf }));
          return elf;
        }
        const built = await (this.#opts.make ?? runMake)({
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
        const meta = project?.project;
        const title = meta?.title ?? path.basename(projectDir);
        const icon = path.join(buildDir, "icon.png");
        const packed = await (this.#opts.packRom ?? packRom)(
          {
            arm9Elf,
            nitrofsDir,
            outNds: ndsPath,
            title,
            subtitle: meta ? meta.subtitle : "DSDude",
            author: meta ? meta.author : "DSDude",
            iconPng: meta && existsSync(icon) ? icon : null,
            gamecode: meta?.gamecode ?? "####",
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
