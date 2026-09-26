/**
 * `dsdude assets <project> [--json]` (C10), registered by packages/cli from this package's `cliCommands` export
 * (C4). It packs the project's assets into its build folder `<DSDUDE_HOME>/build/<project-hash>/` with the detected
 * tools. Exit codes: 0 ok, 1 project problems (E4xx, E29x), 2 tool or environment failure (E6xx; e.g. no grit or
 * mmutil, as in a cloud session). With --json, stdout holds exactly one JSON object; human text goes to stderr.
 */
import * as path from "node:path";
import { parseArgs } from "node:util";
import type { Diagnostic } from "@dsdude/project-format";
import { loadProject } from "@dsdude/project-format/node";
import {
  type CliCommand,
  detectToolchain,
  dsdudeHome,
  type ExitCode,
  exitCodeFor,
  formatDiagnostic,
  projectBuildDir,
  type ToolPaths,
} from "@dsdude/toolchain";
import type { AssetPackManifest } from "./manifest.ts";
import { MANIFEST_JSON, type PackOptions, packAssets } from "./pack/pack.ts";

/** Exit code for a usage mistake (bad flags or no project), as C10 counts it: an environment failure. */
const EXIT_USAGE: ExitCode = 2;
const USAGE = "usage: dsdude assets <project> [--json]";

/** Where the command writes; injectable for tests. */
export interface AssetsIo {
  out(text: string): void;
  err(text: string): void;
}

export interface AssetsCommandOptions {
  io?: AssetsIo;
  env?: Record<string, string | undefined>;
  /** ToolPaths to use instead of detectToolchain() (tests). */
  toolPaths?: ToolPaths;
  pack?: PackOptions;
}

const stdio: AssetsIo = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
};

/** A one-line summary of what was packed, for the human output. */
function summary(manifest: AssetPackManifest, buildDir: string): string {
  const count = (o: object) => Object.keys(o).length;
  const bank = manifest.soundbank === null ? "no soundbank" : `soundbank ${manifest.soundbank.bytes} bytes`;
  return (
    `assets: ${count(manifest.sprites)} sprites, ${count(manifest.backgrounds)} backgrounds, ` +
    `${count(manifest.sounds)} sounds, ${bank} -> ${buildDir}`
  );
}

/** Reads `<project> [--json]`; null for anything else. */
function parseCommandLine(argv: string[]): { json: boolean; dir: string } | null {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: { json: { type: "boolean" } },
      allowPositionals: true,
    });
    const dir = positionals[0];
    return dir === undefined || positionals.length > 1 ? null : { json: values.json ?? false, dir };
  } catch {
    return null;
  }
}

/** Builds the `assets` command. */
export function makeAssetsCommand(opts: AssetsCommandOptions = {}): CliCommand {
  const io = opts.io ?? stdio;
  return {
    name: "assets",
    summary: "assets <project> [--json]: pack sprites, backgrounds, sounds and the icon (C3)",
    async run(argv) {
      const args = parseCommandLine(argv);
      if (args === null) {
        io.err(USAGE);
        return EXIT_USAGE;
      }
      const { json, dir } = args;
      const env = opts.env ?? process.env;
      const projectDir = path.resolve(dir);
      const buildDir = projectBuildDir(projectDir, dsdudeHome(env));
      const loaded = await loadProject(projectDir);
      const diagnostics: Diagnostic[] = [...loaded.diagnostics];
      let manifest: AssetPackManifest | null = null;
      if (loaded.project !== null) {
        const toolPaths = opts.toolPaths ?? (await detectToolchain()).paths;
        const packed = await packAssets(loaded.project, toolPaths, buildDir, { env, ...opts.pack });
        manifest = packed.manifest;
        diagnostics.push(...packed.diagnostics);
      }
      const code = exitCodeFor(diagnostics);
      const manifestPath = manifest === null ? null : path.join(buildDir, MANIFEST_JSON);
      if (json) io.out(JSON.stringify({ ok: code === 0, diagnostics, buildDir, manifestPath, manifest }));
      for (const d of diagnostics) io.err(formatDiagnostic(d));
      if (!json && manifest !== null) io.err(summary(manifest, buildDir));
      return code;
    },
  };
}

/** The commands this package registers with `dsdude` (C4 CliCommand). */
export const cliCommands: CliCommand[] = [makeAssetsCommand()];
