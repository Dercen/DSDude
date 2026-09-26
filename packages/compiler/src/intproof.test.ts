/**
 * The int proof and the int-specialised opcodes (codegen/intproof.ts; contracts/opcodes.json 51-54, PLAN.md 8's
 * M1 fallback). ADDII/SUBII/MULII/CMPJII skip the VM's tag checks, so they may appear only where both operands are
 * proved int; everything else keeps the tag-checked opcode.
 */
import { describe, expect, it } from "vitest";
import type { CodegenEnv } from "./codegen/env.ts";
import { compileFunction } from "./codegen/function.ts";
import { IntProof } from "./codegen/intproof.ts";
import { Reporter } from "./diagnostics/report.ts";
import type { Stmt } from "./syntax/ast.ts";
import { parse } from "./syntax/parser.ts";
import { localsOf } from "./syntax/walk.ts";

/** Top-level statements of a snippet. */
function body(text: string): Stmt[] {
  const parsed = parse(text, { file: "t.dss", kind: "code" });
  expect(parsed.diagnostics).toEqual([]);
  return parsed.ast.items as Stmt[];
}

/** The int locals of a snippet (with optional parameters). */
function intLocals(text: string, params: string[] = []): string[] {
  const b = body(text);
  return [...new IntProof(params, b, localsOf(params, b), { isUserFunction: () => false }).intLocals].sort();
}

/** The instructions of a snippet compiled with the int-specialised opcodes on (no encoding: they are reserved). */
function instructions(text: string, params: string[] = []): string[] {
  const env: CodegenEnv = {
    file: "t.dss",
    reporter: new Reporter("t.dss", text),
    hasInstance: false,
    self: null,
    other: null,
    event: null,
    objectScreen: null,
    lookupFunction: () => null,
    functionNames: () => [],
    assetKind: () => null,
    assetNames: () => [],
    objectInfo: () => null,
    isInstanceVariableName: () => false,
    intOps: true,
  };
  const f = compileFunction(env, { name: "f", params, body: body(text) });
  expect(env.reporter.diagnostics).toEqual([]);
  return f.code.map((i) => `${i.op} ${i.args.join(", ")}`);
}

describe("int proof: locals", () => {
  it("proves a counter that starts int and only grows by ints", () => {
    expect(intLocals("var n = 0\nfor (var i = 0; i < 10; i++) n += i * 2\nvar k = floor(n / 3)")).toEqual([
      "i",
      "k",
      "n",
    ]);
  });

  it("proves locals that depend on each other, and drops the whole cycle when one link is a fraction", () => {
    expect(intLocals("var a = 1\nvar b = a\na = b + 1")).toEqual(["a", "b"]);
    expect(intLocals("var a = 1\nvar b = a\na = b + 0.5")).toEqual([]);
  });

  it("never proves parameters, /=, var without a value, or a declaration that is not certainly first", () => {
    expect(intLocals("var a = p + 1", ["p"])).toEqual([]);
    expect(intLocals("var a = 4\na /= 2")).toEqual([]);
    expect(intLocals("var a\na = 1")).toEqual([]);
    expect(intLocals("if (true) { var a = 1 }\na += 1")).toEqual([]);
    expect(intLocals("var a = a + 1")).toEqual([]);
    expect(intLocals("x = a\nvar a = 1")).toEqual([]);
  });

  it("proves values from int builtins and constants, not from instance or fixed variables", () => {
    expect(intLocals("var w = room_width div 2\nvar r = irandom(5) + c_red\nvar l = array_length([1, 2])")).toEqual([
      "l",
      "r",
      "w",
    ]);
    expect(intLocals("var a = x\nvar b = 2 / 1\nvar c = 1 < 2\nvar d = hp + 1")).toEqual([]);
  });
});

describe("int-specialised opcodes", () => {
  it("uses ADDII/SUBII/MULII only when both operands are proved int", () => {
    expect(instructions("var a = irandom(9)\nvar b = irandom(9)\nvar c = a * b - a")).toContain("MULII 2, 0, 1");
    expect(instructions("var a = irandom(9)\nvar b = irandom(9)\nvar c = a * b - a")).toContain("SUBII 2, 2, 0");
    // A small literal still takes ADDI (one instruction, no register for the literal).
    expect(instructions("var a = irandom(9)\na += 1")).toContain("ADDI 0, 0, 1");
    // An operand that is not proved int keeps the tag-checked ADD.
    expect(instructions("var a = irandom(9)\nvar b = a + p", ["p"])).toContain("ADD 2, 1, 0");
  });

  it("uses CMPJII for comparisons of proved ints and for repeat's counter", () => {
    const loop = instructions("var n = 0\nfor (var i = 0; i < 300; i++) n += i");
    expect(loop.some((i) => i.startsWith("CMPJII 1, "))).toBe(true);
    expect(loop).toContain("ADDII 0, 0, 1");
    expect(instructions("repeat (3) show_debug_message(1)").some((i) => i.startsWith("CMPJII "))).toBe(true);
    expect(instructions("var f = 0.5\nif (f < 1) f = 0").some((i) => i.startsWith("CMPJ "))).toBe(true);
  });
});
