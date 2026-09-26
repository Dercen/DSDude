/**
 * Constant folding (codegen/fold.ts): the folded value must equal what the VM computes (language.md section 3),
 * and anything the runtime reports (overflow, division by zero) must stay a runtime operation.
 * Differentially checked against WS2's dsdude-host on 6,800 random expressions (docs/status/ws4.md, task 7).
 */
import { disassemble } from "@dsdude/dsdb";
import { describe, expect, it } from "vitest";
import { type Folded, fold } from "./codegen/fold.ts";
import { compileProgram } from "./program.ts";
import type { Expr } from "./syntax/ast.ts";
import { parse } from "./syntax/parser.ts";

/** Q20.12 raw value of one (value * 4096). */
const ONE = 4096;
/** Builtin constants the tests may use (a stand-in table). */
const CONSTANTS: Record<string, number> = { c_red: 2 };

/** Folds the argument of `show_debug_message(<source>)`. */
function folded(source: string): Folded | null {
  const parsed = parse(`show_debug_message(${source})`, { file: "t.dss", kind: "code" });
  expect(parsed.diagnostics).toEqual([]);
  const stmt = parsed.ast.items[0] as { call: { args: Expr[] } };
  return fold(stmt.call.args[0] as Expr, (name) => CONSTANTS[name]);
}
const int = (value: number): Folded => ({ kind: "number", repr: "int", value });
const fixed = (raw: number): Folded => ({ kind: "number", repr: "fixed", value: raw });
const bool = (value: boolean): Folded => ({ kind: "bool", value });

describe("constant folding: values", () => {
  it("keeps int arithmetic int and wraps nothing", () => {
    expect(folded("2 + 3 * 4")).toEqual(int(14));
    expect(folded("7 div 2")).toEqual(int(3));
    expect(folded("-7 div 2")).toEqual(int(-3));
    expect(folded("-7 mod 3")).toEqual(int(-1));
    expect(folded("7 % -3")).toEqual(int(1));
    expect(folded("c_red * 10")).toEqual(int(20));
  });

  it("divides like the runtime: exact ints stay int, the rest truncate to 1/4096", () => {
    expect(folded("6 / 3")).toEqual(int(2));
    expect(folded("1 / 3")).toEqual(fixed(1365));
    expect(folded("-1 / 2")).toEqual(fixed(-ONE / 2));
    // A quotient too large for Q20.12 yields the truncated int quotient.
    expect(folded("1000000000 / 3")).toEqual(int(333333333));
  });

  it("turns anything with a fraction into fixed, multiplying with truncation toward zero", () => {
    expect(folded("0.5 + 0.5")).toEqual(fixed(ONE));
    expect(folded("1 + 0.25")).toEqual(fixed(ONE + ONE / 4));
    expect(folded("0.1 * 0.1")).toEqual(fixed(Math.trunc((410 * 410) / ONE)));
    expect(folded("-0.1 * 0.1")).toEqual(fixed(-Math.trunc((410 * 410) / ONE)));
    expect(folded("-(0.25)")).toEqual(fixed(-ONE / 4));
  });

  it("compares ints with fixed values exactly", () => {
    expect(folded("0.5 + 0.5 == 1")).toEqual(bool(true));
    // 1.0001 rounds to exactly 4096/4096, so it equals 1; 1.0002 rounds to 4097/4096.
    expect(folded("1 == 1.0001")).toEqual(bool(true));
    expect(folded("1 < 1.0002")).toEqual(bool(true));
    expect(folded("2 >= 1.5")).toEqual(bool(true));
  });

  it("folds strings, bools and ternaries whose branches are all constant", () => {
    expect(folded('"a" + "b"')).toEqual({ kind: "string", value: "ab" });
    expect(folded('"a" == "a"')).toEqual(bool(true));
    expect(folded("!(true && false)")).toEqual(bool(true));
    expect(folded("1 < 2 ? 10 : 20")).toEqual(int(10));
  });
});

describe("constant folding: left to the runtime", () => {
  it("never folds what the runtime reports or wraps", () => {
    expect(folded("2147483647 + 1")).toBeNull(); // int32 overflow: R52x in debug builds
    expect(folded("65536 * 65536")).toBeNull();
    expect(folded("-(-2147483647 - 1)")).toBeNull();
    expect(folded("524287.5 + 1")).toBeNull(); // outside Q20.12
    expect(folded("1 / 0")).toBeNull();
    expect(folded("1 div 0")).toBeNull();
    expect(folded("1 mod 0")).toBeNull();
    expect(folded("(-2147483647 - 1) div -1")).toBeNull();
  });

  it("leaves mixed kinds, string order and fixed division alone", () => {
    expect(folded('"a" + 1')).toBeNull();
    expect(folded('"a" < "b"')).toBeNull();
    expect(folded("1.5 / 2")).toBeNull();
    expect(folded("7.5 div 2")).toBeNull();
    expect(folded("1 < 2 ? 10 : x")).toBeNull();
    expect(folded("x + 1")).toBeNull();
  });
});

describe("constant folding: code generation", () => {
  /** The instructions of `__main`, without directives. */
  const instructions = (source: string, fold: boolean): string[] => {
    const r = compileProgram(source, { file: "t.dss", fold });
    return disassemble(r.module as NonNullable<typeof r.module>)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("."));
  };

  it("replaces constant expressions with their value only when folding is on", () => {
    expect(instructions("show_debug_message(2 * 3 + 1)", true)).toEqual([
      "LOADI r0, 7",
      "CALLN r0, 1, show_debug_message",
      "RET r0, 0",
    ]);
    expect(instructions("show_debug_message(2 * 3 + 1)", false)).toContain("ADDI r0, r0, 1");
  });

  it("uses folded constants as ADDI operands and drops constant conditions", () => {
    expect(instructions("var a = 1\na = a + 2 * 3", true)).toContain("ADDI r1, r0, 6");
    expect(instructions("var a = 1\nif (1 < 2) a = 5", true)).toEqual(["LOADI r0, 1", "LOADI r0, 5", "RET r0, 0"]);
  });

  it("lets a local shadow a builtin constant's name", () => {
    expect(instructions("var c_red = 5\nshow_debug_message(c_red + 1)", true)).toContain("ADDI r1, r0, 1");
  });
});
