/** E6xx: build and toolchain problems found by @dsdude/toolchain (C9 range; owner WS1, then WS8). */
import { type CatalogEntry, type Diagnostic, makeDiagnostic } from "@dsdude/project-format";

const e = (code: string, title: string, message: string, hint: string | null): CatalogEntry => ({
  code,
  severity: "error",
  title,
  message,
  hint,
});

export const TOOLCHAIN_CATALOG = {
  E600: e(
    "E600",
    "DS tools not installed",
    "The DS tools (BlocksDS) are not installed in {dir}.",
    "Run scripts/install-toolchain.ps1, or dsdude toolchain install.",
  ),
  E601: e(
    "E601",
    "A DS tool is missing",
    "{tool} is missing: {path} does not exist.",
    "Run scripts/install-toolchain.ps1 again to repair the DS tools.",
  ),
  E602: e(
    "E602",
    "A DS tool could not start",
    "{tool} could not start because a DLL it needs is missing (exit code 0xC0000135).",
    "Put C:\\msys64\\opt\\wonderful\\bin first on PATH, or reinstall the tools pack.",
  ),
  E603: e("E603", "A DS tool failed", "{tool} stopped with exit code {code}: {detail}", null),
  E604: e(
    "E604",
    "A DS tool took too long",
    "{tool} did not finish within {seconds} seconds, so it was stopped.",
    "Try again. If it keeps happening, run dsdude doctor.",
  ),
  E605: e(
    "E605",
    "Needs Windows",
    "{what} only works on Windows with the DS tools installed.",
    "Run this on the Windows machine; on other systems only compile works.",
  ),
  E606: e(
    "E606",
    "Path too long",
    "The path {path} is {length} characters long; the DS tools need paths under 250 characters.",
    "Move the project to a shorter folder, for example C:\\DSDudeProjects.",
  ),
  E607: e("E607", "Missing file", "{what} {path} does not exist.", null),
  E608: e(
    "E608",
    "Not a DSDude project",
    "{dir} has no project.json, so it can only be packed with --skip-compile --skip-assets.",
    "Open a folder that holds project.json, or add --skip-compile --skip-assets for a plain BlocksDS folder.",
  ),
  E609: e(
    "E609",
    "Not built yet",
    "There is no built ROM for {dir} yet.",
    "Run dsdude build first, or drop --no-build.",
  ),
  E610: e("E610", "The ROM could not be made", "ndstool could not make {path}: {detail}", null),
  E611: e(
    "E611",
    "Broken ROM header",
    "The ROM {path} is broken: its file table starts at {offset}, before 0x8000.",
    "Rebuild with the ndstool from BlocksDS 1.24.0.",
  ),
  E612: e(
    "E612",
    "Empty game files",
    "The ROM {path} has no files inside, so the game can't load anything.",
    "Check that the game folder is not empty; game.dsdb is always packed.",
  ),
  E613: e(
    "E613",
    "Game files can't be found",
    "The ROM {path} has no 'NitroFS!' mark after its file table, so the DS can't open the game files.",
    "Rebuild with the ndstool from BlocksDS 1.24.0; older versions don't write the mark.",
  ),
  E614: e(
    "E614",
    "ROM too short",
    "The ROM {path} is only {size} bytes long, too short for a DS ROM.",
    "Build it again; a stopped build can leave a cut-off file.",
  ),
  E620: e(
    "E620",
    "Emulator missing",
    "{emulator} is not installed: {path} does not exist.",
    "Run dsdude emulator install {kind}, or scripts/install-toolchain.ps1.",
  ),
  E621: e(
    "E621",
    "Emulator could not start",
    "{emulator} could not start: {detail}",
    "Close other emulator windows and try again.",
  ),
  E622: e(
    "E622",
    "Emulator download damaged",
    "The {emulator} download does not match its checksum.",
    "Delete {path} and download it again.",
  ),
  E623: e(
    "E623",
    "Debugging needs melonDS",
    "DeSmuME has no debugger connection, so Debug can't start it.",
    "Choose melonDS as the emulator to debug.",
  ),
  E624: e(
    "E624",
    "Emulator download failed",
    "{emulator} could not be downloaded from {url}: {detail}",
    "Check the internet connection and try again.",
  ),
  E630: e(
    "E630",
    "Screenshot tool missing",
    "Python or py-desmume is not installed: {detail}",
    "Install Python 3.13, then run: python -m pip install --user py-desmume==0.0.9",
  ),
  E631: e("E631", "Screenshot failed", "The screenshot of {rom} failed: {detail}", null),
  E640: e(
    "E640",
    "The runtime could not be built",
    "make in {dir} stopped with exit code {code}: {detail}",
    "Read the build log above for the first error.",
  ),
  E641: e(
    "E641",
    "Compiler not connected",
    "{what} needs the compiler and the asset pipeline, and this copy of DSDude doesn't have them yet.",
    "Add --skip-compile --skip-assets to pack the last build again.",
  ),
  // E650-E659: warnings from `dsdude doctor` (they never block a build).
  E650: {
    code: "E650",
    severity: "warning",
    title: "OneDrive is syncing the project",
    message: "OneDrive is running and {path} is inside the OneDrive folder, so build files may get locked.",
    hint: "Turn off sync for that folder, or move the project out of OneDrive, for example to C:\\DSDudeProjects.",
  },
  E651: {
    code: "E651",
    severity: "warning",
    title: "Long project path",
    message: "The build folder {path} is {length} characters long; the DS tools stop working at 250.",
    hint: "Move the project to a shorter folder, or set DSDUDE_HOME to a short folder such as C:\\DSDude.",
  },
} as const satisfies Record<string, CatalogEntry>;

export type ToolchainCode = keyof typeof TOOLCHAIN_CATALOG;

export const TOOLCHAIN_CATALOG_ENTRIES: CatalogEntry[] = Object.values(TOOLCHAIN_CATALOG);

/** Builds an E6xx diagnostic from the catalog. */
export function toolchainDiagnostic(
  code: ToolchainCode,
  args: Readonly<Record<string, string | number>> = {},
  at: Partial<Pick<Diagnostic, "file" | "line" | "col" | "endLine" | "endCol">> = {},
): Diagnostic {
  return makeDiagnostic(TOOLCHAIN_CATALOG[code], "toolchain", args, at);
}

/** Thrown by toolchain functions whose result type has no diagnostics field (packRom, ensureInstalled, launch). */
export class ToolchainError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => `${d.message} (${d.code})`).join("\n"));
    this.name = "ToolchainError";
    this.diagnostics = diagnostics;
  }
}
