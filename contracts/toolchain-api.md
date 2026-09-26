# C4: Toolchain driver API and BuildService

Version: 0.5.0 · Owner: WS1 (WS8 from `start-ws8`) · Changes: see the tiers in contracts/README.md

The types live in `packages/toolchain/src/api.ts` (exported from `@dsdude/toolchain`); this file states the rules
the implementation follows. `BuildService` is confirmed at CP-A. Sources: PLAN.md sections 2.6, 3.2 and 6 WS1;
`docs/research/verification.md` claims 1, 2, 3, 6, 7 and 10; spikes 2-9 in `docs/status/ws1.md`.

## Importing

- Importing `@dsdude/toolchain` has no side effects and works on Linux: nothing is spawned or read at import time.
- `@dsdude/toolchain` never imports `@dsdude/compiler` or `@dsdude/asset-pipeline`. `BuildService` receives
  `CompileFn`, `PackAssetsFn` and `CheckRoomBudgetsFn` (`BuildServiceDeps`) from its composition root
  (`packages/cli`, the IDE build worker).
- `MockBuildService` (Phase 0) stays for consumers that want no tools at all; `createFakeToolchain()` runs the real
  service with fake tools (see "Fakes for tests").

## Tools and `detectToolchain()`

- `detectToolchain()` never throws. Off Windows it returns `installed: false`, empty `paths` and one E605.
- On Windows it looks under `C:\msys64` (`DSDUDE_MSYS2` overrides) for `usr\bin\bash.exe` and, under
  `opt\wonderful\thirdparty\blocksds\core\`, for `tools\{ndstool,grit,mmutil}\*.exe`,
  `sys\arm7\main_core\arm7_maxmod.elf` and `sys\icon.bmp`, plus
  `opt\wonderful\toolchain\gcc-arm-none-eabi\bin\arm-none-eabi-gcc.exe`.
  - `installed` is true only when all of them exist; each missing one is an E601 (E600 when BlocksDS is absent).
  - `blocksdsVersion` comes from `core\version.txt` (`v1.24.0-dirty` gives `"1.24.0"`).
- It also reports, without affecting `installed`: `melonds` and `desmume` under `<DSDUDE_HOME>\emulators\`, and
  `python`, the first `python.exe` on PATH. A PATH entry counts when `lstat` finds it: the Microsoft Store
  `python.exe` is an App Execution Alias that `existsSync` reports missing.
- `ToolPaths` gained `arm7Elf`, `icon` and `gcc` in 0.2.0.

## Processes

Every process gets a timeout, and when it fires the whole tree is killed (tree-kill; `make` spawns gcc).

| Process | Spawn | Env | Timeout |
|---|---|---|---|
| ndstool, grit, mmutil | `windowsHide: true`, stdio pipe | PATH prefixed with `C:\msys64\opt\wonderful\bin` (the PATH key is matched case-insensitively) | 60 s |
| make | `bash.exe -lc 'make -jN'` in the Makefile folder, `windowsHide: true` | tool env plus `MSYSTEM=UCRT64`, `MSYS2_PATH_TYPE=inherit`, `CHERE_INVOKING=1`, `BLOCKSDS=/opt/wonderful/thirdparty/blocksds/core`, `BLOCKSDSEXT=/opt/wonderful/thirdparty/blocksds/external`, `WONDERFUL_TOOLCHAIN=/opt/wonderful` | 10 min |
| python (`tools/screenshot.py`) | `windowsHide: true` | `SDL_VIDEODRIVER=dummy`, `SDL_AUDIODRIVER=dummy` | 60 s + 50 ms per frame |
| melonDS, DeSmuME | stdio pipe, **no** `windowsHide` (it hides a GUI emulator's window: spike 2) | caller's env | none; stopped by `stop()` |

- `-l` is required for bash. `CHERE_INVOKING=1` keeps the working directory when SHLVL is unset, as under
  Electron (spike 3). `BLOCKSDS` stays a POSIX path, which MSYS2 converts for gcc.
- `jobs` is `--jobs`, else `DSDUDE_MAKE_JOBS`, else 8.
- Exit code 0xC0000135 from a tool is E602 (a DLL is missing); a timeout is E604; any other non-zero exit is E603
  with the last lines of output.

## `packRom()` and `verifyRom()`

- The ndstool line is
  `ndstool -c <outNds> -9 <arm9Elf> -7 <arm7_maxmod.elf> -b <icon> "Title;Subtitle;Author" [-g <gamecode>] -d <nitrofsDir>`.
  - `-7` is always explicit, so ndstool never depends on `$BLOCKSDS`.
  - The icon is `iconPng`, else `core\sys\icon.bmp`.
  - `;` inside a banner part becomes `,`, and empty parts are dropped. `-g` is passed only when the game code is not `####`.
- Before running, it checks that the ELF, the NitroFS folder and the icon exist (E607) and that every path is under
  250 characters (E606). The output is deleted first.
- After running, the ROM must exist and not be empty, or the failure is E610 and the partial file is deleted.
- **Header check** (`checkRom`, also `verifyRom`). The ROM is read directly, because `ndstool -i` does not report the
  magic. FNT offset/size are at 0x40/0x44 and FAT offset/size at 0x48/0x4C. Each rule, in order:

  | Check | Failure |
  |---|---|
  | The file is at least 0x200 bytes | E614 |
  | FAT offset >= 0x8000 and FNT offset >= 0x8000 | E611 |
  | FAT size > 0 | E612 (an empty `-d` folder packs this way) |
  | The 8 bytes `NitroFS!` at FAT offset + FAT size | E613 |

  A ROM that fails is deleted.
- `packRom()` throws `ToolchainError` (its `diagnostics` hold the E6xx) because `PackRomResult` has no diagnostics
  field.
- `RomInfo.nitrofsFiles` is FAT size / 8. `RomInfo.header` (0.2.0) holds the checked fields.
- Packing is deterministic: the same ELF, folder, title and icon give the same bytes. A stripped ELF gives the same
  ROM as the unstripped one, because ndstool copies only the loadable segments.

## `buildRuntime()`

`runMake({dir, elf, jobs, paths})` runs make in any BlocksDS `rom_arm9` folder and returns `arm9Elf` = `dir/elf`
when make exits 0 and the file exists, else E640 (E604 on timeout). `buildRuntime()` is `runMake` on `runtime/`
with `elf = dist/arm9.elf`. `samples/hello` uses the same Makefile shape (its ELF is `build/hello.elf`).

## `EmulatorManager`

- Emulators live in `<DSDUDE_HOME>\emulators\melonDS-1.1\melonDS.exe` and
  `<DSDUDE_HOME>\emulators\desmume-0.9.13\DeSmuME_0.9.13_x64.exe`. Their configs sit beside the exes, so each
  worktree keeps its own.
- `ensureInstalled("melonds")` installs melonDS 1.1 when it is missing (0.3.0):
  - it reads a local copy of the release zip (`melonDsZip`, the installer's bundled copy), else downloads
    `https://github.com/melonDS-emu/melonDS/releases/download/1.1/melonDS-1.1-windows-x86_64.zip`
    (10-minute limit; a failure is E624);
  - before anything is written, the zip must be 19,484,283 bytes with SHA-256
    `9F3F8A244103BE20B5B657AF5B0ED1B2A66BB20A7181476A6D294C9A53D4F8C8` (else E622);
  - it is unpacked with `%SystemRoot%\System32\tar.exe -xf` (hidden, 2-minute limit), the zip is deleted, and a
    missing `melonDS.exe` afterwards is E621.
- `ensureInstalled("desmume")` copies the exe from `%USERPROFILE%\Downloads\desmume-0.9.13-win64\` when it is
  missing; otherwise it is E620.
- `launch(rom, {kind, debug})`, in order:
  0. `debug` with DeSmuME is E623: it has no GDB stub.
  1. Stop this manager's previous emulator and wait for it to exit.
  2. Reconcile `running.json`.
  3. For melonDS, patch `melonDS.toml` in place: the Controls key map (Qt codes A=88, B=90, X=83, Y=65, L=81,
     R=87, Start=16777220, Select=16777248, Up=16777235, Down=16777237, Left=16777234, Right=16777236),
     `IntegerScaling=true`, `ShowOSD=false`, `[3D] Renderer=0`, `[Screen] UseGL=false` and
     `[Instance0.Gdb] Enabled` = `debug` with ports 3333 (ARM9) and 3334 (ARM7). melonDS binds the stub on
     `0.0.0.0`, so it is only on while Debug runs. Every other key is kept (window
     geometry, recent ROMs), and melonDS keeps these when it rewrites the file on exit.
     For DeSmuME, patch `desmume.ini` beside the exe (0.4.0): `[Controls]` gets the same mapping as Windows
     virtual-key codes (A=88, B=90, X=83, Y=65, L=81, R=87, Start=13, Select=16, Up=38, Down=40, Left=37, Right=39;
     key names from the exe's `inputdx.cpp` strings). DeSmuME keeps the section when it rewrites the file, but
     whether it reads those keys is not verified, because no key-press test was run against a real window.
  4. Spawn `exe <absolute rom>` with cwd = the emulator folder, and record
     `{pid, kind, exe, rom, startedAt}` in `<DSDUDE_HOME>\emulators\running.json` (`startedAt` is taken right
     after the spawn).
- `onLine` receives every stdout/stderr line (decoded as latin1, `\r\n` accepted, `DSD|PAD|` lines dropped).
  A new listener first receives the lines printed so far (up to 5000).
- `stop()` sends `taskkill /PID`, waits up to 2 s for the exit (which flushes the emulator's stdout), then sends
  `taskkill /F /T /PID`. It resolves once the process has exited.
- `reconcile()` (optional in the interface, 0.3.0) kills an emulator an earlier process left running: the PID in
  `running.json`, with `/F /T`. Because Windows reuses PIDs, it kills only while that PID's image path (from
  `Get-Process`) is the recorded exe, which is this worktree's copy, and its start time is within 10 s of
  `startedAt`. It removes the record either way, and resolves true when it killed something. `launch()` calls it,
  and the IDE calls it at startup and before quit. The record is also removed when its process exits.
  - Measured: a detached melonDS was killed by a matching record and left alone by one with a wrong start time. A
    launcher that exits without `stop()` takes melonDS down with it (the closed stdout pipe ends it within 2 s),
    so a stale record then points at no process.

## `BuildService` (`LocalBuildService`)

- **Output** goes to `<DSDUDE_HOME>\build\<project-hash>\`, never into the project.
  - `<project-hash>` is the first 16 hex digits of the SHA-256 of the lower-cased absolute project path.
  - `DSDUDE_HOME` defaults to `%LOCALAPPDATA%\DSDude`.

  | Path in the build folder | Written by |
  |---|---|
  | `nitrofs\` | the NitroFS root: `game.dsdb` (BuildService, from the compiler), `gfx\`, `bg\`, `soundbank.bin` (packAssets) |
  | `icon.png` | packAssets, optional; it becomes ndstool's `-b` icon, else `core\sys\icon.bmp` |
  | `cache\` | packAssets' conversion cache |
  | `assets.manifest.json` | packAssets (docs/kickoff/ws5.md), then rewritten by BuildService with checkRoomBudgets' figures |
  | `game.nds` | packRom |
  | `packrom.json` | BuildService: `{rom, title, sizeBytes, sha256, nitrofsFiles, header}` |

- **Phases**, in order: `load`, `assets`, `compile`, `budgets`, `runtime`, `pack`, then `done`, `failed` or
  `cancelled`.
  - `play` adds `launch` and then `running`, whose events carry each emulator line in `log`.
  - Each phase emits one event when it starts and one per log line. `progress` reaches 1 at `done`.
- **DSDude projects** (`project.json`), 0.4.0:
  1. `load`: `@dsdude/project-format/node` `loadProject()`; its E29x diagnostics are kept.
  2. `assets`: `packAssets(project, toolPaths, buildDir)`. With `skipAssets`, the saved `assets.manifest.json` is
     reused instead (E609 if there is none).
  3. `compile`: `compile(project, manifest)`; `dsdb` is written to `nitrofs\game.dsdb`. With `skipCompile`, the
     existing `game.dsdb` is reused (E609 if there is none).
  4. `budgets`: `checkRoomBudgets(manifest, roomSets)`, whose manifest is then saved (skipped with `skipCompile`,
     which has no room sets).
  5. `runtime` and `pack`: the banner is `project.json`'s title, subtitle and author, with its game code.

  Any error diagnostic stops the build after its phase: a compile error never reaches the runtime or pack.
- **`seed`** (`--seed N`) is written into the DSDB header's RNG seed (C2: u32 LE at offset 12), also into a reused
  `game.dsdb` under `skipCompile`.
- **Without the compiler and asset pipeline** (`deps` null, until WS4 and WS5 land): a project builds only with both
  skip flags. Otherwise the result is E641.
- **`compileOnly`** needs `deps`, spawns nothing and writes nothing. It compiles against the saved
  `assets.manifest.json`, or, when nothing was built yet, against a provisional manifest built from the project
  files (ids in name order, sprite geometry from `sprite.json`, background sizes 0), then runs `checkRoomBudgets`.
- **Plain BlocksDS folders** (no `project.json`, e.g. `samples/hello`) build only with `skipCompile` and
  `skipAssets`; otherwise the result is E608.
  - `<dir>\nitrofs\` is copied to the build folder's `nitrofs\`.
  - The folder name is the title, the subtitle and author are `DSDude`, and the icon is `core\sys\icon.bmp`.
- **The runtime ELF** is `runtime`, else `runtime\dist\arm9.elf`, which `buildRuntime()` makes when it is missing.
  A missing `runtime` file is E607.
- `cancel()` aborts the running request: running processes are tree-killed, the next phase does not start, and
  the result is `ok: false` with a `cancelled` event.
- `debug` (0.3.0) starts melonDS with its GDB stub; with DeSmuME it is E623.
- `launchRom(ndsPath, {kind, debug})` (not in the interface) launches an already built ROM for
  `dsdude play --no-build`.

## Fakes for tests: `MockBuildService` and `createFakeToolchain()`

Both use the same default emulator output, `MOCK_EMULATOR_LINES` (`DSD|READY|0.1.0|00000000`, `DSD|LOG|hello`), and
the same phase order, `BUILD_PHASES`.

- **`MockBuildService`** needs no files at all. It emits every phase with a `mock <phase>` log line, reports the
  diagnostics it was given, and returns `<projectDir>/build/game.nds` as the ROM path (0.4.0: the phases and the
  ROM name now match the real service).
- **`createFakeToolchain({home, deps?, emulatorLines?, rom?, packFailure?})`** (0.4.0) returns
  `{service, status, packs, launches}`: the **real** `LocalBuildService`, with fake tools. Everything else is the
  real code: project loading, the injected functions, the build folder, events, cancellation, `packrom.json` and
  the seed. It runs anywhere, Linux included:
  - `detect` reports an installed BlocksDS 1.24.0 with placeholder Windows paths (`FAKE_TOOL_PATHS`);
  - `make` returns `fixtures/runtime/hello/arm9.elf`;
  - `packRom` checks its inputs (E607), fails with `packFailure` if given, writes `rom` or
    `fixtures/build/hello/game.nds`, and runs the real header check. A hex-patched `rom` therefore fails exactly as
    with ndstool (E611-E614);
  - the emulator manager returns `fakeEmulator()` handles printing `emulatorLines` and records every launch in
    `launches` (Debug with DeSmuME is E623, as for real).
- The fixture paths are exported as `FIXTURE_ROM`, `FIXTURE_PACKROM`, `FIXTURE_NITROFS` and `FIXTURE_ELF`.
## `dsdude doctor` (`runDoctor`) and the tools pack

- **`runDoctor({env, cwd, project})`** returns `{ok, checks, diagnostics}` (0.5.0). Every probe is injectable for
  tests: `detect`, `runVersion`, `checkPyDesmume`, `isRunning`. The checks:
  1. `detectToolchain()`, then `<tool> -V` for ndstool, grit and mmutil with the tool env (E601, or E602 on
     0xC0000135);
  2. melonDS under `DSDUDE_HOME` (E620); DeSmuME is info only;
  3. `python -c "import desmume.emulator"` (E630);
  4. build folders of the repo and the project within 40 characters of 250 (E651, warning);
  5. OneDrive: a warning (E650) only when `OneDrive.exe` runs (tasklist) and the repo, the project or
     `DSDUDE_HOME` is under `%OneDrive%`, `%OneDriveConsumer%` or `%OneDriveCommercial%`.

  It changes nothing. `ok` is false only on an error.
- **The tools pack** (`tools/fetch-vendor.ps1`, pin `tools/tools-pack.json`) builds `vendor\tools-pack\`.
  - Its files:
    - `ndstool.exe`, `grit.exe`, `mmutil.exe`;
    - `libstdc++-6.dll`, `libgcc_s_seh-1.dll`, `libiconv-2.dll`, `libwinpthread-1.dll`, copied only from
      `C:\msys64\opt\wonderful\bin`;
    - `arm7_maxmod.elf` and `icon.bmp`;
    - `licenses\` (the PLAN 2.11 texts) and a copy of `tools-pack.json`.
  - Everything is SHA-256-pinned to BlocksDS 1.24.0. The recursive `objdump -p` import walk must find exactly the
    pinned DLLs, each importing `api-ms-win-crt-*` and not `msvcrt.dll`.
  - `-Test` is the clean-PATH test. With `PATH=C:\Windows\System32`, in a path with spaces:
    - the three tools print `v1.24.0`;
    - ndstool repacks `fixtures/build/hello` byte for byte;
    - without the DLLs, ndstool and grit exit 0xC0000135 while mmutil (no DLLs) still runs.
  - In the packaged IDE (WS8) these files replace `C:\msys64\...`: `ToolPaths` point into the pack, and the tool env
    puts the pack folder first on PATH.

## E6xx catalog

`packages/toolchain/src/diagnostics/catalog.ts`:

| Codes | Meaning |
|---|---|
| E600, E601 | BlocksDS or one tool missing |
| E602, E603, E604 | a tool is missing a DLL, failed, or timed out |
| E605 | needs Windows |
| E606 | path of 250 characters or more |
| E607 | missing input file |
| E608 | not a DSDude project (needs both skip flags) |
| E609 | not built yet |
| E610-E614 | pack and header failures |
| E620-E624 | emulator missing, would not start, bad download checksum, Debug needs melonDS, download failed |
| E630, E631 | Python/py-desmume missing, screenshot failed |
| E640 | runtime `make` failed |
| E641 | a DSDude project needs the compiler and asset pipeline, which are not injected yet |
| E650, E651 | **warnings** from `dsdude doctor`: OneDrive syncing a project folder; a build path near 250 characters |

Every E6xx has `source: "toolchain"` and is an error, except the E65x warnings. The CLI exits 2 on any E6xx error
(C10).

## How to change me

- T0 (wording, examples): WS1 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new optional field, a new function type, a new phase): minor version bump + CHANGELOG entry in one commit;
  WS0 reviews within 24 hours.
- T2 (anything that breaks an implementer or a consumer): an ADR co-signed by WS4, WS5, WS6 and WS8.

## Changes

- 0.2.0 (WS1, 2026-09-25, T1): `ToolPaths.arm7Elf`, `icon` and `gcc`; `RomHeaderInfo` and `RomInfo.header`; the
  `BuildResult.ndsPath` comment names `game.nds` (PLAN.md 3.2). No field was removed or retyped.
- 0.3.0 (WS1, 2026-09-26, T1): `LaunchOptions.debug`, `BuildRequest.debug`, optional `EmulatorManager.reconcile()`; melonDS download + SHA-256 in `ensureInstalled`; reconcile by exe path and start time; E623, E624.
- 0.4.0 (WS1, 2026-09-26, T1): `PackAssetsFn` gets `outDir` (the build folder) and the build-folder layout is fixed; the `project.json` build path (assets, compile, budgets, seed patch, reuse under the skip flags); `compileOnly` with a provisional manifest; `createFakeToolchain()`; `MockBuildService` phases and ROM name match the real service; the DeSmuME `[Controls]` key map; E641.
- 0.5.0 (WS1, 2026-09-26, T1): `runDoctor` and the doctor checks; the tools pack (`tools/fetch-vendor.ps1`, `tools/tools-pack.json`); E650/E651 warnings.
