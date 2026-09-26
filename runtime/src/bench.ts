/**
 * `npm run bench -w runtime [-- --emulator melonds|desmume]` (PLAN.md 8 M1 "VM microbenchmark", spike 14): builds
 * the timer harness twice (runtime/Makefile DSD_BENCH=1, with -mlong-calls and with DSD_VM_BL=1) and runs each on
 * two workloads: WS2's fixtures/bytecode/bench.dsdb and a baseline, the same game with obj_bench's Step body
 * emptied (bench-line.ts, assembled here with @dsdude/dsdb). Runs are headless in py-desmume by default, or in one
 * emulator window through `dsdude play` (one emulator machine-wide: the runs are sequential).
 *
 * Reported per variant: the harness's whole-frame figure (the Step block plus the engine's and platform's per-frame
 * work) and the VM-only figure (full - baseline). Exit 0 when every VM-only figure meets the gate, 1 when one does
 * not, 2 on a tool/environment failure. Local machine only.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleToBytes } from "@dsdude/dsdb";
import { loadBuiltinsEnv } from "@dsdude/dsdb/node";
import { detectToolchain, dsdudeHome, formatDiagnostic, runMake, takeScreenshot } from "@dsdude/toolchain";
import { run } from "./artifact.ts";
import { type BenchResult, baselineDsda, loopDsda, MIX, parseBenchLine, stepVariant, vmFigures } from "./bench-line.ts";

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.dirname(runtimeDir);
const CLI = path.join(repoRoot, "packages", "cli", "src", "main.ts");
const BENCH = path.join(repoRoot, "fixtures", "bytecode", "bench");
const HEADLESS_FRAMES = 240; // boot + 30 warm-up frames + the timed 600 frames (~0.4 s emulated) fit easily
const PLAY_SECONDS = 8;

/** The last JSON object a `dsdude ... --json` run printed on stdout (C10). */
function lastJson<T>(stdout: string): T {
  const line = stdout
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim().startsWith("{"));
  return (line ? JSON.parse(line) : {}) as T;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const emulator = argv.includes("--emulator") ? argv[argv.indexOf("--emulator") + 1] : null;
  if (emulator !== null && emulator !== "melonds" && emulator !== "desmume") {
    console.error("bench: --emulator is melonds or desmume");
    return 2;
  }
  const status = await detectToolchain();
  if (!status.installed || !status.paths.python) {
    for (const d of status.diagnostics) console.error(formatDiagnostic(d));
    console.error("bench: needs BlocksDS and py-desmume (the local machine)");
    return 2;
  }
  const workloads: Record<"full" | "base" | "loop", Uint8Array> = {
    full: readFileSync(`${BENCH}.dsdb`),
    base: assembleToBytes(baselineDsda(readFileSync(`${BENCH}.dsda`, "utf8")), loadBuiltinsEnv(repoRoot)),
    loop: assembleToBytes(loopDsda(readFileSync(`${BENCH}.dsda`, "utf8")), loadBuiltinsEnv(repoRoot)),
  };
  const cli = (...args: string[]) =>
    run(process.execPath, [CLI, ...args], { cwd: repoRoot, timeoutMs: 180_000 }).then((r) => r.stdout);

  // One run: pack `dsdb` around `elf` as a plain BlocksDS folder (C10) and return its bench line.
  async function runOnce(label: string, elf: string, dsdb: Uint8Array): Promise<BenchResult | null> {
    const dir = path.join(dsdudeHome(), "bench", label);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(path.join(dir, "nitrofs"), { recursive: true });
    writeFileSync(path.join(dir, "nitrofs", "game.dsdb"), dsdb);
    const rom = lastJson<{ ndsPath?: string }>(
      await cli("build", dir, "--runtime", elf, "--skip-compile", "--skip-assets", "--json"),
    ).ndsPath;
    if (!rom) throw new Error(`dsdude build printed no ndsPath for ${dir}`);
    let log: string[];
    if (emulator) {
      const out = await cli(
        "play",
        dir,
        "--no-build",
        "--emulator",
        emulator,
        "--seconds",
        String(PLAY_SECONDS),
        "--json",
      );
      log = lastJson<{ log?: string[] }>(out).log ?? [];
    } else {
      const shot = await takeScreenshot({
        rom,
        frames: HEADLESS_FRAMES,
        out: path.join(dir, "shot"),
        python: status.paths.python,
      });
      if (!shot.ok) throw new Error(shot.diagnostics.map(formatDiagnostic).join("\n"));
      log = shot.log;
    }
    const line = log.find((l) => l.startsWith("DSD|LOG|bench: calls="));
    if (line) console.log(`${label}: ${line.slice("DSD|LOG|bench: ".length)}`);
    else console.log(`${label}: no bench line; log: ${JSON.stringify(log.slice(0, 6))}`);
    const probe = log.find((l) => l.startsWith("DSD|LOG|bench: memprobe"));
    if (probe && label.endsWith("-full")) console.log(`${label}: ${probe.slice("DSD|LOG|bench: ".length)}`);
    return line ? parseBenchLine(line) : null;
  }

  let failed = 0;
  const mix = argv.includes("--mix");
  for (const bl of mix ? [false] : [false, true]) {
    const name = bl ? "dsdude_bench_bl" : "dsdude_bench";
    const built = await runMake({
      dir: runtimeDir,
      elf: path.join("build", `${name}.elf`),
      paths: status.paths,
      env: { ...process.env, DSD_BENCH: "1", DSD_VM_BL: bl ? "1" : "0" },
    });
    if (!built.ok || !built.arm9Elf) {
      for (const d of built.diagnostics) console.error(formatDiagnostic(d));
      return 2;
    }
    const elf = path.join(dsdudeHome(), "bench", `${name}.elf`);
    mkdirSync(path.dirname(elf), { recursive: true });
    copyFileSync(built.arm9Elf, elf);
    if (mix) {
      // Per-opcode breakdown: each single-op Step body against the baseline (bench-line.ts MIX).
      const base = await runOnce(`${name}-base`, elf, workloads.base);
      if (!base) return 2;
      const benchDsda = readFileSync(`${BENCH}.dsda`, "utf8");
      for (const [op, body] of Object.entries(MIX)) {
        const dsdb = assembleToBytes(stepVariant(benchDsda, body), loadBuiltinsEnv(repoRoot));
        const r = await runOnce(`${name}-mix-${op.replace(/\W/g, "")}`, elf, dsdb);
        if (!r) return 2;
        const vm = vmFigures(r, base);
        console.log(`MIX ${op.padEnd(9)} ${vm.cyclesPerOp.toFixed(2)} cycles/op on ${r.emulator}`);
      }
      return 0;
    }
    const full = await runOnce(`${name}-full`, elf, workloads.full);
    const base = await runOnce(`${name}-base`, elf, workloads.base);
    if (!full || !base) {
      failed++;
      continue;
    }
    const vm = vmFigures(full, base);
    const pass = vm.opsPerFrame >= full.gate;
    console.log(
      `${pass ? "PASS" : "FAIL"} ${name} on ${full.emulator}: VM ${vm.cyclesPerOp.toFixed(2)} cycles/op = ` +
        `${vm.opsPerFrame} ops/frame (gate ${full.gate}); whole frame ${full.cyclesPerOp.toFixed(2)} cycles/op = ` +
        `${full.opsPerFrame} ops/frame; per-frame overhead ${vm.overheadPerFrame} cycles`,
    );
    if (!pass) failed++;
    // Spike 14: the same op mix from a small loop (cache-resident on hardware) against the straight-line block.
    const loop = await runOnce(`${name}-loop`, elf, workloads.loop);
    if (loop) {
      const lv = vmFigures(loop, base);
      console.log(
        `LOOP ${name} on ${loop.emulator}: VM ${lv.cyclesPerOp.toFixed(2)} cycles/op = ${lv.opsPerFrame} ops/frame ` +
          `(straight-line ${vm.cyclesPerOp.toFixed(2)})`,
      );
    }
  }
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`bench: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  },
);
