/**
 * Installs melonDS 1.1 into <DSDUDE_HOME>\emulators\melonDS-1.1\ (PLAN.md 2.6): from a local zip (the installer's
 * bundled copy) or the GitHub release, SHA-256-checked before anything is extracted. Extraction uses Windows'
 * own tar.exe (bsdtar reads zip), so no npm dependency is needed.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { ToolchainError, toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { outputTail, runProcess } from "./process.ts";

export const MELONDS_URL =
  "https://github.com/melonDS-emu/melonDS/releases/download/1.1/melonDS-1.1-windows-x86_64.zip";
export const MELONDS_SHA256 = "9f3f8a244103be20b5b657af5b0ed1b2a66bb20a7181476a6d294c9a53d4f8c8";
export const MELONDS_ZIP_BYTES = 19_484_283;
export const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const EXTRACT_TIMEOUT_MS = 2 * 60_000;

export type DownloadFn = (url: string, signal: AbortSignal) => Promise<Uint8Array>;
export type ExtractFn = (zip: string, dir: string) => Promise<void>;

export const fetchDownload: DownloadFn = async (url, signal) => {
  const res = await fetch(url, { signal, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

/** `tar.exe -xf <zip> -C <dir>` from System32, hidden and time-limited. */
export const tarExtract: ExtractFn = async (zip, dir) => {
  const tar = path.win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  const run = await runProcess(tar, ["-xf", zip, "-C", dir], {
    env: { ...process.env } as Record<string, string>,
    timeoutMs: EXTRACT_TIMEOUT_MS,
    windowsHide: true,
  });
  if (run.exitCode !== 0) throw new Error(run.spawnError ?? `tar exit ${run.exitCode}: ${outputTail(run)}`);
};

export interface InstallMelonDsOptions {
  /** Target exe: <DSDUDE_HOME>\emulators\melonDS-1.1\melonDS.exe. */
  exe: string;
  /** A local copy of the release zip; when absent (or missing on disk) the zip is downloaded. */
  zip?: string;
  download?: DownloadFn;
  extract?: ExtractFn;
  timeoutMs?: number;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Returns the exe; throws ToolchainError E622 (bad checksum), E624 (download failed) or E621 (bad archive). */
export async function installMelonDs(opts: InstallMelonDsOptions): Promise<string> {
  const dir = path.dirname(opts.exe);
  let bytes: Uint8Array;
  if (opts.zip && existsSync(opts.zip)) {
    bytes = readFileSync(opts.zip);
  } else {
    try {
      bytes = await (opts.download ?? fetchDownload)(
        MELONDS_URL,
        AbortSignal.timeout(opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new ToolchainError([toolchainDiagnostic("E624", { emulator: "melonDS 1.1", url: MELONDS_URL, detail })]);
    }
  }
  if (bytes.length !== MELONDS_ZIP_BYTES || sha256(bytes) !== MELONDS_SHA256) {
    throw new ToolchainError([toolchainDiagnostic("E622", { emulator: "melonDS 1.1", path: opts.zip ?? MELONDS_URL })]);
  }
  mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, "melonDS-1.1-windows-x86_64.zip");
  writeFileSync(zip, bytes);
  try {
    await (opts.extract ?? tarExtract)(zip, dir);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new ToolchainError([
      toolchainDiagnostic("E621", { emulator: "melonDS", detail: `unpacking failed: ${detail}` }),
    ]);
  } finally {
    rmSync(zip, { force: true });
  }
  if (!existsSync(opts.exe)) {
    throw new ToolchainError([
      toolchainDiagnostic("E621", { emulator: "melonDS", detail: `the archive has no ${path.basename(opts.exe)}` }),
    ]);
  }
  return opts.exe;
}
