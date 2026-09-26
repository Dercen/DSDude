// Shared by the generators: write outputs, or with --check compare them byte for byte (PLAN.md 5: LF endings,
// "/" separators, code-point order, so Windows and Linux produce the same bytes).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const repoRoot = resolve(import.meta.dirname, "../..");

export interface Output {
  /** Repo-relative path with "/" separators. */
  path: string;
  content: string | Uint8Array;
}

/** Writes (or checks, when `check`) every output; returns the process exit code. */
export function emit(tool: string, outputs: Output[], check: boolean): number {
  const stale: string[] = [];
  for (const o of outputs) {
    const file = resolve(repoRoot, o.path);
    const want = typeof o.content === "string" ? Buffer.from(o.content, "utf8") : Buffer.from(o.content);
    if (check) {
      if (!existsSync(file) || !readFileSync(file).equals(want)) stale.push(o.path);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, want);
  }
  if (check && stale.length) {
    console.error(
      `${tool}: ${stale.length} generated file(s) are stale; run node tools/${tool}.ts:\n  ${stale.join("\n  ")}`,
    );
    return 1;
  }
  console.log(`${tool}: ${check ? "checked" : "wrote"} ${outputs.length} file(s)`);
  return 0;
}

export const byCodePoint = (a: string, b: string): number => {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return Buffer.compare(x, y);
};

export const readJson = <T>(rel: string): T => JSON.parse(readFileSync(resolve(repoRoot, rel), "utf8")) as T;
