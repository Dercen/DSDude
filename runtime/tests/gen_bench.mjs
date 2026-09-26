// gen_bench.mjs: writes fixtures/bytecode/bench.dsda, the M1 microbenchmark (PLAN.md 2.3 and 8 M1; C14), and
// bench-ii.dsda, the same block with the int-specialised ADDII/SUBII/MULII/CMPJII (opcodes 0.4.0) that WS4's
// compiler emits when it proves both operands ints.
//
//   node runtime/tests/gen_bench.mjs && node tools/gen-dsdb.ts
//
// The Step event of obj_bench is one straight-line block of UNITS x 10 instruction words (>= 4 KB of bytecode in
// main RAM) with the fixed M1 op mix per unit of 10:
//   40% tag-checked ADD/SUB/MUL, 30% MOV/LOADI/GETSLOT/SETSLOT, 20% CMPJ + JMP, 10% CALLN.
// Every JMP targets the next word, so taken or skipped the block stays straight-line; values stay small, so no
// debug overflow trap fires. WS3 times one run of the Step event with its hardware-timer harness; the host trace's
// `ops` shows the step count.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const UNITS = 120; // 120 x 10 = 1,200 words = 4.8 KB
const SLOTS = 4; // user slots the block reads and writes
const DIR = join(import.meta.dirname, "..", "..", "fixtures", "bytecode");
// Tag-checked opcode -> its int-specialised form, for bench-ii.dsda (every operand in the block is an int).
const INT_FORMS = { ADD: "ADDII", SUB: "SUBII", MUL: "MULII", CMPJ: "CMPJII" };

// Registers: r0-r7 small constants, r8-r11 accumulators and products, r12-r14 scratch, r15 the CALLN argument.
const ARITH = [
  (u) => `ADD r8, r8, r${1 + (u % 7)}`,
  (u) => `SUB r9, r9, r${1 + ((u + 3) % 7)}`,
  (u) => `MUL r10, r${1 + (u % 4)}, r${4 + (u % 4)}`,
  (u) => `ADD r11, r11, r${1 + ((u + 5) % 7)}`,
];
const RELATIONS = 6; // CMPJ relation codes 0-5: == != < <= > >=

const lines = [".dsda 0.1", ".seed 1", "", ".func bench_create 0 1", '    .loc "objects/obj_bench/create.dss" 1'];
for (let s = 0; s < SLOTS; s++) lines.push(`    LOADI r0, ${s + 1}`, `    SETSLOT r0, ${s}`);
lines.push("    RET r0, 0", ".end", "", ".func bench_step 0 16", '    .loc "objects/obj_bench/step.dss" 1');
for (let r = 0; r < 8; r++) lines.push(`    LOADI r${r}, ${r + 1}`);
lines.push("    LOADI r8, 0", "    LOADI r9, 0", "    LOADI r11, 0", "    LOADI r15, -3");
let label = 0;
for (let u = 0; u < UNITS; u++) {
  for (const op of ARITH) lines.push(`    ${op(u)}`);
  lines.push(`    MOV r12, r${8 + (u % 4)}`, `    LOADI r13, ${u % 100}`);
  lines.push(u % 2 === 0 ? `    GETSLOT r14, ${u % SLOTS}` : `    SETSLOT r13, ${u % SLOTS}`);
  lines.push(`    CMPJ r8, r9, ${u % RELATIONS}`, `    JMP L${label}`, `  L${label}:`);
  label++;
  lines.push("    CALLN r15, 1, abs");
}
lines.push("    RET r0, 0", ".end", "");
lines.push(
  ".object obj_bench sprite=- parent=- visible=0 screen=top depth=0",
  ...Array.from({ length: SLOTS }, (_, s) => `    .slot s${s} ${s}`),
  "    .event create bench_create",
  "    .event step bench_step",
  ".end",
  "",
  ".room rm_bench 256 192",
  "    .screen top - 0 0",
  "    .screen bottom - 0 0",
  "    .instance obj_bench 0 0 top -",
  "    .set top - -",
  "    .set bottom - -",
  "    .sounds -",
  ".end",
  "",
  ".first rm_bench",
  "",
);
const text = lines.join("\n");
const intText = text.replace(/^( {4})(ADD|SUB|MUL|CMPJ) /gm, (_, indent, op) => `${indent}${INT_FORMS[op]} `);
writeFileSync(join(DIR, "bench.dsda"), text);
writeFileSync(join(DIR, "bench-ii.dsda"), intText);
console.log(`gen_bench: wrote bench.dsda and bench-ii.dsda in ${DIR} (${UNITS * 10} words in the block)`);
