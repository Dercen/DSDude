import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { comparable, compareLogs, normalizeLine, type ProgramCase, parseProgramCases } from "./conformance.ts";

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const exited: ProgramCase = {
  dsdb: "x.dsdb",
  expected: "x.out",
  logOnly: false,
  state: "EXITED",
  frames: 0,
  keys: null,
};

describe("WS2's case table", () => {
  it("parses runtime/tests/test_programs.c", () => {
    const cases = parseProgramCases(readFileSync(path.join(runtimeDir, "tests", "test_programs.c"), "utf8"));
    expect(cases.length).toBeGreaterThanOrEqual(30);
    expect(cases[0]).toEqual({
      ...exited,
      dsdb: "fixtures/bytecode/hello.dsdb",
      expected: "fixtures/bytecode/hello.out",
    });
    expect(cases.some((c) => c.state === "RUNNING" && c.frames > 0)).toBe(true);
    expect(cases.some((c) => c.keys?.endsWith(".keys"))).toBe(true);
    expect(cases.some((c) => c.logOnly)).toBe(true);
  });

  it("refuses a file without the table", () => {
    expect(() => parseProgramCases("int x;")).toThrow(/CASES/);
  });
});

describe("log comparison", () => {
  const host = ["DSD|READY|0.1.0|0dd9987a", "DSD|LOG|hello", "DSD|EXIT|0", ""];

  it("keeps only the core's DSD|MEM figures", () => {
    expect(normalizeLine("DSD|MEM|inst=1/512,arena=0/512,heapfree=3000,cstack=4/10")).toBe(
      "DSD|MEM|inst=1/512,arena=0/512",
    );
    expect(normalizeLine("DSD|LOG|x")).toBe("DSD|LOG|x");
  });

  it("drops pads, STAT lines, CRs and non-DSD| output", () => {
    expect(comparable(["DSD|PAD|....", "noise", "DSD|STAT|fps=60", "DSD|LOG|a\r"], false)).toEqual(["DSD|LOG|a"]);
    expect(comparable(["DSD|READY|x|y", "DSD|LOG|a"], true)).toEqual(["DSD|LOG|a"]);
  });

  it("wants an exact match for a game that ended", () => {
    expect(compareLogs(["DSD|READY|0.1.0|0dd9987a", "DSD|PAD|..", "DSD|LOG|hello", "DSD|EXIT|0"], host, exited)).toBe(
      null,
    );
    expect(compareLogs(["DSD|READY|0.1.0|0dd9987a", "DSD|LOG|bye", "DSD|EXIT|0"], host, exited)).toMatch(/^line 2:/);
    expect(compareLogs(["DSD|READY|0.1.0|0dd9987a"], host, exited)).toMatch(/ends after 1 lines/);
    expect(compareLogs([...host.slice(0, 3), "DSD|LOG|more"], host, exited)).toMatch(/1 extra lines/);
  });

  it("accepts a longer DS log for a game still running after the host's frames", () => {
    const running = { ...exited, state: "RUNNING" as const, frames: 3 };
    expect(
      compareLogs(["DSD|READY|0.1.0|0dd9987a", "DSD|LOG|hello", "DSD|EXIT|0", "DSD|LOG|later"], host, running),
    ).toBe(null);
  });
});
