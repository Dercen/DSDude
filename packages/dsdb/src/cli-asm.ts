#!/usr/bin/env node
// dsdb-asm in.dsda -o out.dsdb : assembles .dsda text into a DSDB (ids and the ABI hash from contracts/builtins.json).
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { assembleToBytes } from "./asm.ts";
import { loadBuiltinsEnv } from "./node.ts";

const args = process.argv.slice(2);
const o = args.indexOf("-o");
const input = args.find((a, i) => a !== "-o" && i !== o + 1);
if (!input || o < 0 || !args[o + 1]) {
  console.error("usage: dsdb-asm in.dsda -o out.dsdb");
  process.exit(2);
}
const out = args[o + 1];
try {
  writeFileSync(out, assembleToBytes(readFileSync(input, "utf8"), loadBuiltinsEnv()));
} catch (err) {
  rmSync(out, { force: true });
  console.error(`dsdb-asm: ${input}: ${(err as Error).message}`);
  process.exit(1);
}
