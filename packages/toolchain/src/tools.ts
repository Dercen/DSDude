/** Console tools (ndstool, grit, mmutil): windowsHide, a timeout, the Wonderful bin first on PATH, E6xx on failure. */
import type { Diagnostic } from "@dsdude/project-format";
import type { ToolRunResult } from "./api.ts";
import { toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { EXIT_DLL_NOT_FOUND, outputTail, type RunResult, runProcess } from "./process.ts";

export const DEFAULT_TOOL_TIMEOUT_MS = 60_000;

/** The diagnostics a finished tool run deserves: none when it exited 0. */
export function toolRunDiagnostics(tool: string, run: RunResult, timeoutMs: number): Diagnostic[] {
  if (run.spawnError !== null) return [toolchainDiagnostic("E603", { tool, code: "none", detail: run.spawnError })];
  if (run.timedOut) return [toolchainDiagnostic("E604", { tool, seconds: Math.round(timeoutMs / 1000) })];
  if (run.exitCode === EXIT_DLL_NOT_FOUND || run.exitCode === EXIT_DLL_NOT_FOUND - 2 ** 32) {
    return [toolchainDiagnostic("E602", { tool })];
  }
  if (run.exitCode !== 0) {
    return [toolchainDiagnostic("E603", { tool, code: String(run.exitCode), detail: outputTail(run) })];
  }
  return [];
}

export interface RunToolOptions {
  cwd?: string;
  timeoutMs?: number;
  env: Record<string, string>;
  signal?: AbortSignal;
}

export async function runTool(
  tool: string,
  exe: string,
  args: readonly string[],
  opts: RunToolOptions,
): Promise<ToolRunResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const run = await runProcess(exe, args, {
    cwd: opts.cwd,
    env: opts.env,
    timeoutMs,
    windowsHide: true,
    signal: opts.signal,
  });
  return {
    exitCode: run.exitCode,
    stdout: run.stdout,
    stderr: run.stderr,
    timedOut: run.timedOut,
    diagnostics: toolRunDiagnostics(tool, run, timeoutMs),
  };
}
