/**
 * `npm run bench -w runtime [-- --emulator melonds|desmume] [-- --mix]` (PLAN.md 8 M1 "VM microbenchmark", spike
 * 14): builds the timer harness twice (runtime/Makefile DSD_BENCH=1, with -mlong-calls and with DSD_VM_BL=1) and
 * runs one ROM per variant holding three workloads (bench-rom.ts): WS2's fixtures/bytecode/bench.dsdb, the
 * baseline (Step emptied) and spike 14's loop. The ROM computes the VM-only figures itself (full - baseline) and
 * prints a summary line, which this script reports. Runs are headless in py-desmume by default, or in one emulator
 * window through `dsdude play` (one emulator machine-wide: the runs are sequential). `--mix` times single-opcode
 * Step bodies against the baseline instead.
 * Exit 0 when every VM figure meets the gate, 1 when one does not, 2 on a tool/environment failure.
 */
import * as path from "node:path";
import { detectToolchain, formatDiagnostic } from "@dsdude/toolchain";
import { MIX, parseSummaryLine } from "./bench-line.ts";
import { buildBenchElf, type Emulator, packBench, runRom, workloads } from "./bench-rom.ts";

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
    // Per-opcode breakdown: each single-op Step body as game.dsdb beside the baseline.
    const elf = await buildBenchElf(status.paths, false);
    for (const [op, dsdb] of Object.entries(w.mix)) {
      const rom = await packBench(`mix-${op.replace(/\W/g, "")}`, elf, { "game.dsdb": dsdb, "base.dsdb": w.base });
      const s = (await runRom(rom, emulator, status.paths.python)).map(parseSummaryLine).find((x) => x);
      console.log(`MIX ${op.padEnd(9)} ${s ? `${s.vmCyclesPerOp.toFixed(2)} cycles/op` : "no summary line"}`);
    }
    return Object.keys(MIX).length > 0 ? 0 : 2;
  }

  let failed = 0;
  // Tag-checked (the gate mix as bench.dsdb has it) with long calls and with BL, then the int-specialised forms.
  const runs = [
    { bl: false, ii: false },
    { bl: true, ii: false },
    { bl: false, ii: true },
  ];
  for (const { bl, ii } of runs) {
    const elf = await buildBenchElf(status.paths, bl);
    const name = `${path.basename(elf, ".elf")}${ii ? "_ii" : ""}`;
    const rom = await packBench(name, elf, {
      "game.dsdb": ii ? w.fullII : w.full,
      "base.dsdb": w.base,
      "loop.dsdb": ii ? w.loopII : w.loop,
    });
    const log = await runRom(rom, emulator, status.paths.python);
    for (const l of log.filter((x) => x.startsWith("DSD|LOG|bench: "))) console.log(`${name}: ${l.slice(15)}`);
    const s = log.map(parseSummaryLine).find((x) => x);
    if (!s) {
      console.log(`FAIL ${name}: no summary line`);
      failed++;
      continue;
    }
    console.log(
      `${s.pass ? "PASS" : "FAIL"} ${name}: VM ${s.vmCyclesPerOp.toFixed(2)} cycles/op = ${s.vmOpsPerFrame} ops/frame ` +
        `(gate ${s.gate}); loop ${s.loopCyclesPerOp.toFixed(2)} cycles/op; per-frame overhead ${s.overheadPerFrame}`,
    );
    if (!s.pass) failed++;
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
