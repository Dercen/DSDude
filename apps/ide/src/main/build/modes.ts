/**
 * The build-service switch (docs/kickoff/ws6.md tasks 3 and 5):
 * - `mock`: C4 MockBuildService in the worker and fake emulators in main (fake log, diagnostics, a fake emulator
 *   that waits). The default until the real BuildService is wired at CP-B.
 * - `fake` (`DSDUDE_FAKE_TOOLCHAIN=1`): createFakeToolchain(): the real LocalBuildService with fake tools, and fake
 *   emulators. For Vitest and Playwright.
 * - `real` (`DSDUDE_BUILD_SERVICE=real`): LocalBuildService and LocalEmulatorManager.
 * `DSDUDE_MOCK_DIAGNOSTICS` (a JSON array of C9 diagnostics) makes the mock report them, so tests can fail a Play.
 */
import { DiagnosticSchema } from "@dsdude/project-format";
import {
  type BuildService,
  type BuildServiceDeps,
  createFakeToolchain,
  type EmulatorHandle,
  type EmulatorKind,
  type EmulatorManager,
  fakeEmulator,
  LocalBuildService,
  LocalEmulatorManager,
  MOCK_EMULATOR_LINES,
  MockBuildService,
  type PackAssetsFn,
  provisionalManifest,
} from "@dsdude/toolchain";
import { z } from "zod";
import type { BuildServiceMode } from "./protocol.ts";

type Env = Record<string, string | undefined>;

export function buildServiceMode(env: Env): BuildServiceMode {
  if (env.DSDUDE_FAKE_TOOLCHAIN === "1") return "fake";
  const m = env.DSDUDE_BUILD_SERVICE;
  return m === "real" || m === "fake" ? m : "mock";
}

function mockDiagnostics(env: Env) {
  if (!env.DSDUDE_MOCK_DIAGNOSTICS) return [];
  return z.array(DiagnosticSchema).parse(JSON.parse(env.DSDUDE_MOCK_DIAGNOSTICS));
}

/**
 * The BuildService the worker runs (steps 3-6). `deps` are WS4's compileProject and WS5's packAssets and
 * checkRoomBudgets, injected by the worker entry (C4: the toolchain never imports them). Fake mode swaps packAssets
 * for `fakePackAssets`, so it compiles DSS for real without grit or mmutil.
 */
export function createWorkerBuildService(
  mode: BuildServiceMode,
  home: string,
  env: Env,
  deps: BuildServiceDeps | null = null,
): BuildService {
  if (mode === "fake")
    return createFakeToolchain({ home, deps: deps ? { ...deps, packAssets: fakePackAssets } : null }).service;
  if (mode === "real") return new LocalBuildService({ home, runtimeDir: env.DSDUDE_RUNTIME_DIR, deps, env });
  return new MockBuildService({ diagnostics: mockDiagnostics(env) });
}

/** packAssets without tools (fake mode): the provisional manifest from the project, no NitroFS asset files. */
export const fakePackAssets: PackAssetsFn = async (project) => ({
  manifest: provisionalManifest(project),
  diagnostics: [],
});

export type IdeEmulatorManager = EmulatorManager & { stopCurrent?: () => Promise<void> };

/** Fake emulators for mock and fake mode: MOCK_EMULATOR_LINES, then wait until stop() (C4 fakeEmulator). */
export class FakeEmulatorManager implements EmulatorManager {
  readonly lines: readonly string[];
  #current: EmulatorHandle | null = null;

  constructor(lines: readonly string[] = MOCK_EMULATOR_LINES) {
    this.lines = lines;
  }

  async ensureInstalled(kind: EmulatorKind): Promise<string> {
    return kind === "melonds" ? "C:\\fake\\melonDS-1.1\\melonDS.exe" : "C:\\fake\\desmume-0.9.13\\DeSmuME.exe";
  }

  async launch(_romPath: string, opts: { kind: EmulatorKind }): Promise<EmulatorHandle> {
    await this.stopCurrent();
    const handle = { ...fakeEmulator([...this.lines]), kind: opts.kind };
    this.#current = handle;
    return handle;
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

/** The EmulatorManager main uses for step 7. */
export function createEmulatorManager(mode: BuildServiceMode, home: string): IdeEmulatorManager {
  return mode === "real" ? new LocalEmulatorManager({ home }) : new FakeEmulatorManager();
}
