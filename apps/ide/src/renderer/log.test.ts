import { describe, expect, it } from "vitest";
import { parseLogLine } from "./log.ts";

describe("C8 log lines", () => {
  it("turns READY, LOG and EXIT into Output lines", () => {
    expect(parseLogLine("DSD|READY|0.1.0|0dd9987a")).toEqual({
      type: "output",
      line: { kind: "ready", text: "Game started (runtime 0.1.0)" },
    });
    expect(parseLogLine("DSD|LOG|score: 3 | best 5\r")).toEqual({
      type: "output",
      line: { kind: "log", text: "score: 3 | best 5" },
    });
    expect(parseLogLine("DSD|EXIT|0")).toMatchObject({ line: { kind: "exit" } });
  });

  it("drops the flush pad and unknown line types", () => {
    expect(parseLogLine(`DSD|PAD|${".".repeat(1014)}`)).toEqual({ type: "drop" });
    expect(parseLogLine("DSD|FUTURE|x")).toEqual({ type: "drop" });
  });

  it("makes a Problems entry from DSD|ERR, keeping '|' in the message", () => {
    const p = parseLogLine("DSD|ERR|R510|obj_bird|Step|objects/obj_bird/step.dss|7|spr_x is not loaded | in rm_game");
    expect(p.type).toBe("error");
    if (p.type !== "error") return;
    expect(p.line.text).toBe(
      "Error R510 in obj_bird Step (objects/obj_bird/step.dss:7): spr_x is not loaded | in rm_game",
    );
    expect(p.diagnostic).toMatchObject({
      code: "R510",
      file: "objects/obj_bird/step.dss",
      line: 7,
      source: "runtime",
      message: "spr_x is not loaded | in rm_game",
    });
    const unknownLine = parseLogLine("DSD|ERR|R501|obj_a|Create|objects/obj_a/create.dss|0|boom");
    expect(unknownLine.type === "error" && unknownLine.diagnostic?.line).toBeNull();
    const badCode = parseLogLine("DSD|ERR|X1|o|e|f|1|m");
    expect(badCode.type === "error" && badCode.diagnostic).toBeNull();
  });

  it("parses STAT and MEM figures", () => {
    expect(parseLogLine("DSD|STAT|fps=60,inst=14,oam_drop=0,aff_drop=2")).toEqual({
      type: "stat",
      stats: { fps: 60, inst: 14, oam_drop: 0, aff_drop: 2 },
    });
    const mem = parseLogLine("DSD|MEM|inst=14/512,snd=120/768");
    expect(mem.type === "mem" && mem.usage).toEqual({ inst: { used: 14, total: 512 }, snd: { used: 120, total: 768 } });
  });
});
