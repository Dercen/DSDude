/**
 * createFakeToolchain() (C4): the real LocalBuildService with fake tools, for tests that need the whole Play path
 * without Windows tools. It runs on Linux (cloud streams), in CI and in the IDE's tests:
 * - `detect` reports an installed BlocksDS 1.24.0 with placeholder paths;
 * - `make` returns fixtures/runtime/hello/arm9.elf;
 * - `packRom` checks its inputs like the real one (E607), then copies fixtures/build/hello/game.nds and runs the
 *   real header check (so hex-patched ROM tests behave as with ndstool);
 * - the emulator manager returns fakeEmulator() handles printing MOCK_EMULATOR_LINES, as MockBuildService does.
 * Everything else (project loading, the injected compiler and asset pipeline, the build folder, events,
 * cancellation, packrom.json, --seed) is the real code.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { Diagnostic } from "@dsdude/project-format";
import type {
  BuildServiceDeps,
  EmulatorHandle,
  EmulatorKind,
  EmulatorManager,
  LaunchOptions,
  PackRomOptions,
  PackRomResult,
  ToolchainStatus,
} from "./api.ts";
import { LocalBuildService } from "./build-service.ts";
import { ToolchainError, toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { sha256 } from "./emulator-install.ts";
import { FIXTURE_ELF, FIXTURE_ROM } from "./fixtures.ts";
import { fakeEmulator, MOCK_EMULATOR_LINES } from "./mock-build-service.ts";
import { checkRom, readRomHeader } from "./rom.ts";

export interface FakeToolchainOptions {
  /** DSDUDE_HOME for the build folders (a temp dir in tests). */
  home: string;
  /** compileProject / packAssets / checkRoomBudgets, real or fake; null = only the reuse path (skip flags). */
  deps?: BuildServiceDeps | null;
  /** Lines every fake emulator prints before it waits; default MOCK_EMULATOR_LINES. */
  emulatorLines?: readonly string[];
  /** Replaces the ROM the fake ndstool "writes" (e.g. a hex-patched copy of the fixture). */
  rom?: Uint8Array;
  /** Diagnostics the fake ndstool fails with (e.g. an E602), instead of writing a ROM. */
  packFailure?: Diagnostic[];
}

export interface FakeLaunch {
  romPath: string;
  kind: EmulatorKind;
  debug: boolean;
}

export interface FakeToolchain {
  service: LocalBuildService;
  status: ToolchainStatus;
  /** Every packRom call, in order. */
  packs: PackRomOptions[];
  /** Every emulator launch, in order. */
  launches: FakeLaunch[];
}

export const FAKE_TOOL_PATHS = {
  bash: "C:\\msys64\\usr\\bin\\bash.exe",
  wonderful: "C:\\msys64\\opt\\wonderful",
  blocksds: "/opt/wonderful/thirdparty/blocksds/core",
  ndstool: "C:\\msys64\\opt\\wonderful\\thirdparty\\blocksds\\core\\tools\\ndstool\\ndstool.exe",
  grit: "C:\\msys64\\opt\\wonderful\\thirdparty\\blocksds\\core\\tools\\grit\\grit.exe",
  mmutil: "C:\\msys64\\opt\\wonderful\\thirdparty\\blocksds\\core\\tools\\mmutil\\mmutil.exe",
  arm7Elf: "C:\\msys64\\opt\\wonderful\\thirdparty\\blocksds\\core\\sys\\arm7\\main_core\\arm7_maxmod.elf",
  icon: "C:\\msys64\\opt\\wonderful\\thirdparty\\blocksds\\core\\sys\\icon.bmp",
  gcc: "C:\\msys64\\opt\\wonderful\\toolchain\\gcc-arm-none-eabi\\bin\\arm-none-eabi-gcc.exe",
} as const;

class FakeEmulatorManager implements EmulatorManager {
  readonly #lines: readonly string[];
  readonly #launches: FakeLaunch[];
  #current: EmulatorHandle | null = null;

  constructor(lines: readonly string[], launches: FakeLaunch[]) {
    this.#lines = lines;
    this.#launches = launches;
  }

  async ensureInstalled(kind: EmulatorKind): Promise<string> {
    return kind === "melonds"
      ? "C:\\fake\\melonDS-1.1\\melonDS.exe"
      : "C:\\fake\\desmume-0.9.13\\DeSmuME_0.9.13_x64.exe";
  }

  async launch(romPath: string, opts: LaunchOptions & { kind: EmulatorKind }): Promise<EmulatorHandle> {
    if (opts.debug && opts.kind !== "melonds") throw new ToolchainError([toolchainDiagnostic("E623")]);
    if (!existsSync(romPath))
      throw new ToolchainError([toolchainDiagnostic("E607", { what: "The ROM", path: romPath })]);
    await this.stopCurrent();
    this.#launches.push({ romPath, kind: opts.kind, debug: opts.debug === true });
    const handle = fakeEmulator([...this.#lines]);
    this.#current = handle;
    return { ...handle, kind: opts.kind };
  }

  async stopCurrent(): Promise<void> {
    const current = this.#current;
    this.#current = null;
    if (current) await current.stop();
  }

  async reconcile(): Promise<boolean> {
    return false;
  }
}

export function createFakeToolchain(opts: FakeToolchainOptions): FakeToolchain {
  const packs: PackRomOptions[] = [];
  const launches: FakeLaunch[] = [];
  const status: ToolchainStatus = {
    installed: true,
    blocksdsVersion: "1.24.0",
    paths: { ...FAKE_TOOL_PATHS },
    diagnostics: [],
  };

  const fakePack = async (p: PackRomOptions): Promise<PackRomResult> => {
    packs.push(p);
    const missing: Diagnostic[] = [];
    if (!existsSync(p.arm9Elf)) missing.push(toolchainDiagnostic("E607", { what: "The runtime", path: p.arm9Elf }));
    if (!existsSync(p.nitrofsDir))
      missing.push(toolchainDiagnostic("E607", { what: "The game folder", path: p.nitrofsDir }));
    if (missing.length > 0) throw new ToolchainError(missing);
    if (opts.packFailure) throw new ToolchainError(opts.packFailure);
    mkdirSync(path.dirname(p.outNds), { recursive: true });
    if (opts.rom) writeFileSync(p.outNds, opts.rom);
    else copyFileSync(FIXTURE_ROM, p.outNds);
    const rom = readFileSync(p.outNds);
    const diagnostics = checkRom(rom, p.outNds);
    if (diagnostics.length > 0) {
      rmSync(p.outNds, { force: true });
      throw new ToolchainError(diagnostics);
    }
    const header = readRomHeader(rom);
    return {
      ndsPath: p.outNds,
      info: {
        sizeBytes: rom.length,
        sha256: sha256(rom),
        nitrofsFiles: header ? header.fatSize / 8 : 0,
        ...(header ? { header } : {}),
      },
    };
  };

  const service = new LocalBuildService({
    home: opts.home,
    runtimeDir: path.join(opts.home, "fake-runtime"),
    deps: opts.deps ?? null,
    detect: async () => status,
    emulators: new FakeEmulatorManager(opts.emulatorLines ?? MOCK_EMULATOR_LINES, launches),
    packRom: fakePack,
    make: async () => ({ ok: true, arm9Elf: FIXTURE_ELF, diagnostics: [] }),
  });
  return { service, status, packs, launches };
}
