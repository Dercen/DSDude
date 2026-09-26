import { ControlsSchema } from "@dsdude/ipc-contract";
import { describe, expect, it } from "vitest";
import { controlsLine, controlsRows, DEFAULT_CONTROLS, effectiveControls, keyLabel } from "./controls.ts";

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

describe("effective controls", () => {
  it("are the defaults until C4 can apply rebound keys (ADR-0007)", () => {
    expect(effectiveControls({ controls: ControlsSchema.parse({ a: "k" }) })).toEqual(DEFAULT_CONTROLS);
    expect(effectiveControls(null).a).toBe("x");
  });
});
