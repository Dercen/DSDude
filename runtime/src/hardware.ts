/**
 * `npm run hardware -w runtime`: the hardware ROM set (spike 15; the user's original Nintendo 3DS loads .nds files
 * through TWiLight Menu++). Hardware has no stdout, so every ROM shows its result on screen:
 *   1-selftest.nds  runtime/selftest (page 4: boot figures; page 2: the scanline limit)
 *   2-bench.nds     the M1 timer harness: VM cycles/op and ops/frame, loop variant, memory probe (top screen)
 *   2b-bench-ii.nds the same with the mix's ADD/SUB/MUL/CMPJ as ADDII/SUBII/MULII/CMPJII (the M1 fallback)
 *   3-hello.nds     fixtures/bytecode/hello.dsdb on the screen-log runtime (DSD_SCREENLOG: the log on screen)
 *   4-numeric.nds   spike 12's numeric-hashes.dsdb on the screen-log runtime
 *   5-flappy.nds    samples/flappy built end to end with the shipped runtime/dist/arm9.elf
 * into <DSDUDE_HOME>/hardware/, then checks each headless in py-desmume (the log and the screens) before calling the
 * set ready. Local machine only. Exit 0 ready, 1 a check failed, 2 tool/environment failure.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import * as path from "node:path";
import { detectToolchain, dsdudeHome, formatDiagnostic } from "@dsdude/toolchain";
import { parseSummaryLine } from "./bench-line.ts";
import {
  buildBenchElf,
  buildElf,
  cli,
  lastJson,
  type Packed,
  packBench,
  repoRoot,
  runRom,
  runtimeDir,
  workloads,
} from "./bench-rom.ts";
import { compareLogs } from "./conformance.ts";

const OUT = path.join(dsdudeHome(), "hardware");

interface Rom {
  file: string;
  packed: Packed;
  /** Frames to run headless before checking. */
  frames: number;
  check: (log: string[]) => string | null;
}

const has = (log: string[], re: RegExp) => log.some((l) => re.test(l));

async function main(): Promise<number> {
  const status = await detectToolchain();
  if (!status.installed || !status.paths.python) {
    for (const d of status.diagnostics) console.error(formatDiagnostic(d));
    console.error("hardware: needs BlocksDS and py-desmume (the local machine)");
    return 2;
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const roms: Rom[] = [];

  // 1. The selftest (its Makefile packs fixtures/runtime/selftest/nitrofs).
  const selftestRom = await buildElf(status.paths, { DSD_SELFTEST: "1" }, "dsdude_selftest.nds");
  roms.push({
    file: "1-selftest.nds",
    packed: { dir: path.join(dsdudeHome(), "hardware-work", "selftest"), rom: selftestRom },
    frames: 120,
    check: (log) => (has(log, /^DSD\|LOG\|nitrofs: read 1048576 B sum=133693440 ok/) ? null : "no 1 MB read line"),
  });

  // 2. The M1 bench: full, baseline and loop in one ROM.
  const w = workloads();
  const benchElf = await buildBenchElf(status.paths, false);
  roms.push({
    file: "2-bench.nds",
    packed: await packBench(
      "bench",
      benchElf,
      { "game.dsdb": w.full, "base.dsdb": w.base, "loop.dsdb": w.loop },
      "hardware-work",
    ),
    frames: 400,
    check: (log) => (log.map(parseSummaryLine).some((s) => s && s.vmOpsPerFrame > 0) ? null : "no summary line"),
  });

  // 2b. The same bench with the gate mix's ADD/SUB/MUL/CMPJ as the int-specialised forms (the M1 fallback).
  roms.push({
    file: "2b-bench-ii.nds",
    packed: await packBench(
      "bench-ii",
      benchElf,
      { "game.dsdb": w.fullII, "base.dsdb": w.base, "loop.dsdb": w.loopII },
      "hardware-work",
    ),
    frames: 400,
    check: (log) => (log.map(parseSummaryLine).some((s) => s && s.vmOpsPerFrame > 0) ? null : "no summary line"),
  });

  // 3 and 4. The screen-log runtime around WS2's fixtures.
  const screenElf = await buildElf(
    status.paths,
    { DSD_SCREENLOG: "1" },
    path.join("build", "dsdude_runtime_screenlog.elf"),
  );
  const fixture = (rel: string) => readFileSync(path.join(repoRoot, rel));
  roms.push({
    file: "3-hello.nds",
    packed: await packBench(
      "hello",
      screenElf,
      { "game.dsdb": fixture("fixtures/bytecode/hello.dsdb") },
      "hardware-work",
    ),
    frames: 90,
    check: (log) => (has(log, /^DSD\|LOG\|hello$/) && has(log, /^DSD\|EXIT\|0$/) ? null : "no hello / EXIT line"),
  });
  const numericOut = readFileSync(path.join(repoRoot, "fixtures/bytecode/runtime/numeric-hashes.out"), "utf8");
  roms.push({
    file: "4-numeric.nds",
    packed: await packBench(
      "numeric",
      screenElf,
      { "game.dsdb": fixture("fixtures/bytecode/runtime/numeric-hashes.dsdb") },
      "hardware-work",
    ),
    frames: 120,
    check: (log) =>
      compareLogs(log, numericOut.split("\n"), {
        dsdb: "",
        expected: "",
        logOnly: false,
        state: "EXITED",
        frames: 0,
        keys: null,
      }),
  });

  // 5. Flappy, built end to end with the shipped runtime.
  const flappy = lastJson<{ ok?: boolean; ndsPath?: string }>(
    await cli("build", "samples/flappy", "--runtime", path.join(runtimeDir, "dist", "arm9.elf"), "--json"),
  );
  if (!flappy.ok || !flappy.ndsPath) {
    console.error("hardware: samples/flappy did not build");
    return 2;
  }
  roms.push({
    file: "5-flappy.nds",
    packed: { dir: path.join(dsdudeHome(), "hardware-work", "flappy"), rom: flappy.ndsPath },
    frames: 120,
    check: (log) => (has(log, /^DSD\|STAT\|fps=\d+,inst=/) ? null : "no DSD|STAT line"),
  });

  let failed = 0;
  for (const r of roms) {
    mkdirSync(r.packed.dir, { recursive: true });
    const log = await runRom(r.packed, null, status.paths.python, r.frames);
    const shot = path.join(r.packed.dir, "shot");
    const problem = r.check(log);
    copyFileSync(r.packed.rom, path.join(OUT, r.file));
    console.log(`${problem === null ? "OK  " : "FAIL"} ${r.file}${problem ? `: ${problem}` : ""} (screens: ${shot})`);
    if (problem !== null) failed++;
  }
  console.log(`\nhardware ROMs: ${OUT}`);
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`hardware: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  },
);
