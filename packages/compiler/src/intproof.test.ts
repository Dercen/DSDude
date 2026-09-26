/**
 * The int proof and the int-specialised opcodes (codegen/intproof.ts; contracts/opcodes.json 51-54, PLAN.md 8's
 * M1 fallback). ADDII/SUBII/MULII/CMPJII skip the VM's tag checks, so they may appear only where both operands are
 * proved int; everything else keeps the tag-checked opcode.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { disassemble } from "@dsdude/dsdb";
import type { Project } from "@dsdude/project-format";
import { loadProject } from "@dsdude/project-format/node";
import type { AssetManifest } from "@dsdude/toolchain";
import { describe, expect, it } from "vitest";
import type { CodegenEnv } from "./codegen/env.ts";
import { compileFunction } from "./codegen/function.ts";
import { IntProof } from "./codegen/intproof.ts";
import { Reporter } from "./diagnostics/report.ts";
import { goldenText, REPO_ROOT, readBytes, UPDATING_GOLDENS } from "./golden.ts";
import { compileProjectModule, GAME_OPTIONS } from "./project.ts";
import type { Stmt } from "./syntax/ast.ts";
import { parse } from "./syntax/parser.ts";
import { localsOf } from "./syntax/walk.ts";
import { makeProject } from "./testing.ts";

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

describe("int variables (project-wide)", () => {
  const MANIFEST: AssetManifest = { provisional: true, sprites: {}, backgrounds: {}, sounds: {} };

  /** The disassembly of a two-object project compiled as a game, and its diagnostics. */
  function game(a: Record<string, string>, b: Record<string, string> = {}): string {
    const project = makeProject({ obj_a: { events: a }, obj_b: { events: b } });
    const r = compileProjectModule(project, MANIFEST, GAME_OPTIONS);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    return r.module === null ? "" : disassemble(r.module);
  }

  it("proves an instance variable whose every store, in every object, is an int", () => {
    const code = game({
      create: "score = 0\nlives = 3\n",
      step: "score = score + lives\nif (score > lives) lives -= 1\n",
    });
    expect(code).toMatch(/ADDII /);
    expect(code).toMatch(/CMPJII /);
  });

  it("drops it when any object stores a fraction, even through other.", () => {
    const code = game(
      { create: "score = 0\nlives = 3\n", step: "score = score + lives\n" },
      { step: "other.lives = 1.5\n" },
    );
    expect(code).not.toMatch(/ADDII /);
    expect(code).toMatch(/\bADD /);
  });

  it("proves globals the same way, and treats an element write as a non-int store", () => {
    expect(game({ create: "global.hi = 0\nglobal.hi = global.hi + irandom(3)\n" })).toMatch(/ADDII /);
    expect(game({ create: "global.hi = 0\nglobal.hi[0] = 1\nglobal.hi = global.hi + irandom(3)\n" })).not.toMatch(
      /ADDII /,
    );
  });

  it("proves int-typed builtin variables, writable ones included, and alarm elements", () => {
    expect(game({ step: "depth = depth + irandom(3)\n" })).toMatch(/ADDII /);
    expect(game({ step: "if (alarm[0] < irandom(9)) x = 0\n" })).toMatch(/CMPJII /);
  });

  it("never proves builtin variables the engine writes (x moves by hspeed)", () => {
    expect(game({ step: "x = 0\nx = x + irandom(3)\n" })).not.toMatch(/ADDII /);
  });
});

/**
 * The M1 gate (44,000 ops/frame on melonDS) is met only with the int-specialised opcodes (WS3's re-bench: 44,605
 * with them, 38,631 without), so a narrower int proof is an M1 regression. These tests make any loss visible.
 */
/** An empty provisional asset manifest (C4). */
const MANIFEST_EMPTY: AssetManifest = { provisional: true, sprites: {}, backgrounds: {}, sounds: {} };

describe("int-specialised share (M1 guard)", () => {
  /** Tag-checked forms that have an int-specialised twin. */
  const CHECKED = new Set(["ADD", "SUB", "MUL", "CMPJ"]);
  /** The int-specialised forms (opcodes 51-54). */
  const SPECIALISED = new Set(["ADDII", "SUBII", "MULII", "CMPJII"]);
  /**
   * The corpus-wide count of int-specialised instructions in fixtures/compiler (samples, conformance, perf) when this
   * guard was written. Lower it only on purpose, with the reason in docs/status/ws4.md.
   */
  const CORPUS_II_FLOOR = 38;

  /** Per function of a `.dsda` text: how many instructions are int-specialised and how many tag-checked. */
  function share(dsda: string): Record<string, { ii: number; checked: number }> {
    const out: Record<string, { ii: number; checked: number }> = {};
    let fn: string | null = null;
    for (const line of dsda.split("\n")) {
      const head = line.trim().split(/\s+/)[0] ?? "";
      if (head === ".func") fn = line.trim().split(/\s+/)[1] ?? null;
      else if (head === ".end") fn = null;
      else if (fn !== null && (SPECIALISED.has(head) || CHECKED.has(head))) {
        const counts = out[fn] ?? { ii: 0, checked: 0 };
        if (SPECIALISED.has(head)) counts.ii++;
        else counts.checked++;
        out[fn] = counts;
      }
    }
    return out;
  }

  it("compiles the int-mix benchmark with every ADD/SUB/MUL/CMPJ of its Step int-specialised", async () => {
    const loaded = await loadProject(join(REPO_ROOT, "fixtures/compiler/perf/int-mix"));
    expect(loaded.diagnostics).toEqual([]);
    const r = compileProjectModule(loaded.project as Project, MANIFEST_EMPTY, GAME_OPTIONS);
    expect(r.diagnostics).toEqual([]);
    const dsda = disassemble(r.module as NonNullable<typeof r.module>);
    const golden = "fixtures/compiler/perf/int-mix.dsda";
    expect(dsda).toBe(goldenText(golden, dsda));
    if (!UPDATING_GOLDENS) expect(r.dsdb).toEqual(readBytes(golden.replace(/\.dsda$/, ".dsdb")));
    const step = share(dsda).obj_worker__step;
    expect(step?.checked).toBe(0);
    expect(step?.ii).toBeGreaterThanOrEqual(10);
  });

  it("keeps the corpus's int-specialised share (report: fixtures/compiler/ii-share.json)", () => {
    const report: Record<string, Record<string, { ii: number; checked: number }>> = {};
    const root = join(REPO_ROOT, "fixtures/compiler");
    const files = readdirSync(root, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".dsda"))
      .map((f) => f.replace(/\\/g, "/"))
      .sort();
    let total = 0;
    for (const f of files) {
      const s = share(readFileSync(join(root, f), "utf8"));
      if (Object.keys(s).length === 0) continue;
      report[f] = s;
      for (const c of Object.values(s)) total += c.ii;
    }
    const text = `${JSON.stringify(report, null, 2)}\n`;
    expect(text).toBe(goldenText("fixtures/compiler/ii-share.json", text));
    expect(total).toBeGreaterThanOrEqual(CORPUS_II_FLOOR);
  });
});
