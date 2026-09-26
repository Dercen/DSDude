/**
 * Where the DS tools, emulators and build folders live, and the environment their processes get (PLAN.md 3.2,
 * 6 WS1). Pure functions: no file access, so they work (and are tested) on Linux too. Windows paths are built with
 * path.win32 so the result does not depend on the host.
 */
import { createHash } from "node:crypto";
import * as path from "node:path";

const win = path.win32;

export const DEFAULT_MSYS2_ROOT = "C:\\msys64";
/** POSIX path of the BlocksDS core inside MSYS2 (BLOCKSDS). */
export const BLOCKSDS_POSIX = "/opt/wonderful/thirdparty/blocksds/core";
export const BLOCKSDSEXT_POSIX = "/opt/wonderful/thirdparty/blocksds/external";
export const WONDERFUL_POSIX = "/opt/wonderful";
/** Build paths must stay under this length (ndstool, grit and mmutil fail on longer ones). */
export const MAX_TOOL_PATH = 250;

export const MELONDS_DIR = "melonDS-1.1";
export const MELONDS_EXE = "melonDS.exe";
export const DESMUME_DIR = "desmume-0.9.13";
export const DESMUME_EXE = "DeSmuME_0.9.13_x64.exe";

/** Every tool location that follows from the MSYS2 root. */
export interface WonderfulLayout {
  msys2: string;
  bash: string;
  wonderful: string;
  wonderfulBin: string;
  wfConfig: string;
  core: string;
  versionFile: string;
  ndstool: string;
  grit: string;
  mmutil: string;
  arm7Elf: string;
  icon: string;
  gcc: string;
}

export function wonderfulLayout(msys2Root: string = DEFAULT_MSYS2_ROOT): WonderfulLayout {
  const wonderful = win.join(msys2Root, "opt", "wonderful");
  const core = win.join(wonderful, "thirdparty", "blocksds", "core");
  const tool = (name: string) => win.join(core, "tools", name, `${name}.exe`);
  return {
    msys2: msys2Root,
    bash: win.join(msys2Root, "usr", "bin", "bash.exe"),
    wonderful,
    wonderfulBin: win.join(wonderful, "bin"),
    wfConfig: win.join(wonderful, "bin", "wf-config"),
    core,
    versionFile: win.join(core, "version.txt"),
    ndstool: tool("ndstool"),
    grit: tool("grit"),
    mmutil: tool("mmutil"),
    arm7Elf: win.join(core, "sys", "arm7", "main_core", "arm7_maxmod.elf"),
    icon: win.join(core, "sys", "icon.bmp"),
    gcc: win.join(wonderful, "toolchain", "gcc-arm-none-eabi", "bin", "arm-none-eabi-gcc.exe"),
  };
}

type Env = Record<string, string | undefined>;

/** The env key that holds PATH, matched case-insensitively (Windows uses "Path"); "PATH" when there is none. */
export function pathKey(env: Env): string {
  return Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
}

/** A copy of `env` with `dir` first on PATH (removed from later positions, so repeated calls don't grow PATH). */
export function withPathPrefix(env: Env, dir: string): Record<string, string> {
  const key = pathKey(env);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && (k.toUpperCase() !== "PATH" || k === key)) out[k] = v;
  }
  const rest = (out[key] ?? "").split(";").filter((p) => p !== "" && p.toLowerCase() !== dir.toLowerCase());
  out[key] = [dir, ...rest].join(";");
  return out;
}

/** Environment for console tools (ndstool, grit, mmutil): their runtime DLLs live in the Wonderful bin folder. */
export function toolEnv(base: Env, layout: WonderfulLayout): Record<string, string> {
  return withPathPrefix(base, layout.wonderfulBin);
}

/**
 * Environment for `bash.exe -lc` (make, wf-pacman). CHERE_INVOKING=1 keeps the working directory when SHLVL is
 * unset, as under Electron (verification.md claim 2); BLOCKSDS stays a POSIX path, which MSYS2 converts for gcc.
 */
export function bashEnv(base: Env, layout: WonderfulLayout): Record<string, string> {
  return {
    ...toolEnv(base, layout),
    MSYSTEM: "UCRT64",
    MSYS2_PATH_TYPE: "inherit",
    CHERE_INVOKING: "1",
    BLOCKSDS: BLOCKSDS_POSIX,
    BLOCKSDSEXT: BLOCKSDSEXT_POSIX,
    WONDERFUL_TOOLCHAIN: WONDERFUL_POSIX,
  };
}

/**
 * DSDUDE_HOME: the per-worktree `.dsdude` folder in development, else %LOCALAPPDATA%\DSDude, else ~/.dsdude.
 */
export function dsdudeHome(env: Env = process.env): string {
  if (env.DSDUDE_HOME) return env.DSDUDE_HOME;
  if (env.LOCALAPPDATA) return win.join(env.LOCALAPPDATA, "DSDude");
  return path.join(env.HOME ?? env.USERPROFILE ?? ".", ".dsdude");
}

/** First 16 hex digits of the SHA-256 of the lower-cased absolute project path (PLAN.md 3.2). */
export function projectHash(projectDir: string): string {
  return createHash("sha256").update(path.resolve(projectDir).toLowerCase()).digest("hex").slice(0, 16);
}

/** <DSDUDE_HOME>\build\<project-hash>: the project's build folder, never inside the project. */
export function projectBuildDir(projectDir: string, home: string): string {
  return path.join(home, "build", projectHash(projectDir));
}

export function emulatorsDir(home: string): string {
  return path.join(home, "emulators");
}

export function melonDsExe(home: string): string {
  return path.join(emulatorsDir(home), MELONDS_DIR, MELONDS_EXE);
}

export function desmumeExe(home: string): string {
  return path.join(emulatorsDir(home), DESMUME_DIR, DESMUME_EXE);
}

/** "v1.24.0-dirty\n" -> "1.24.0"; null when the text holds no version. */
export function parseBlocksdsVersion(text: string): string | null {
  const m = /v?(\d+\.\d+\.\d+)/.exec(text);
  return m ? (m[1] ?? null) : null;
}
