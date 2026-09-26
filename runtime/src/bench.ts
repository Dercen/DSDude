/**
 * `npm run bench -w runtime [-- --emulator melonds|desmume] [-- --mix]` (PLAN.md 8 M1 "VM microbenchmark", spike
 * 14): builds the timer harness twice (runtime/Makefile DSD_BENCH=1, with -mlong-calls and with DSD_VM_BL=1) with
 * its workloads linked in (bench-rom.ts): WS2's fixtures/bytecode/bench.dsdb, the baseline (Step emptied), spike
 * 14's loop, and the int-specialised forms of the mix and the loop. The ROM computes the VM-only figures itself
 * (full - baseline) and prints a summary line per set (tagged, ii), which this script reports. Runs are headless in py-desmume by default, or in one emulator
 * window through `dsdude play` (one emulator machine-wide: the runs are sequential). `--mix` times single-opcode
 * Step bodies against the baseline instead.
 * Exit 0 when every VM figure meets the gate, 1 when one does not, 2 on a tool/environment failure.
 */
import * as path from "node:path";
import { detectToolchain, formatDiagnostic } from "@dsdude/toolchain";
import { MIX, parseSummaryLine } from "./bench-line.ts";
import { BENCH_NITROFS, buildBenchElf, type Emulator, packBench, runRom, workloads } from "./bench-rom.ts";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const emu = argv.includes("--emulator") ? argv[argv.indexOf("--emulator") + 1] : null;
  if (emu !== null && emu !== "melonds" && emu !== "desmume") {
    console.error("bench: --emulator is melonds or desmume");
    return 2;
  }
  const emulator = emu as Emulator | null;
  const status = await detectToolchain();
  if (!status.installed || !status.paths.python) {
    for (const d of status.diagnostics) console.error(formatDiagnostic(d));
    console.error("bench: needs BlocksDS and py-desmume (the local machine)");
    return 2;
  }
  const w = workloads();

  if (argv.includes("--mix")) {
    // Per-opcode breakdown: each single-op Step body as nitro:/game.dsdb, timed against the linked baseline.
    const elf = await buildBenchElf(status.paths, false, w);
    for (const [op, dsdb] of Object.entries(w.mix)) {
      const rom = await packBench(`mix-${op.replace(/\W/g, "")}`, elf, { "game.dsdb": dsdb });
      const s = (await runRom(rom, emulator, status.paths.python)).map(parseSummaryLine).find((x) => x);
      console.log(`MIX ${op.padEnd(10)} ${s ? `${s.vmCyclesPerOp.toFixed(2)} cycles/op` : "no summary line"}`);
    }
    return Object.keys(MIX).length > 0 ? 0 : 2;
  }

  let failed = 0;
  for (const bl of [false, true]) {
    const elf = await buildBenchElf(status.paths, bl, w);
    const name = path.basename(elf, ".elf");
    const rom = await packBench(name, elf, BENCH_NITROFS);
    const log = await runRom(rom, emulator, status.paths.python);
    for (const l of log.filter((x) => x.startsWith("DSD|LOG|bench: "))) console.log(`${name}: ${l.slice(15)}`);
    const sums = log.map(parseSummaryLine).filter((x) => x !== null);
    if (sums.length === 0) {
      console.log(`FAIL ${name}: no summary line`);
      failed++;
      continue;
    }
    for (const s of sums) {
      console.log(
        `${s.pass ? "PASS" : "FAIL"} ${name} ${s.set}: VM ${s.vmCyclesPerOp.toFixed(2)} cycles/op = ` +
          `${s.vmOpsPerFrame} ops/frame (gate ${s.gate}); loop ${s.loopCyclesPerOp.toFixed(2)} cycles/op; ` +
          `per-frame overhead ${s.overheadPerFrame}`,
      );
      if (!s.pass && s.set === "tagged") failed++;
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
