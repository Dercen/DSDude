import { describe, expect, it } from "vitest";
import { ASSET_CATALOG } from "./catalog.ts";

/** Words contracts/diagnostics.md bans from messages and hints. */
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
/** E4xx codes this catalog may use: E400-E489 (E490-E499 are the compiler's). */
const OWN_CODE = /^E4[0-8]\d$/;
/** Codes that are warnings: colour reduction, the missing icon and a dropped loop (contracts/assetpack.md 10). */
const WARNINGS = ["E407", "E418", "E419"];

describe("ASSET_CATALOG", () => {
  const entries = Object.entries(ASSET_CATALOG);

  it("uses only its own E4xx range, keyed by code", () => {
    for (const [key, e] of entries) {
      expect(e.code).toBe(key);
      expect(e.code).toMatch(OWN_CODE);
    }
  });

  it("never uses a banned word", () => {
    for (const [, e] of entries) {
      const text = `${e.message} ${e.hint ?? ""}`.toLowerCase();
      for (const word of BANNED) expect([e.code, text.includes(word)]).toEqual([e.code, false]);
    }
  });

  it("has the severities of contracts/assetpack.md section 10", () => {
    for (const [code, e] of entries)
      expect([code, e.severity]).toEqual([code, WARNINGS.includes(code) ? "warning" : "error"]);
  });

  it("fills the DoD examples word for word", () => {
    const fill = (t: string, a: Record<string, string | number>) =>
      t.replace(/\{(\w+)\}/g, (_, k: string) => String(a[k]));
    const e401 = ASSET_CATALOG.E401;
    expect(`${fill(e401.message, { name: "spr_boss", width: 100, height: 100, max: 64 })} ${e401.hint}`).toBe(
      "spr_boss is 100x100. DS sprites can be at most 64x64. Shrink it, or make it a Background.",
    );
    const e415 = ASSET_CATALOG.E415;
    const args = { name: "rm_game", count: 18, screen: "top", max: 16, list: "spr_a or spr_b" };
    expect(`${fill(e415.message, args)} ${fill(e415.hint ?? "", args)}`).toBe(
      "rm_game needs 18 colour sets on the top screen, but the DS has 16. Reduce spr_a or spr_b to 16 colours.",
    );
  });
});
