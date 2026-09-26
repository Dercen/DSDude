# Contracts CHANGELOG

One section per contract. Append only: add a line at the end of your own contract's section (WS7 also under C2
builtins for its doc/example fills); existing lines never change. Format:
`- <version> (<date>, <stream>, <tier>): <what changed>`.

## C1 Project format (`contracts/project-format.md`, `packages/project-format`)
- 0.1.0 (2026-09-25, WS0, Phase 0): format v0: project.json, sprites, backgrounds, sounds, objects, rooms, scripts; zod schemas; browser-safe load/save over ProjectFs; the `./node` adapter; E290-E299.

## C2 DSDB container (`contracts/dsdb.md`, `packages/dsdb`)
- 0.1.0 (2026-09-25, WS0, Phase 0): header, ten sections (incl. KONS), 8-byte cells, instruction encoding, calling convention, event ids, OBJS/ROOM/ASET, program form, `.dsda` grammar and canonical form, ABI hash.
- 0.2.0 (2026-09-26, WS4, T1, ADR-0003 pending WS2's co-signature): section 5 operand kinds `sym` and `bivar` (names in `.dsda`); packages/dsdb encodes, decodes and assembles them (`BuiltinsEnv.variables`).
- 0.3.0 (2026-09-26, WS4, T1, ADR-0006 proposed by WS2, co-signed by WS4): header offset 28 becomes the extension-table offset; the `SPRG` sprite-geometry extension (frame size, origin, bbox per ASET sprite); `.dsda` `.asset sprite ... origin= size= bbox=`; format minor 2 only in files that carry extensions. packages/dsdb encodes, decodes and assembles it; the compiler writes SPRG from sprite.json; fixtures/compiler goldens with sprites regenerated.

## C2 opcodes (`contracts/opcodes.json`)
- 0.1.0 (2026-09-25, WS0, Phase 0): 29 stable opcodes (0-28), 22 provisional (29-50), 4 reserved int-specialised (51-54).
- 0.2.0 (2026-09-26, WS4, T1, ADR-0003 pending WS2's co-signature): operand kinds `sym` (GETDYN/SETDYN C) and `bivar` (GETBI/SETBI Bx); new provisional GETBIX/SETBIX (55-56, builtin array variables) and GETBIO/SETBIO (57-58, builtin variables of another instance); stated meanings for WITHBEGIN/WITHNEXT/WITHEND, NEWARR and SETIDX; runtime/gen/opcodes.h and packages/dsdb/src/gen/opcodes.ts regenerated.
- 0.2.0 T0 (2026-09-26, WS4): WS0 renumbered the opcode-operands ADR from 0003 to **ADR-0005** (co-signed by WS2); the "ADR-0003" in the two WS4 lines of 2026-09-26 above (C2 container and opcodes) means ADR-0005.

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
- 0.5.0 T0 (2026-09-26, WS1): the DeSmuME [Controls] key map is verified with real key presses (toolchain-api.md wording).

## C5 IPC (`contracts/ipc.md`, `packages/ipc-contract`)
- 0.1.0 (2026-09-25, WS0, Phase 0): channel list and zod stubs.
- 0.2.0 (2026-09-26, WS6, T1): completes the Phase-0 stubs: ProjectSchema (whole C1 Project), SpritePreviewSchema for assets.preview (request gains optional sourcePath/options; sprite now optional, exactly one required), typed SettingsSchema (settings.get/set keys narrowed to its keys, value checked per key), build.progress phase = C4 BuildPhase, PlayResult.emulator {kind,pid}; new channels settings.getAll and dialog.open; dispatchInvoke/validateEvent/createLocalBridge/parseIpcError helpers and the [code] error convention. No channel renamed or removed. Stub narrowings listed for WS0 review.
- 0.3.0 (2026-09-26, WS6, T1): BuildRequestSchema gains optional `debug` (follows C4 0.3.0); the compile-time C1/C4/C12 links now also compare key sets, so an optional field added on one side only fails `tsc -b`.
- 0.4.0 (2026-09-26, WS6, T1): new channels project.readFile / project.writeFile (asset files: AssetPathSchema, safe relative paths, png/wav/mp3/xm/mod/it/s3m, Uint8Array bytes; for the C12 editors) and learn.list / learn.read (docs/tutorial|manual|reference markdown, local images as data: URLs; for the Learn panel); settings key learnOpened (default false); isSafeRelativePath, AssetPathSchema, LearnPathSchema, LearnDocSchema exported. All additive.

## C6 Language, events, conformance (`contracts/language.md`, `contracts/events.md`, `fixtures/conformance/`)
- 0.1.0 (2026-09-25, WS0, Phase 0): language.md v0.1, events.md v0.1, conformance v0 (5 programs, hand-written expected logs).
- 0.1.0 T0 (2026-09-26, WS4): language.md clarifications pinned by the parser: a string closes on the line it starts on; a `return` value starts on the `return`'s line.
- 0.1.0 (2026-09-26, WS4, C14 producer): conformance programs 06-10 (v1 strings and arrays, v2 instances, v3 with, v4 rooms), each with its intended output for WS2's expected logs.

## C7 Language-service host API (`packages/lang/src/host.ts`)
- owed: WS4, by CP-B.
- 0.1.0 (2026-09-26, WS4): `LanguageServiceHost` over plain data (UTF-16 offsets into LF text, C9 diagnostics): setProject/setFile/getFile, parse (syntax diagnostics + classified tokens), check, symbolsAt, completionsAt, hover, definitionAt, referencesAt, signatureAt, documentSymbols, foldingRanges, format; `createLanguageServiceHost()`. Freezes at CP-B.

## C8 Log protocol (`contracts/log-protocol.md`)
- 0.1.0 (2026-09-25, WS0, Phase 0): READY/LOG/ERR/MEM/STAT/PAD/EXIT lines, one protocol from 0x04FFFA00, >= 5 KB flush pad.
- 0.2.0 (2026-09-26, WS2, T1): "Host runner" section: dsdude-host command line (a `.dsdb` path as the root), LF-only stdout, exit codes 0/1/2, empty ERR fields in program form and load errors, the `--input` key-script format, the `--trace` JSONL schema (one integer-only object per frame, fixed key order), and `--png-dir` (from tier v4).
- 0.2.0 T0 (2026-09-26, WS2): a trace line is written when the frame has ended (after a pending room change); DSD|STAT comes every 60th frame; DSD|MEM comes after Room Start and its `inst` counts instance blocks in use.
- 0.2.0 T0 (2026-09-26, WS2, from WS1): the flush pad is >= 5120 bytes, at least six DSD|PAD| lines (five 1023-char lines are 5,115 characters). DSD|STAT's spr_top/spr_bot/oam_drop/aff_drop describe the last frame (oam_drop and aff_drop summed over both screens).

## C8 Runtime artifact (`contracts/runtime-artifact.md`)
- owed: WS3, with its first runtime/dist build.
- 0.1.0 (2026-09-26, WS3, first build): runtime/dist/arm9.elf (stripped) + arm9-debug.elf + VERSION (key=value: runtime, abi, tree = git tree of runtime/ without dist/, blocksds, arm7, arm9_sha256, itcm/dtcm/dtcm_data/cstack/image); paired ARM7 arm7_maxmod.elf; `npm run build:runtime -w runtime`; DTCM data 0x1200 with an 11,200-byte C stack; reproducible across folders; boot errors R580-R582 provisional (ADR-0004).

## C9 Diagnostics (`contracts/diagnostics.md`, `packages/project-format/src/diagnostics.ts`)
- 0.1.0 (2026-09-25, WS0, Phase 0): shape, code ranges and the five catalogs, style rules, lints.
- 0.1.0 T0 (2026-09-26, WS4): compiler catalog `packages/compiler/src/diagnostics/catalog.ts` started: E101-E129 (syntax), W030, W032.
- 0.1.0 T0 (2026-09-26, WS4): compiler catalog adds E201-E206, E208 (names, assets, helpers), E301-E314 (arguments, types, events), E491-E494 (limits), W031, W040-W043, W050-W052 (lints).
- R5xx catalog 0.1.0 (2026-09-26, WS2, T0): `runtime/core/diagnostics/catalog.json` created with R500-R590 (sub-ranges R50x variables, R51x runaway scripts, R52x number range, R53x division and roots, R54x wrong kinds of value, R55x lists, R56x memory, R58x the game file, R59x script checks).
- R5xx catalog (2026-09-26, WS2, T0): R551 "Not a list" ([] or a length on a value that is not a list).
- R5xx catalog (2026-09-26, WS2, T0): R502 instance not found, R503 no instance of that object, R504 too many extra variables, R505 read-only variable, R561 too many instances, R570/R571 picture/sound could not be loaded, R572 asset not loaded in this room.

## C10 CLI (`contracts/cli.md`)
- 0.1.0 (2026-09-25, WS0, Phase 0): draft commands, flags, exit codes; WS1 finalises.
- 0.2.0 (2026-09-25, WS1, T1; line appended by WS0 at the merge of 4ddccb5): WS1's revision (see contracts/cli.md). Reviewed and accepted by WS0 2026-09-25.
- 0.3.0 (2026-09-26, WS1, T1): `play --debug`; the `--keys` key-script format of ADR-0003 (proposed; adds TOUCH x y); `emulator install melonds` downloads and SHA-256-checks.
- 0.3.0 T0 (2026-09-26, WS1): `--seed` is written into game.dsdb (also a reused one); DSDude projects need the injected compiler and asset pipeline, else E641.
- 0.4.0 (2026-09-26, WS1, T1): `dsdude doctor [project]` implemented, `--json` field `checks`.

## C11 Platform seam (`runtime/core/include/dsd_platform.h`)
- owed: WS2, by CP-A.
- 0.1.0 (2026-09-26, WS2, publication; frozen at CP-A): lifecycle and frame (`dsd_plat_init/frame_begin/frame_end/read_input` with `dsd_input`), files (`dsd_plat_read_file`), C8 output (`dsd_plat_log`, `dsd_plat_log_flush` for the DS pad), `dsd_plat_fatal` (`dsd_fatal`), `dsd_plat_mem_report`, sprites/backgrounds/shadow OAM (`dsd_sprite_info`, `dsd_oam_entry`, `dsd_affine`), UI layer, sound (incl. `dsd_plat_music_active`), room-load primitives (`dsd_plat_screens_blank`, `dsd_plat_assets_free`, `dsd_plat_sfx_load`, `dsd_plat_music_load`), `dsd_plat_millis`, `dsd_plat_rng_seed`, and the `DSD_ITCM_CODE`/`DSD_DTCM_DATA`/`DSD_DTCM_BSS` placement macros (libnds section names under `ARM9`, empty on the host).
- 0.2.0 (2026-09-26, WS2, T1; answers WS3's ADR-0004): `int dsd_core_main(void)`, the core's entry point that runs the whole game and re-initialises all core state (the DS `main()` only calls it; the host runner keeps `dsd_game_boot`/`dsd_game_frame` for per-frame traces); `dsd_plat_init` results defined: `DSD_PLAT_ENOENT` = NitroFS not mounted (R584 "file system"), `DSD_PLAT_ELOAD` = soundbank not loaded (R571).

## C12 EditorPanel host API + preview API (`apps/ide/src/renderer/panels/api.ts`, `packages/asset-pipeline/src/preview.ts`)
- 0.1.0 (2026-09-25, WS0, Phase 0): preview types (`PreviewSpriteFn`, `SpritePreview`). Panel API + mock-host owed by WS6 (CP-A).
- panel API 0.1.0 (2026-09-26, WS6, CP-A delivery): `apps/ide/src/renderer/panels/api.ts` (`@dsdude/ide/panels`): ResourceRef/resourceId/resourceFile; EditorPanel {id, kind, open, save, dispose, onDirty}, EditorPanelFactory {kind, canOpen, create({element, host})}; PanelHost {project: ProjectStore (get/dir/subscribe/update/isDirty/save), files (read/write via C5 project.*File), ipc, undo: UndoStack, toast, openLearn, openResource}; editor modules = default export of `editors/<name>/index.ts(x)`; Learn links `dsdude-learn:/docs/...md#anchor`, headingSlug (GitHub-style), learnTargetForCode (docs/reference/errors.md#<code>), learnTargetForBuiltin (functions.md / variables.md). Helpers (kit.ts): createUndoStack, updateWithUndo (immer patches). `fixtures/ide/mock-host` (= `@dsdude/ide/mock-host`): createMockHost -> mountEditor / mountLearn / mountShell in headless Chromium, in-memory C5 handlers behind createLocalBridge. Freezes at CP-A.

## C13 Runtime limits (`contracts/runtime-limits.json`)
- 0.1.0 (2026-09-25, WS0, Phase 0): the 22 PLAN 5.2 C13 keys and values.

## C14 Phase-0 fixtures
- 0.1.0 (2026-09-25, WS0, Phase 0): samples/minimal, samples/flappy v0 (ADR-0001 applied), fixtures/bytecode hello + conformance/v0-01, fixtures/assets, fixtures/conformance v0.
- hello (2026-09-26, WS1, producer of samples/hello and the hello fixtures): samples/hello also logs every key press as DSD|LOG|key <buttons> (ADR-0003 names) plus the pad; fixtures/runtime/hello and fixtures/build/hello regenerated (ROM SHA-256 2b2eb01c...; header, NitroFS layout and the DSD|LOG|hello line unchanged).
