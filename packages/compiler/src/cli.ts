/**
 * The compiler's `dsdude` commands (C10, contracts/cli.md): `dsdude compile <project> [-o <file.dsdb>] [--seed N]
 * [--json]`. packages/cli registers them from `cliCommands`.
 *
 * This module is reachable from the Worker-safe package index, so every Node API and the Node-only packages
 * (`@dsdude/toolchain`, `@dsdude/project-format/node`) are imported dynamically inside `run`, never at the top.
 */
import type { Diagnostic } from "@dsdude/project-format";
import type { AssetManifest, CliCommand, ExitCode } from "@dsdude/toolchain";
import { compileProjectModule, GAME_OPTIONS } from "./project.ts";

/** Where output goes; tests inject their own. */
export interface CompilerCliIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

export interface CompilerCliOptions {
  io?: CompilerCliIo;
  /** Environment for DSDUDE_HOME (the default output folder); defaults to process.env. */
  env?: Record<string, string | undefined>;
}

/** The DSDB's name in the NitroFS root (C3). */
const DSDB_NAME = "game.dsdb";
/** The asset pipeline's manifest in the build folder (PLAN.md 3.2 step 4), read when present. */
const MANIFEST_NAME = "assets.manifest.json";
/** The manifest used when no assets have been packed yet (C4, provisional until C3). */
const EMPTY_MANIFEST: AssetManifest = { provisional: true, sprites: {}, backgrounds: {}, sounds: {} };
/** The one-line usage shown for wrong arguments (exit 2). */
const USAGE = "usage: dsdude compile <project> [-o <file.dsdb>] [--seed N] [--json]";

/** Builds the compiler's commands. */
export function makeCompilerCliCommands(opts: CompilerCliOptions = {}): CliCommand[] {
  const io: CompilerCliIo = opts.io ?? {
    out: (t) => process.stdout.write(`${t}\n`),
    err: (t) => process.stderr.write(`${t}\n`),
  };
  return [
    {
      name: "compile",
      summary: "compile <project> [-o file.dsdb] [--seed N] [--json]: check the code and write the DSDB",
      run: (argv) => runCompile(argv, io, opts.env ?? process.env),
    },
  ];
}

/** The commands packages/cli registers. */
export const cliCommands: CliCommand[] = makeCompilerCliCommands();

async function runCompile(
  argv: string[],
  io: CompilerCliIo,
  env: Record<string, string | undefined>,
): Promise<ExitCode> {
  const { parseArgs } = await import("node:util");
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const { formatDiagnostic, exitCodeFor, dsdudeHome, projectBuildDir } = await import("@dsdude/toolchain");
  const { loadProject } = await import("@dsdude/project-format/node");

  let values: { output?: string; seed?: string; json?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { output: { type: "string", short: "o" }, seed: { type: "string" }, json: { type: "boolean" } },
    }));
  } catch (err) {
    io.err(`dsdude compile: ${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  const seed = values.seed === undefined ? 0 : Number(values.seed);
  if (positionals.length !== 1 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    io.err(USAGE);
    return 2;
  }
  const json = values.json === true;
  const projectDir = path.resolve(positionals[0] as string);
  const buildDir = projectBuildDir(projectDir, dsdudeHome(env));
  const output = path.resolve(values.output ?? path.join(buildDir, "nitrofs", DSDB_NAME));

  /** Prints the diagnostics (stderr) and, with --json, the one result object (stdout). */
  const finish = (diagnostics: Diagnostic[], fields: Record<string, unknown>): ExitCode => {
    const code = exitCodeFor(diagnostics);
    if (json) io.out(JSON.stringify({ ok: code === 0, diagnostics, ...fields }));
    for (const d of diagnostics) io.err(formatDiagnostic(d));
    return code;
  };

  const started = performance.now();
  const loaded = await loadProject(projectDir);
  if (loaded.project === null || loaded.diagnostics.some((d) => d.severity === "error"))
    return finish(loaded.diagnostics, { output: null });

  let manifest = EMPTY_MANIFEST;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(buildDir, MANIFEST_NAME), "utf8")) as AssetManifest;
  } catch {
    // No packed assets yet: compile against the empty manifest (sprite.json frame counts, sound id 0).
  }
  const result = compileProjectModule(loaded.project, manifest, { ...GAME_OPTIONS, seed });
  const diagnostics = [...loaded.diagnostics, ...result.diagnostics];
  if (result.module === null) return finish(diagnostics, { output: null });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, result.dsdb);
  const ms = Math.round(performance.now() - started);
  if (!json) io.err(`wrote ${output} (${result.dsdb.length} bytes) in ${ms} ms`);
  return finish(diagnostics, { output, bytes: result.dsdb.length, roomSets: result.roomSets, ms });
}
