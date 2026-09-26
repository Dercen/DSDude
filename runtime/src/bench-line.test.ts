import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleToBytes } from "@dsdude/dsdb";
import { loadBuiltinsEnv } from "@dsdude/dsdb/node";
import { describe, expect, it } from "vitest";
import { baselineDsda, loopDsda, parseBenchLine, parseSummaryLine, rewriteToII } from "./bench-line.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// melonDS 1.1, JIT off, 2026-09-26 (the shape bench.c prints; figures from the first run).
const LINE =
  "DSD|LOG|bench: calls=long emulator=melonDS 1.1 workload=full frames=600 ops=691800 ticks=18854404 " +
  "cycles=37708808 cycles_per_op=54.50 ops_per_frame=20554 gate=44000 FAIL";
const SUMMARY =
  "DSD|LOG|bench: summary set=tagged calls=long vm_cycles_per_op=35.06 vm_ops_per_frame=31957 loop_cycles_per_op=34.81 " +
  "loop_ops_per_frame=32186 overhead_per_frame=16577 gate=44000 FAIL";

describe("bench lines", () => {
  it("parse a workload's result", () => {
    expect(parseBenchLine(LINE)).toEqual({
      calls: "long",
      emulator: "melonDS 1.1",
      workload: "full",
      frames: 600,
      ops: 691800,
      cycles: 37708808,
      cyclesPerOp: 54.5,
      opsPerFrame: 20554,
      gate: 44000,
      pass: false,
    });
    expect(parseBenchLine("DSD|LOG|bench: cstack=1/2 B")).toBe(null);
  });

  it("parse the ROM's VM-only summary", () => {
    expect(parseSummaryLine(SUMMARY)).toEqual({
      set: "tagged",
      calls: "long",
      vmCyclesPerOp: 35.06,
      vmOpsPerFrame: 31957,
      loopCyclesPerOp: 34.81,
      loopOpsPerFrame: 32186,
      overheadPerFrame: 16577,
      gate: 44000,
      pass: false,
    });
    expect(parseSummaryLine(LINE)).toBe(null);
  });
});

describe("baseline workload", () => {
  const bench = readFileSync(path.join(repoRoot, "fixtures", "bytecode", "bench.dsda"), "utf8");

  it("empties only bench_step and still assembles", () => {
    const base = baselineDsda(bench);
    const step = base.slice(base.indexOf(".func bench_step"), base.indexOf(".end", base.indexOf(".func bench_step")));
    expect(step.trim().split("\n")).toHaveLength(3); // .func, .loc, RET
    expect(base).toContain(".func bench_create");
    expect(base).toContain(".object obj_bench");
    expect(base.length).toBeLessThan(bench.length / 5);
    const env = loadBuiltinsEnv(repoRoot);
    expect(assembleToBytes(base, env).length).toBeLessThan(assembleToBytes(bench, env).length);
  });

  it("builds spike 14's loop: 10 units of the mix run 12 times from a small block, and it assembles", () => {
    const loop = loopDsda(bench);
    expect(loop).toContain(".func bench_step 0 18");
    const step = loop.slice(loop.indexOf(".func bench_step"), loop.indexOf(".end", loop.indexOf(".func bench_step")));
    expect(step.match(/CALLN /g)).toHaveLength(10);
    expect(step).toContain("    LOADI r17, 12\n  LOOP:");
    expect(step).toContain("    CMPJ r16, r17, 2\n    JMP LEND\n    JMP LOOP\n  LEND:\n    RET r0, 0");
    const env = loadBuiltinsEnv(repoRoot);
    expect(assembleToBytes(loop, env).length).toBeLessThan(assembleToBytes(bench, env).length / 3);
  });

  it("rewrites every ADD/SUB/MUL/CMPJ to its int-specialised opcode, as WS2's tests do", () => {
    const dsdb = readFileSync(path.join(repoRoot, "fixtures", "bytecode", "bench.dsdb"));
    const { bytes, changed } = rewriteToII(dsdb);
    expect(changed).toBe(120 * 5); // 120 units x (ADD, SUB, MUL, ADD, CMPJ)
    let diff = 0;
    for (let i = 0; i < dsdb.length; i++) if (dsdb[i] !== bytes[i]) diff++;
    expect(diff).toBe(changed); // one opcode byte each, nothing else
    expect(dsdb[0]).toBe(bytes[0]);
  });

  it("refuses a file without bench_step", () => {
    expect(() => baselineDsda(".dsda 0.1\n")).toThrow(/bench_step/);
  });
});
