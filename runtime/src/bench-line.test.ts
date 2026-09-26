import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleToBytes } from "@dsdude/dsdb";
import { loadBuiltinsEnv } from "@dsdude/dsdb/node";
import { describe, expect, it } from "vitest";
import { baselineDsda, FRAME_CYCLES, parseBenchLine, vmFigures } from "./bench-line.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// melonDS 1.1, JIT off, 2026-09-26: the whole-frame figure of the first run.
const LINE =
  "DSD|LOG|bench: calls=long emulator=melonDS 1.1 frames=600 ops=691800 ticks=18854404 cycles=37708808 " +
  "cycles_per_op=54.50 ops_per_frame=20554 gate=44000 FAIL";

describe("bench line", () => {
  it("parses the harness's result", () => {
    expect(parseBenchLine(LINE)).toEqual({
      calls: "long",
      emulator: "melonDS 1.1",
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

  it("isolates the VM: (full - baseline) cycles over (full - baseline) ops", () => {
    const full = parseBenchLine(LINE);
    if (!full) throw new Error("parse");
    const base = { ...full, ops: 600, cycles: 12_000_000 };
    const vm = vmFigures(full, base);
    expect(vm.cyclesPerOp).toBeCloseTo((37708808 - 12_000_000) / (691800 - 600), 6);
    expect(vm.opsPerFrame).toBe(Math.floor(FRAME_CYCLES / vm.cyclesPerOp));
    expect(vm.overheadPerFrame).toBe(20000);
    expect(() => vmFigures(base, full)).toThrow(/did not cost more/);
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

  it("refuses a file without bench_step", () => {
    expect(() => baselineDsda(".dsda 0.1\n")).toThrow(/bench_step/);
  });
});
