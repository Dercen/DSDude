/**
 * `npm run selftest -w runtime [-- --update] [-- --case <name>]` (docs/kickoff/ws3.md task 3): builds the selftest
 * ROM (runtime/Makefile with DSD_SELFTEST=1, through runMake), then runs every case of selftest-cases.ts through
 * `dsdude screenshot` (C4 takeScreenshot, py-desmume, headless) and compares its PNGs with the goldens and its DSD|
 * log with the case's patterns. `--update` rewrites the goldens instead of comparing them. Local machine only.
 * Exit 0 all pass, 1 a check failed, 2 tool/environment failure (C10 codes).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { detectToolchain, dsdudeHome, formatDiagnostic, runMake, takeScreenshot } from "@dsdude/toolchain";
import { decodePng, diffPixels, type Rgba } from "./png.ts";
import { checkLog, SELFTEST_CASES } from "./selftest-cases.ts";

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.dirname(runtimeDir);
const fixtureDir = path.join(repoRoot, "fixtures", "runtime", "selftest");
const ROM = "dsdude_selftest.nds";

/**
 * Spike 10 (PLAN.md 7.1): the screen shows the source PNGs' own colours at RGB555. The boot screen's top rows
 * 168-191 are pure room background (sprites end at y 168, the UI at y 32), and sprite 0 (frame 0, extended
 * palette 0) sits at (0, 40).
 */
function spike10(top: Rgba): string[] {
  const assets = path.join(repoRoot, "fixtures", "assets");
  const bg = decodePng(readFileSync(path.join(assets, "background256x192.png")));
  const sheet = decodePng(readFileSync(path.join(assets, "sprite16x16x3.png")));
  const rgb555 = (img: Rgba, x: number, y: number) => {
    const i = (y * img.width + x) * 4;
    return ((img.data[i] >> 3) << 10) | ((img.data[i + 1] >> 3) << 5) | (img.data[i + 2] >> 3);
  };
  let bgBad = 0;
  for (let y = 168; y < 192; y++) for (let x = 0; x < 256; x++) if (rgb555(top, x, y) !== rgb555(bg, x, y)) bgBad++;
  let sprBad = 0;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (sheet.data[(y * sheet.width + x) * 4 + 3] >= 128 && rgb555(top, x, 40 + y) !== rgb555(sheet, x, y)) sprBad++;
  const out: string[] = [];
  if (bgBad > 0) out.push(`spike 10: ${bgBad} background pixels differ from background256x192.png`);
  if (sprBad > 0) out.push(`spike 10: ${sprBad} sprite pixels differ from sprite16x16x3.png frame 0`);
  return out;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const update = argv.includes("--update");
  const only = argv.includes("--case") ? argv[argv.indexOf("--case") + 1] : null;

  const status = await detectToolchain();
  if (!status.installed || !status.paths.python) {
    for (const d of status.diagnostics) console.error(formatDiagnostic(d));
    console.error("selftest: needs BlocksDS and py-desmume (the local machine)");
    return 2;
  }
  const built = await runMake({
    dir: runtimeDir,
    elf: ROM,
    paths: status.paths,
    env: { ...process.env, DSD_SELFTEST: "1" },
    onOutput: (text) => process.stdout.write(text),
  });
  if (!built.ok) {
    for (const d of built.diagnostics) console.error(formatDiagnostic(d));
    return 2;
  }

  let failed = 0;
  for (const c of SELFTEST_CASES) {
    if (only && c.name !== only) continue;
    const out = path.join(dsdudeHome(), "selftest", c.name);
    const shot = await takeScreenshot({
      rom: path.join(runtimeDir, ROM),
      frames: c.frames,
      keys: c.keys ? path.join(fixtureDir, "keys", c.keys) : undefined,
      out,
      python: status.paths.python,
    });
    if (!shot.ok) {
      for (const d of shot.diagnostics) console.error(formatDiagnostic(d));
      return 2;
    }
    const problems = checkLog(shot.log, c);
    for (const screen of c.golden) {
      const got = screen === "top" ? shot.top : shot.bottom;
      const golden = path.join(fixtureDir, "golden", `${c.name}-${screen}.png`);
      if (!got) {
        problems.push(`no ${screen} screenshot`);
      } else if (update) {
        mkdirSync(path.dirname(golden), { recursive: true });
        copyFileSync(got, golden);
      } else if (!existsSync(golden)) {
        problems.push(`no golden ${path.relative(repoRoot, golden)} (run with --update)`);
      } else {
        const n = diffPixels(decodePng(readFileSync(got)), decodePng(readFileSync(golden)));
        if (n > 0) problems.push(`${screen}: ${n} pixels differ from ${path.relative(repoRoot, golden)} (${got})`);
      }
    }
    if (c.name === "boot" && shot.top) problems.push(...spike10(decodePng(readFileSync(shot.top))));
    console.log(`${problems.length === 0 ? "PASS" : "FAIL"} ${c.name}${update ? " (goldens written)" : ""}`);
    for (const p of problems) console.log(`  ${p}`);
    if (problems.length > 0) {
      failed++;
      for (const l of shot.log) console.log(`  | ${l.length > 120 ? `${l.slice(0, 117)}...` : l}`);
    }
  }
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`selftest: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  },
);
