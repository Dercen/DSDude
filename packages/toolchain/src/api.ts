/**
 * Contract C4 v0.1.0: toolchain driver API + BuildService. Types only.
 * Written by WS0 in Phase 0; owner WS1 (then WS8), BuildService confirmed at CP-A. Spec: PLAN.md 5.2 C4,
 * contracts/toolchain-api.md (WS1). How to change me: T0 comments; T1 (minor bump + CHANGELOG entry) for
 * additive members (a new optional field, a new phase, a new function type); T2 (ADR co-signed by WS4, WS5,
 * WS6 and WS8) for anything that breaks an implementer or a consumer.
 *
 * `@dsdude/toolchain` never imports `@dsdude/compiler` or `@dsdude/asset-pipeline`: they import these types,
 * and BuildService receives CompileFn, PackAssetsFn and CheckRoomBudgetsFn injected by the composition roots
 * (packages/cli and the IDE build worker). Importing this module has no side effects and works on Linux.
 */
import type { Diagnostic, Project } from "@dsdude/project-format";

export const CONTRACT_VERSION = "0.3.0";

// ---------------------------------------------------------------------------------------------------------
// Tools

/**
 * Absolute paths of the local tools, as `detectToolchain()` found them. Every field is optional: in a cloud
 * session (Linux, `CLAUDE_CODE_REMOTE=true`) ToolPaths stays empty and real-tool tests print
 * `skipped: no ToolPaths`.
 */
export interface ToolPaths {
  /** C:\msys64\usr\bin\bash.exe (spawned as `bash.exe -lc` with CHERE_INVOKING=1, only for make and the install). */
  bash?: string;
  /** C:\msys64\opt\wonderful (WONDERFUL_TOOLCHAIN); its bin\ goes first on PATH for console tools. */
  wonderful?: string;
  /** POSIX path of the BlocksDS core, e.g. /opt/wonderful/thirdparty/blocksds/core (BLOCKSDS). */
  blocksds?: string;
  ndstool?: string;
  grit?: string;
  mmutil?: string;
  /** <core>\sys\arm7\main_core\arm7_maxmod.elf, always passed to ndstool as -7 (0.2.0). */
  arm7Elf?: string;
  /** <core>\sys\icon.bmp, the ndstool -b icon when a build has none of its own (0.2.0). */
  icon?: string;
  /** arm-none-eabi-gcc.exe; only buildRuntime needs it (0.2.0). */
  gcc?: string;
  /** melonDS 1.1 exe under <DSDUDE_HOME>\emulators\. */
  melonds?: string;
  /** DeSmuME 0.9.13 exe under <DSDUDE_HOME>\emulators\ (optional profile). */
  desmume?: string;
  /** Python with py-desmume 0.0.9, for `dsdude screenshot`. */
  python?: string;
}

export interface ToolchainStatus {
  /** false (never a throw) when BlocksDS is missing, including on Linux. */
  installed: boolean;
  /** e.g. "1.24.0"; null when not installed. */
  blocksdsVersion: string | null;
  paths: ToolPaths;
  /** E6xx diagnostics describing what is missing. */
  diagnostics: Diagnostic[];
}

export interface InstallProgress {
  step: string;
  /** 0..1 */
  progress: number;
  log?: string;
}

/** Result of one console-tool run (grit, mmutil, ndstool). Spawned with windowsHide and a timeout. */
export interface ToolRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  diagnostics: Diagnostic[];
}

export interface BuildRuntimeOptions {
  /** make -j; default DSDUDE_MAKE_JOBS, else 8. */
  jobs?: number;
  timeoutMs?: number;
}

export interface BuildRuntimeResult {
  ok: boolean;
  /** runtime/dist/arm9.elf (C8 runtime artifact). */
  arm9Elf: string | null;
  diagnostics: Diagnostic[];
}

export interface PackRomOptions {
  arm9Elf: string;
  /** Folder that becomes the NitroFS root (game.dsdb, gfx/, bg/, soundbank.bin; C3). */
  nitrofsDir: string;
  outNds: string;
  title: string;
  subtitle: string;
  author: string;
  /** 32x32 PNG with <= 15 colours + transparent (ndstool -b). */
  iconPng: string | null;
  /** "####" in 0.1. */
  gamecode: string;
}

/** The NitroFS fields of a ROM header that verifyRom() checks (PLAN.md 3.2 step 6; 0.2.0). */
export interface RomHeaderInfo {
  /** FNT offset/size at 0x40/0x44, FAT offset/size at 0x48/0x4C. */
  fntOffset: number;
  fntSize: number;
  fatOffset: number;
  fatSize: number;
  /** fatOffset + fatSize: where the 8 bytes "NitroFS!" must be. */
  magicOffset: number;
  magicOk: boolean;
}

export interface RomInfo {
  sizeBytes: number;
  sha256: string;
  nitrofsFiles: number;
  /** The checked header fields (0.2.0). */
  header?: RomHeaderInfo;
}

export interface PackRomResult {
  ndsPath: string;
  info: RomInfo;
}

export interface VerifyRomResult {
  ok: boolean;
  diagnostics: Diagnostic[];
}

export type DetectToolchainFn = () => Promise<ToolchainStatus>;
export type InstallToolchainFn = (progress: (p: InstallProgress) => void) => Promise<ToolchainStatus>;
export type BuildRuntimeFn = (opts: BuildRuntimeOptions) => Promise<BuildRuntimeResult>;
export type RunToolFn = (args: string[], opts?: { cwd?: string; timeoutMs?: number }) => Promise<ToolRunResult>;
export type PackRomFn = (opts: PackRomOptions) => Promise<PackRomResult>;
export type VerifyRomFn = (ndsPath: string) => Promise<VerifyRomResult>;

// ---------------------------------------------------------------------------------------------------------
// Emulators

export type EmulatorKind = "melonds" | "desmume";

export interface LaunchOptions {
  /** Extra environment for the emulator process. Emulators spawn WITHOUT windowsHide and with stdio 'pipe'. */
  env?: Record<string, string>;
  /** Debug: melonDS starts its GDB stub on 3333 (ARM9) / 3334 (ARM7); DeSmuME has none (E623). 0.3.0. */
  debug?: boolean;
}

/**
 * A running emulator. onLine receives each stdout line with `\r\n` accepted and every `DSD|PAD|` flush-pad
 * line dropped (C8). stop() closes gracefully (`taskkill /PID`, then `/F` after 2 s), so buffered stdout
 * still reaches onLine.
 */
export interface EmulatorHandle {
  readonly kind: EmulatorKind;
  readonly pid: number | null;
  /** Subscribes to log lines; returns an unsubscribe function. */
  onLine(listener: (line: string) => void): () => void;
  /** Stops the emulator; resolves once the process has exited. */
  stop(): Promise<void>;
  /** Resolves with the exit code (null when killed) once the process ends for any reason. */
  readonly exited: Promise<number | null>;
}

export interface EmulatorManager {
  /** Unpacks/copies the emulator into <DSDUDE_HOME>\emulators\ if needed; returns its exe. */
  ensureInstalled(kind: EmulatorKind): Promise<string>;
  launch(romPath: string, opts: LaunchOptions & { kind: EmulatorKind }): Promise<EmulatorHandle>;
  /**
   * Kills an emulator an earlier process left running (PID + exe + start time persisted under DSDUDE_HOME), with
   * taskkill /F /T; the IDE calls it at startup and before quit. Resolves true when it killed one. 0.3.0.
   */
  reconcile?(): Promise<boolean>;
}

// ---------------------------------------------------------------------------------------------------------
// Assets and compiler seams (implemented by WS5 and WS4; injected into BuildService)

/** PROVISIONAL until WS5's contracts/assetpack.md (C3): names -> ids, dimensions, frames. */
export interface AssetManifest {
  provisional: true;
  sprites: Record<
    string,
    { id: number; frames: number; frameWidth: number; frameHeight: number; colorMode: "16" | "256" }
  >;
  backgrounds: Record<string, { id: number; width: number; height: number }>;
  sounds: Record<string, { id: number; kind: "effect" | "music" }>;
}

/** PROVISIONAL until C3: the assets one room needs, per screen (C3 "Per-room asset sets"). */
export interface RoomAssetSet {
  room: string;
  screens: {
    top: { sprites: string[]; backgrounds: string[] };
    bottom: { sprites: string[]; backgrounds: string[] };
  };
  /** Sound effects and music modules loaded before Room Start. */
  sounds: string[];
}

export interface CompileOutput {
  /** The DSDB image (C2); empty when diagnostics contain an error. */
  dsdb: Uint8Array;
  roomSets: RoomAssetSet[];
  diagnostics: Diagnostic[];
}

/** `compileProject` from @dsdude/compiler (WS4). Synchronous and Worker-safe: no fs, no Node imports. */
export type CompileFn = (project: Project, manifest: AssetManifest) => CompileOutput;

/** `packAssets` from @dsdude/asset-pipeline (WS5). Writes the NitroFS asset files; empty ToolPaths -> E6xx. */
export type PackAssetsFn = (
  project: Project,
  toolPaths: ToolPaths,
) => Promise<{ manifest: AssetManifest; diagnostics: Diagnostic[] }>;

/** `checkRoomBudgets` from @dsdude/asset-pipeline (WS5); BuildService calls it after compileProject. */
export type CheckRoomBudgetsFn = (
  manifest: AssetManifest,
  roomSets: RoomAssetSet[],
) => { manifest: AssetManifest; diagnostics: Diagnostic[] };

// ---------------------------------------------------------------------------------------------------------
// BuildService

export type BuildPhase =
  | "load"
  | "compile"
  | "assets"
  | "budgets"
  | "runtime"
  | "pack"
  | "launch"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export interface BuildEvent {
  phase: BuildPhase;
  /** 0..1 over the whole request. */
  progress: number;
  /** Diagnostics found so far in this request (cumulative). */
  diagnostics: Diagnostic[];
  /** New log lines since the previous event (build output and, while running, DSD| lines). */
  log: string[];
  /** Milliseconds spent per finished phase. */
  timings: Partial<Record<BuildPhase, number>>;
}

export interface BuildRequest {
  projectDir: string;
  emulator?: EmulatorKind;
  /** DSDB header RNG seed (C2); 0 or absent = runtime picks. */
  seed?: number;
  /** Prebuilt runtime ELF instead of runtime/dist/arm9.elf. */
  runtime?: string;
  skipCompile?: boolean;
  skipAssets?: boolean;
  /** Runtime build parallelism (C10 --jobs). */
  jobs?: number;
  /** play only: launch with the emulator's GDB stub (C10 --debug; melonDS only, else E623). 0.3.0. */
  debug?: boolean;
}

export interface BuildResult {
  ok: boolean;
  /** <DSDUDE_HOME>\build\<project-hash>\game.nds; null for compileOnly or on failure. */
  ndsPath: string | null;
  diagnostics: Diagnostic[];
  timings: Partial<Record<BuildPhase, number>>;
}

export interface PlayResult extends BuildResult {
  /** The running emulator; null when the build failed or was cancelled. */
  emulator: EmulatorHandle | null;
}

export interface BuildService {
  /** Build, then launch the emulator. */
  play(req: BuildRequest): Promise<PlayResult>;
  build(req: BuildRequest): Promise<BuildResult>;
  /** Load + compile + budgets only; no tools needed (works on Linux). */
  compileOnly(req: BuildRequest): Promise<BuildResult>;
  /** Gracefully stops the running emulator, if any. */
  stop(): Promise<void>;
  /** Cancels the running build, if any; its promise resolves with phase "cancelled". */
  cancel(): void;
  /** Subscribes to BuildEvents of every request; returns an unsubscribe function. */
  onEvent(listener: (event: BuildEvent) => void): () => void;
}

export interface BuildServiceDeps {
  compile: CompileFn;
  packAssets: PackAssetsFn;
  checkRoomBudgets: CheckRoomBudgetsFn;
}

// ---------------------------------------------------------------------------------------------------------
// CLI registration (C10): each package exports `cliCommands: CliCommand[]` from its index.

export type ExitCode = 0 | 1 | 2;

export interface CliCommand {
  /** Subcommand name, e.g. "compile". */
  name: string;
  /** One line for `dsdude --help`. */
  summary: string;
  /** argv excludes the subcommand. 0 ok, 1 user-input diagnostics, 2 tool/environment failure. */
  run(argv: string[]): Promise<ExitCode>;
}
