#!/usr/bin/env node
// dsdb-dis in.dsdb [-o out.dsda] : prints the canonical .dsda form of a DSDB (to stdout without -o).
import { readFileSync, writeFileSync } from "node:fs";
import { disassembleBytes } from "./asm.ts";
import { loadBuiltinsEnv } from "./node.ts";

const args = process.argv.slice(2);
const o = args.indexOf("-o");
const input = args.find((a, i) => a !== "-o" && (o < 0 || i !== o + 1));
if (!input) {
  console.error("usage: dsdb-dis in.dsdb [-o out.dsda]");
  process.exit(2);
}
try {
  const text = disassembleBytes(new Uint8Array(readFileSync(input)), loadBuiltinsEnv());
  if (o >= 0 && args[o + 1]) writeFileSync(args[o + 1], text);
  else process.stdout.write(text);
} catch (err) {
  console.error(`dsdb-dis: ${input}: ${(err as Error).message}`);
  process.exit(1);
}
