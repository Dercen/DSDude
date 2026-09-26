import { describe, expect, it } from "vitest";
import { parseKeyScript, screenshotUsesRanges, toRangeScript } from "./keys.ts";

describe("C8 key scripts", () => {
  it("parse change points with keys and one touch", () => {
    expect(parseKeyScript("# c\n0 -\n2 a+right\n6 b+T10,20\r\n7 -\n")).toEqual([
      { frame: 0, keys: [], touch: null },
      { frame: 2, keys: ["a", "right"], touch: null },
      { frame: 6, keys: ["b"], touch: [10, 20] },
      { frame: 7, keys: [], touch: null },
    ]);
  });

  it("reject bad lines, naming the line", () => {
    expect(() => parseKeyScript("0 -\n0 a\n")).toThrow(/line 2: frames must increase/);
    expect(() => parseKeyScript("3 jump\n")).toThrow(/line 1: unknown part "jump"/);
    expect(() => parseKeyScript("a 3\n")).toThrow(/line 1/);
  });

  it("translate to ADR-0003 ranges one frame later, as the selftest's first key files had them", () => {
    const c8 = "0 -\n49 right\n52 -\n59 T200,150\n64 -\n79 a\n81 -\n";
    expect(toRangeScript(parseKeyScript(c8), 110).split("\n").slice(1)).toEqual([
      "50-52 RIGHT",
      "60-64 TOUCH 200 150",
      "80-81 A",
      "",
    ]);
  });

  it("hold the last change until the last frame", () => {
    expect(toRangeScript(parseKeyScript("10 a+b\n"), 20)).toContain("11-20 A B\n");
  });

  it("detect which format tools/screenshot.py reads", () => {
    expect(screenshotUsesRanges("is not a frame or frame range like 30")).toBe(true);
    expect(screenshotUsesRanges("def parse_keys(path): # C8 change points")).toBe(false);
  });
});
