/**
 * grit and mmutil behind ToolPaths (C3 sections 3-5; PLAN.md 2.9). Node side: spawns with windowsHide, a timeout
 * and the Wonderful bin first on PATH (its DLLs), like WS1's console tools. The runner is injectable so unit tests
 * mock grit and mmutil; the real-tool tests skip when ToolPaths is empty (cloud sessions).
 */
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import * as path from "node:path";
import type { Diagnostic } from "@dsdude/project-format";
import { type ToolPaths, toolchainDiagnostic, toolEnv, wonderfulLayout } from "@dsdude/toolchain";

/** What one tool run returned. `spawnError` is set when the process could not start at all. */
export interface ToolRun {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError: string | null;
}

export interface ToolRunOptions {
  cwd: string;
  env: Record<string, string>;
  timeoutMs: number;
}

/** Runs one console tool. The default spawns it; tests inject fakes. */
export type ToolRunner = (exe: string, args: readonly string[], opts: ToolRunOptions) => Promise<ToolRun>;

/** A grit run on one small image takes well under a second; this bounds a hung tool. */
export const GRIT_TIMEOUT_MS = 30_000;
/** mmutil converts every sound at once. */
export const MMUTIL_TIMEOUT_MS = 60_000;
/** `-V` answers at once. */
export const VERSION_TIMEOUT_MS = 20_000;
/** Windows exit code when a DLL the program imports is missing (STATUS_DLL_NOT_FOUND), as signed and unsigned. */
const EXIT_DLL_NOT_FOUND = 0xc0000135;
const EXIT_DLL_NOT_FOUND_SIGNED = EXIT_DLL_NOT_FOUND - 2 ** 32;
/** Output kept for diagnostics. */
const OUTPUT_TAIL_CHARS = 400;
const MS_PER_SECOND = 1000;

/** The real runner: spawn with windowsHide and a timeout (SIGKILL on expiry), capturing stdout and stderr. */
export const spawnTool: ToolRunner = (exe, args, opts) =>
  new Promise((resolve) => {
    const result: ToolRun = { exitCode: null, stdout: "", stderr: "", timedOut: false, spawnError: null };
    const child = spawn(exe, args, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
      timeout: opts.timeoutMs,
      killSignal: "SIGKILL",
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d: Buffer) => {
      result.stdout += d.toString("latin1");
    });
    child.stderr.on("data", (d: Buffer) => {
      result.stderr += d.toString("latin1");
    });
    child.on("error", (err) => {
      result.spawnError = err.message;
    });
    child.on("close", (code, signal) => {
      result.exitCode = code;
      result.timedOut = code === null && signal === "SIGKILL";
      resolve(result);
    });
  });

/** The environment console tools get: the Wonderful bin (from ToolPaths.wonderful when set) first on PATH. */
export function toolEnvironment(toolPaths: ToolPaths, base: Record<string, string | undefined> = process.env) {
  const layout = wonderfulLayout();
  const wonderfulBin =
    toolPaths.wonderful === undefined ? layout.wonderfulBin : path.win32.join(toolPaths.wonderful, "bin");
  return toolEnv(base, { ...layout, wonderfulBin });
}

/** The last characters of a run's output, for a diagnostic. */
function outputTail(run: ToolRun): string {
  const text = `${run.stdout}\n${run.stderr}`.trim();
  return text.length > OUTPUT_TAIL_CHARS ? `...${text.slice(-OUTPUT_TAIL_CHARS)}` : text || "no output";
}

/** E6xx diagnostics for a finished run (the toolchain catalog's codes, as WS1's own tools use them). */
export function runDiagnostics(tool: string, run: ToolRun, timeoutMs: number): Diagnostic[] {
  if (run.spawnError !== null) return [toolchainDiagnostic("E603", { tool, code: "none", detail: run.spawnError })];
  if (run.timedOut) return [toolchainDiagnostic("E604", { tool, seconds: Math.round(timeoutMs / MS_PER_SECOND) })];
  if (run.exitCode === EXIT_DLL_NOT_FOUND || run.exitCode === EXIT_DLL_NOT_FOUND_SIGNED) {
    return [toolchainDiagnostic("E602", { tool })];
  }
  if (run.exitCode !== 0) {
    return [toolchainDiagnostic("E603", { tool, code: String(run.exitCode), detail: outputTail(run) })];
  }
  return [];
}

/** Which tool is usable: its ToolPaths entry is set and the file exists. */
export type ToolState = { ok: true; exe: string } | { ok: false; diagnostic: Diagnostic };

/**
 * Checks one tool: unset in ToolPaths (e.g. a cloud session) is E605, set but missing is E601. `what` names the
 * work that needs it, for E605.
 */
export function checkTool(tool: "grit" | "mmutil", toolPaths: ToolPaths, what: string): ToolState {
  const exe = toolPaths[tool];
  if (exe === undefined) return { ok: false, diagnostic: toolchainDiagnostic("E605", { what }) };
  try {
    if (statSync(exe).isFile()) return { ok: true, exe };
  } catch {
    // Falls through to E601.
  }
  return { ok: false, diagnostic: toolchainDiagnostic("E601", { tool, path: exe }) };
}

/** A tool's identity for cache keys: path, size and modification time (cheap; `-V` runs only when it changes). */
export function toolStamp(exe: string): string {
  const s = statSync(exe);
  return `${exe}|${s.size}|${s.mtimeMs}`;
}

/** The first dotted version number in `<tool> -V` output, else its first line, else null. */
export function parseToolVersion(output: string): string | null {
  const version = /(\d+\.\d+(?:\.\d+)?)/.exec(output);
  if (version !== null) return version[1] as string;
  const first = output.trim().split(/\r?\n/)[0];
  return first === undefined || first === "" ? null : first;
}

// ---------------------------------------------------------------------------------------------------------
// Command lines (C3; verified with the shipped BlocksDS 1.24.0 tools, docs/research/verification.md claims 5, 9)

/**
 * grit for a sprite sheet: 8bpp, or 4bpp with a 16-entry palette; tiles only (-m!); GRF (-ftr); no header (-fh!);
 * magenta transparent. `outBase` is the output path without extension (grit appends .grf).
 */
export function gritSpriteArgs(pngPath: string, outBase: string, colorMode: "16" | "256"): string[] {
  const depth = colorMode === "16" ? ["-gB4", "-pn16"] : ["-gB8"];
  return [pngPath, ...depth, "-gt", "-gTFF00FF", "-m!", "-ftr", "-fh!", "-W1", "-o", outBase];
}

/** grit for a background: 8bpp tiles, screen-block map with tile + flip reduction (never -mRtpf on 8bpp). */
export function gritBackgroundArgs(pngPath: string, outBase: string): string[] {
  return [pngPath, "-gB8", "-gt", "-m", "-mLs", "-mRtf", "-gTFF00FF", "-ftr", "-fh!", "-W1", "-o", outBase];
}

/**
 * mmutil: effect WAVs sorted by name, then modules sorted by name (the caller sorts), dynamic-bank mode (-d), and
 * the two outputs with their option values attached (a space would make them inputs).
 */
export function mmutilArgs(
  effects: readonly string[],
  modules: readonly string[],
  bankPath: string,
  headerPath: string,
) {
  return [...effects, ...modules, "-d", `-o${bankPath}`, `-h${headerPath}`];
}
