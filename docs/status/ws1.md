# WS1 status: Toolchain, build driver and Play

**toolchain-ok: passed 2026-09-25 4ddccb5**

Mode: **hybrid**, local slot 1. Launched 2026-09-25 (Day 1, evening). Branch `ws1-toolchain`, `main` merged at `8613b6c` (after checkpoint-10). WS0 merged the gate as `19c3ce8` and tagged `toolchain-ok` (2026-09-25); checkpoint-1 merged `06e370e`. **Paused** again after the batch in "After checkpoint-7" (WS0's list).

Gate evidence (all run 2026-09-25 on this machine, section 8 criteria):
- **Install by `scripts/install-toolchain.ps1`:** fresh run into an empty `C:\msys64\opt\wonderful` (the earlier install was moved aside, then deleted), 23:05:22-23:06:33, exit 0, unattended, no UAC prompt. Then `scripts/smoke-test.ps1 -Screenshot`: 3/3 examples PASS plus a screenshot PASS.
- **`samples/hello` builds, and the header check passes:** `packrom.json` shows FNT 0x20400 (19 bytes), FAT 0x20600 (8 bytes, 1 file), and `NitroFS!` present at 0x20608.
- **`dsdude build samples/hello --runtime fixtures/runtime/hello/arm9.elf --skip-compile --skip-assets && dsdude play samples/hello --no-build`**, in both emulators, window visible, line captured live (flush pad):
  ```
  packed ...\.dsdude\build\916bfd600938335b\game.nds (145408 bytes, 1 NitroFS files)
  melonds running (pid 21692); Ctrl+C stops it
  DSD|LOG|hello
  exit=0
  window: melonDS pid=15604 hwnd=4787690 title=melonDS 1.1                                   (--json run)
  {"ok":true,...,"emulator":"melonds","pid":15604,"exitCode":0,"ms":6578,"log":["DSD|LOG|hello"]}
  desmume running (pid 10344); Ctrl+C stops it
  DSD|LOG|hello
  exit=0
  window: DeSmuME_0.9.13_x64 pid=40860 hwnd=6362494 title=DeSmuME 0.9.13 x64 SSE2 | hello DSDude
  {"ok":true,...,"emulator":"desmume","pid":40860,"exitCode":0,"ms":6450,"log":["DSD|LOG|hello"]}
  ```
  melonDS shows no duplicate lines. Afterwards `Get-Process melonDS, DeSmuME*` is empty.
- **`dsdude screenshot <build>\game.nds --frames 120 --out <DSDUDE_HOME>\gate\screenshot`** returned both PNGs
  (`C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws1\.dsdude\gate\screenshot\top.png` and `bottom.png`):
  - the top screen is the solid blue backdrop (`uniform.top: true`, as intended);
  - the bottom screen shows "DSDude hello / emulator: (none) / log: legacy stub / hello";
  - `log` holds `["DSD|LOG|hello"]`.

## Progress

Legend: todo / in progress / done (<sha>).

- Task 1. Install (hour zero, user present): **done** (82c3746)
  - BlocksDS 1.24.0 installed from the Wonderful tarball into `C:\msys64\opt\wonderful` by a background Node script (spike 4 below), 2026-09-25 22:35-22:37 local. No UAC prompt; MSYS2 packages untouched. Reinstalled from scratch by the script at 23:05 (gate evidence above).
  - Installed check: `C:\msys64\opt\wonderful\bin\wf-config` and `...\thirdparty\blocksds\core\tools\ndstool\ndstool.exe` both exist.
  - melonDS 1.1 zip SHA-256 `9F3F8A24...F8C8` matches; extracted to `<DSDUDE_HOME>\emulators\melonDS-1.1\`.
  - DeSmuME 0.9.13: `DeSmuME_0.9.13_x64.exe` (SHA-256 `1CA4E771...CF32C`) copied to `<DSDUDE_HOME>\emulators\desmume-0.9.13\`.
  - `python -m pip install --user py-desmume==0.0.9`: installed (cached wheel `py_desmume-0.0.9-cp313-cp313-win_amd64.whl`).
  - `python -m pip show Pillow`: `pillow 12.2.0`, user site `...\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\LocalCache\local-packages\Python313\site-packages` (same site as py-desmume).
  - **The user confirmed that the example ROM shows its background in melonDS** (2026-09-25; `graphics_2d/bg_regular_8bit`, see Deviations).
  - `scripts/install-toolchain.ps1`: every step exit-code checked and time-limited (30 min for `blocksds-toolchain`), idempotent. Tested: a fresh install (gate evidence), the re-run path (exit 0), and its bash helper for exit 0, exit 1 and a 1-min timeout (tree killed, error names `db.lck`).
- Task 2. `toolchain-ok`: **done** (1791ede, 4d75383, d654c0c, 4ddccb5)
  - `samples/hello` (C8 writer: one protocol from `0x04FFFA00`, a legacy-signature RAM stub in `.data`, 6 pad lines) and the C14 fixtures: `fixtures/runtime/hello/{arm9.elf,hello.nds}` (stripped ELF; same ROM bytes as unstripped) and `fixtures/build/hello/{nitrofs/hello.txt,game.nds,packrom.json}`.
  - `@dsdude/toolchain`: `detectToolchain`, `packRom`/`verifyRom`/`checkRom`, `runMake`/`buildRuntime`, `LocalEmulatorManager`, `LocalBuildService` (plain BlocksDS folders), `takeScreenshot`, the E600-E640 catalog, and `cliCommands`.
  - `packages/cli`: the registry of every package's `cliCommands`, and `--help`.
  - `tools/screenshot.py`, `scripts/smoke-test.ps1`, `contracts/toolchain-api.md` 0.2.0, `contracts/cli.md` 0.2.0.
  - Tests: toolchain 54 (mocked spawns assert argv, env, windowsHide and timeout; real-ndstool tests skip without ToolPaths), cli 4; `tsc -b` and Biome clean.
- Task 3. CLI polish: **done** (5f40fcd, 6c7c469); C4 and C10 are now 0.3.0 (T1, CHANGELOG lines appended).
  - **melonDS install.** `ensureInstalled("melonds")` reads a local release zip, else downloads it. It checks the
    size and SHA-256 before writing (E622, or E624 when the download fails), then unpacks with System32 `tar.exe`.
    A real-zip test runs with the hour-zero `%TEMP%\melonDS.zip` (0.4 s); the fakes cover the checksum, download and
    local-zip cases.
  - **Reconcile** by PID + exe path + start time (10 s tolerance) through `Get-Process`. Measured on a detached
    melonDS:
    - a matching record killed it; a record with a wrong start time left it alone;
    - the OS start time was 13 ms from the recorded one;
    - a launcher that exits without `stop()` takes melonDS down with it (closed stdout pipe, within 2 s), so the
      stale record then matched nothing and was removed.
  - **Debug.** `play --debug` makes melonDS listen on 3333 and 3334 (its own PID; verified with
    `Get-NetTCPConnection`), and still logs `DSD|LOG|hello`. DeSmuME with `--debug` is E623, exit 2. melonDS binds
    the stub on `0.0.0.0`, so it is on only while Debug runs.
  - **`--keys`.** The ADR-0003 format (buttons, and `TOUCH x y`), because WS2's "Host runner" has no key format yet
    (checked `main` and `origin/ws2-runtime-core`: no commits). Verified with the SDK's `input/touch_input` and
    `input/key_input`:
    - `40-120 TOUCH 128 96` reads back as (129, 97), with the box drawn at the centre;
    - `60-120 A, RIGHT` shows "Held: A Right";
    - bad lines give E631 naming file:line, exit 2;
    - timing: a one-frame touch on frame 100 first shows in the frame-102 screenshot (`key_input` samples only
      every 10th frame, so it misses one-frame presses; that is the ROM, not py-desmume).
  - The C10 flags `--runtime --skip-compile --skip-assets --emulator --no-build --seed --jobs --json` and exit codes
    0/1/2 were already in place (task 2).
  - Tests: toolchain 61 (was 54), cli 4; `npm run check` green (Biome, `tsc -b`, generators).- Task 4. `BuildService`: **done for CP-A** (ac168f9), C4 0.4.0 (T1, CHANGELOG lines appended).
  Only the wiring of WS4's and WS5's real functions remains; it happens when they land on `main`.
  - **The `project.json` path:**
    - `loadProject` → `packAssets(project, paths, buildDir)` → `compile` → `nitrofs\game.dsdb`, with `--seed`
      patched at C2 offset 12 → `checkRoomBudgets` → runtime → pack, with `project.json`'s banner and the
      pipeline's `icon.png`;
    - `--skip-assets` and `--skip-compile` reuse `assets.manifest.json` and `game.dsdb` (E609 when missing);
    - without the injected functions, a full build is E641.
  - **`compileOnly`** needs no tools: it compiles against the saved manifest, or a provisional one built from the
    project files.
  - **`PackAssetsFn` gains `outDir`**, the build folder. This matches `docs/kickoff/ws5.md` ("writes
    `<build>/nitrofs`, `<build>/icon.png`, `<build>/assets.manifest.json`"). A two-argument implementation still
    type-checks.
  - **`createFakeToolchain()`**: the real service with fake detect, make, packRom and emulators, runnable on Linux,
    for WS6's `DSDUDE_FAKE_TOOLCHAIN=1` mode and the cloud streams. `MockBuildService` now shares
    `MOCK_EMULATOR_LINES` and `BUILD_PHASES`, and names its ROM `game.nds`.
  - **Cancellation** (the next phase never starts, and processes are tree-killed), **graceful Stop** and **Debug**
    are unit-tested through the fake.
  - **The DeSmuME profile:**
    - `desmume.ini` `[Controls]` gets the Controls mapping as virtual-key codes, with key names from the exe's
      `inputdx.cpp` strings;
    - DeSmuME keeps the section when it rewrites the file, and still logs `DSD|LOG|hello`;
    - **verified after checkpoint-1** (2026-09-26, the user present; see "DeSmuME key-map check" below).
  - **`packages/cli`** injects `compileProject` (`@dsdude/compiler`) and `packAssets` + `checkRoomBudgets`
    (`@dsdude/asset-pipeline`) as soon as both export them. Today neither does, so `dsdude build samples/minimal`
    is E641, exit 2.
  - **Regression:** the gate path is unchanged. `dsdude build samples/hello ...` gives the same SHA-256
    (`73f8bb7e...`), and `play` in melonDS logs `DSD|LOG|hello`.
  - **Tests:** toolchain 76, cli 6; `npm run check` green.
  - **Leftover for CP-B** (or WS8 at CP-C): wire and run the real `compileProject`/`packAssets` on `samples/minimal`
    and `samples/flappy` once they are on `main`.- Task 5. Spike 5 + `dsdude doctor`: **done** (115a22b, cb9abe9); C4 0.5.0, C10 0.4.0 (T1, CHANGELOG lines appended).
  - **Tools pack:** `tools/tools-pack.json` pins every file and licence text by SHA-256 (spike 5 below).
    `tools/fetch-vendor.ps1 -Test` builds `vendor\tools-pack\` (19 files, 5.3 MB, gitignored) and passes every check.
  - **`dsdude doctor [project] [--json]`:**
    - checks BlocksDS by running each tool (0xC0000135 is E602), melonDS/DeSmuME, and py-desmume (by importing it);
    - warns about build paths near 250 characters (E651) and about OneDrive.exe running while a path is under
      `%OneDrive%` (E650);
    - names the fix for each problem, and exits 2 only on a failed check;
    - on this machine every check is OK. The worktree is under `%OneDrive%`, but OneDrive.exe is not running.
  - **Tests:** toolchain 84, cli 6; `npm run check` green.
  - **My slip, no effect:** I included a read-only package-manager query (`-Q`) in one command. The deny rule
    refused it, and I took the version from the install log instead. No package manager has run since `phase0`.

## After checkpoint-1 (2026-09-26)

- **Merge:** WS0 merged `ws1-toolchain` as `06e370e` and accepted C4 0.5.0 and C10 0.4.0 (T1). ADR-0002 is accepted.
  ADR-0003 waits for WS2's co-signature, so the `ADR-pending ADR-0003` marker in `tools/screenshot.py` stays.
- **Update:** `main` merged at `829b00d`, then `npm install`. `npm test -w packages/toolchain`: 84 passed.
- **`samples/hello` now logs key presses**, as `DSD|LOG|key <buttons>` (ADR-0003 names), each followed by the pad.
  Checked headless first: a key script with `60-62 A` and `90 START, UP` logs `key A` and `key START UP`, and the
  one-frame press registers.
- **C14 hello fixtures regenerated** from the new build:
  - `fixtures/runtime/hello/arm9.elf` (stripped), `hello.nds`, and `fixtures/build/hello/{game.nds,packrom.json}`;
  - the header is unchanged (FNT 0x20400, FAT 0x20600/8, magic OK);
  - the ROM SHA-256 is now `2b2eb01c...`;
  - the real-ndstool byte-for-byte test passes against it.
- **DeSmuME key-map check** (the user pressing keys in the window):
  1. `dsdude play samples/hello --emulator desmume --no-build`: X, Z, Enter, Up and Shift gave `DSD|LOG|key A`,
     `DSD|LOG|key B`, `DSD|LOG|key START`, `DSD|LOG|key UP` and `DSD|LOG|key SELECT`. Every line arrived live; a
     graceful close exited 0.
  2. DeSmuME's built-in keyboard defaults are close to our map, so step 1 alone does not prove the ini is read. I
     wrote `[Controls] A=75` (K) and launched DeSmuME directly: K gave `key A`, and X gave nothing, even after the
     graceful close that flushes stdout. So DeSmuME reads our `[Controls]` section, and it overrides the defaults.
     `desmume.ini` is back to `A=88`, and no emulator is running.
  - **Result: PASS.** The leftovers line "The DeSmuME key map is written but not verified" is resolved; the list
    itself is left for WS0 to edit.
- **WS1 is now paused** until WS4's `compileProject` and WS5's `packAssets`/`checkRoomBudgets` are on `main`. WS0 then
  starts a short WS1 session to wire and run them on `samples/minimal` and `samples/flappy`. The TypeScript
  `installToolchain()` stays a WS8 leftover.

## After checkpoint-7 (2026-09-26): WS0's batch

`main` merged at `ca5a41e`, then `npm install`. Commits `0a59a6e` (C4 0.6.0) and `5f3f26a` (C10 0.5.0).

1. **`samples/minimal` and `samples/flappy` build, play and screenshot** with WS4's `compileProject` and WS5's
   `packAssets`/`checkRoomBudgets` (the composition root picked them up; nothing to wire):
   - `dsdude build samples/minimal` (the runtime built with `make -j4`, then packed): 225,280-byte ROM, 2 NitroFS files;
     `dsdude build samples/flappy`: 258,048 bytes, 5 NitroFS files. Both exit 0.
   - `dsdude play <sample> --no-build --seconds 8 --json`, one window at a time:

     | Sample | Emulator | exit | READY lines | ERR lines | LOG lines |
     |---|---|---|---|---|---|
     | minimal | melonDS 1.1 (with no `melonDS.toml`, item 2) | 0 | 1 (version 0.1.0, ABI f1d376bb) | none | none |
     | flappy | melonDS 1.1 | 0 | 1 | none | `Score: 0` x5 (the bird falls and the room restarts) |
     | minimal | DeSmuME 0.9.13 | 0 | 1 | none | none |
     | flappy | DeSmuME 0.9.13 | 0 | 1 | none | `Score: 0` x5 |

     `DSD|STAT` shows fps=60 (flappy 59-60) and no OAM/affine/sfx drops; nothing is left running afterwards.
   - Screenshots (`<DSDUDE_HOME>\batch\`, 120 frames): minimal shows the blue player sprite centred on a black top
     screen; flappy shows the score `0` and the bird, fallen to the bottom. Both bottom screens are one colour (as
     designed). With a C8 key script flapping every 22 frames (`batch\flappy-flap.keys`), frame 100 shows the bird
     near the top and the first pipes coming in; without it, the bird is mid-screen and no pipes have spawned.
2. **melonDS 1.1 crash on first Play (WS3's report): fixed.** Reproduced in a scratch copy: writing only DSDude's keys
   into a new `melonDS.toml` made melonDS exit 0xC0000409 within 4.4 s and left the file at 0 bytes. With no file it
   starts and writes its default (3,239 bytes); with that default plus DSDude's keys it runs and logs `DSD|LOG|hello`.
   `writeMelonDsConfig` now seeds a missing or empty file with that default (`MELONDS_DEFAULT_TOML`, without the
   machine-specific `RecentROM` and `Geometry`), which also repairs a file an earlier crash truncated. Verified for
   real: this worktree's `melonDS.toml` moved aside, then `dsdude play samples/minimal` ran with exit 0 and READY.
3. **`--keys` uses the C8 0.2.0 `--input` format** (ADR-0003 superseded). `tools/screenshot.py` parses change-point
   lines exactly as `runtime/host/keys.c` does: 0-based frames, `-`, lower-case names joined by `+`, one `T<x>,<y>`
   within 255/191, `#` only at the start of a line, CRLF accepted. The same bad lines fail (`A`, `a++b`, `a+`,
   `T256,0`, two touches, `30 a b`, an inline comment, a repeated frame), naming the line (E631, exit 2). The
   `ADR-pending ADR-0003` marker is gone. WS3's `runtime/src/selftest.ts` detects the switch by itself
   (`screenshotUsesRanges` no longer matches), so it now passes its C8 scripts through untranslated.
4. **`contracts/cli.md` 0.5.0:** the `assets` `--json` row (`buildDir`, `manifestPath`, `manifest`), and the
   `--keys` section rewritten for the C8 format.
5. **ADR-0007 (key rebinding), C4 0.6.0:**
   - `DsButton`, `SUPPORTED_KEYS`, `LaunchOptions.keys`, and an optional `EmulatorHandle.diagnostics`.
   - `resolveKeys`/`translateKey`/`DEFAULT_KEYS` go into `keymap.ts`: Qt codes for `melonDS.toml` and virtual-key
     codes for `desmume.ini`, with `VK_OEM_*` for punctuation.
   - A key that can't be used keeps that button's default and adds one **E625 warning** ("The key 'F13' can't be
     used for the B button, so B stays on z."). `launchRom` adds it to its result and its `running` events. The fake
     manager records `keys` and reports the same warning.
   - I did not add `BuildRequest.keys`: WS6's compile-time link in `packages/ipc-contract` (`Same<BuildRequest>`)
     would fail, and the IDE launches through `EmulatorManager.launch` directly anyway.
   - **Verified with the user pressing keys** (`samples/hello`, launched through `LocalEmulatorManager` with
     `keys: {a: "k", b: "/"}`, one window at a time):
     - melonDS: K gave `DSD|LOG|key A`, / gave `key B`, and X and Z gave nothing. The file held `A = 75`, `B = 47`.
     - DeSmuME: the same result, with `A=75`, `B=191` (`VK_OEM_2`).
   - Both configs return to the defaults at the next launch without `keys`.
- **Tests:** toolchain 92 (was 84), cli 6, runtime 27; after merging `main` at `8613b6c`: ipc-contract 73, apps/ide 88 + 10. `npm run check` is green.

## Leftovers (for CP-B, or WS8 at CP-C)

- Golden PNGs for `samples/minimal` and `samples/flappy` (WS0's checkpoint notes "no golden committed yet"): the
  frame-120 screenshots above are candidates once WS4/WS5 output is stable.
- WS5 asks to export `runTool`/`toolRunDiagnostics` from `@dsdude/toolchain` (docs/status/ws5.md), so
  `packages/asset-pipeline/src/pack/tools.ts` can drop its copy. Not done in this batch.
- `dsdude toolchain install` still points to `scripts/install-toolchain.ps1`; an `installToolchain()` in TypeScript
  is not written.
- The packaged IDE (WS8) must point `ToolPaths` at `resources/tools-pack/` instead of `C:\msys64`.

## Definition of done (section 6 WS1)

- [x] The install script completes unattended with no UAC prompt; `dsdude toolchain status --json` reports every path (bash, wonderful, blocksds, ndstool, grit, mmutil, arm7Elf, icon, gcc, melonds, desmume, python).
- [x] toolchain-ok command, in melonDS and DeSmuME, window visible, `DSD|LOG|hello` live, no duplicates on melonDS; `dsdude screenshot` returns both PNGs.
- [x] `buildRuntime()`/`runMake` succeeds spawned with SHLVL unset: `samples/hello` copy built in 2.7 s. `runtime/` has no Makefile yet (WS3), so the runtime itself is untested.
- [x] Header check passes on hello. The E6xx cases are unit-tested on the fixture: `NitroFS!` zeroed → E613; FAT size zeroed → E612; FAT below 0x8000 → E611; empty `-d` folder → E612 from the real ndstool.
- [x] 20 consecutive Play launches leave no orphan: 20/20 in melonDS and 20/20 in DeSmuME, each logging `DSD|LOG|hello` (1.6-1.9 s per relaunch, including the graceful stop of the previous one); `tasklist` shows no emulator afterwards, and `running.json` is removed.
- [x] Each worktree's emulator config lives only under its `DSDUDE_HOME` (`melonDS.toml`, `rtc.bin` and `desmume.ini` beside the exes in `.dsdude\emulators\`).
- [x] Tools-pack clean-PATH test passes (spike 5): `tools/fetch-vendor.ps1 -Test`.

## Notes for WS0

- **T1 for review: C4 0.3.0 and C10 0.3.0** (6c7c469), all additive. The CHANGELOG lines are appended.
  - C4: `LaunchOptions.debug`, `BuildRequest.debug`, optional `EmulatorManager.reconcile()`, and the melonDS
    download in `ensureInstalled`.
  - C10: `play --debug`, and the ADR-0003 key scripts.
  - (0.2.0 was accepted at checkpoint 0.)
- **C8 pad wording (for WS2, T0).** Five pad lines of 1023 chars are 5115 bytes, just under 5 KB (5120). `samples/hello` sends six (6138 bytes). "At least six lines" or ">= 5120 bytes" would remove the ambiguity.
- **C4 `PackAssetsFn` (for WS5, task 4).** The signature says nothing about where the NitroFS files go. `LocalBuildService` packs `<DSDUDE_HOME>\build\<project-hash>\nitrofs\`, so `packAssets` must write there. Either WS5 computes that folder the same way (`projectBuildDir` is exported), or a T1 adds an `outDir` argument; I'll raise it when wiring.
- **ADR-0002 (proposed):** DeSmuME's R4 slot-1 profile does not mount NitroFS, so DSDude uses DeSmuME's default slot 1 only.
- **Python on PATH.** The Microsoft Store alias is found first; MSYS2's own `python.exe` 3.14.3 sits in `C:\msys64\ucrt64\bin` later on PATH. `detectToolchain` uses `lstat`, because `existsSync` misses the alias and would fall through to MSYS2's python.
- **T1 for review: C4 0.4.0** (ac168f9), details in Task 4.
  - For WS5: `packAssets` receives the build folder as a third argument and writes only there.
  - For WS6: `createFakeToolchain()` and `MockBuildService` now share their phases and output; the mock's ROM path
    changed from `mock.nds` to `game.nds`. No code outside `packages/toolchain` used the mock yet.
- **ADR-0003 (proposed, for WS2):** one key-script format for `dsdude screenshot --keys` and `dsdude-host`.
  Open marker: `ADR-pending ADR-0003` in `tools/screenshot.py`; it goes when WS2's "Host runner" section adopts the
  format.
- **Memory gate.** Checkpoint 0 recorded a 1095 MB minimum during my install, with emulators open. Since then I run
  one emulator at a time, for 4-6 s, and close it after each test.

## Deviations from PLAN.md (for WS0)

- **`examples/graphics_2d/bg_regular_nitrofs` has no Makefile in BlocksDS 1.24.0.** It builds with `python3 build.py` (ArchitectDS), which is not installed, so the PLAN 7.1 line `cd $BLOCKSDS/examples/graphics_2d/bg_regular_nitrofs && make` fails with `make: *** No targets specified and no makefile found.` 18 SDK examples use `build.py`, 167 use a Makefile. Substitutes (no extra install): `graphics_2d/bg_regular_8bit` for the "background shows" check, and `filesystem/nitrofs` + `maxmod/nitrofs` for NitroFS. PLAN 7.1 (Day-0 block, spike 6) and `scripts/smoke-test.ps1` should name these.
- The versions print as `v1.24.0-dirty` (ndstool, grit, mmutil and `core/version.txt`), so version checks match `v1.24.0` as a prefix.
- `arm-none-eabi-gcc` is not on the login shell's PATH: it is `C:\msys64\opt\wonderful\toolchain\gcc-arm-none-eabi\bin\arm-none-eabi-gcc.exe`; the BlocksDS Makefiles use the full path. `detectToolchain()` checks that path.
- The install took ~70 s, not ~30 min: 163.99 MiB download, 549.65 MiB installed for `blocksds-toolchain` + `blocksds-docs`.
- Examples are built from copies under `%TEMP%`, so the SDK tree stays pristine.

## Spike results

### Spike 3: `bash.exe -lc pwd` from Node with SHLVL removed (claim 2): PASS
```
CHERE_INVOKING=unset status=0 out="/home/zache\nSHLVL=1"
CHERE_INVOKING=1     status=0 out="/c/Users/zache/OneDrive/Desktop/Projects/DSDude-ws1\nSHLVL=1"
```
Without `CHERE_INVOKING=1` the login shell runs `cd $HOME`, as claim 2 says.

### Spike 4: the install driven from Node (claim 1): PASS
Every step spawned `C:\msys64\usr\bin\bash.exe -lc <step>` with the section 7.1 env, SHLVL removed, `windowsHide` and a timeout; every exit code was 0.

| Step | Exit | Seconds |
|---|---|---|
| extract bootstrap tarball (4,885,826 bytes, SHA-256 `551E5B30...2DE6`) | 0 | 1.1 |
| wf-tools run 1 | 0 | 6.1 |
| wf-tools run 2 | 0 | 6.0 |
| `wf-config repo enable blocksds` | 0 | 0.8 |
| `wf-pacman -Syu --noconfirm` (after enable) | 0 | 1.5 |
| `wf-pacman -S --noconfirm blocksds-toolchain blocksds-docs` | 0 | 51.5 |
| `wf-pacman -Syu --noconfirm` (verify) | 0 | 1.4 |

wf-tools run 1 (upgrades only wf-pacman, exits 0 without wf-tools, as claim 1 says):
```
:: Synchronizing package databases...
 wonderful downloading...
:: Starting core system upgrade...
Packages (1) wf-pacman-7.1.0-3
Total Download Size:    3.63 MiB
...
upgrading wf-pacman...
:: Run wf-pacman again in order to finish the upgrade.
```
wf-tools run 2 (no further core update):
```
:: Synchronizing package databases...
 wonderful downloading...
:: Starting core system upgrade...
 there is nothing to do
:: Starting full system upgrade...
Packages (10) wf-lua-5.4.8-5  wf-lua-filesystem-1.8.0.r352.912e067-1  wf-lua-iconv-7.1.r101.5452834-1  wf-lua-libdeflate-0.0.1.r3.d34711a-1  wf-lua-penlight-1.15.0.r950.c317508-1  wf-lua-plum-0.0.1.r9.6a60edc-1  wf-lua-toml-0.4.0.r47.44a4056-1  wf-tools-lua-0.1.0.r183.ad72e38-1  wf-tools-native-0.1.0.r180.3bf0d29-1  wf-tools-0.2.0-3
Total Download Size:   0.81 MiB
...
installing wf-tools...
```
`-Syu` after `wf-config repo enable blocksds` (no core update):
```
:: Synchronizing package databases...
 blocksds downloading...
 wonderful downloading...
:: Starting core system upgrade...
 there is nothing to do
:: Starting full system upgrade...
 there is nothing to do
```
Installed: `blocksds-toolchain 1.24.0-1`, `blocksds-docs 1.24.0-1`, `toolchain-gcc-arm-none-eabi-gcc 1~16.2.0.r229124.be93d9d35bf-1`, `toolchain-gcc-arm-none-eabi-binutils 2.47-2`, `toolchain-gcc-arm-none-eabi-picolibc-generic 1.8.12.r26255.40c274b4a-1`, `runtime-gcc-libs 0.1.0-14`, `wf-pacman 7.1.0-3`, `wf-tools 0.2.0-3`.
Versions: `arm-none-eabi-gcc.exe (Wonderful toolchain) 16.2.0`; `ndstool v1.24.0-dirty`, `grit v1.24.0-dirty`, `mmutil v1.24.0-dirty`.

### Spike 2: melonDS 1.1 from Node, with and without `windowsHide` (claim 6): PASS
`spawn(melonDS.exe, [rom], {stdio: 'pipe', windowsHide})`, checked after 4 s with `IsWindowVisible(MainWindowHandle)`:
```
windowsHide=false hwnd=9570628 visible=True title=[60/60] melonDS 1.1   graceful taskkill /PID: exit 0 after 651 ms
windowsHide=true  hwnd=0       visible=False title=                     graceful taskkill /PID: exit 0 after 582 ms
```
Emulators must spawn without `windowsHide`. On first launch melonDS writes `melonDS.toml` and `rtc.bin` next to the exe.

### Spike 6: `make VERBOSE=1 -j4` from Node, SHLVL removed (claim 2): PASS
Section 6 WS1 env, `CHERE_INVOKING=1`, run in copies under `%TEMP%\dsdude-spikes\examples`:

| Example | Exit | Seconds | ROM |
|---|---|---|---|
| `graphics_2d/bg_regular_8bit` | 0 | 4.1 | `bg_regular_8bit.nds`, 120,320 bytes |
| `filesystem/nitrofs` | 0 | 2.6 | `fs_nitrofs.nds`, 165,888 bytes |
| `maxmod/nitrofs` | 0 | 3.4 | `maxmod_nitrofs.nds`, 722,944 bytes |

The ROM is named after the Makefile's `NAME`, not the folder.

### Spike 7: py-desmume screenshots (claim 10): PASS
`tools/screenshot.py` uses `SDL_VIDEODRIVER=dummy`, `SDL_AUDIODRIVER=dummy` and `cycle(with_joystick=False)`; the 256x384 image is split into top and bottom.
- `graphics_2d/bg_regular_8bit`, 300 frames: the background renders on the top screen.
- `samples/hello`, 120 frames: blue top screen, console on the bottom screen.
- Finding: libdesmume block-buffers its own stdout, which carries its chatter and the ROM's `DSD|` lines. A JSON line printed by the script landed inside a `DSD|PAD|` line, so the result goes to `<out>\screenshot.json`, which `takeScreenshot` reads.
- Bonus: py-desmume forwards the ROM's legacy-signature output, so `dsdude screenshot --json` also returns the `DSD|` lines.

### Spike 8: the `samples/hello` log path (claim 6): PASS
Each variant was repacked from a different `nitrofs/hello.txt` with the same ELF, then launched through `LocalEmulatorManager` for 4 s and stopped gracefully.

| Emulator | Protocol | With pad | Without pad (`nitro:/nopad`) |
|---|---|---|---|
| melonDS 1.1 | 0x04FFFA10 (ID `melonDS`) | all lines live at 1240 ms | lines arrive only after the stop (4531 ms; stop sent at 4026) |
| DeSmuME 0.9.13 | legacy RAM stub | all lines live at 1436 ms | after the stop (4460 ms; stop sent at 4021) |

- **Long line:** a 300-char text (a 308-char line) arrives intact in both.
- **`%`:** `DSD|LOG|100% done %d %s %%` arrives unchanged; `0x04FFFA10` does no `%param%` substitution.
- **Duplicates:** none on melonDS. That line arrives exactly once, so only one protocol printed it.
- **Pad:** six lines of 1023 chars (`DSD|PAD|` + 1014 dots + `\n`); `LineSplitter` drops them all (6 per run).
- **Graceful stop:** `taskkill /PID` flushes the buffered tail in both emulators: without the pad, every line arrived only after the stop.

### Spike 9: NitroFS (claim 3): PASS for the supported profiles; R4 slot-1 profile FAIL (ADR-0002)
- **Header** (hello, via packRom): FNT 0x20400/19, FAT 0x20600/8, magic at 0x20608 present, 1 file.
- **Repack timing** (packRom, one-file NitroFS, ~145 KB ROM), 10 runs: min 71 ms, median 78 ms, max 87 ms.
- **Empty `-d` folder:**
  - ndstool exits 0 and writes FNT 0x20400/9 and FAT 0x20600/**0**, with no `NitroFS!` mark;
  - `checkRom` reports E612;
  - booted anyway, the ROM logs `DSD|LOG|hello: nitroFSInit failed` in melonDS, DeSmuME and py-desmume;
  - `packRom` now deletes such a ROM.
- **Boot:** melonDS PASS, DeSmuME with default settings (slot 1 "Retail MC+ROM") PASS, py-desmume PASS.
- **DeSmuME `--slot1 R4 --slot1-fat-dir <dir>`:** FAIL. It prints `slot1 fat not successfully mounted` for an empty folder and for the ROM's own folder alike, and the ROM logs `nitroFSInit failed`. See `docs/adr/0002-desmume-r4-slot1-profile.md` (proposed: default slot 1 only).

### Spike 5: tools pack (claim 7): PASS
- **objdump import walk** (`C:\msys64\ucrt64\bin\objdump.exe -p`, recursive):
  - ndstool needs `libgcc_s_seh-1`, `libiconv-2`, `libstdc++-6`, and through them `libwinpthread-1`;
  - grit needs `libgcc_s_seh-1` and `libstdc++-6`; mmutil needs none;
  - all four DLLs come from `C:\msys64\opt\wonderful\bin` and import `api-ms-win-crt-*`, never `msvcrt.dll`.
- **Clean PATH** (`PATH=C:\Windows\System32`, pack in `%TEMP%\dsdude tools pack test <time>\`, a path with spaces):
  - `ndstool -V`, `grit -V` and `mmutil -V` print `v1.24.0-dirty` and exit 0;
  - ndstool repacks `fixtures/build/hello` byte for byte (SHA-256 `73f8bb7e...`).
- **Without the four DLLs:** ndstool and grit exit 0xC0000135; mmutil still runs.
- **Licence texts** (PLAN 2.11):
  - `blocksds/{ndstool,grit,mmutil}` at `master` (the repos have no `v1.24.0` tag, so each text is pinned by SHA-256);
  - GCC `COPYING.RUNTIME` from `gcc-mirror/gcc` (gnu.org's `gcc-exception-3.1.txt` now returns 404);
  - LGPL-2.1 from gnu.org, and the winpthreads `COPYING` from `mingw-w64`.

## Integration feedback
