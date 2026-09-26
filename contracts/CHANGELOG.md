# Contracts CHANGELOG

One section per contract. Append only: add a line at the end of your own contract's section (WS7 also under C2
builtins for its doc/example fills); existing lines never change. Format:
`- <version> (<date>, <stream>, <tier>): <what changed>`.

## C1 Project format (`contracts/project-format.md`, `packages/project-format`)
- 0.1.0 (2026-09-25, WS0, Phase 0): format v0: project.json, sprites, backgrounds, sounds, objects, rooms, scripts; zod schemas; browser-safe load/save over ProjectFs; the `./node` adapter; E290-E299.

## C2 DSDB container (`contracts/dsdb.md`, `packages/dsdb`)
- 0.1.0 (2026-09-25, WS0, Phase 0): header, ten sections (incl. KONS), 8-byte cells, instruction encoding, calling convention, event ids, OBJS/ROOM/ASET, program form, `.dsda` grammar and canonical form, ABI hash.

## C2 opcodes (`contracts/opcodes.json`)
- 0.1.0 (2026-09-25, WS0, Phase 0): 29 stable opcodes (0-28), 22 provisional (29-50), 4 reserved int-specialised (51-54).

## C2 builtins (`contracts/builtins.json`)
- 0.1.0 (2026-09-25, WS0, Phase 0): ids 0-84 the 85 section-4 functions, 85-116 instance variables, 117-124 globals, 125-142 constants; ABI hash 0x0dd9987a; docs for the 30 builtins the samples use, TODO(WS7) elsewhere.

## C3 Asset pack (`contracts/assetpack.md`)
- owed: WS5 writes 0.1.0 on its first day (CP-A).
- 0.1.0 (2026-09-26, WS5, day 1): assetpack.md written: build-folder layout, names, sprite conversion (transparency, RGB555, 16/256 mode, median-cut reduction, palette order, OBJ-size padding, vertical stitch, grit lines, frame/VRAM stride), backgrounds (text-BG padding, tile count), sounds (WAV rewrite, module pass-through, mmutil line, ids from soundbank.h, RAM bytes), icon, assets.manifest.json schema (a superset of C4's provisional AssetManifest), cache key, per-room budgets and E401-E422.

## C4 Toolchain API (`packages/toolchain/src/api.ts`, `contracts/toolchain-api.md`)
- 0.1.0 (2026-09-25, WS0, Phase 0): api.ts types (BuildService, BuildEvent, ToolPaths, EmulatorHandle/Manager, provisional AssetManifest and RoomAssetSet, CompileFn, PackAssetsFn, CheckRoomBudgetsFn, CliCommand) and MockBuildService. toolchain-api.md owed by WS1 (CP-A).
- 0.2.0 (2026-09-25, WS1, T1; line appended by WS0 at the merge of 4ddccb5): ToolPaths.arm7Elf/icon/gcc, RomHeaderInfo and RomInfo.header (all optional); contracts/toolchain-api.md 0.2.0 written. Reviewed and accepted by WS0 2026-09-25.
- 0.3.0 (2026-09-26, WS1, T1): LaunchOptions.debug and BuildRequest.debug (melonDS GDB stub on 3333/3334; DeSmuME E623), optional EmulatorManager.reconcile() (PID + exe path + start time); ensureInstalled("melonds") downloads the 1.1 zip and checks its SHA-256; E623, E624. All additive.
- 0.4.0 (2026-09-26, WS1, T1): PackAssetsFn gets a third argument outDir (the build folder; an implementation that takes two still type-checks, but must write there); the build-folder layout (nitrofs/, icon.png, cache/, assets.manifest.json by BuildService); the project.json build path; compileOnly with a provisional manifest; createFakeToolchain(), MOCK_EMULATOR_LINES, BUILD_PHASES and the FIXTURE_* paths exported; MockBuildService phases and ROM name (game.nds) now match LocalBuildService; DeSmuME [Controls] key map; E641.
- 0.5.0 (2026-09-26, WS1, T1): runDoctor (dsdude doctor); the tools pack pinned by tools/tools-pack.json and built by tools/fetch-vendor.ps1 (spike 5 passes); E650/E651 doctor warnings (severity warning, the only non-error E6xx).

## C5 IPC (`contracts/ipc.md`, `packages/ipc-contract`)
- 0.1.0 (2026-09-25, WS0, Phase 0): channel list and zod stubs.
- 0.2.0 (2026-09-26, WS6, T1): completes the Phase-0 stubs: ProjectSchema (whole C1 Project), SpritePreviewSchema for assets.preview (request gains optional sourcePath/options; sprite now optional, exactly one required), typed SettingsSchema (settings.get/set keys narrowed to its keys, value checked per key), build.progress phase = C4 BuildPhase, PlayResult.emulator {kind,pid}; new channels settings.getAll and dialog.open; dispatchInvoke/validateEvent/createLocalBridge/parseIpcError helpers and the [code] error convention. No channel renamed or removed. Stub narrowings listed for WS0 review.

## C6 Language, events, conformance (`contracts/language.md`, `contracts/events.md`, `fixtures/conformance/`)
- 0.1.0 (2026-09-25, WS0, Phase 0): language.md v0.1, events.md v0.1, conformance v0 (5 programs, hand-written expected logs).
- 0.1.0 T0 (2026-09-26, WS4): language.md clarifications pinned by the parser: a string closes on the line it starts on; a `return` value starts on the `return`'s line.

## C7 Language-service host API (`packages/lang/src/host.ts`)
- owed: WS4, by CP-B.

## C8 Log protocol (`contracts/log-protocol.md`)
- 0.1.0 (2026-09-25, WS0, Phase 0): READY/LOG/ERR/MEM/STAT/PAD/EXIT lines, one protocol from 0x04FFFA00, >= 5 KB flush pad.

## C8 Runtime artifact (`contracts/runtime-artifact.md`)
- owed: WS3, with its first runtime/dist build.

## C9 Diagnostics (`contracts/diagnostics.md`, `packages/project-format/src/diagnostics.ts`)
- 0.1.0 (2026-09-25, WS0, Phase 0): shape, code ranges and the five catalogs, style rules, lints.
- 0.1.0 T0 (2026-09-26, WS4): compiler catalog `packages/compiler/src/diagnostics/catalog.ts` started: E101-E129 (syntax), W030, W032.

## C10 CLI (`contracts/cli.md`)
- 0.1.0 (2026-09-25, WS0, Phase 0): draft commands, flags, exit codes; WS1 finalises.
- 0.2.0 (2026-09-25, WS1, T1; line appended by WS0 at the merge of 4ddccb5): WS1's revision (see contracts/cli.md). Reviewed and accepted by WS0 2026-09-25.
- 0.3.0 (2026-09-26, WS1, T1): `play --debug`; the `--keys` key-script format of ADR-0003 (proposed; adds TOUCH x y); `emulator install melonds` downloads and SHA-256-checks.
- 0.3.0 T0 (2026-09-26, WS1): `--seed` is written into game.dsdb (also a reused one); DSDude projects need the injected compiler and asset pipeline, else E641.
- 0.4.0 (2026-09-26, WS1, T1): `dsdude doctor [project]` implemented, `--json` field `checks`.

## C11 Platform seam (`runtime/core/include/dsd_platform.h`)
- owed: WS2, by CP-A.

## C12 EditorPanel host API + preview API (`apps/ide/src/renderer/panels/api.ts`, `packages/asset-pipeline/src/preview.ts`)
- 0.1.0 (2026-09-25, WS0, Phase 0): preview types (`PreviewSpriteFn`, `SpritePreview`). Panel API + mock-host owed by WS6 (CP-A).

## C13 Runtime limits (`contracts/runtime-limits.json`)
- 0.1.0 (2026-09-25, WS0, Phase 0): the 22 PLAN 5.2 C13 keys and values.

## C14 Phase-0 fixtures
- 0.1.0 (2026-09-25, WS0, Phase 0): samples/minimal, samples/flappy v0 (ADR-0001 applied), fixtures/bytecode hello + conformance/v0-01, fixtures/assets, fixtures/conformance v0.
