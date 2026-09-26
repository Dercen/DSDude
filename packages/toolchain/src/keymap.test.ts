import { describe, expect, it } from "vitest";
import { SUPPORTED_KEYS } from "./api.ts";
import { DEFAULT_KEYS, DS_BUTTONS, resolveKeys, translateKey } from "./keymap.ts";

describe("keymap (ADR-0007)", () => {
  it("translates every supported key for both emulators, and nothing else", () => {
    const qt = new Set<number>();
    const vk = new Set<number>();
    for (const key of SUPPORTED_KEYS) {
      const codes = translateKey(key);
      expect(codes, key).not.toBeNull();
      qt.add(codes?.[0] ?? -1);
      vk.add(codes?.[1] ?? -1);
    }
    // No two keys share a code.
    expect(qt.size).toBe(SUPPORTED_KEYS.length);
    expect(vk.size).toBe(SUPPORTED_KEYS.length);
    for (const key of ["F1", "Escape", "Alt", "Meta", "", "ab", "é", "Unidentified", "Numpad1"]) {
      expect(translateKey(key), key).toBeNull();
    }
  });

  it("reads an upper-case letter as the same key", () => {
    expect(translateKey("X")).toEqual(translateKey("x"));
    expect(translateKey("x")).toEqual([0x58, 0x58]);
  });

  it("keeps the codes of the verified default mapping", () => {
    const r = resolveKeys();
    expect(r.diagnostics).toEqual([]);
    expect(r.qt).toEqual({
      a: 88,
      b: 90,
      x: 83,
      y: 65,
      l: 81,
      r: 87,
      start: 16777220,
      select: 16777248,
      up: 16777235,
      down: 16777237,
      left: 16777234,
      right: 16777236,
    });
    expect(r.vk).toEqual({
      a: 0x58,
      b: 0x5a,
      x: 0x53,
      y: 0x41,
      l: 0x51,
      r: 0x57,
      start: 0x0d,
      select: 0x10,
      up: 0x26,
      down: 0x28,
      left: 0x25,
      right: 0x27,
    });
  });

  it("is the IDE's default mapping (C5 ControlsSchema defaults) in C6 button order", () => {
    // @dsdude/ipc-contract depends on this package, so its defaults are restated here.
    expect(DEFAULT_KEYS).toEqual({
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
      a: "x",
      b: "z",
      x: "s",
      y: "a",
      l: "q",
      r: "w",
      start: "Enter",
      select: "Shift",
    });
    expect(Object.keys(DEFAULT_KEYS)).toEqual(DS_BUTTONS);
    for (const key of Object.values(DEFAULT_KEYS)) expect(SUPPORTED_KEYS).toContain(key);
  });

  it("falls back per button with one E625 warning each", () => {
    const r = resolveKeys({ a: "Escape", b: "k", select: "Alt" });
    expect(r.keys).toMatchObject({ a: "x", b: "k", select: "Shift" });
    expect(r.diagnostics.map((d) => [d.code, d.severity, d.message])).toEqual([
      ["E625", "warning", "The key 'Escape' can't be used for the A button, so A stays on x."],
      ["E625", "warning", "The key 'Alt' can't be used for the Select button, so Select stays on Shift."],
    ]);
  });
});
