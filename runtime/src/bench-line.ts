/** The M1 timer harness's result lines (runtime/selftest/bench/bench.c), parsed, and its workloads. */

/** ARM9 cycles in one 60 Hz frame (560,190 bus cycles x 2). */
export const FRAME_CYCLES = 1_120_380;

export interface BenchResult {
  calls: "long" | "bl";
  emulator: string;
  /** "full" (bench.dsdb), "base" (Step emptied) or "loop" (spike 14). */
  workload: string;
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
    /^DSD\|LOG\|bench: calls=(long|bl) emulator=(.+) workload=(\w+) frames=(\d+) ops=(\d+) ticks=\d+ cycles=(\d+) cycles_per_op=(\d+\.\d\d) ops_per_frame=(\d+) gate=(\d+) (PASS|FAIL)$/.exec(
      line,
    );
  if (!m) return null;
  return {
    calls: m[1] as "long" | "bl",
    emulator: m[2],
    workload: m[3],
    frames: Number(m[4]),
    ops: Number(m[5]),
    cycles: Number(m[6]),
    cyclesPerOp: Number(m[7]),
    opsPerFrame: Number(m[8]),
    gate: Number(m[9]),
    pass: m[10] === "PASS",
  };
}

/** The ROM's own VM-only figures (the summary line, computed on the DS from full, base and loop). */
export interface BenchSummary {
  calls: "long" | "bl";
  vmCyclesPerOp: number;
  vmOpsPerFrame: number;
  loopCyclesPerOp: number;
  loopOpsPerFrame: number;
  overheadPerFrame: number;
  gate: number;
  pass: boolean;
}

export function parseSummaryLine(line: string): BenchSummary | null {
  const m =
    /^DSD\|LOG\|bench: summary calls=(long|bl) vm_cycles_per_op=(\d+\.\d\d) vm_ops_per_frame=(\d+) loop_cycles_per_op=(\d+\.\d\d) loop_ops_per_frame=(\d+) overhead_per_frame=(\d+) gate=(\d+) (PASS|FAIL)$/.exec(
      line,
    );
  if (!m) return null;
  return {
    calls: m[1] as "long" | "bl",
    vmCyclesPerOp: Number(m[2]),
    vmOpsPerFrame: Number(m[3]),
    loopCyclesPerOp: Number(m[4]),
    loopOpsPerFrame: Number(m[5]),
    overheadPerFrame: Number(m[6]),
    gate: Number(m[7]),
    pass: m[8] === "PASS",
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
 * Spike 14's cache-resident loop: the first `units` units of bench.dsda's straight-line block (the same M1 op mix,
 * 10 words each: `units` x 40 bytes of bytecode) run `iterations` times through a backward jump, so about the same
 * number of ops runs from a block small enough to stay in the data cache on hardware. Registers r16 (counter) and
 * r17 (limit) are added to the function; the loop costs 3 ops per iteration (ADDI, CMPJ, JMP).
 */
export function loopDsda(benchDsda: string, units = 10, iterations = 12): string {
  const lines = benchDsda.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\.func bench_step\b/.test(l));
  if (start < 0) throw new Error("bench.dsda has no .func bench_step");
  const end = lines.findIndex((l, i) => i > start && l.trim() === ".end");
  const inner = lines.slice(start + 1, end);
  let k = inner.findIndex((l) => l.trim().startsWith(".loc")) + 1;
  const head = inner.slice(0, k);
  while (k < inner.length && /^\s*LOADI /.test(inner[k])) head.push(inner[k++]);
  // A unit ends with its CALLN (bench.dsda: 4 arith, MOV, LOADI, GET/SETSLOT, CMPJ + JMP + label, CALLN).
  const body: string[] = [];
  let done = 0;
  for (; k < inner.length && done < units; k++) {
    body.push(inner[k]);
    if (/^\s*CALLN /.test(inner[k])) done++;
  }
  if (done < units) throw new Error(`bench.dsda has fewer than ${units} units`);
  const func = lines[start].replace(/^(\.func bench_step \d+) \d+/, "$1 18");
  const loop = [
    "    LOADI r16, 0",
    `    LOADI r17, ${iterations}`,
    "  LOOP:",
    ...body,
    "    ADDI r16, r16, 1",
    "    CMPJ r16, r17, 2",
    "    JMP LEND",
    "    JMP LOOP",
    "  LEND:",
    "    RET r0, 0",
  ];
  return [...lines.slice(0, start), func, ...head, ...loop, ...lines.slice(end)].join("\n");
}

/**
 * The baseline workload: the Step body is one RET. Timing it gives the per-frame engine and platform cost without
 * the block.
 */
export function baselineDsda(benchDsda: string): string {
  return stepVariant(benchDsda, [], false);
}

// DSDB layout (contracts/dsdb.md): the section table at byte 32, 12-byte entries {tag, offset, size}; CODE is entry
// 3 and starts with a u32 word count, then one little-endian word per instruction, opcode in the low byte.
const SECTION_TABLE = 32;
const SECTION_ENTRY = 12;
const CODE_SECTION = 3;
/** Opcode numbers (runtime/gen/opcodes.h): ADD, SUB, MUL, CMPJ and their int-specialised forms (reserved 51-54). */
export const II_REWRITE: ReadonlyMap<number, number> = new Map([
  [6, 51],
  [7, 52],
  [8, 53],
  [33, 54],
]);

/**
 * The int-specialised variant of a DSDB, as WS2's test_programs.c builds it (ADDII/SUBII/MULII/CMPJII take
 * ADD/SUB/MUL/CMPJ's operands; WS4's assembler cannot write them before its T1): every ADD/SUB/MUL/CMPJ in CODE gets
 * its II opcode. Only valid when every such instruction works on ints, as in bench.dsda. Returns a copy.
 */
export function rewriteToII(dsdb: Uint8Array): { bytes: Uint8Array; changed: number } {
  const bytes = new Uint8Array(dsdb);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const off = dv.getUint32(SECTION_TABLE + CODE_SECTION * SECTION_ENTRY + 4, true);
  const count = dv.getUint32(off, true);
  let changed = 0;
  for (let i = 0; i < count; i++) {
    const at = off + 4 + i * 4;
    const to = II_REWRITE.get(bytes[at]);
    if (to !== undefined) {
      bytes[at] = to;
      changed++;
    }
  }
  return { bytes, changed };
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
