/**
 * `npm run build:runtime -w runtime` (PLAN.md 6 WS3; contracts/runtime-artifact.md): make through buildRuntime()
 * (C4) into dist/arm9.elf + dist/arm9-debug.elf, then the .itcm/.dtcm report and dist/VERSION.
 *
 *   node src/build-runtime.ts [--jobs N]
 *
 * Exit codes follow C10: 0 ok, 2 tool/environment failure (no BlocksDS, make failed, a budget exceeded).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuntime, detectToolchain, formatDiagnostic } from "@dsdude/toolchain";
import {
  formatReport,
  formatVersion,
  memoryReport,
  parseNm,
  parseSizeA,
  parseSizeBerkeley,
  readAbiHash,
  reportProblems,
  run,
  runtimeTreeHash,
} from "./artifact.ts";

const TOOL_TIMEOUT_MS = 60_000;

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.dirname(runtimeDir);

function parseJobs(argv: readonly string[]): number | undefined {
  const i = argv.indexOf("--jobs");
  if (i < 0) return undefined;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n < 1) throw new Error("--jobs needs a positive integer");
  return n;
}

async function main(): Promise<number> {
  const jobs = parseJobs(process.argv.slice(2));
  const status = await detectToolchain();
  if (!status.installed || !status.paths.gcc) {
    for (const d of status.diagnostics) console.error(formatDiagnostic(d));
    console.error("build:runtime: BlocksDS is not installed here (the runtime builds only on the local machine)");
    return 2;
  }

  const built = await buildRuntime({
    runtimeDir,
    paths: status.paths,
    jobs,
    onOutput: (text) => process.stdout.write(text),
  });
  if (!built.ok || !built.arm9Elf) {
    for (const d of built.diagnostics) console.error(formatDiagnostic(d));
    return 2;
  }

  const bin = path.dirname(status.paths.gcc);
  const exe = (tool: string) => path.join(bin, `arm-none-eabi-${tool}${process.platform === "win32" ? ".exe" : ""}`);
  const debugElf = path.join(runtimeDir, "dist", "arm9-debug.elf");
  const sizes = parseSizeA((await run(exe("size"), ["-A", debugElf], { timeoutMs: TOOL_TIMEOUT_MS })).stdout);
  const symbols = parseNm((await run(exe("nm"), [debugElf], { timeoutMs: TOOL_TIMEOUT_MS })).stdout);
  const totals = parseSizeBerkeley((await run(exe("size"), [debugElf], { timeoutMs: TOOL_TIMEOUT_MS })).stdout);
  const report = memoryReport(sizes, symbols, totals);

  const abi = readAbiHash(readFileSync(path.join(runtimeDir, "gen", "builtins_table.h"), "utf8"));
  const pkg = JSON.parse(readFileSync(path.join(runtimeDir, "package.json"), "utf8")) as { version: string };
  const version = formatVersion({
    runtime: pkg.version,
    abi,
    tree: await runtimeTreeHash(repoRoot),
    blocksds: status.blocksdsVersion ?? "unknown",
    arm9Sha256: createHash("sha256").update(readFileSync(built.arm9Elf)).digest("hex"),
    report,
  });
  // Binary write: LF only, on every host.
  writeFileSync(path.join(runtimeDir, "dist", "VERSION"), Buffer.from(version, "utf8"));

  console.log(`\nbuild:runtime: ${path.relative(repoRoot, built.arm9Elf)} (runtime ${pkg.version}, abi ${abi})`);
  console.log(formatReport(report));
  const problems = reportProblems(report);
  for (const p of problems) console.error(`build:runtime: ${p}`);
  return problems.length > 0 ? 2 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(`build:runtime: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 2;
  },
);
