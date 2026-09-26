/** @dsdude/toolchain: contract C4. Importing it has no side effects and works on Linux (tools are only spawned). */
export * from "./api.ts";
export {
  errorDiagnostics,
  LocalBuildService,
  type LocalBuildServiceOptions,
  PACKROM_JSON,
  ROM_NAME,
} from "./build-service.ts";
export { cliCommands, exitCodeFor, formatDiagnostic, makeCliCommands } from "./cli.ts";
export { detectToolchain } from "./detect.ts";
export {
  TOOLCHAIN_CATALOG,
  TOOLCHAIN_CATALOG_ENTRIES,
  ToolchainError,
  toolchainDiagnostic,
} from "./diagnostics/catalog.ts";
export { LineSplitter, LocalEmulatorManager, patchToml } from "./emulator.ts";
export {
  createFakeToolchain,
  FAKE_TOOL_PATHS,
  type FakeLaunch,
  type FakeToolchain,
  type FakeToolchainOptions,
} from "./fake-toolchain.ts";
export { FIXTURE_ELF, FIXTURE_NITROFS, FIXTURE_PACKROM, FIXTURE_ROM } from "./fixtures.ts";
export {
  bashEnv,
  dsdudeHome,
  projectBuildDir,
  projectHash,
  toolEnv,
  type WonderfulLayout,
  wonderfulLayout,
} from "./layout.ts";
export {
  BUILD_PHASES,
  fakeEmulator,
  MOCK_EMULATOR_LINES,
  type MockBuildOptions,
  MockBuildService,
} from "./mock-build-service.ts";
export { MANIFEST_JSON, provisionalManifest, withDsdbSeed } from "./project-build.ts";
export { checkRom, packRom, readRomHeader, verifyRom } from "./rom.ts";
export { buildRuntime, runMake } from "./runtime.ts";
export { takeScreenshot } from "./screenshot.ts";

export const packageName = "@dsdude/toolchain";
