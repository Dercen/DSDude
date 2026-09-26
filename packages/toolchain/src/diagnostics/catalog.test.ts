import { DiagnosticSchema } from "@dsdude/project-format";
import { describe, expect, it } from "vitest";
import { TOOLCHAIN_CATALOG, TOOLCHAIN_CATALOG_ENTRIES, toolchainDiagnostic } from "./catalog.ts";

// contracts/diagnostics.md: never in messages or hints.
const BANNED = [
  "instruction",
  "token",
  "identifier",
  "operand",
  "arity",
  "expression",
  "opcode",
  "vram",
  "oam",
  "palette slot",
];

describe("E6xx catalog", () => {
  it("keys match codes, all in E600-E699, all errors", () => {
    for (const [key, entry] of Object.entries(TOOLCHAIN_CATALOG)) {
      expect(entry.code).toBe(key);
      expect(entry.code).toMatch(/^E6\d\d$/);
      expect(entry.severity).toBe("error");
    }
    expect(TOOLCHAIN_CATALOG_ENTRIES).toHaveLength(Object.keys(TOOLCHAIN_CATALOG).length);
  });

  it("uses none of the banned words", () => {
    for (const entry of TOOLCHAIN_CATALOG_ENTRIES) {
      const text = `${entry.title} ${entry.message} ${entry.hint ?? ""}`.toLowerCase();
      for (const word of BANNED) expect(text, `${entry.code} uses '${word}'`).not.toMatch(new RegExp(`\\b${word}\\b`));
    }
  });

  it("builds valid C9 diagnostics with the toolchain source", () => {
    const d = toolchainDiagnostic("E601", { tool: "grit", path: "C:\\x\\grit.exe" });
    expect(DiagnosticSchema.parse(d)).toEqual(d);
    expect(d).toMatchObject({ source: "toolchain", message: "grit is missing: C:\\x\\grit.exe does not exist." });
  });
});
