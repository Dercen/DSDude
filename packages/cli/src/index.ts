/**
 * @dsdude/cli: the `dsdude` composition root (C10). It collects the `cliCommands` each package exports (C4
 * `CliCommand`), so WS4 (`compile`) and WS5 (`assets`) never edit this package, and it injects WS4's
 * compileProject and WS5's packAssets and checkRoomBudgets into the toolchain's BuildService (C4: @dsdude/toolchain
 * never imports them). Until both packages export those functions, project builds report E605.
 */
import type { BuildServiceDeps, CheckRoomBudgetsFn, CliCommand, CompileFn, PackAssetsFn } from "@dsdude/toolchain";
import { makeCliCommands } from "@dsdude/toolchain";

export const packageName = "@dsdude/cli";

/** Packages whose `cliCommands` export is picked up when present (compiler: compile, gen-builtins; assets). */
const OPTIONAL_PACKAGES = ["@dsdude/compiler", "@dsdude/asset-pipeline", "@dsdude/dsdb"] as const;

export type ModuleLoader = (pkg: string) => Promise<Record<string, unknown>>;

const importModule: ModuleLoader = async (pkg) => (await import(pkg)) as Record<string, unknown>;

export interface ResolvedDeps {
  /** All three functions, or null while any is missing. */
  deps: BuildServiceDeps | null;
  /** The missing exports, e.g. "@dsdude/compiler compileProject". */
  missing: string[];
}

/** Looks up compileProject (WS4) and packAssets + checkRoomBudgets (WS5) as they land on main (C4). */
export async function resolveBuildDeps(load: ModuleLoader = importModule): Promise<ResolvedDeps> {
  const compiler = await load("@dsdude/compiler");
  const assets = await load("@dsdude/asset-pipeline");
  const found = {
    compile: compiler.compileProject,
    packAssets: assets.packAssets,
    checkRoomBudgets: assets.checkRoomBudgets,
  };
  const missing = [
    ...(typeof found.compile === "function" ? [] : ["@dsdude/compiler compileProject"]),
    ...(typeof found.packAssets === "function" ? [] : ["@dsdude/asset-pipeline packAssets"]),
    ...(typeof found.checkRoomBudgets === "function" ? [] : ["@dsdude/asset-pipeline checkRoomBudgets"]),
  ];
  if (missing.length > 0) return { deps: null, missing };
  return {
    deps: {
      compile: found.compile as CompileFn,
      packAssets: found.packAssets as PackAssetsFn,
      checkRoomBudgets: found.checkRoomBudgets as CheckRoomBudgetsFn,
    },
    missing,
  };
}

async function optionalCommands(pkg: string, load: ModuleLoader): Promise<CliCommand[]> {
  const mod = await load(pkg);
  return Array.isArray(mod.cliCommands) ? (mod.cliCommands as CliCommand[]) : [];
}

/** The default sources: the toolchain's commands (with whatever build deps exist), then the optional packages. */
export function defaultSources(load: ModuleLoader = importModule): (() => Promise<CliCommand[]>)[] {
  return [
    async () => makeCliCommands({ deps: (await resolveBuildDeps(load)).deps }),
    ...OPTIONAL_PACKAGES.map((p) => () => optionalCommands(p, load)),
  ];
}

/** Every registered command; on a duplicate name the first one wins. */
export async function commandRegistry(
  sources: readonly (() => Promise<CliCommand[]>)[] = defaultSources(),
): Promise<CliCommand[]> {
  const seen = new Set<string>();
  const out: CliCommand[] = [];
  for (const source of sources) {
    for (const cmd of await source()) {
      if (seen.has(cmd.name)) continue;
      seen.add(cmd.name);
      out.push(cmd);
    }
  }
  return out;
}

export function formatHelp(commands: readonly CliCommand[]): string {
  const width = Math.max(...commands.map((c) => c.name.length), 4);
  return [
    "usage: dsdude <command> [args]   (exit codes: 0 ok, 1 project errors, 2 tool or environment failure)",
    "",
    ...commands.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`),
  ].join("\n");
}
