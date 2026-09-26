/**
 * Building, packing and running the harness ROMs (bench.ts, hardware.ts). Local machine only: make, ndstool,
 * py-desmume and the emulators.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleToBytes } from "@dsdude/dsdb";
import { loadBuiltinsEnv } from "@dsdude/dsdb/node";
import { dsdudeHome, formatDiagnostic, runMake, type ToolPaths, takeScreenshot } from "@dsdude/toolchain";
import { run } from "./artifact.ts";
import { baselineDsda, loopDsda, MIX, rewriteToII, stepVariant } from "./bench-line.ts";

export const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = path.dirname(runtimeDir);
const CLI = path.join(repoRoot, "packages", "cli", "src", "main.ts");
const BENCH = path.join(repoRoot, "fixtures", "bytecode", "bench");
const HEADLESS_FRAMES = 400; // boot + 3 workloads x (30 warm-up + 600 timed frames, ~0.4 s emulated each)
const PLAY_SECONDS = 12;

export type Emulator = "melonds" | "desmume";

export interface Workloads {
  full: Uint8Array;
  base: Uint8Array;
  loop: Uint8Array;
  /** full and loop with ADD/SUB/MUL/CMPJ as ADDII/SUBII/MULII/CMPJII (the M1 fallback; rewriteToII). */
  fullII: Uint8Array;
  loopII: Uint8Array;
  mix: Record<string, Uint8Array>;
}

/** WS2's bench.dsdb plus the baseline, loop and single-opcode variants, assembled from bench.dsda. */
export function workloads(): Workloads {
  const dsda = readFileSync(`${BENCH}.dsda`, "utf8");
  const env = loadBuiltinsEnv(repoRoot);
  const mix: Record<string, Uint8Array> = {};
  for (const [op, body] of Object.entries(MIX)) mix[op] = assembleToBytes(stepVariant(dsda, body), env);
  // The II forms of the arithmetic and compare rows.
  mix.ADDII = rewriteToII(mix.ADD).bytes;
  mix.MULII = rewriteToII(mix.MUL).bytes;
  mix["CMPJII+JMP"] = rewriteToII(mix["CMPJ+JMP"]).bytes;
  const full = readFileSync(`${BENCH}.dsdb`);
  const loop = assembleToBytes(loopDsda(dsda), env);
  return {
    full,
    base: assembleToBytes(baselineDsda(dsda), env),
    loop,
    fullII: rewriteToII(full).bytes,
    loopII: rewriteToII(loop).bytes,
    mix,
  };
}

/** The last JSON object a `dsdude ... --json` run printed on stdout (C10). */
export function lastJson<T>(stdout: string): T {
  const line = stdout
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim().startsWith("{"));
  return (line ? JSON.parse(line) : {}) as T;
}

export const cli = (...args: string[]) =>
  run(process.execPath, [CLI, ...args], { cwd: repoRoot, timeoutMs: 180_000 }).then((r) => r.stdout);

/** make in runtime/ with extra make variables; returns the ELF path. */
export async function buildElf(paths: ToolPaths, vars: Record<string, string>, elf: string): Promise<string> {
  const built = await runMake({ dir: runtimeDir, elf, paths, env: { ...process.env, ...vars } });
  if (!built.ok || !built.arm9Elf) throw new Error(built.diagnostics.map(formatDiagnostic).join("\n"));
  return built.arm9Elf;
}

/** Where bench-rom.ts writes the workloads the bench ELF links in (runtime/Makefile DSD_BENCH=1, BINDIRS). */
export const BENCH_DATA = path.join(runtimeDir, "build", "bench-data");

/**
 * Builds the bench ELF with the workloads linked in (bench.c): bench.dsdb, the baseline, the loop and the II forms
 * of both, so the ROM needs no NitroFS.
 */
export function buildBenchElf(paths: ToolPaths, bl: boolean, w: Workloads): Promise<string> {
  mkdirSync(BENCH_DATA, { recursive: true });
  const files: Record<string, Uint8Array> = {
    bench_full: w.full,
    bench_base: w.base,
    bench_loop: w.loop,
    bench_fullii: w.fullII,
    bench_loopii: w.loopII,
  };
  for (const [name, bytes] of Object.entries(files)) {
    const file = path.join(BENCH_DATA, `${name}.bin`);
    // Only rewrite changed files, so make relinks only when a workload changed.
    let same = false;
    try {
      same = Buffer.compare(readFileSync(file), Buffer.from(bytes)) === 0;
    } catch {
      same = false;
    }
    if (!same) writeFileSync(file, bytes);
  }
  const name = bl ? "dsdude_bench_bl" : "dsdude_bench";
  return buildElf(paths, { DSD_BENCH: "1", DSD_VM_BL: bl ? "1" : "0" }, path.join("build", `${name}.elf`));
}

/** NitroFS content for a bench ROM whose workloads are linked in (dsdude build packs no empty folder). */
export const BENCH_NITROFS: Record<string, Uint8Array> = {
  "bench.txt": new TextEncoder().encode("DSDude M1 bench: the workloads are linked into the ROM.\n"),
};

/** A packed ROM: the plain BlocksDS folder (C10) and the ROM `dsdude build` made from it. */
export interface Packed {
  dir: string;
  rom: string;
}

/**
 * Packs `files` (NitroFS name -> bytes) around `elf` as a plain BlocksDS folder (C10) under
 * <DSDUDE_HOME>/<group>/<label>.
 */
export async function packBench(
  label: string,
  elf: string,
  files: Record<string, Uint8Array>,
  group = "bench",
): Promise<Packed> {
  const dir = path.join(dsdudeHome(), group, label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.join(dir, "nitrofs"), { recursive: true });
  for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(dir, "nitrofs", name), bytes);
  const copy = path.join(dir, path.basename(elf)); // the build folder keeps its own ELF (runtime/build changes)
  copyFileSync(elf, copy);
  const rom = lastJson<{ ndsPath?: string }>(
    await cli("build", dir, "--runtime", copy, "--skip-compile", "--skip-assets", "--json"),
  ).ndsPath;
  if (!rom) throw new Error(`dsdude build printed no ndsPath for ${dir}`);
  return { dir, rom };
}

/** Runs a ROM headless (py-desmume) or in one emulator window; returns its DSD| lines. */
export async function runRom(
  packed: Packed,
  emulator: Emulator | null,
  python: string,
  frames = HEADLESS_FRAMES,
): Promise<string[]> {
  if (emulator) {
    const out = await cli(
      "play",
      packed.dir,
      "--no-build",
      "--emulator",
      emulator,
      "--seconds",
      String(PLAY_SECONDS),
      "--json",
    );
    return lastJson<{ log?: string[] }>(out).log ?? [];
  }
  const shot = await takeScreenshot({ rom: packed.rom, frames, out: path.join(packed.dir, "shot"), python });
  if (!shot.ok) throw new Error(shot.diagnostics.map(formatDiagnostic).join("\n"));
  return shot.log;
}
