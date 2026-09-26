/**
 * `dsdude screenshot` (C10): runs tools/screenshot.py (py-desmume 0.0.9) headless for N frames and returns the
 * top/bottom PNG paths. Python spawns with windowsHide, a timeout and the SDL dummy drivers (claim 10).
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Diagnostic } from "@dsdude/project-format";
import { toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { LineSplitter } from "./emulator.ts";
import { outputTail, runProcess } from "./process.ts";

/** tools/screenshot.py in the repo (packages/toolchain/src -> ../../../tools). */
export const SCREENSHOT_SCRIPT = fileURLToPath(new URL("../../../tools/screenshot.py", import.meta.url));

export interface ScreenshotOptions {
  rom: string;
  frames: number;
  keys?: string;
  out: string;
  /** python.exe; default "python" from PATH. */
  python?: string;
  script?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

export interface ScreenshotResult {
  ok: boolean;
  top: string | null;
  bottom: string | null;
  /** true when a screen is one solid colour (a hint that the ROM hung or drew nothing). */
  uniform: { top: boolean; bottom: boolean } | null;
  /** DSD| lines the ROM printed (pads dropped). */
  log: string[];
  diagnostics: Diagnostic[];
}

/** Startup plus a generous per-frame budget (py-desmume runs far faster than 60 fps). */
export function screenshotTimeoutMs(frames: number): number {
  return 60_000 + frames * 50;
}

export async function takeScreenshot(opts: ScreenshotOptions): Promise<ScreenshotResult> {
  const fail = (diagnostics: Diagnostic[], log: string[] = []): ScreenshotResult => ({
    ok: false,
    top: null,
    bottom: null,
    uniform: null,
    log,
    diagnostics,
  });
  if (!existsSync(opts.rom)) return fail([toolchainDiagnostic("E607", { what: "The ROM", path: opts.rom })]);
  const script = opts.script ?? SCREENSHOT_SCRIPT;
  const args = [script, path.resolve(opts.rom), "--frames", String(opts.frames), "--out", path.resolve(opts.out)];
  if (opts.keys) args.push("--keys", path.resolve(opts.keys));
  const resultFile = path.join(opts.out, "screenshot.json");
  rmSync(resultFile, { force: true });
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.env ?? process.env)) if (v !== undefined) env[k] = v;
  env.SDL_VIDEODRIVER = "dummy";
  env.SDL_AUDIODRIVER = "dummy";
  env.PYTHONIOENCODING = "utf-8";
  const timeoutMs = opts.timeoutMs ?? screenshotTimeoutMs(opts.frames);
  const run = await runProcess(opts.python ?? "python", args, { env, timeoutMs, windowsHide: true });
  const splitter = new LineSplitter();
  const log = [...splitter.push(run.stdout), ...splitter.end()].filter((l) => l.startsWith("DSD|"));
  if (run.spawnError !== null) return fail([toolchainDiagnostic("E630", { detail: run.spawnError })]);
  if (run.timedOut) {
    return fail([toolchainDiagnostic("E604", { tool: "py-desmume", seconds: Math.round(timeoutMs / 1000) })], log);
  }
  if (run.exitCode !== 0 || !existsSync(resultFile)) {
    const detail = outputTail({ stdout: "", stderr: run.stderr }, 2);
    const code = /py-desmume is not installed|No module named/.test(run.stderr) ? "E630" : "E631";
    return fail([toolchainDiagnostic(code, { rom: opts.rom, detail })], log);
  }
  const parsed = JSON.parse(readFileSync(resultFile, "utf8")) as {
    top: string;
    bottom: string;
    uniform: { top: boolean; bottom: boolean };
  };
  return { ok: true, top: parsed.top, bottom: parsed.bottom, uniform: parsed.uniform, log, diagnostics: [] };
}
