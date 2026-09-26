/**
 * The C8 runtime artifact (contracts/runtime-artifact.md): the dist/VERSION file, the memory report read from
 * arm-none-eabi-size / arm-none-eabi-nm, and the git tree hash VERSION records. Pure helpers plus two git and
 * tool runners; runtime/src/build-runtime.ts drives them after make.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

/** ITCM ceiling for the VM and hot builtins; libnds's vectors are already in ITCM (PLAN.md 6 WS3). */
export const ITCM_CEILING_BYTES = 24 * 1024;
/** The ARM9 image budget (PLAN.md 3.3: <= 0.7 MB): the binary's code and data, not the core's static pools. */
export const IMAGE_BUDGET_BYTES = Math.floor(0.7 * 1024 * 1024);
/** The ARM7 binary every runtime ROM is packed with (ndstool -7). */
export const ARM7_ELF = "$BLOCKSDS/sys/arm7/main_core/arm7_maxmod.elf";
/** runtime/ path segments the VERSION tree hash leaves out: dist/ holds VERSION itself. */
export const TREE_EXCLUDES = ["dist"] as const;
/**
 * runtime/ paths the DS build reads (runtime/Makefile without DSD_SELFTEST): the VERSION `build_tree` hash covers
 * exactly these, so it changes only when the ELF can. WS2's tests/ and host/, the briefs and selftest/ are left out.
 */
export const BUILD_INPUTS = ["core", "gen", "platform/ds/src", "data", "Makefile", "package.json"] as const;

const MAIN_RAM_START = 0x02000000;
const MAIN_RAM_END = 0x02400000;

export interface SectionSizes {
  [name: string]: { size: number; addr: number };
}

/** Parses `arm-none-eabi-size -A` (SysV format: name, size, address; decimal). */
export function parseSizeA(text: string): SectionSizes {
  const out: SectionSizes = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\.\S+)\s+(\d+)\s+(\d+)\s*$/.exec(line);
    if (m) out[m[1]] = { size: Number(m[2]), addr: Number(m[3]) };
  }
  return out;
}

/** Parses `arm-none-eabi-size` (Berkeley format): the text, data and bss totals of the first file. */
export function parseSizeBerkeley(text: string): { text: number; data: number; bss: number } {
  const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+[0-9a-f]+\s/m.exec(text);
  if (!m) throw new Error("arm-none-eabi-size printed no totals");
  return { text: Number(m[1]), data: Number(m[2]), bss: Number(m[3]) };
}

/** Parses `arm-none-eabi-nm` output into symbol -> address (hex). */
export function parseNm(text: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]+)\s+\S\s+(\S+)\s*$/.exec(line);
    if (m) out.set(m[2], Number.parseInt(m[1], 16));
  }
  return out;
}

export interface MemoryReport {
  /** .itcm bytes (libnds vectors included) against ITCM_CEILING_BYTES. */
  itcm: number;
  /** .dtcm + .sbss bytes against dtcmData. */
  dtcm: number;
  /** __dtcm_data_size: DTCM reserved for the VM's data (runtime/Makefile). */
  dtcmData: number;
  /** The C stack: __sp_usr - __dtcm_start. */
  cstack: number;
  /** Everything static in main RAM (loaded sections plus .bss, i.e. the core's pools): __end__ - 0x02000000. */
  image: number;
  /** The binary itself, code and data (ITCM/DTCM copies included): `size` text + data. Budget 0.7 MB. */
  loaded: number;
}

function need(symbols: Map<string, number>, name: string): number {
  const v = symbols.get(name);
  if (v === undefined) throw new Error(`arm-none-eabi-nm: symbol ${name} is missing`);
  return v;
}

export function memoryReport(
  sizes: SectionSizes,
  symbols: Map<string, number>,
  totals: { text: number; data: number },
): MemoryReport {
  const itcm = sizes[".itcm"]?.size ?? 0;
  const dtcm = (sizes[".dtcm"]?.size ?? 0) + (sizes[".sbss"]?.size ?? 0);
  const end = need(symbols, "__end__");
  if (end < MAIN_RAM_START || end > MAIN_RAM_END) throw new Error(`__end__ 0x${end.toString(16)} is not in main RAM`);
  return {
    itcm,
    dtcm,
    dtcmData: need(symbols, "__dtcm_data_size"),
    cstack: need(symbols, "__sp_usr") - need(symbols, "__dtcm_start"),
    image: end - MAIN_RAM_START,
    loaded: totals.text + totals.data,
  };
}

/** Problems that fail the build: ITCM over its ceiling, DTCM data over its reservation, the binary over budget. */
export function reportProblems(r: MemoryReport): string[] {
  const out: string[] = [];
  if (r.itcm > ITCM_CEILING_BYTES) out.push(`ITCM ${r.itcm} B is over the ${ITCM_CEILING_BYTES} B ceiling`);
  if (r.dtcm > r.dtcmData) out.push(`DTCM data ${r.dtcm} B is over __dtcm_data_size ${r.dtcmData} B`);
  if (r.loaded > IMAGE_BUDGET_BYTES)
    out.push(`the ARM9 image ${r.loaded} B is over the ${IMAGE_BUDGET_BYTES} B budget`);
  return out;
}

const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;

/** The printed report (one line per figure). */
export function formatReport(r: MemoryReport): string {
  return [
    `itcm   ${r.itcm} B (${kb(r.itcm)} of ${kb(ITCM_CEILING_BYTES)})`,
    `dtcm   ${r.dtcm} B (${kb(r.dtcm)} of ${kb(r.dtcmData)} reserved)`,
    `cstack ${r.cstack} B (${kb(r.cstack)})`,
    `loaded ${r.loaded} B (${kb(r.loaded)} of ${kb(IMAGE_BUDGET_BYTES)}: code + data)`,
    `image  ${r.image} B (${kb(r.image)}: everything static, the core's pools included)`,
  ].join("\n");
}

export interface VersionInfo {
  runtime: string;
  /** 8 lowercase hex digits, as in DSD|READY. */
  abi: string;
  /** git tree hash of runtime/ without dist/ (informational). */
  tree: string;
  /** git tree hash of BUILD_INPUTS only: the staleness check for dist/. */
  buildTree: string;
  blocksds: string;
  arm9Sha256: string;
  report: MemoryReport;
}

/** dist/VERSION: `key=value` lines, LF, in this fixed order (contracts/runtime-artifact.md). */
export function formatVersion(v: VersionInfo): string {
  const lines = [
    `runtime=${v.runtime}`,
    `abi=${v.abi}`,
    `tree=${v.tree}`,
    `blocksds=${v.blocksds}`,
    `arm7=${ARM7_ELF}`,
    `arm9_sha256=${v.arm9Sha256}`,
    `itcm=${v.report.itcm}`,
    `dtcm=${v.report.dtcm}`,
    `dtcm_data=${v.report.dtcmData}`,
    `cstack=${v.report.cstack}`,
    `image=${v.report.image}`,
    `loaded=${v.report.loaded}`,
    `build_tree=${v.buildTree}`,
  ];
  return `${lines.join("\n")}\n`;
}

export function parseVersion(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

/** DSD_ABI_HASH from runtime/gen/builtins_table.h, as 8 lowercase hex digits. */
export function readAbiHash(builtinsTableH: string): string {
  const m = /#define\s+DSD_ABI_HASH\s+0x([0-9a-fA-F]{1,8})u?/.exec(builtinsTableH);
  if (!m) throw new Error("DSD_ABI_HASH not found in builtins_table.h");
  return m[1].toLowerCase().padStart(8, "0");
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** execFile with a timeout and a hidden window; rejects on a non-zero exit, with stderr in the message. */
export function run(
  exe: string,
  args: readonly string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      args,
      { cwd: opts.cwd, env: opts.env, timeout: opts.timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`${path.basename(exe)} ${args.join(" ")}: ${err.message}\n${stderr}`.trim()));
        else resolve({ stdout, stderr });
      },
    );
  });
}

const GIT_TIMEOUT_MS = 60_000;

/**
 * The git tree hash of `<repoRoot>/runtime` as it is in the working tree, without runtime/dist: HEAD's tree plus
 * every tracked and untracked, non-ignored change under runtime/, staged into a throwaway index (the real index is
 * never touched). A commit that adds sources and their dist/ together records the tree it commits. With `only`,
 * the tree keeps just those runtime/-relative paths (BUILD_INPUTS for `build_tree`).
 */
export async function runtimeTreeHash(repoRoot: string, git = "git", only?: readonly string[]): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), "dsdude-runtime-tree-"));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, "index") };
  const g = (args: string[]) => run(git, args, { cwd: repoRoot, env, timeoutMs: GIT_TIMEOUT_MS });
  try {
    await g(["read-tree", "HEAD"]);
    await g(["add", "-A", "--", "runtime"]);
    for (const ex of TREE_EXCLUDES) await g(["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", `runtime/${ex}`]);
    if (only) {
      const keep = only.map((p) => `:(exclude)runtime/${p}`);
      await g(["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", "runtime", ...keep]);
    }
    const { stdout } = await g(["write-tree", "--prefix=runtime/"]);
    const tree = stdout.trim();
    if (!/^[0-9a-f]{40}$/.test(tree)) throw new Error(`git write-tree printed ${JSON.stringify(stdout)}`);
    return tree;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Why dist/ does not match its inputs, from dist/VERSION and the current state: `build_tree` differs (a build input
 * changed since dist/ was built) or `arm9_sha256` is not dist/arm9.elf's. Empty when dist/ is current. A VERSION
 * without `build_tree` (C8 artifact < 0.3.0) counts as stale.
 */
export function distProblems(version: Record<string, string>, buildTree: string, arm9Sha256: string): string[] {
  const out: string[] = [];
  if (!version.build_tree) out.push("dist/VERSION has no build_tree (built before C8 artifact 0.3.0)");
  else if (version.build_tree !== buildTree) {
    out.push(`a build input changed since dist/ was built (build_tree ${version.build_tree} -> ${buildTree})`);
  }
  if (version.arm9_sha256 !== arm9Sha256) out.push("dist/arm9.elf is not the file dist/VERSION describes");
  return out;
}
