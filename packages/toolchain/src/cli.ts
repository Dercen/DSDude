/**
 * The toolchain's `dsdude` commands (C10, contracts/cli.md): toolchain, emulator, build, play, screenshot.
 * packages/cli registers them from `cliCommands`. With --json, stdout holds exactly one JSON object with `ok` and
 * `diagnostics`; human text goes to stderr (except `play`'s live DSD| lines, which go to stdout without --json).
 */
import { existsSync } from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import type { Diagnostic } from "@dsdude/project-format";
import type { BuildServiceDeps, CliCommand, EmulatorKind, ExitCode } from "./api.ts";
import { LocalBuildService } from "./build-service.ts";
import { detectToolchain } from "./detect.ts";
import { ToolchainError, toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { LocalEmulatorManager } from "./emulator.ts";
import { dsdudeHome } from "./layout.ts";
import { takeScreenshot } from "./screenshot.ts";

/** Where `dsdude emulator install desmume` copies DeSmuME from on this machine (PLAN.md 2.6). */
export const DEFAULT_DESMUME_SOURCE = path.win32.join(
  process.env.USERPROFILE ?? "C:\\Users\\Default",
  "Downloads",
  "desmume-0.9.13-win64",
);

export interface CliIo {
  out: (text: string) => void;
  err: (text: string) => void;
}

const stdio: CliIo = {
  out: (t) => process.stdout.write(`${t}\n`),
  err: (t) => process.stderr.write(`${t}\n`),
};

/** 0 when nothing failed; 2 when a tool or the environment failed (any E6xx); 1 for the project's own errors. */
export function exitCodeFor(diagnostics: readonly Diagnostic[]): ExitCode {
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length === 0) return 0;
  return errors.some((d) => d.source === "toolchain") ? 2 : 1;
}

export function formatDiagnostic(d: Diagnostic): string {
  const where = d.file ? `${d.file}${d.line ? `:${d.line}${d.col ? `:${d.col}` : ""}` : ""}: ` : "";
  return `${where}${d.severity}: ${d.message}${d.hint ? `\n  ${d.hint}` : ""} (${d.code})`;
}

function report(io: CliIo, json: boolean, fields: Record<string, unknown>, diagnostics: Diagnostic[]): ExitCode {
  const code = exitCodeFor(diagnostics);
  if (json) io.out(JSON.stringify({ ok: code === 0, diagnostics, ...fields }));
  for (const d of diagnostics) io.err(formatDiagnostic(d));
  return code;
}

function usage(io: CliIo, text: string): ExitCode {
  io.err(text);
  return 2;
}

function positiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0)
    throw new ToolchainError([
      toolchainDiagnostic("E603", {
        tool: "dsdude",
        code: "2",
        detail: `${name} must be a whole number, not '${value}'`,
      }),
    ]);
  return n;
}

function emulatorKind(value: string | undefined): EmulatorKind {
  if (value === undefined || value === "melonds") return "melonds";
  if (value === "desmume") return "desmume";
  throw new ToolchainError([
    toolchainDiagnostic("E603", {
      tool: "dsdude",
      code: "2",
      detail: `--emulator must be melonds or desmume, not '${value}'`,
    }),
  ]);
}

export interface ToolchainCliOptions {
  io?: CliIo;
  /** Injected by the composition root (packages/cli); null until WS4/WS5 land. */
  deps?: BuildServiceDeps | null;
  env?: Record<string, string | undefined>;
}

const BUILD_OPTIONS = {
  runtime: { type: "string" },
  "skip-compile": { type: "boolean" },
  "skip-assets": { type: "boolean" },
  jobs: { type: "string" },
  seed: { type: "string" },
  json: { type: "boolean" },
} as const;

export function makeCliCommands(opts: ToolchainCliOptions = {}): CliCommand[] {
  const io = opts.io ?? stdio;
  const env = opts.env ?? process.env;
  const home = () => dsdudeHome(env);
  const service = () => new LocalBuildService({ home: home(), deps: opts.deps ?? null, env });

  const guard =
    (run: (argv: string[]) => Promise<ExitCode>) =>
    async (argv: string[]): Promise<ExitCode> => {
      try {
        return await run(argv);
      } catch (err) {
        if (err instanceof ToolchainError) return report(io, argv.includes("--json"), {}, err.diagnostics);
        if (err instanceof TypeError && "code" in err && String(err.code).startsWith("ERR_PARSE_ARGS")) {
          return usage(io, `dsdude: ${err.message}`);
        }
        throw err;
      }
    };

  const toolchain: CliCommand = {
    name: "toolchain",
    summary: "toolchain status [--json]: which DS tools are installed and where",
    run: guard(async (argv) => {
      const { values, positionals } = parseArgs({
        args: argv,
        options: { json: { type: "boolean" } },
        allowPositionals: true,
      });
      const sub = positionals[0] ?? "status";
      if (sub === "install") {
        return usage(
          io,
          "dsdude toolchain install: run scripts/install-toolchain.ps1 (installToolchain() is not in the CLI yet)",
        );
      }
      if (sub !== "status") return usage(io, "usage: dsdude toolchain status|install [--json]");
      const status = await detectToolchain({ env, home: home() });
      if (!values.json) {
        io.err(status.installed ? `BlocksDS ${status.blocksdsVersion} installed` : "BlocksDS not installed");
        for (const [k, v] of Object.entries(status.paths)) io.err(`  ${k}: ${v}`);
      }
      return report(
        io,
        values.json ?? false,
        { installed: status.installed, blocksdsVersion: status.blocksdsVersion, paths: status.paths },
        status.diagnostics,
      );
    }),
  };

  const emulator: CliCommand = {
    name: "emulator",
    summary: "emulator install|status <melonds|desmume> [--json]: the emulator under DSDUDE_HOME",
    run: guard(async (argv) => {
      const { values, positionals } = parseArgs({
        args: argv,
        options: { json: { type: "boolean" } },
        allowPositionals: true,
      });
      const [sub, kindArg] = positionals;
      if ((sub !== "install" && sub !== "status") || kindArg === undefined) {
        return usage(io, "usage: dsdude emulator install|status <melonds|desmume> [--json]");
      }
      const kind = emulatorKind(kindArg);
      const manager = new LocalEmulatorManager({ home: home(), desmumeSource: DEFAULT_DESMUME_SOURCE });
      const exe = sub === "install" ? await manager.ensureInstalled(kind) : manager.exePath(kind);
      if (sub === "status") {
        const installed = existsSync(exe);
        if (!values.json) io.err(`${kind}: ${installed ? exe : "not installed"}`);
        return report(
          io,
          values.json ?? false,
          { kind, installed, exe },
          installed ? [] : [toolchainDiagnostic("E620", { emulator: kind, path: exe, kind })],
        );
      }
      if (!values.json) io.err(`${kind}: ${exe}`);
      return report(io, values.json ?? false, { kind, installed: true, exe }, []);
    }),
  };

  const build: CliCommand = {
    name: "build",
    summary: "build <project> [--runtime elf] [--skip-compile] [--skip-assets] [--jobs N] [--json]: make the .nds",
    run: guard(async (argv) => {
      const { values, positionals } = parseArgs({ args: argv, options: BUILD_OPTIONS, allowPositionals: true });
      if (positionals.length !== 1) return usage(io, "usage: dsdude build <project> [flags]");
      const svc = service();
      if (!values.json) {
        svc.onEvent((e) => {
          for (const l of e.log) io.err(l);
        });
      }
      const result = await svc.build({
        projectDir: positionals[0] ?? ".",
        runtime: values.runtime,
        skipCompile: values["skip-compile"],
        skipAssets: values["skip-assets"],
        jobs: positiveInt(values.jobs, "--jobs"),
        seed: positiveInt(values.seed, "--seed"),
      });
      if (result.ok && !values.json) io.err(result.ndsPath ?? "");
      return report(io, values.json ?? false, { ndsPath: result.ndsPath, timings: result.timings }, result.diagnostics);
    }),
  };

  const play: CliCommand = {
    name: "play",
    summary:
      "play <project> [build flags] [--no-build] [--emulator melonds|desmume] [--seconds N] [--json]: build and run",
    run: guard(async (argv) => {
      const { values, positionals } = parseArgs({
        args: argv,
        options: {
          ...BUILD_OPTIONS,
          "no-build": { type: "boolean" },
          emulator: { type: "string" },
          seconds: { type: "string" },
        },
        allowPositionals: true,
      });
      if (positionals.length !== 1) return usage(io, "usage: dsdude play <project> [flags]");
      const projectDir = positionals[0] ?? ".";
      const kind = emulatorKind(values.emulator);
      const seconds = positiveInt(values.seconds, "--seconds");
      const svc = service();
      if (!values.json) {
        svc.onEvent((e) => {
          if (e.phase !== "running") for (const l of e.log) io.err(l);
        });
      }
      let result: Awaited<ReturnType<LocalBuildService["play"]>>;
      if (values["no-build"]) {
        const rom = svc.romPath(projectDir);
        if (!existsSync(rom)) {
          return report(io, values.json ?? false, { ndsPath: null }, [
            toolchainDiagnostic("E609", { dir: path.resolve(projectDir) }),
          ]);
        }
        result = await svc.launchRom(rom, kind);
      } else {
        result = await svc.play({
          projectDir,
          emulator: kind,
          runtime: values.runtime,
          skipCompile: values["skip-compile"],
          skipAssets: values["skip-assets"],
          jobs: positiveInt(values.jobs, "--jobs"),
          seed: positiveInt(values.seed, "--seed"),
        });
      }
      const emu = result.emulator;
      if (!result.ok || emu === null) {
        return report(io, values.json ?? false, { ndsPath: result.ndsPath, log: [] }, result.diagnostics);
      }
      const log: string[] = [];
      const started = Date.now();
      emu.onLine((line) => {
        if (!line.startsWith("DSD|")) return;
        log.push(line);
        if (!values.json) io.out(line);
      });
      if (!values.json) io.err(`${kind} running (pid ${emu.pid}); Ctrl+C stops it`);
      const onSigint = () => void emu.stop();
      process.once("SIGINT", onSigint);
      const timer = seconds !== undefined ? setTimeout(() => void emu.stop(), seconds * 1000) : null;
      const exitCode = await emu.exited;
      if (timer) clearTimeout(timer);
      process.removeListener("SIGINT", onSigint);
      return report(
        io,
        values.json ?? false,
        { ndsPath: result.ndsPath, emulator: kind, pid: emu.pid, exitCode, ms: Date.now() - started, log },
        result.diagnostics,
      );
    }),
  };

  const screenshot: CliCommand = {
    name: "screenshot",
    summary: "screenshot <rom> --frames N [--keys file] --out dir [--json]: headless top.png and bottom.png",
    run: guard(async (argv) => {
      const { values, positionals } = parseArgs({
        args: argv,
        options: {
          frames: { type: "string" },
          keys: { type: "string" },
          out: { type: "string" },
          json: { type: "boolean" },
        },
        allowPositionals: true,
      });
      const frames = positiveInt(values.frames, "--frames");
      if (positionals.length !== 1 || frames === undefined || frames < 1 || values.out === undefined) {
        return usage(io, "usage: dsdude screenshot <rom> --frames N [--keys file] --out dir [--json]");
      }
      if (process.platform !== "win32") {
        return report(io, values.json ?? false, {}, [toolchainDiagnostic("E605", { what: "dsdude screenshot" })]);
      }
      const shot = await takeScreenshot({ rom: positionals[0] ?? "", frames, keys: values.keys, out: values.out, env });
      if (shot.ok && !values.json) io.err(`${shot.top}\n${shot.bottom}`);
      return report(
        io,
        values.json ?? false,
        { top: shot.top, bottom: shot.bottom, uniform: shot.uniform, log: shot.log },
        shot.diagnostics,
      );
    }),
  };

  return [toolchain, emulator, build, play, screenshot];
}

/** The commands with the default wiring (no compiler or asset pipeline injected). */
export const cliCommands: CliCommand[] = makeCliCommands();
