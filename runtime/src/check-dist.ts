/**
 * `npm run check:dist -w runtime` (contracts/runtime-artifact.md "Staleness"): is runtime/dist/ current? It compares
 * dist/VERSION's `build_tree` with the git tree of the DS build's inputs now (BUILD_INPUTS) and `arm9_sha256` with
 * dist/arm9.elf. Needs only git and Node, so it runs anywhere, the cloud and CI included; a WS2 test or host edit
 * does not make dist/ stale. Exit 0 current, 1 stale (run `npm run build:runtime -w runtime` locally), 2 error.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_INPUTS, distProblems, parseVersion, runtimeTreeHash } from "./artifact.ts";

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.dirname(runtimeDir);

async function main(): Promise<number> {
  const version = parseVersion(readFileSync(path.join(runtimeDir, "dist", "VERSION"), "utf8"));
  const buildTree = await runtimeTreeHash(repoRoot, "git", BUILD_INPUTS);
  const elf = createHash("sha256")
    .update(readFileSync(path.join(runtimeDir, "dist", "arm9.elf")))
    .digest("hex");
  const problems = distProblems(version, buildTree, elf);
  if (problems.length === 0) {
    console.log(`check:dist: runtime/dist is current (build_tree ${buildTree})`);
    return 0;
  }
  for (const p of problems) console.log(`check:dist: stale: ${p}`);
  console.log("check:dist: run `npm run build:runtime -w runtime` on the local machine and commit runtime/dist");
  return 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`check:dist: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  },
);
