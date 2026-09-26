import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { REPO_ROOT } from "./testing/golden.ts";

/** Follows the relative imports of a module and returns every module it reaches. */
function closure(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/(?:import|export)[^"';]*?from\s+"(\.[^"]+)"/g)) {
    closure(path.resolve(path.dirname(file), m[1] as string), seen);
  }
  return seen;
}

describe("@dsdude/asset-pipeline/browser", () => {
  it("reaches no Node module, so the IDE renderer can import it", () => {
    const src = path.join(REPO_ROOT, "packages/asset-pipeline/src");
    const files = closure(path.join(src, "browser.ts"));
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      // Type-only imports are erased; value imports of node:* or Node-side packages are not allowed.
      const values = [...text.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1] as string);
      const bad = values.filter((m) => m.startsWith("node:") || m === "@dsdude/toolchain" || m.endsWith("/node"));
      expect([path.relative(src, f), bad]).toEqual([path.relative(src, f), []]);
    }
    expect(files.size).toBeGreaterThan(10);
    expect(readdirSync(src)).toContain("browser.ts");
  });
});
