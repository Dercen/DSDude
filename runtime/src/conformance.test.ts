import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  comparable,
  compareLogs,
  normalizeLine,
  objBox,
  type ProgramCase,
  parseProgramCases,
  placeholderGrf,
  readyAbi,
  spriteAssets,
} from "./conformance.ts";

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

  it("masks the READY line's ABI hash (checked separately by readyAbi)", () => {
    expect(normalizeLine("DSD|READY|0.1.0|f1d376bb")).toBe("DSD|READY|0.1.0|xxxxxxxx");
    expect(compareLogs(["DSD|READY|0.1.0|f1d376bb", "DSD|LOG|hello", "DSD|EXIT|0"], host, exited)).toBe(null);
    expect(readyAbi(["DSD|LOG|x", "DSD|READY|0.1.0|f1d376bb"])).toBe("f1d376bb");
    expect(readyAbi(["DSD|LOG|x"])).toBe(null);
  });

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

describe("placeholder sprites", () => {
  it("reads the .asset sprite lines of a .dsda, with 16x16 when size= is missing", () => {
    const dsda = [
      '.asset sprite spr_box "gfx/spr_box.grf" 2 origin=0,0 size=16,16 bbox=0,0,15,15',
      '.asset sprite spr_c "gfx/spr_c.grf" 3 origin=2,3 size=12,10 bbox=0,0,11,9',
      '.asset sprite spr_dummy "gfx/spr_dummy.grf" 1',
      '.asset sound snd_x "" 0',
    ].join("\n");
    expect(spriteAssets(dsda)).toEqual([
      { path: "gfx/spr_box.grf", frames: 2, width: 16, height: 16 },
      { path: "gfx/spr_c.grf", frames: 3, width: 12, height: 10 },
      { path: "gfx/spr_dummy.grf", frames: 1, width: 16, height: 16 },
    ]);
  });

  it("pads a frame to the smallest OBJ size (C3)", () => {
    expect(objBox(12, 10)).toEqual([16, 16]);
    expect(objBox(20, 8)).toEqual([32, 8]);
    expect(objBox(8, 9)).toEqual([8, 16]);
    expect(objBox(64, 64)).toEqual([64, 64]);
    expect(objBox(65, 8)).toBe(null);
  });

  it("writes a GRF with grit's chunk layout", () => {
    const g = placeholderGrf(16, 16, 3);
    const dv = new DataView(g.buffer);
    const tag = (at: number) => new TextDecoder().decode(g.subarray(at, at + 4));
    expect([tag(0), tag(8), tag(12)]).toEqual(["RIFF", "GRF ", "HDRX"]);
    expect(dv.getUint32(4, true)).toBe(g.length - 8);
    expect([dv.getUint16(20, true), dv.getUint16(22, true), dv.getUint32(36, true), dv.getUint32(40, true)]).toEqual([
      2, 8, 16, 48,
    ]);
    expect(tag(44)).toBe("GFX ");
    expect(dv.getUint32(48, true)).toBe(4 + 16 * 16 * 3);
    expect(dv.getUint32(52, true)).toBe((16 * 16 * 3) << 8);
    const pal = 44 + 8 + 4 + 16 * 16 * 3;
    expect(tag(pal)).toBe("PAL ");
  });
});
