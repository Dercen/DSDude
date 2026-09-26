/**
 * `npm run conformance:ds -w runtime [-- --case <substring>] [-- --frames N]`: every case of WS2's
 * runtime/tests/test_programs.c on the DS. Each DSDB is packed alone (with header seed 1, as the host runs it) around
 * runtime/dist/arm9.elf, run headless by `dsdude screenshot` (py-desmume) for N frames, and its DSD| log is compared
 * with the host's expected output (conformance.ts). Cases with a key script are skipped: the core's first frame
 * starts at an emulated frame that boot time decides, so host frame numbers cannot be replayed. Local machine only.
 * Exit 0 all pass, 1 a case failed, 2 tool/environment failure.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectToolchain,
  dsdudeHome,
  formatDiagnostic,
  packRom,
  takeScreenshot,
  toolEnv,
  withDsdbSeed,
  wonderfulLayout,
} from "@dsdude/toolchain";
import { readAbiHash } from "./artifact.ts";
import { compareLogs, objBox, parseProgramCases, placeholderGrf, readyAbi, spriteAssets } from "./conformance.ts";

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.dirname(runtimeDir);
const HOST_SEED = 1; // runtime/tests/test_programs.c RUN_SEED
const DEFAULT_FRAMES = 300;

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const only = argv.includes("--case") ? argv[argv.indexOf("--case") + 1] : null;
  const frames = argv.includes("--frames") ? Number(argv[argv.indexOf("--frames") + 1]) : DEFAULT_FRAMES;

  const status = await detectToolchain();
  if (!status.installed || !status.paths.python) {
    for (const d of status.diagnostics) console.error(formatDiagnostic(d));
    console.error("conformance:ds: needs BlocksDS and py-desmume (the local machine)");
    return 2;
  }
  const elf = path.join(runtimeDir, "dist", "arm9.elf");
  const abi = readAbiHash(readFileSync(path.join(runtimeDir, "gen", "builtins_table.h"), "utf8"));
  const cases = parseProgramCases(readFileSync(path.join(runtimeDir, "tests", "test_programs.c"), "utf8"));
  const work = path.join(dsdudeHome(), "conformance-ds");
  let failed = 0;
  let passed = 0;
  let skipped = 0;

  for (const c of cases) {
    if (only && !c.dsdb.includes(only)) continue;
    const name = path.basename(c.dsdb, ".dsdb");
    const label = path.relative("fixtures", c.dsdb).replaceAll("\\", "/");
    if (c.keys) {
      console.log(`SKIP ${label} (key script: host frame numbers cannot be replayed on the DS)`);
      skipped++;
      continue;
    }
    if (!existsSync(path.join(repoRoot, c.dsdb))) {
      console.log(`SKIP ${label} (not on this branch)`);
      skipped++;
      continue;
    }
    const dir = path.join(work, label.replace(/[/.]/g, "_"));
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(path.join(dir, "nitrofs"), { recursive: true });
    const dsdb = readFileSync(path.join(repoRoot, c.dsdb));
    const seeded = new DataView(dsdb.buffer, dsdb.byteOffset).getUint32(12, true) === 0;
    writeFileSync(path.join(dir, "nitrofs", "game.dsdb"), seeded ? withDsdbSeed(dsdb, HOST_SEED) : dsdb);
    // Placeholder GRFs for the sprites the fixture declares (conformance.ts).
    const dsda = path.join(repoRoot, c.dsdb.replace(/\.dsdb$/, ".dsda"));
    for (const s of existsSync(dsda) ? spriteAssets(readFileSync(dsda, "utf8")) : []) {
      const box = objBox(s.width, s.height);
      if (!box) continue;
      mkdirSync(path.dirname(path.join(dir, "nitrofs", s.path)), { recursive: true });
      writeFileSync(path.join(dir, "nitrofs", s.path), placeholderGrf(box[0], box[1], s.frames));
    }
    const rom = path.join(dir, "game.nds");
    try {
      await packRom(
        {
          arm9Elf: elf,
          nitrofsDir: path.join(dir, "nitrofs"),
          outNds: rom,
          title: name,
          subtitle: "DSDude",
          author: "DSDude",
          iconPng: null,
          gamecode: "####",
        },
        { paths: status.paths, env: toolEnv(process.env, wonderfulLayout()) },
      );
    } catch (err) {
      console.error(`conformance:ds: packing ${label}: ${err instanceof Error ? err.message : String(err)}`);
      return 2;
    }
    const shot = await takeScreenshot({ rom, frames, out: path.join(dir, "shot"), python: status.paths.python });
    if (!shot.ok) {
      for (const d of shot.diagnostics) console.error(formatDiagnostic(d));
      return 2;
    }
    writeFileSync(path.join(dir, "ds.log"), `${shot.log.join("\n")}\n`);
    copyFileSync(path.join(repoRoot, c.expected), path.join(dir, "host.out"));
    const got = readyAbi(shot.log);
    const diff =
      got !== null && got !== abi
        ? `DSD|READY reports ABI ${got}, runtime/gen has ${abi}: rebuild runtime/dist`
        : compareLogs(shot.log, readFileSync(path.join(repoRoot, c.expected), "utf8").split("\n"), c);
    if (diff === null) {
      passed++;
      console.log(`PASS ${label}`);
    } else {
      failed++;
      console.log(`FAIL ${label}: ${diff}`);
      console.log(`  ${path.join(dir, "ds.log")}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped (${frames} frames each)`);
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`conformance:ds: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  },
);
