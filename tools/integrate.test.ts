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

describe("watch trigger", async () => {
  const { due } = await import("./lib/watch.ts");
  const M = 60_000;
  const t0 = 1_000_000_000_000;
  const o = { quietMin: 10, maxWaitMin: 45, gapMin: 30, force: false };
  const p = [{ ws: "WS4", ref: "origin/ws4-compiler", sha: "b", commits: 2 }];
  const seen = (since: number, first = since) => ({ WS4: { sha: "b", since, first } });

  it("waits for a quiet period and the gap since the last run", () => {
    expect(due({ attempted: {}, seen: seen(t0) }, p, t0 + 5 * M, o)).toEqual([]);
    expect(due({ attempted: {}, seen: seen(t0) }, p, t0 + 10 * M, o)).toEqual(p);
    expect(due({ lastRun: t0, attempted: {}, seen: seen(t0) }, p, t0 + 20 * M, o)).toEqual([]);
    expect(due({ lastRun: t0, attempted: {}, seen: seen(t0) }, p, t0 + 30 * M, o)).toEqual(p);
  });

  it("does not wait forever for a busy stream", () => {
    const busy = { attempted: {}, seen: seen(t0 + 44 * M, t0) };
    expect(due(busy, p, t0 + 44 * M, o)).toEqual([]);
    expect(due(busy, p, t0 + 45 * M, o)).toEqual(p);
  });

  it("ignores a tip it already attempted, and a request forces a run", () => {
    expect(due({ attempted: { WS4: "b" }, seen: seen(t0) }, p, t0 + 60 * M, o)).toEqual([]);
    expect(due({ lastRun: t0, attempted: {}, seen: seen(t0) }, p, t0 + M, { ...o, force: true })).toEqual(p);
  });
});
