// gen_dss.mjs: compiles WS2's DSS-sourced runtime fixtures to .dsda with WS4's compiler, so their bytecode always
// comes from the source kept beside it (CLAUDE.md: a .dsdb changes only through tools/gen-dsdb.ts, in the same commit
// as its .dsda). Run from the repo root:
//
//   node runtime/tests/gen_dss.mjs && node tools/gen-dsdb.ts
//
// Two kinds of fixture:
//   - program form: one .dss file (contracts/language.md section 1), compiled by compileProgram;
//   - room games: a project folder under fixtures/runtime-core/, compiled by `dsdude compile` (the same options as
//     Play) and disassembled.
// Each .dsda starts with the compiler's own header lines; the .dss or project is the thing to edit.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMPILER_BUILTINS_ENV, compileProgram } from "@dsdude/compiler";
import { disassemble, disassembleBytes } from "@dsdude/dsdb";

const RUNTIME = "fixtures/bytecode/runtime";
const COMPILE_TIMEOUT_MS = 120_000; // every spawned process gets a timeout (CLAUDE.md)

// Program-form fixtures: source, the path recorded in DBG (and so in DSD|ERR lines), and the header seed.
const PROGRAMS = [
  { name: "numeric-hashes", file: "rt/numeric-hashes.dss", seed: 20260926 },
  { name: "builtins-math", file: "rt/builtins-math.dss", seed: 7 },
];

// Room-game fixtures: project folders under fixtures/runtime-core/, and the header seed.
const PROJECTS = [{ name: "cov-world", seed: 3 }];

// Writes `text` to fixtures/bytecode/runtime/<name>.dsda and says so.
function writeDsda(name, text) {
  const out = join(RUNTIME, `${name}.dsda`);
  writeFileSync(out, text);
  console.log(`gen_dss: wrote ${out}`);
}

for (const p of PROGRAMS) {
  const source = readFileSync(join(RUNTIME, `${p.name}.dss`), "utf8");
  const result = compileProgram(source, { file: p.file, seed: p.seed });
  if (result.module === null) {
    console.error(`gen_dss: ${p.name}.dss does not compile:\n${JSON.stringify(result.diagnostics, null, 2)}`);
    process.exit(1);
  }
  writeDsda(p.name, disassemble(result.module));
}

const scratch = mkdtempSync(join(tmpdir(), "gen-dss-"));
try {
  for (const p of PROJECTS) {
    const dsdb = join(scratch, `${p.name}.dsdb`);
    const args = ["dsdude", "compile", join("fixtures/runtime-core", p.name), "-o", dsdb, "--seed", String(p.seed)];
    execFileSync("npx", args, { stdio: "inherit", timeout: COMPILE_TIMEOUT_MS });
    writeDsda(p.name, disassembleBytes(readFileSync(dsdb), COMPILER_BUILTINS_ENV));
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
