import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The compiler must run in a Web Worker (PLAN.md 6 WS4): nothing statically reachable from src/index.ts may import
 * a Node API or a Node-only package. Type-only imports are erased and dynamic `import()` calls run only in the CLI.
 */
const NODE_ONLY = [/^node:/, /^@dsdude\/toolchain$/, /^@dsdude\/project-format\/node$/, /^@dsdude\/dsdb\/node$/];

/** Static value imports of one source file (not `import type`, not dynamic `import()`). */
function valueImports(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(/^(?:import|export)\s+(?!type\s)[^;]*?from\s+"([^"]+)";/gms)) out.push(m[1] as string);
  return out;
}

describe("worker safety", () => {
  it("reaches no Node API from src/index.ts", () => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const spec of valueImports(file)) {
        if (NODE_ONLY.some((re) => re.test(spec))) offenders.push(`${file}: ${spec}`);
        else if (spec.startsWith(".")) visit(resolve(dirname(file), spec));
      }
    };
    visit(join(import.meta.dirname, "index.ts"));
    expect(seen.size).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
  });
});
