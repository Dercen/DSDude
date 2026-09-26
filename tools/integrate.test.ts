import { describe, expect, it } from "vitest";
import { registryTargets, STREAMS, statusPushTarget } from "./lib/integrate.ts";

describe("integrate helpers", () => {
  it("reads push targets from the registry lines", () => {
    const text =
      "# Cloud\n\n    - WS9: example; push target `x`\n- WS2: environment `dsdude-ws2`; session u; push target `ws2-runtime-core`; started d; last merged -\n- WS4: environment `dsdude-ws4`; push target `claude/ws4-compiler`; last merged abc\n";
    expect([...registryTargets(text)]).toEqual([
      ["WS2", "ws2-runtime-core"],
      ["WS4", "claude/ws4-compiler"],
    ]);
  });

  it("reads a status file's Cloud push target line with or without a list prefix", () => {
    expect(statusPushTarget("# WS4\nCloud push target: `ws4-compiler`\n")).toBe("ws4-compiler");
    expect(statusPushTarget("# WS2\n- Cloud push target: `claude/ws2-runtime-core` (since D+1)\n")).toBe(
      "claude/ws2-runtime-core",
    );
    expect(statusPushTarget("# WS5\nno target yet\n")).toBeNull();
  });

  it("integrates contract producers first", () => {
    expect(STREAMS.map((s) => s.ws)).toEqual(["WS1", "WS8", "WS4", "WS2", "WS3", "WS5", "WS6", "WS6b", "WS7"]);
  });
});
