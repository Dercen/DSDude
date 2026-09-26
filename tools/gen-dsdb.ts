// Regenerates every committed fixtures/**/*.dsdb from its sibling .dsda (C2), stamping builtin ids and the ABI
// hash from contracts/builtins.json and opcodes from contracts/opcodes.json. Usage: node tools/gen-dsdb.ts [--check]
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { assembleToBytes } from "@dsdude/dsdb";
import { loadBuiltinsEnv } from "@dsdude/dsdb/node";
import { byCodePoint, emit, type Output, repoRoot } from "./lib/gen.ts";

export function dsdaFiles(dir = join(repoRoot, "fixtures")): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...dsdaFiles(p));
    else if (e.name.endsWith(".dsda")) out.push(relative(repoRoot, p).replaceAll("\\", "/"));
  }
  return out.sort(byCodePoint);
}

if (import.meta.main) {
  const env = loadBuiltinsEnv(repoRoot);
  const outputs: Output[] = [];
  for (const src of dsdaFiles()) {
    try {
      outputs.push({
        path: src.replace(/\.dsda$/, ".dsdb"),
        content: assembleToBytes(readFileSync(join(repoRoot, src), "utf8"), env),
      });
    } catch (err) {
      console.error(`gen-dsdb: ${src}: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  process.exit(emit("gen-dsdb", outputs, process.argv.includes("--check")));
}
