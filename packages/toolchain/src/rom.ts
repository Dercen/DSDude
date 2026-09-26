/**
 * packRom() and verifyRom() (C4; PLAN.md 3.2 step 6, verification.md claim 3). ndstool packs the runtime ELF, the
 * BlocksDS ARM7 core and a NitroFS folder; the header check reads the FNT/FAT fields and the "NitroFS!" mark
 * itself, because `ndstool -i` does not report the mark.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import * as path from "node:path";
import type { Diagnostic } from "@dsdude/project-format";
import type { PackRomOptions, PackRomResult, RomHeaderInfo, ToolPaths, VerifyRomResult } from "./api.ts";
import { ToolchainError, toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { MAX_TOOL_PATH } from "./layout.ts";
import { outputTail } from "./process.ts";
import { runTool } from "./tools.ts";

export const NITROFS_MAGIC = "NitroFS!";
/** libnds refuses a file table below this offset (the ARM7 binary always comes first). */
export const MIN_NITROFS_OFFSET = 0x8000;
/** A DS header is 0x200 bytes; anything shorter is not a ROM. */
export const ROM_HEADER_SIZE = 0x200;
export const PACK_TIMEOUT_MS = 60_000;

/** Reads the NitroFS fields; null when the buffer is shorter than a header. */
export function readRomHeader(rom: Uint8Array): RomHeaderInfo | null {
  if (rom.length < ROM_HEADER_SIZE) return null;
  const view = new DataView(rom.buffer, rom.byteOffset, rom.byteLength);
  const fntOffset = view.getUint32(0x40, true);
  const fntSize = view.getUint32(0x44, true);
  const fatOffset = view.getUint32(0x48, true);
  const fatSize = view.getUint32(0x4c, true);
  const magicOffset = fatOffset + fatSize;
  let magicOk = magicOffset + NITROFS_MAGIC.length <= rom.length;
  for (let i = 0; magicOk && i < NITROFS_MAGIC.length; i++) {
    if (rom[magicOffset + i] !== NITROFS_MAGIC.charCodeAt(i)) magicOk = false;
  }
  return { fntOffset, fntSize, fatOffset, fatSize, magicOffset, magicOk };
}

const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;

/** The E6xx diagnostics for a ROM image: empty when NitroFS will mount. `name` is used in the messages. */
export function checkRom(rom: Uint8Array, name: string): Diagnostic[] {
  const header = readRomHeader(rom);
  if (header === null) return [toolchainDiagnostic("E614", { path: name, size: rom.length })];
  if (header.fatOffset < MIN_NITROFS_OFFSET)
    return [toolchainDiagnostic("E611", { path: name, offset: hex(header.fatOffset) })];
  if (header.fntOffset < MIN_NITROFS_OFFSET)
    return [toolchainDiagnostic("E611", { path: name, offset: hex(header.fntOffset) })];
  if (header.fatSize === 0) return [toolchainDiagnostic("E612", { path: name })];
  if (!header.magicOk) return [toolchainDiagnostic("E613", { path: name })];
  return [];
}

export async function verifyRom(ndsPath: string): Promise<VerifyRomResult> {
  if (!existsSync(ndsPath)) {
    return { ok: false, diagnostics: [toolchainDiagnostic("E607", { what: "The ROM", path: ndsPath })] };
  }
  const diagnostics = checkRom(readFileSync(ndsPath), ndsPath);
  return { ok: diagnostics.length === 0, diagnostics };
}

/** ndstool's -b title: "Title;Subtitle;Author" (ndstool splits on ';', so the parts must not contain one). */
export function bannerTitle(opts: Pick<PackRomOptions, "title" | "subtitle" | "author">): string {
  const clean = (s: string) => s.replaceAll(";", ",").trim();
  return [opts.title, opts.subtitle, opts.author]
    .map(clean)
    .filter((s) => s !== "")
    .join(";");
}

/** The ndstool argv for one pack. -7 is always explicit, so ndstool never depends on $BLOCKSDS. */
export function ndstoolArgs(opts: PackRomOptions, arm7Elf: string, defaultIcon: string): string[] {
  const args = ["-c", opts.outNds, "-9", opts.arm9Elf, "-7", arm7Elf];
  args.push("-b", opts.iconPng ?? defaultIcon, bannerTitle(opts));
  if (opts.gamecode !== "####") args.push("-g", opts.gamecode);
  args.push("-d", opts.nitrofsDir);
  return args;
}

export interface PackRomDeps {
  paths: ToolPaths;
  /** Environment for console tools (toolEnv()). */
  env: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Packs the ROM, then checks its header. Throws ToolchainError (E6xx) on any failure and deletes a partial ROM.
 */
export async function packRom(opts: PackRomOptions, deps: PackRomDeps): Promise<PackRomResult> {
  const { ndstool, arm7Elf, icon } = deps.paths;
  if (!ndstool || !arm7Elf || (!icon && opts.iconPng === null)) {
    throw new ToolchainError([
      toolchainDiagnostic("E600", { dir: deps.paths.wonderful ?? "C:\\msys64\\opt\\wonderful" }),
    ]);
  }
  const problems: Diagnostic[] = [];
  for (const [what, p] of [
    ["The runtime", opts.arm9Elf],
    ["The game folder", opts.nitrofsDir],
  ] as const) {
    if (!existsSync(p)) problems.push(toolchainDiagnostic("E607", { what, path: p }));
  }
  if (opts.iconPng !== null && !existsSync(opts.iconPng)) {
    problems.push(toolchainDiagnostic("E607", { what: "The icon", path: opts.iconPng }));
  }
  for (const p of [opts.outNds, opts.arm9Elf, opts.nitrofsDir]) {
    const full = path.resolve(p);
    if (full.length >= MAX_TOOL_PATH) problems.push(toolchainDiagnostic("E606", { path: full, length: full.length }));
  }
  if (problems.length > 0) throw new ToolchainError(problems);

  mkdirSync(path.dirname(opts.outNds), { recursive: true });
  rmSync(opts.outNds, { force: true });
  const run = await runTool("ndstool", ndstool, ndstoolArgs(opts, arm7Elf, icon ?? ""), {
    cwd: path.dirname(opts.outNds),
    env: deps.env,
    timeoutMs: deps.timeoutMs ?? PACK_TIMEOUT_MS,
    signal: deps.signal,
  });
  // ndstool can exit 0 without writing (e.g. an unreadable ELF): the file must exist and not be empty.
  const written = existsSync(opts.outNds) && statSync(opts.outNds).size > 0;
  if (run.diagnostics.length > 0 || !written) {
    rmSync(opts.outNds, { force: true });
    throw new ToolchainError(
      run.diagnostics.length > 0
        ? run.diagnostics
        : [toolchainDiagnostic("E610", { path: opts.outNds, detail: outputTail(run) })],
    );
  }

  const rom = readFileSync(opts.outNds);
  const diagnostics = checkRom(rom, opts.outNds);
  if (diagnostics.length > 0) {
    // A ROM whose game files can't mount must not be launched later (play --no-build): remove it.
    rmSync(opts.outNds, { force: true });
    throw new ToolchainError(diagnostics);
  }
  const header = readRomHeader(rom);
  return {
    ndsPath: opts.outNds,
    info: {
      sizeBytes: rom.length,
      sha256: createHash("sha256").update(rom).digest("hex"),
      nitrofsFiles: header ? header.fatSize / 8 : 0,
      ...(header ? { header } : {}),
    },
  };
}
