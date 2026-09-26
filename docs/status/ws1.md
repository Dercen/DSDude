# WS1 status: Toolchain, build driver and Play

**toolchain-ok: passed 2026-09-25 4ddccb5**

Mode: **hybrid**, local slot 1. Launched 2026-09-25 (Day 1, evening). Branch `ws1-toolchain`, `main` merged at `41c7714`.
WS1 now stops touching the branch until WS0 reports the merge and tags `toolchain-ok`.

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
- Task 3. CLI polish: todo. Next:
  - `ensureInstalled("melonds")` downloads and SHA-256-checks the zip (today: E620 when missing);
  - reconcile compares the start time as well as the image name;
  - GDB 3333/3334 for Debug;
  - `--keys` follows WS2's "Host runner" format once it exists (today: the provisional cli.md draft).
- Task 4. `BuildService`: in progress.
  - Plain-folder builds, cancellation, graceful Stop and the DeSmuME launch work.
  - Todo: the `project.json` path with the injected WS4/WS5 functions, `createFakeToolchain()`, and a `desmume.ini` key map.
- Task 5. Spike 5 + `dsdude doctor`: todo.

## Definition of done (section 6 WS1)

- [x] The install script completes unattended with no UAC prompt; `dsdude toolchain status --json` reports every path (bash, wonderful, blocksds, ndstool, grit, mmutil, arm7Elf, icon, gcc, melonds, desmume, python).
- [x] toolchain-ok command, in melonDS and DeSmuME, window visible, `DSD|LOG|hello` live, no duplicates on melonDS; `dsdude screenshot` returns both PNGs.
- [x] `buildRuntime()`/`runMake` succeeds spawned with SHLVL unset: `samples/hello` copy built in 2.7 s. `runtime/` has no Makefile yet (WS3), so the runtime itself is untested.
- [x] Header check passes on hello. The E6xx cases are unit-tested on the fixture: `NitroFS!` zeroed → E613; FAT size zeroed → E612; FAT below 0x8000 → E611; empty `-d` folder → E612 from the real ndstool.
- [x] 20 consecutive Play launches leave no orphan: 20/20 in melonDS and 20/20 in DeSmuME, each logging `DSD|LOG|hello` (1.6-1.9 s per relaunch, including the graceful stop of the previous one); `tasklist` shows no emulator afterwards, and `running.json` is removed.
- [x] Each worktree's emulator config lives only under its `DSDUDE_HOME` (`melonDS.toml`, `rtc.bin` and `desmume.ini` beside the exes in `.dsdude\emulators\`).
- [ ] Tools-pack clean-PATH test (spike 5): task 5 or a WS8 leftover.

## Notes for WS0

- **CHANGELOG lines owed.** C4 went to 0.2.0 (T1: `ToolPaths.arm7Elf/icon/gcc`, `RomHeaderInfo`/`RomInfo.header`; the `ndsPath` comment now names `game.nds`, as PLAN 3.2 does), and C10 went to 0.2.0 (T1: `play --seconds`, the plain-folder rules, the `--json` fields, the provisional key scripts). `contracts/CHANGELOG.md` does not exist on `main` yet, so the entries are in each file's "Changes" section; I append them to the CHANGELOG once it exists.
- **C8 pad wording (for WS2, T0).** Five pad lines of 1023 chars are 5115 bytes, just under 5 KB (5120). `samples/hello` sends six (6138 bytes). "At least six lines" or ">= 5120 bytes" would remove the ambiguity.
- **C4 `PackAssetsFn` (for WS5, task 4).** The signature says nothing about where the NitroFS files go. `LocalBuildService` packs `<DSDUDE_HOME>\build\<project-hash>\nitrofs\`, so `packAssets` must write there. Either WS5 computes that folder the same way (`projectBuildDir` is exported), or a T1 adds an `outDir` argument; I'll raise it when wiring.
- **ADR-0002 (proposed):** DeSmuME's R4 slot-1 profile does not mount NitroFS, so DSDude uses DeSmuME's default slot 1 only.
- **Python on PATH.** The Microsoft Store alias is found first; MSYS2's own `python.exe` 3.14.3 sits in `C:\msys64\ucrt64\bin` later on PATH. `detectToolchain` uses `lstat`, because `existsSync` misses the alias and would fall through to MSYS2's python.
- No `ADR-pending` markers in WS1 code.

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

### Spike 5: todo (task 5, else a WS8 leftover)
