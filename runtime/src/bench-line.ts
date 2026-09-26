/** The M1 timer harness's result line (runtime/selftest/bench/bench.c), parsed, and the VM-only figures. */

/** ARM9 cycles in one 60 Hz frame (560,190 bus cycles x 2). */
export const FRAME_CYCLES = 1_120_380;

export interface BenchResult {
  calls: "long" | "bl";
  emulator: string;
  frames: number;
  ops: number;
  cycles: number;
  /** ARM9 cycles per VM op, two decimals. */
  cyclesPerOp: number;
  opsPerFrame: number;
  gate: number;
  pass: boolean;
}

export function parseBenchLine(line: string): BenchResult | null {
  const m =
    /^DSD\|LOG\|bench: calls=(long|bl) emulator=(.+) frames=(\d+) ops=(\d+) ticks=\d+ cycles=(\d+) cycles_per_op=(\d+\.\d\d) ops_per_frame=(\d+) gate=(\d+) (PASS|FAIL)$/.exec(
      line,
    );
  if (!m) return null;
  return {
    calls: m[1] as "long" | "bl",
    emulator: m[2],
    frames: Number(m[3]),
    ops: Number(m[4]),
    cycles: Number(m[5]),
    cyclesPerOp: Number(m[6]),
    opsPerFrame: Number(m[7]),
    gate: Number(m[8]),
    pass: m[9] === "PASS",
  };
}

/**
 * bench.dsda with obj_bench's Step body replaced: its `.loc` and LOADI prologue (with `prologue`), then `body`,
 * then RET; everything else (objects, room, instance, Create) unchanged.
 */
export function stepVariant(benchDsda: string, body: readonly string[], prologue = true): string {
  const lines = benchDsda.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\.func bench_step\b/.test(l));
  if (start < 0) throw new Error("bench.dsda has no .func bench_step");
  const end = lines.findIndex((l, i) => i > start && l.trim() === ".end");
  if (end < 0) throw new Error("bench.dsda: .func bench_step has no .end");
  const inner = lines.slice(start + 1, end);
  const loc = inner.filter((l) => l.trim().startsWith(".loc")).slice(0, 1);
  let k = inner.findIndex((l) => l.trim().startsWith(".loc")) + 1;
  const pro: string[] = [];
  while (prologue && k < inner.length && /^\s*LOADI /.test(inner[k])) pro.push(inner[k++]);
  return [...lines.slice(0, start + 1), ...loc, ...pro, ...body, "    RET r0, 0", ...lines.slice(end)].join("\n");
}

/**
 * The baseline workload: the Step body is one RET. Timing it gives the per-frame engine and platform cost without
 * the block.
 */
export function baselineDsda(benchDsda: string): string {
  return stepVariant(benchDsda, [], false);
}

/**
 * Single-opcode workloads for a per-opcode breakdown (`npm run bench -- --mix`): each repeats one op of the M1 mix
 * after the bench prologue (r0-r7 = 1..8, r8, r9, r11 = 0, r15 = -3). Values stay small, so no overflow trap fires.
 */
export const MIX: Record<string, string[]> = {
  ADD: Array.from({ length: 1200 }, () => "    ADD r8, r8, r1"),
  MUL: Array.from({ length: 1200 }, () => "    MUL r10, r1, r4"),
  MOV: Array.from({ length: 1200 }, () => "    MOV r12, r8"),
  LOADI: Array.from({ length: 1200 }, () => "    LOADI r13, 5"),
  GETSLOT: Array.from({ length: 1200 }, () => "    GETSLOT r14, 0"),
  SETSLOT: ["    LOADI r13, 1", ...Array.from({ length: 1200 }, () => "    SETSLOT r13, 1")],
  "CMPJ+JMP": Array.from({ length: 600 }, (_, i) => [`    CMPJ r8, r9, ${i % 6}`, `    JMP M${i}`, `  M${i}:`]).flat(),
  CALLN: Array.from({ length: 1200 }, () => "    CALLN r15, 1, abs"),
};

export interface VmFigures {
  /** Cycles the Step block's ops cost, per op: the difference between the full and the baseline run. */
  cyclesPerOp: number;
  /** FRAME_CYCLES / cyclesPerOp: the gate's "typed simple ops per full frame" for the VM alone. */
  opsPerFrame: number;
  /** The baseline's cost per frame (engine + platform, no block). */
  overheadPerFrame: number;
}

export function vmFigures(full: BenchResult, base: BenchResult): VmFigures {
  const dOps = full.ops - base.ops;
  const dCycles = full.cycles - base.cycles;
  if (dOps <= 0 || dCycles <= 0) throw new Error("bench: the full run did not cost more than the baseline");
  const cyclesPerOp = dCycles / dOps;
  return {
    cyclesPerOp,
    opsPerFrame: Math.floor(FRAME_CYCLES / cyclesPerOp),
    overheadPerFrame: Math.round(base.cycles / base.frames),
  };
}
