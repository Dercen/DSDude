/** @dsdude/dsdb/node: finds contracts/builtins.json by walking up from a folder and builds the BuiltinsEnv. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type BuiltinsEnv, type BuiltinsFile, builtinsEnv } from "./abi.ts";

export function findRepoRoot(from: string = process.cwd()): string {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "contracts", "builtins.json"))) return dir;
    if (dirname(dir) === dir) throw new Error(`no contracts/builtins.json above ${from}`);
  }
}

export function loadBuiltins(root: string = findRepoRoot()): BuiltinsFile {
  return JSON.parse(readFileSync(join(root, "contracts", "builtins.json"), "utf8")) as BuiltinsFile;
}

export const loadBuiltinsEnv = (root?: string): BuiltinsEnv => builtinsEnv(loadBuiltins(root));
