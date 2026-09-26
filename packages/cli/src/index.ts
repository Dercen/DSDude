/**
 * @dsdude/cli: the `dsdude` composition root (C10). It collects the `cliCommands` each package exports (C4
 * `CliCommand`), so WS4 (`compile`) and WS5 (`assets`) never edit this package. It will inject compileProject,
 * packAssets and checkRoomBudgets into the toolchain's BuildService once they land (WS1 task 4).
 */
import type { CliCommand } from "@dsdude/toolchain";
import { cliCommands as toolchainCommands } from "@dsdude/toolchain";

export const packageName = "@dsdude/cli";

/** Packages whose `cliCommands` export is picked up when present (compiler: compile, gen-builtins; assets). */
const OPTIONAL_PACKAGES = ["@dsdude/compiler", "@dsdude/asset-pipeline", "@dsdude/dsdb"] as const;

async function optionalCommands(pkg: string): Promise<CliCommand[]> {
  const mod = (await import(pkg)) as { cliCommands?: CliCommand[] };
  return Array.isArray(mod.cliCommands) ? mod.cliCommands : [];
}

/** Every registered command; on a duplicate name the first one wins. */
export async function commandRegistry(
  sources: readonly (() => Promise<CliCommand[]>)[] = [
    async () => toolchainCommands,
    ...OPTIONAL_PACKAGES.map((p) => () => optionalCommands(p)),
  ],
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
