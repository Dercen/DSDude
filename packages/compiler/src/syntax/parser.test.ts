import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import type { Expr, Stmt } from "./ast.ts";
import { type FileKind, parse } from "./parser.ts";

/** Repository root, three levels above packages/compiler/src/syntax. */
const ROOT = join(import.meta.dirname, "..", "..", "..", "..");

/** Every .dss file under `dir`, recursively. */
function dssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return dssFiles(path);
    return name.endsWith(".dss") ? [path] : [];
  });
}

/** functions.dss and scripts/*.dss hold only functions (language.md section 1). */
function kindOf(path: string): FileKind {
  return path.endsWith(`${sep}functions.dss`) || path.includes(`${sep}scripts${sep}`) ? "functions" : "code";
}

/** Renders a value as a compact prefix form, so precedence tests stay readable. */
function show(e: Expr): string {
  switch (e.kind) {
    case "number":
      return e.repr === "int" ? String(e.value) : `${e.value}q`;
    case "string":
      return JSON.stringify(e.value);
    case "bool":
      return String(e.value);
    case "undefined":
      return "undefined";
    case "special":
      return e.which;
    case "name":
      return e.name;
    case "global":
      return `global.${e.name}`;
    case "member":
      return `${show(e.object)}.${e.name}`;
    case "index":
      return `${show(e.object)}[${show(e.index)}]`;
    case "call":
      return `${show(e.callee)}(${e.args.map(show).join(" ")})`;
    case "unary":
      return `(${e.op} ${show(e.operand)})`;
    case "binary":
      return `(${e.op} ${show(e.left)} ${show(e.right)})`;
    case "ternary":
      return `(? ${show(e.cond)} ${show(e.then)} ${show(e.otherwise)})`;
    case "array":
      return `[${e.items.map(show).join(" ")}]`;
    case "error":
      return "<error>";
  }
}

/** Parses `text` as one assignment `x = <value>` and shows the value. */
function value(text: string): string {
  const r = parse(`x = ${text}`, { file: null, kind: "code" });
  expect(r.diagnostics.map((d) => d.code)).toEqual([]);
  const stmt = r.ast.items[0] as Stmt;
  if (stmt.kind !== "assign") throw new Error(`not an assignment: ${stmt.kind}`);
  return show(stmt.value);
}

/** Parses `text` and returns its diagnostics as "CODE line:col". */
function diags(text: string, kind: FileKind = "code"): string[] {
  return parse(text, { file: "t.dss", kind }).diagnostics.map((d) => `${d.code} ${d.line}:${d.col}`);
}

describe("parser: the repository's own DSS", () => {
  const files = [...dssFiles(join(ROOT, "samples")), ...dssFiles(join(ROOT, "fixtures", "conformance"))];

  it("finds the samples and the conformance programs", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  for (const path of files) {
    it(`parses ${relative(ROOT, path).split(sep).join("/")} with zero diagnostics`, () => {
      const text = readFileSync(path, "utf8").replace(/\r/g, "");
      const r = parse(text, { file: null, kind: kindOf(path) });
      expect(r.diagnostics).toEqual([]);
      expect(r.ast.items.length).toBeGreaterThan(0);
    });
  }
});

describe("parser: values", () => {
  it("follows the precedence table (language.md section 3)", () => {
    expect(value("1 + 2 * 3")).toBe("(+ 1 (* 2 3))");
    expect(value("a - b - c")).toBe("(- (- a b) c)");
    expect(value("a || b && c == d < e + f * -g")).toBe("(|| a (&& b (== c (< d (+ e (* f (- g)))))))");
    expect(value("a div b mod c % d")).toBe("(% (mod (div a b) c) d)");
    expect(value("!a == b")).toBe("(== (! a) b)");
    expect(value("a ? b : c ? d : e")).toBe("(? a b (? c d e))");
    expect(value("a || b ? 1 : 2")).toBe("(? (|| a b) 1 2)");
  });

  it("reads postfix chains, literals and arrays", () => {
    expect(value("other.scored")).toBe("other.scored");
    expect(value("a[i][j].x")).toBe("a[i][j].x");
    expect(value("f(1, g(2), [3, 4])")).toBe("f(1 g(2) [3 4])");
    expect(value("global.score + 1")).toBe("(+ global.score 1)");
    expect(value('[true, undefined, noone, "s", 0.5]')).toBe('[true undefined noone "s" 2048q]');
    expect(value("-2147483648")).toBe("-2147483648");
    expect(value("(1 + 2) * 3")).toBe("(* (+ 1 2) 3)");
  });

  it("reads = as == inside conditions and nested values, with W030", () => {
    const r = parse("if (a = b) x = (c = d)", { file: null, kind: "code" });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["W030", "W030"]);
    const stmt = r.ast.items[0] as Stmt;
    if (stmt.kind !== "if" || stmt.then.kind !== "assign") throw new Error("shape");
    expect(show(stmt.cond)).toBe("(== a b)");
    expect(show(stmt.then.value)).toBe("(== c d)");
  });
});

describe("parser: statements", () => {
  it("ends statements without semicolons where the next token cannot continue", () => {
    const r = parse("x = 1 y = 2\nz += 3; w++\nf()", { file: null, kind: "code" });
    expect(r.diagnostics).toEqual([]);
    expect(r.ast.items.map((s) => s.kind)).toEqual(["assign", "assign", "assign", "incdec", "call"]);
  });

  it("parses every statement form", () => {
    const text = [
      "var a = 1, b",
      "if (a) b = 1 else { b = 2 }",
      "while (a < 3) a++",
      "do a-- until (a <= 0);",
      "for (var i = 0; i < 3; i += 1) {}",
      "for (;;) break",
      "repeat (4) continue",
      "switch (a) { case 1: case 2: b = 1; break; default: exit }",
      "with (obj_pipe) hspeed = 0",
      "return",
      "function f(p, q = 2) { return p + q }",
      ";",
    ].join("\n");
    const r = parse(text, { file: null, kind: "code" });
    expect(r.diagnostics).toEqual([]);
    expect(r.ast.items.map((s) => s.kind)).toEqual([
      "var",
      "if",
      "while",
      "do",
      "for",
      "for",
      "repeat",
      "switch",
      "with",
      "return",
      "function",
      "empty",
    ]);
  });

  it("keeps a return value on the return's own line", () => {
    const r = parse("function f() {\n  return\n  g()\n}", { file: null, kind: "functions" });
    expect(r.diagnostics).toEqual([]);
    const fn = r.ast.items[0];
    if (fn?.kind !== "function") throw new Error("shape");
    expect(fn.body.body.map((s) => s.kind)).toEqual(["return", "call"]);
  });

  it("records source ranges", () => {
    const r = parse("  foo(1)", { file: null, kind: "code" });
    expect(r.ast.items[0]).toMatchObject({ kind: "call", start: 2, end: 8 });
  });
});

describe("parser: one mistake yields one diagnostic", () => {
  // Each case: source text and the single diagnostic it must produce ("CODE line:col").
  const cases: [string, string, string][] = [
    ["missing ) before {", "if (a > b {\n  x = 1\n}\ny = 2", "E101 1:4"],
    ["missing ) at the end of a line", "f(a, b\nx = 1", "E101 1:2"],
    ["missing ) at the end of the file", "x = (1 + 2", "E101 1:5"],
    ["missing ]", "x = [1, 2", "E102 1:5"],
    ["missing } at the end of the file", "if (a) {\n  x = 1\n", "E103 1:8"],
    ["missing } before the next function", "function a() {\n  x = 1\nfunction b() {\n  y = 2\n}", "E103 1:14"],
    ["extra }", "}\nx = 1", "E104 1:1"],
    ["extra )", "x = 1)\ny = 2", "E104 1:6"],
    ["missing comma", "f(a b)\nx = 1", "E123 1:5"],
    ["missing value at the end of a line", "x = \ny = 2", "E112 1:3"],
    ["missing value before )", "x = 1 + )", "E112 1:9"],
    ["== used to assign", "x == 5", "E115 1:1"],
    ["value not used", "x + 1", "E114 1:1"],
    ["assigning to a number", "5 = x", "E116 1:1"],
    ["if without brackets", "if x > 1 { y = 2 }", "E117 1:4"],
    ["statement in a functions file", "x = 1\ny = 2\nfunction f() {}", "E118 1:1"],
    ["var without a name", "var = 3", "E119 1:1"],
    ["case outside switch", "case 1: x = 1", "E120 1:1"],
    ["++ inside a line", "x = a++", "E121 1:6"],
    ["++ before the name", "++x", "E121 1:1"],
    ["bit operator", "x = a & b", "E122 1:7"],
    ["missing ; in for", "for (i = 0 i < 3; i++) {}", "E123 1:12"],
    ["missing until", "do { x++ } while (x < 3)", "E123 1:12"],
    ["missing : in ?", "x = a ? b", "E123 1:10"],
    ["global without a name", "global = 3", "E123 1:8"],
    ["default before required", "function f(a = 1, b) {}", "E124 1:19"],
    ["else without if", "else x = 1", "E125 1:1"],
    ["keyword as a name", "var if = 3", "E126 1:5"],
    ["function inside an if", "if (x) function f() {}", "E127 1:8"],
    ["single quotes", "s = 'hi'", "E128 1:5"],
    ["code before the first case", "switch (x) { y = 1; case 1: z = 2 }", "E129 1:14"],
    ["unclosed text", 's = "abc\ny = 2', "E105 1:5"],
    ["unknown escape", 's = "a\\qb"', "E106 1:7"],
    ["unknown character", "x = @y", "E110 1:5"],
    ["condition that fails inside its brackets", "if (x > ) {\n  y = 1\n}\nz = 2", "E112 1:9"],
    ["line starting with (", "x = y\n(z)", "W032 2:1"],
  ];

  for (const [name, text, expected] of cases) {
    it(name, () => {
      expect(diags(text, name.includes("functions file") ? "functions" : "code")).toEqual([expected]);
    });
  }

  it("keeps checking after a recovered mistake (a second, separate mistake is reported)", () => {
    expect(diags("if (x > ) {\n  y = 1\n}\nz = 2 +")).toEqual(["E112 1:9", "E112 4:7"]);
    expect(diags("f(a, b\ng(c d)")).toEqual(["E101 1:2", "E123 2:5"]);
  });

  it("gives diagnostics the C9 shape", () => {
    const [d] = parse("x = (1 + 2", { file: "objects/obj_a/step.dss", kind: "code" }).diagnostics;
    expect(d).toEqual({
      severity: "error",
      code: "E101",
      message: "The ( on line 1 is never closed.",
      hint: "Add a ) where the part in brackets ends.",
      file: "objects/obj_a/step.dss",
      line: 1,
      col: 5,
      endLine: null,
      endCol: null,
      source: "compiler",
    });
  });
});
