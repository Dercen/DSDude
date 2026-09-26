import { DIAGNOSTIC_CODE } from "@dsdude/project-format";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS, COMPILER_CATALOG, COMPILER_CATALOG_ENTRIES } from "./catalog.ts";

/** Ranges this catalog may use (contracts/diagnostics.md): E1xx, E2xx except E29x, E3xx, E49x, W0xx. */
const OWNED_CODE = /^(E1\d\d|E2[0-8]\d|E3\d\d|E49\d|W0\d\d)$/;

describe("compiler catalog", () => {
  it("keys each entry by its own code, inside WS4's ranges", () => {
    for (const [key, entry] of Object.entries(COMPILER_CATALOG)) {
      expect(entry.code).toBe(key);
      expect(entry.code).toMatch(DIAGNOSTIC_CODE);
      expect(entry.code).toMatch(OWNED_CODE);
      expect(entry.severity).toBe(entry.code.startsWith("W") ? "warning" : "error");
    }
  });

  it("never uses a banned word (contracts/diagnostics.md)", () => {
    for (const entry of COMPILER_CATALOG_ENTRIES) {
      const text = `${entry.title} ${entry.message} ${entry.hint ?? ""}`.toLowerCase();
      for (const word of BANNED_WORDS)
        expect(text, `${entry.code} uses "${word}"`).not.toMatch(new RegExp(`\\b${word}`));
    }
  });
});
