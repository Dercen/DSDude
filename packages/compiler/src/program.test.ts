import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assemble, decode, disassemble, encode } from "@dsdude/dsdb";
import { describe, expect, it } from "vitest";
import { COMPILER_BUILTINS_ENV } from "./codegen/abi.ts";
import { goldenText, REPO_ROOT, readBytes, UPDATING_GOLDENS } from "./golden.ts";
import { compileProgram, MAIN_FUNCTION } from "./program.ts";

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
      const r = compileProgram(text, { file: `${tier}/${name}` });
      expect(r.diagnostics).toEqual([]);
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
    const r = compileProgram("var a = 1\nvar b = a + 2\nshow_debug_message(b)", { file: "t.dss" });
    expect(disassemble(r.module as NonNullable<typeof r.module>)).toContain(
      ["    LOADI r0, 1", '    .loc "t.dss" 2', "    LOADI r2, 2", "    ADD r1, r0, r2"].join("\n"),
    );
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
