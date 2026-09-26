import { ControlsSchema } from "@dsdude/ipc-contract";
import { describe, expect, it } from "vitest";
import { controlsLine, controlsRows, DEFAULT_CONTROLS, effectiveControls, keyLabel, sharedKeys } from "./controls.ts";

describe("Controls text", () => {
  it("matches the PLAN.md 6 WS6 mapping with the default keys", () => {
    expect(controlsLine(ControlsSchema.parse({}))).toBe(
      "Controls: Arrows = D-pad, X = A, Z = B, S = X, A = Y, Q = L, W = R, Enter = Start, Shift = Select, click the bottom screen to touch",
    );
  });

  it("lists each direction when the arrows are rebound", () => {
    const rows = controlsRows(ControlsSchema.parse({ up: "i", left: "j", down: "k", right: "l" }));
    expect(rows.slice(0, 4)).toEqual([
      ["Up", "I"],
      ["Down", "K"],
      ["Left", "J"],
      ["Right", "L"],
    ]);
    expect(keyLabel(" ")).toBe("Space");
    expect(keyLabel("ArrowLeft")).toBe("Left");
  });
});

describe("effective controls (ADR-0007)", () => {
  it("are the user's keys, letters in either case, with the default for a key the emulator cannot use", () => {
    const controls = ControlsSchema.parse({ a: "K", b: "/", start: "F13" });
    const eff = effectiveControls({ controls }, ["k", "/", "Enter", ...Object.values(DEFAULT_CONTROLS)]);
    expect(eff.a).toBe("k");
    expect(eff.b).toBe("/");
    expect(eff.start).toBe("Enter");
    expect(effectiveControls({ controls }).start).toBe("F13");
    expect(effectiveControls(null)).toEqual(DEFAULT_CONTROLS);
  });

  it("finds buttons sharing a key", () => {
    expect([...sharedKeys(ControlsSchema.parse({ a: "z", b: "Z" }))]).toEqual([["z", ["a", "b"]]]);
    expect(sharedKeys(DEFAULT_CONTROLS).size).toBe(0);
  });
});
