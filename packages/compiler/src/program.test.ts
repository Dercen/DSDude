import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assemble, decode, disassemble, encode } from "@dsdude/dsdb";
import { describe, expect, it } from "vitest";
import { COMPILER_BUILTINS_ENV } from "./codegen/abi.ts";
import { goldenText, REPO_ROOT, readBytes, UPDATING_GOLDENS } from "./golden.ts";
import { compileProgram, MAIN_FUNCTION } from "./program.ts";

/** Lints a conformance program triggers on purpose (the rule it pins). */
const EXPECTED_WARNINGS: Readonly<Record<string, string[]>> = { "v1/07-arrays.dss": ["W041"] };

/**
 * Header seeds for programs that pin the RNG seed rule (language.md section 7): a non-zero header seed wins over the
 * platform's, so their random numbers are the same on every run. Every other program keeps seed 0.
 */
const PROGRAM_SEEDS: Readonly<Record<string, number>> = { "v1/11-random.dss": 20260926 };

/** Program-form conformance tiers (language.md section 1); v2+ are projects. */
const PROGRAM_TIERS = ["v0", "v1"];

/** Every program-form conformance file as [tier, file name]. */
function programs(): [string, string][] {
  return PROGRAM_TIERS.flatMap((tier) => {
    const dir = join(REPO_ROOT, "fixtures", "conformance", tier);
    let names: string[] = [];
    try {
      names = readdirSync(dir).filter((n) => n.endsWith(".dss"));
    } catch {
      return [];
    }
    return names.sort().map((n): [string, string] => [tier, n]);
  });
}

/** Compiles a snippet and returns its diagnostic codes. */
function codes(text: string): string[] {
  return compileProgram(text, { file: "t.dss" }).diagnostics.map((d) => d.code);
}

describe("program form: the conformance corpus", () => {
  it("compiles v0/01-arith exactly like the hand-assembled fixtures/bytecode/conformance/v0-01.dsda", () => {
    const text = readFileSync(join(REPO_ROOT, "fixtures/conformance/v0/01-arith.dss"), "utf8");
    const r = compileProgram(text, { file: "v0/01-arith.dss" });
    expect(r.diagnostics).toEqual([]);
    const golden = readFileSync(join(REPO_ROOT, "fixtures/bytecode/conformance/v0-01.dsda"), "utf8").replace(/\r/g, "");
    expect(disassemble(r.module as NonNullable<typeof r.module>)).toBe(golden);
    expect(r.dsdb).toEqual(readBytes("fixtures/bytecode/conformance/v0-01.dsdb"));
  });

  for (const [tier, name] of programs()) {
    const stem = name.replace(/\.dss$/, "");
    const golden = `fixtures/compiler/conformance/${tier}/${stem}.dsda`;
    it(`compiles ${tier}/${name} to its golden and round-trips through the disassembler`, () => {
      const text = readFileSync(join(REPO_ROOT, "fixtures", "conformance", tier, name), "utf8").replace(/\r/g, "");
      const r = compileProgram(text, { file: `${tier}/${name}`, seed: PROGRAM_SEEDS[`${tier}/${name}`] });
      // Programs may exercise a lint on purpose (v1/07's fractional index is W041), never an error.
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(r.diagnostics.map((d) => d.code)).toEqual(EXPECTED_WARNINGS[`${tier}/${name}`] ?? []);
      const module = r.module as NonNullable<typeof r.module>;
      expect(module.functions[0]?.name).toBe(MAIN_FUNCTION);
      const dsda = disassemble(module);
      expect(dsda).toBe(goldenText(golden, dsda));
      // Byte-identical: the compiler's DSDB equals the one assembled from the golden, and decodes back to it.
      const bytes = r.dsdb as Uint8Array;
      expect(bytes).toEqual(encode(assemble(dsda), COMPILER_BUILTINS_ENV));
      expect(disassemble(decode(bytes, COMPILER_BUILTINS_ENV))).toBe(dsda);
      if (!UPDATING_GOLDENS) expect(bytes).toEqual(readBytes(golden.replace(/\.dsda$/, ".dsdb")));
    });
  }
});

describe("program form: code shape", () => {
  it("puts locals in fixed registers and temporaries above them", () => {
    // 200 is outside ADDI's signed 8-bit range, so the literal goes through a temporary register.
    const r = compileProgram("var a = 1\nvar b = a + 200\nshow_debug_message(b)", { file: "t.dss" });
    expect(disassemble(r.module as NonNullable<typeof r.module>)).toContain(
      ["    LOADI r0, 1", '    .loc "t.dss" 2', "    LOADI r2, 200", "    ADD r1, r0, r2"].join("\n"),
    );
  });

  /** The disassembled instructions of a one-function program, without directives. */
  const instructions = (source: string): string[] => {
    const r = compileProgram(source, { file: "t.dss" });
    return disassemble(r.module as NonNullable<typeof r.module>)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("."));
  };

  it("uses ADDI/SUBI/MULI for small int literals, and ADD for anything else", () => {
    expect(instructions("var a = 1\nvar b = a - 127\nb *= -3\nb += 127\nb--")).toEqual([
      "LOADI r0, 1",
      "SUBI r1, r0, 127",
      "MULI r1, r1, -3",
      "ADDI r1, r1, 127",
      "SUBI r1, r1, 1",
      "RET r0, 0",
    ]);
    // 128 and a fixed-point literal don't fit the signed 8-bit int operand.
    expect(instructions("var a = 1\nvar b = a + 128\nb += 1.5")).toEqual([
      "LOADI r0, 1",
      "LOADI r2, 128",
      "ADD r1, r0, r2",
      "LOADK r2, 1.5",
      "ADD r1, r1, r2",
      "RET r0, 0",
    ]);
  });

  it("writes `a = a <op> x` straight into a's register, even when x reads a", () => {
    // The right side goes to temporaries and the destination is written last (checked on dsdude-host: -3).
    expect(instructions("var a = 3\na = a - a * 2")).toEqual([
      "LOADI r0, 3",
      "MULI r1, r0, 2",
      "SUB r0, r0, r1",
      "RET r0, 0",
    ]);
    // Other reads of a still go through a temporary: `a = 1 - a` must not overwrite a before reading it.
    expect(instructions("var a = 3\na = 1 - a")).toEqual([
      "LOADI r0, 3",
      "LOADI r1, 1",
      "SUB r1, r1, r0",
      "MOV r0, r1",
      "RET r0, 0",
    ]);
  });

  it("branches on comparisons with CMPJ followed by JMP", () => {
    // if: jump past the body when the relation fails, so CMPJ tests the relation itself (3 is <=).
    expect(instructions("var a = 1\nif (a <= 5) a = 2")).toEqual([
      "LOADI r0, 1",
      "LOADI r1, 5",
      "CMPJ r0, r1, 3",
      "JMP L0",
      "LOADI r0, 2",
      "L0:",
      "RET r0, 0",
    ]);
    // `||` jumps into the body when its left side is true, so CMPJ tests the negated relation: 1 (!=) skips that
    // JMP exactly when a == 3 is false.
    expect(instructions("var a = 1\nif (a == 3 || a > 7) a = 2")).toContain("CMPJ r0, r1, 1");
  });

  it("fills default parameters at the call", () => {
    const r = compileProgram("function f(a, b = 10) { return a + b }\nshow_debug_message(f(1))", { file: "t.dss" });
    expect(disassemble(r.module as NonNullable<typeof r.module>)).toContain(
      "    LOADI r0, 1\n    LOADI r1, 10\n    CALL r0, f",
    );
  });

  it("uses CONCAT only when both sides are provably text", () => {
    const text = 'var n = 1\nshow_debug_message("a" + string(n))\nshow_debug_message("a" + n)';
    const dsda = disassemble(
      compileProgram(text, { file: "t.dss" }).module as NonNullable<ReturnType<typeof compileProgram>["module"]>,
    );
    expect(dsda.match(/CONCAT/g)?.length).toBe(1);
    expect(dsda).toContain("ADD");
  });

  it("writes array elements back through their variables", () => {
    const dsda = disassemble(
      compileProgram("global.a = [[0]]\nglobal.a[0][0] = 5", { file: "t.dss" }).module as NonNullable<
        ReturnType<typeof compileProgram>["module"]
      >,
    );
    expect(dsda).toContain("GETGLOB r0, a");
    expect(dsda.match(/SETIDX/g)?.length).toBe(2);
    expect(dsda.match(/SETGLOB/g)?.length).toBe(2);
  });
});

describe("program form: diagnostics", () => {
  it("reports program-form mistakes once each", () => {
    expect(codes("foo = 1")).toEqual(["E203"]);
    expect(codes("show_debug_message(foo)")).toEqual(["E202"]);
    expect(codes("x = 1")).toEqual(["E303"]);
    expect(codes("with (all) {}")).toEqual(["E303"]);
    expect(codes("show_debug_mesage(1)")).toEqual(["E201"]);
    expect(codes("show_debug_message(1, 2)")).toEqual(["E301"]);
    expect(codes("function f(a) {}\nf()")).toEqual(["E301"]);
    expect(codes("break")).toEqual(["E304"]);
    expect(codes("while (true) { continue }")).toEqual([]);
    expect(codes("room_width = 3")).toEqual(["E302"]);
    expect(codes("btn_a = 3")).toEqual(["E302"]);
    expect(codes("var a = floor")).toEqual(["E204"]);
    expect(codes("var v = 1\nv(2)")).toEqual(["E306"]);
    expect(codes("function f(a, b = a) {}")).toEqual(["E307"]);
  });

  it("suggests the closest name", () => {
    const [d] = compileProgram("show_debug_mesage(1)", { file: "t.dss" }).diagnostics;
    expect(d?.hint).toBe("Did you mean show_debug_message()? Check the spelling, or add the function to Scripts.");
  });

  it("returns syntax errors without compiling", () => {
    const r = compileProgram("x = (1", { file: "t.dss" });
    expect(r.module).toBeNull();
    expect(r.diagnostics.map((d) => d.code)).toEqual(["E101"]);
  });
});
