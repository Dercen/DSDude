/**
 * `dsdude doctor` (C10; PLAN.md 6 WS1): checks every prerequisite and names the exact fix. It reports a tool's exit
 * 0xC0000135 as a missing DLL, warns about build paths near 250 characters, and warns when OneDrive.exe runs while
 * the repo or project is under %OneDrive% (risk 10). It never changes anything.
 */
import * as path from "node:path";
import type { Diagnostic } from "@dsdude/project-format";
import type { ToolchainStatus, ToolRunResult } from "./api.ts";
import { detectToolchain } from "./detect.ts";
import { toolchainDiagnostic } from "./diagnostics/catalog.ts";
import {
  desmumeExe,
  dsdudeHome,
  MAX_TOOL_PATH,
  melonDsExe,
  projectBuildDir,
  toolEnv,
  wonderfulLayout,
} from "./layout.ts";
import { runProcess } from "./process.ts";
import { runTool } from "./tools.ts";

export interface DoctorCheck {
  name: string;
  status: "ok" | "warn" | "fail" | "info";
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
  diagnostics: Diagnostic[];
}

export interface DoctorOptions {
  env?: Record<string, string | undefined>;
  /** Paths to check for length and OneDrive: the repo (cwd) and, if given, a project. */
  cwd?: string;
  project?: string;
  platform?: NodeJS.Platform;
  detect?: () => Promise<ToolchainStatus>;
  /** Runs `<tool> -V`; default runTool with the tool env. */
  runVersion?: (tool: string, exe: string) => Promise<ToolRunResult>;
  /** Runs python to import desmume; resolves to the error text, or null when it imports. */
  checkPyDesmume?: (python: string) => Promise<string | null>;
  /** Whether a process image is running (OneDrive.exe). */
  isRunning?: (image: string) => Promise<boolean>;
  exists?: (p: string) => boolean;
}

const defaultRunVersion = (env: Record<string, string | undefined>) => (tool: string, exe: string) =>
  runTool(tool, exe, ["-V"], { env: toolEnv(env, wonderfulLayout()), timeoutMs: 20_000 });

const defaultCheckPyDesmume = (env: Record<string, string | undefined>) => async (python: string) => {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined) clean[k] = v;
  const run = await runProcess(python, ["-c", "import desmume.emulator"], {
    env: { ...clean, SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy" },
    timeoutMs: 30_000,
    windowsHide: true,
  });
  if (run.spawnError !== null) return run.spawnError;
  if (run.timedOut) return "python did not answer within 30 seconds";
  return run.exitCode === 0 ? null : (run.stderr.trim().split(/\r?\n/).at(-1) ?? `exit ${run.exitCode}`);
};

const defaultIsRunning = (env: Record<string, string | undefined>) => async (image: string) => {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) if (v !== undefined) clean[k] = v;
  const run = await runProcess("tasklist.exe", ["/FI", `IMAGENAME eq ${image}`, "/FO", "CSV", "/NH"], {
    env: clean,
    timeoutMs: 15_000,
    windowsHide: true,
  });
  return run.stdout.toLowerCase().includes(`"${image.toLowerCase()}"`);
};

/** The OneDrive roots from the environment (personal and business). */
export function oneDriveRoots(env: Record<string, string | undefined>): string[] {
  return [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter(
    (p): p is string => typeof p === "string" && p !== "",
  );
}

export function isUnder(child: string, parent: string): boolean {
  const c = path.win32.resolve(child).toLowerCase();
  const p = path.win32.resolve(parent).toLowerCase().replace(/\\+$/, "");
  return c === p || c.startsWith(`${p}\\`);
}

export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorReport> {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const checks: DoctorCheck[] = [];
  const diagnostics: Diagnostic[] = [];
  const add = (name: string, status: DoctorCheck["status"], detail: string, d?: Diagnostic) => {
    checks.push({ name, status, detail });
    if (d) diagnostics.push(d);
  };

  if (platform !== "win32") {
    const d = toolchainDiagnostic("E605", { what: "The DS tools, emulators and screenshots" });
    add("platform", "fail", d.message, d);
    return { ok: false, checks, diagnostics };
  }

  // 1. BlocksDS tools, each run once so a missing DLL (0xC0000135) shows up as E602.
  const status = await (opts.detect ?? (() => detectToolchain({ env })))();
  if (!status.installed) {
    for (const d of status.diagnostics) add("BlocksDS", "fail", `${d.message} ${d.hint ?? ""}`.trim(), d);
  } else {
    add("BlocksDS", "ok", `${status.blocksdsVersion} in ${status.paths.wonderful}`);
    const runVersion = opts.runVersion ?? defaultRunVersion(env);
    for (const tool of ["ndstool", "grit", "mmutil"] as const) {
      const exe = status.paths[tool];
      if (!exe) continue;
      const run = await runVersion(tool, exe);
      const d = run.diagnostics[0];
      if (d) add(tool, "fail", `${d.message} ${d.hint ?? ""}`.trim(), d);
      else add(tool, "ok", (run.stdout.split(/\r?\n/)[0] ?? "").trim());
    }
  }

  // 2. Emulators under DSDUDE_HOME.
  const home = dsdudeHome(env);
  const exists = opts.exists ?? ((p: string) => status.paths.melonds === p || status.paths.desmume === p);
  const melon = melonDsExe(home);
  if (exists(melon)) add("melonDS", "ok", melon);
  else {
    const d = toolchainDiagnostic("E620", { emulator: "melonDS 1.1", path: melon, kind: "melonds" });
    add("melonDS", "fail", `${d.message} Fix: dsdude emulator install melonds`, d);
  }
  const desmume = desmumeExe(home);
  add(
    "DeSmuME",
    exists(desmume) ? "ok" : "info",
    exists(desmume) ? desmume : "not installed (optional profile): dsdude emulator install desmume",
  );

  // 3. Python with py-desmume, for dsdude screenshot.
  if (!status.paths.python) {
    const d = toolchainDiagnostic("E630", { detail: "python.exe is not on PATH" });
    add("py-desmume", "fail", `${d.message} ${d.hint}`, d);
  } else {
    const error = await (opts.checkPyDesmume ?? defaultCheckPyDesmume(env))(status.paths.python);
    if (error === null) add("py-desmume", "ok", `importable from ${status.paths.python}`);
    else {
      const d = toolchainDiagnostic("E630", { detail: error });
      add("py-desmume", "fail", `${d.message} ${d.hint}`, d);
    }
  }

  // 4. Path lengths: the build folder plus the longest file name inside it must stay under 250.
  const places = [opts.cwd ?? process.cwd(), ...(opts.project ? [opts.project] : [])];
  for (const place of places) {
    const buildDir = projectBuildDir(place, home);
    if (buildDir.length + 40 >= MAX_TOOL_PATH) {
      const d = toolchainDiagnostic("E651", { path: buildDir, length: buildDir.length });
      add("path length", "warn", d.message, d);
    }
  }
  if (!checks.some((c) => c.name === "path length"))
    add("path length", "ok", `build folders under ${home} are short enough`);

  // 5. OneDrive (risk 10): only a problem while OneDrive.exe runs.
  const roots = oneDriveRoots(env);
  const synced = [...places, home].filter((p) => roots.some((r) => isUnder(p, r)));
  if (synced.length === 0) add("OneDrive", "ok", "nothing under a OneDrive folder");
  else if (await (opts.isRunning ?? defaultIsRunning(env))("OneDrive.exe")) {
    for (const p of synced) {
      const d = toolchainDiagnostic("E650", { path: p });
      add("OneDrive", "warn", d.message, d);
    }
  } else add("OneDrive", "ok", `${synced[0]} is under OneDrive, but OneDrive.exe is not running`);

  return { ok: !diagnostics.some((d) => d.severity === "error"), checks, diagnostics };
}
