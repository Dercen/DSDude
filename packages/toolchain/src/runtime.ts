/**
 * buildRuntime() (C4; PLAN.md 6 WS1): `bash.exe -lc 'make -jN'` in a BlocksDS rom_arm9 folder (runtime/ or
 * samples/hello), with the Wonderful env. -l is required (make needs /usr/bin and msys-2.0.dll); CHERE_INVOKING=1
 * keeps the cwd when SHLVL is unset, as under Electron.
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import type { BuildRuntimeOptions, BuildRuntimeResult, ToolPaths } from "./api.ts";
import { toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { bashEnv, type WonderfulLayout, wonderfulLayout } from "./layout.ts";
import { outputTail, runProcess } from "./process.ts";

export const DEFAULT_JOBS = 8;
export const DEFAULT_MAKE_TIMEOUT_MS = 10 * 60_000;

/** --jobs, else DSDUDE_MAKE_JOBS, else 8. */
export function resolveJobs(jobs: number | undefined, env: Record<string, string | undefined> = process.env): number {
  if (jobs !== undefined && Number.isInteger(jobs) && jobs > 0) return jobs;
  const fromEnv = Number(env.DSDUDE_MAKE_JOBS);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_JOBS;
}

export interface MakeOptions extends BuildRuntimeOptions {
  /** The folder holding the Makefile. */
  dir: string;
  /** The ELF the build must produce, relative to `dir` (runtime: dist/arm9.elf). */
  elf: string;
  paths: ToolPaths;
  /** Default wonderfulLayout() (C:\msys64). */
  layout?: WonderfulLayout;
  /** Base environment; default process.env. */
  env?: Record<string, string | undefined>;
  onOutput?: (text: string) => void;
  signal?: AbortSignal;
}

export async function runMake(opts: MakeOptions): Promise<BuildRuntimeResult> {
  if (!opts.paths.bash || !opts.paths.gcc) {
    return {
      ok: false,
      arm9Elf: null,
      diagnostics: [toolchainDiagnostic("E600", { dir: opts.paths.wonderful ?? "C:\\msys64\\opt\\wonderful" })],
    };
  }
  const layout = opts.layout ?? wonderfulLayout();
  const jobs = resolveJobs(opts.jobs, opts.env ?? process.env);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_MAKE_TIMEOUT_MS;
  const run = await runProcess(opts.paths.bash, ["-lc", `make -j${jobs}`], {
    cwd: opts.dir,
    env: bashEnv(opts.env ?? process.env, layout),
    timeoutMs,
    windowsHide: true,
    onOutput: opts.onOutput,
    signal: opts.signal,
  });
  const elf = path.join(opts.dir, opts.elf);
  if (run.timedOut) {
    return {
      ok: false,
      arm9Elf: null,
      diagnostics: [toolchainDiagnostic("E604", { tool: "make", seconds: Math.round(timeoutMs / 1000) })],
    };
  }
  if (run.cancelled) return { ok: false, arm9Elf: null, diagnostics: [] };
  if (run.exitCode !== 0 || !existsSync(elf)) {
    const detail = run.exitCode === 0 ? `${elf} was not made` : (run.spawnError ?? outputTail(run, 5));
    return {
      ok: false,
      arm9Elf: null,
      diagnostics: [toolchainDiagnostic("E640", { dir: opts.dir, code: String(run.exitCode), detail })],
    };
  }
  return { ok: true, arm9Elf: elf, diagnostics: [] };
}

/** Builds runtime/ into runtime/dist/arm9.elf (the C8 runtime artifact, WS3's Makefile). */
export function buildRuntime(
  opts: BuildRuntimeOptions & Omit<MakeOptions, "dir" | "elf"> & { runtimeDir: string },
): Promise<BuildRuntimeResult> {
  return runMake({ ...opts, dir: opts.runtimeDir, elf: path.join("dist", "arm9.elf") });
}
