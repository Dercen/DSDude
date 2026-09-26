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

## C4 Toolchain API (`packages/toolchain/src/api.ts`, `contracts/toolchain-api.md`)
- 0.1.0 (2026-09-25, WS0, Phase 0): api.ts types (BuildService, BuildEvent, ToolPaths, EmulatorHandle/Manager, provisional AssetManifest and RoomAssetSet, CompileFn, PackAssetsFn, CheckRoomBudgetsFn, CliCommand) and MockBuildService. toolchain-api.md owed by WS1 (CP-A).
- 0.2.0 (2026-09-25, WS1, T1; line appended by WS0 at the merge of 4ddccb5): ToolPaths.arm7Elf/icon/gcc, RomHeaderInfo and RomInfo.header (all optional); contracts/toolchain-api.md 0.2.0 written. Reviewed and accepted by WS0 2026-09-25.

## C5 IPC (`contracts/ipc.md`, `packages/ipc-contract`)
- 0.1.0 (2026-09-25, WS0, Phase 0): channel list and zod stubs.

## C6 Language, events, conformance (`contracts/language.md`, `contracts/events.md`, `fixtures/conformance/`)
- 0.1.0 (2026-09-25, WS0, Phase 0): language.md v0.1, events.md v0.1, conformance v0 (5 programs, hand-written expected logs).

## C7 Language-service host API (`packages/lang/src/host.ts`)
- owed: WS4, by CP-B.

## C8 Log protocol (`contracts/log-protocol.md`)
- 0.1.0 (2026-09-25, WS0, Phase 0): READY/LOG/ERR/MEM/STAT/PAD/EXIT lines, one protocol from 0x04FFFA00, >= 5 KB flush pad.
- 0.2.0 (2026-09-26, WS2, T1): "Host runner" section: dsdude-host command line (a `.dsdb` path as the root), LF-only stdout, exit codes 0/1/2, empty ERR fields in program form and load errors, the `--input` key-script format, the `--trace` JSONL schema (one integer-only object per frame, fixed key order), and `--png-dir` (from tier v4).

## C8 Runtime artifact (`contracts/runtime-artifact.md`)
- owed: WS3, with its first runtime/dist build.

## C9 Diagnostics (`contracts/diagnostics.md`, `packages/project-format/src/diagnostics.ts`)
- 0.1.0 (2026-09-25, WS0, Phase 0): shape, code ranges and the five catalogs, style rules, lints.
- R5xx catalog 0.1.0 (2026-09-26, WS2, T0): `runtime/core/diagnostics/catalog.json` created with R500-R590 (sub-ranges R50x variables, R51x runaway scripts, R52x number range, R53x division and roots, R54x wrong kinds of value, R55x lists, R56x memory, R58x the game file, R59x script checks).

## C10 CLI (`contracts/cli.md`)
- 0.1.0 (2026-09-25, WS0, Phase 0): draft commands, flags, exit codes; WS1 finalises.
- 0.2.0 (2026-09-25, WS1, T1; line appended by WS0 at the merge of 4ddccb5): WS1's revision (see contracts/cli.md). Reviewed and accepted by WS0 2026-09-25.

## C11 Platform seam (`runtime/core/include/dsd_platform.h`)
- owed: WS2, by CP-A.

## C12 EditorPanel host API + preview API (`apps/ide/src/renderer/panels/api.ts`, `packages/asset-pipeline/src/preview.ts`)
- 0.1.0 (2026-09-25, WS0, Phase 0): preview types (`PreviewSpriteFn`, `SpritePreview`). Panel API + mock-host owed by WS6 (CP-A).

## C13 Runtime limits (`contracts/runtime-limits.json`)
- 0.1.0 (2026-09-25, WS0, Phase 0): the 22 PLAN 5.2 C13 keys and values.

## C14 Phase-0 fixtures
- 0.1.0 (2026-09-25, WS0, Phase 0): samples/minimal, samples/flappy v0 (ADR-0001 applied), fixtures/bytecode hello + conformance/v0-01, fixtures/assets, fixtures/conformance v0.
