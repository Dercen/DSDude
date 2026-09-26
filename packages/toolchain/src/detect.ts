/** detectToolchain() (C4): which DS tools, emulators and Python this machine has. Never throws. */
import { lstatSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { Diagnostic } from "@dsdude/project-format";
import type { ToolchainStatus, ToolPaths } from "./api.ts";
import { toolchainDiagnostic } from "./diagnostics/catalog.ts";
import {
  BLOCKSDS_POSIX,
  DEFAULT_MSYS2_ROOT,
  desmumeExe,
  dsdudeHome,
  melonDsExe,
  parseBlocksdsVersion,
  pathKey,
  wonderfulLayout,
} from "./layout.ts";

export interface DetectOptions {
  platform?: NodeJS.Platform;
  /** Default DSDUDE_MSYS2 or C:\msys64. */
  msys2Root?: string;
  /** Default dsdudeHome(). */
  home?: string;
  env?: Record<string, string | undefined>;
  exists?: (p: string) => boolean;
  readText?: (p: string) => string | null;
}

/**
 * True when anything is at `p`. lstat, not existsSync: the Microsoft Store python.exe is an App Execution Alias
 * (a reparse point) that stat cannot follow, so existsSync reports it missing and PATH search would fall through
 * to MSYS2's python.
 */
export function existsOrAlias(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function readTextOrNull(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/** Finds `python.exe` on PATH (the Microsoft Store alias counts); null when absent. */
export function findOnPath(
  exe: string,
  env: Record<string, string | undefined>,
  exists: (p: string) => boolean,
): string | null {
  for (const dir of (env[pathKey(env)] ?? "").split(";")) {
    if (dir === "") continue;
    const candidate = path.win32.join(dir, exe);
    if (exists(candidate)) return candidate;
  }
  return null;
}

export async function detectToolchain(opts: DetectOptions = {}): Promise<ToolchainStatus> {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  if (platform !== "win32") {
    return {
      installed: false,
      blocksdsVersion: null,
      paths: {},
      diagnostics: [toolchainDiagnostic("E605", { what: "The DS toolchain" })],
    };
  }
  const exists = opts.exists ?? existsOrAlias;
  const readText = opts.readText ?? readTextOrNull;
  const layout = wonderfulLayout(opts.msys2Root ?? env.DSDUDE_MSYS2 ?? DEFAULT_MSYS2_ROOT);
  const home = opts.home ?? dsdudeHome(env);
  const diagnostics: Diagnostic[] = [];
  const paths: ToolPaths = {};

  if (exists(layout.bash)) paths.bash = layout.bash;
  else diagnostics.push(toolchainDiagnostic("E601", { tool: "MSYS2 bash", path: layout.bash }));

  if (!exists(layout.core)) {
    diagnostics.push(toolchainDiagnostic("E600", { dir: layout.wonderful }));
  } else {
    paths.wonderful = layout.wonderful;
    paths.blocksds = BLOCKSDS_POSIX;
    const required: [keyof ToolPaths, string, string][] = [
      ["ndstool", "ndstool", layout.ndstool],
      ["grit", "grit", layout.grit],
      ["mmutil", "mmutil", layout.mmutil],
      ["arm7Elf", "arm7_maxmod.elf", layout.arm7Elf],
      ["icon", "the default icon", layout.icon],
      ["gcc", "arm-none-eabi-gcc", layout.gcc],
    ];
    for (const [key, tool, p] of required) {
      if (exists(p)) paths[key] = p;
      else diagnostics.push(toolchainDiagnostic("E601", { tool, path: p }));
    }
  }

  const melon = melonDsExe(home);
  if (exists(melon)) paths.melonds = melon;
  const desmume = desmumeExe(home);
  if (exists(desmume)) paths.desmume = desmume;
  const python = findOnPath("python.exe", env, exists);
  if (python) paths.python = python;

  const versionText = readText(layout.versionFile);
  const installed = diagnostics.length === 0;
  return {
    installed,
    blocksdsVersion: installed && versionText !== null ? parseBlocksdsVersion(versionText) : null,
    paths,
    diagnostics,
  };
}
