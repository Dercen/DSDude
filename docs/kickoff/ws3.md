# WS3 kickoff: DS platform layer and runtime ELF

You implement `dsd_platform.h` (C11) on libnds/maxmod, own the BlocksDS Makefile and the shipped `runtime/dist/arm9.elf`, and bring up the hardware with a selftest ROM before the core exists (PLAN.md section 6 WS3). Every Play packs your ELF around WS2's core. WS3 is a local stream (hybrid slot 2, Windows worktree `..\DSDude-ws3`). Paths are relative to `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`.

## Paste this to start

```text
You are workstream **WS3: DS platform layer and runtime ELF** on DSDude, a GameMaker-like Nintendo DS IDE. Read `docs/kickoff/ws3.md` first, then your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md` and the contract files listed for you; read the `PLAN.md` sections they cite, not the whole file. Work only inside the paths `tools/ownership.json` assigns to you; WS0's integration refuses anything else. Edit only the contract files `tools/ownership.json` assigns to you (T0/T1 directly, T2 via ADR; section 7.4); never edit root config files or `package-lock.json`; never run `pacman`/`wf-pacman`; put a timeout on every process you spawn. If a contract blocks you, write `docs/adr/NNNN-<title>.md` with a proposed change, mark your workaround `// ADR-pending ADR-NNNN`, and continue. Branch `ws3-platform` in worktree `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws3`; merge `main` into your branch daily (never rebase once WS0 has merged any of your commits); do not push and never merge `origin/*` refs (WS0 integrates your local branch and the cloud streams, and pushes `main`); small commits; run `npm test -w runtime` (or `mingw32-make -f runtime/Makefile.host test` / `make -j4` for the runtime) before each commit. Keep to the capacity rules of section 7.2: `vitest run --pool=threads --maxWorkers=2`, no watch mode, close the dev IDE and the emulator after each test. You cannot see emulator windows: verify with `DSD|` lines and `dsdude screenshot` PNGs. Keep `docs/status/ws3.md` current. Test in isolation using the fixtures and mocks named below; do not wait for other streams. Report blockers as ADR drafts.
Read CLAUDE.md, then runtime/platform/ds/CLAUDE.md (yours) and runtime/CLAUDE.md (WS2's, read-only for you), runtime/core/include/dsd_platform.h, contracts/log-protocol.md, contracts/runtime-limits.json, contracts/assetpack.md (if it exists) and contracts/runtime-artifact.md (yours, once written). Operating mode: hybrid, local stream in slot 2 (the CLAUDE.md Status block is authoritative; if it records a fallback to standard mode, follow the standard-fallback notes in docs/kickoff/ws3.md). Then begin with task 1 under "First tasks" in docs/kickoff/ws3.md.
```

## When this stream starts

- **Hybrid mode (the plan):** local slot 2, at WS1's `toolchain-ok` gate (day 1-3), not before the `phase0` tag (day 2). You are the fourth local instance (WS0, WS1, WS3, WS6): the user launches you when WS0 calls for it, and only while the memory gate holds (minimum available memory > 1.5 GB). WS2 and WS4 already run in the cloud from the tag; WS5 and WS7 join at CP-A. Build the selftest first: CP-B = M0 (D+7, week 2) needs its sprite/BG screenshot checks plus logged touch and a logged maxmod effect. CP-C = M1 (D+14, week 3).
- **Depends on:**
  - WS1's toolchain-ok;
  - WS2's C11 draft (frozen at CP-A). WS2 runs in the cloud from the tag; its commits reach you through WS0's merge into `main`.
- **Fallbacks** (PLAN.md section 7.2; WS0 records a switch in the CLAUDE.md Status block):
  - *Standard:* slot 1 at M0 (~week 2, ~D+7-10), after WS1 hands off once `packRom`, EmulatorManager, log capture, BuildService and `dsdude screenshot` work. Do the M1 path first. Standard-mode M0 is CLI-only, and the selftest criterion moves to **M1** (CP-C, ~week 4-5).
  - *Upgraded:* as hybrid, with one emulator per worktree.

  WS3 runs only locally (BlocksDS, emulators, py-desmume).

## Setup (PowerShell)

```powershell
# Run in PowerShell. <n> = 3; <name> = platform (PLAN.md section 7.5 table)
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude
git worktree add ..\DSDude-ws3 -b ws3-platform
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws3
git config --worktree dsdude.ws WS3
# Per-instance env block (PLAN.md section 7.5). Set in the worktree's PowerShell before starting `claude`.
$env:DSDUDE_HOME = 'C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws3\.dsdude'
$env:DSDUDE_PORT_BASE = '5130'   # electron-vite dev server = base; Vitest browser mode / Playwright = base+1..base+9
$env:DSDUDE_MAKE_JOBS = '4'   # hybrid and standard: always; upgraded fallback: while more than two stream instances run (buildRuntime default is 8)
$env:MSYSTEM = 'UCRT64'; $env:MSYS2_PATH_TYPE = 'inherit'; $env:CHERE_INVOKING = '1'
$env:BLOCKSDS = '/opt/wonderful/thirdparty/blocksds/core'; $env:BLOCKSDSEXT = '/opt/wonderful/thirdparty/blocksds/external'; $env:WONDERFUL_TOOLCHAIN = '/opt/wonderful'
$env:PATH = "C:\msys64\opt\wonderful\bin;$env:PATH;C:\msys64\ucrt64\bin"   # ucrt64\bin last: host gcc and mingw32-make need it (section 2.4); without it gcc exits 1 with no message
npm install          # never npm ci in worktrees
claude
```

## Owned paths and contracts

**Owned:** `runtime/platform/ds/**` (including your brief `runtime/platform/ds/CLAUDE.md`), `runtime/selftest/**`, `runtime/data/**` (the 8x8 font), `runtime/Makefile`, `runtime/package.json`, `runtime/tsconfig.json`, `runtime/vitest.config.ts`, `runtime/src/**` (the TypeScript `build:runtime` script and its tests; not the C sources), `runtime/dist/**`, `fixtures/runtime/**` except `hello/` (including the selftest GRFs/soundbank WS3 makes itself with the installed grit/mmutil), `contracts/runtime-artifact.md`, `docs/manual/runtime-build.md`, `docs/status/ws3.md`.

**Not yours:**
- WS2: `runtime/core/**` (including `dsd_platform.h` and `vm.arm.c`), `runtime/host/**`, `runtime/Makefile.host`, `runtime/tests/**`, `runtime/CLAUDE.md`, `fixtures/bytecode/**`. If the core needs a change to build for the DS, file an ADR to WS2.
- Generated: `runtime/gen/**`.
- WS1, then WS8: `fixtures/runtime/hello/**`.
- WS0: root config.

**Enforcement.** The `pre-commit` hook runs `tools/check-ownership.ts` for your worktree's `dsdude.ws`. `commit-msg` adds `DSDude-WS: WS3` and rejects `package-lock.json`. At integration, WS0 checks every commit in `main..ws3-platform` and refuses the merge on a violation.

**Contracts** (versions in `contracts/CHANGELOG.md`):
- **Owner:** C8 runtime artifact: `contracts/runtime-artifact.md`, `runtime/dist/arm9.elf` + `arm9-debug.elf` + `VERSION`. Write it with the first `runtime/dist` build.
- **Consumer:** C11 `runtime/core/include/dsd_platform.h`, which you implement.
- **Consumer:** C8 `contracts/log-protocol.md`, for which you implement the writer and the flush pad.
- **Consumer:** C3 `contracts/assetpack.md`. WS5 (cloud) writes it on its first day (CP-A, D+3), and it reaches you through `main` (standard fallback: ~week 5). Until then, work from sections 2.9 and 5 C3.
- **Consumer:** C13 `contracts/runtime-limits.json`.

## First tasks

1. **`runtime/Makefile` and `runtime/package.json` as in section 6 WS3, and `npm run build:runtime`.**
   - **Makefile.** Set the section 6 WS3 variables before `include $(BLOCKSDS)/sys/default_makefiles/rom_arm9/Makefile`, including:
     - `CFLAGS := -std=c11 -fwrapv -fno-strict-aliasing -funsigned-char`;
     - `LIBDIRS := $(BLOCKSDS)/libs/maxmod`, without which `maxmod9.h`/`-lmm9` are not found;
     - `BINDIRS := data`.
   - **Linker.** Set the DTCM symbols that `ds_arm9.ld` PROVIDEs (`__dtcm_data_size`, stack sizes; section 3.3).
   - **M1 switch.** Add a switch that builds `vm.arm.c` without `-mlong-calls`.
   - **Build.** `npm run build:runtime -w runtime` goes through `buildRuntime({jobs})` (C4). If that cannot target `runtime/`, spawn `bash.exe -lc 'make -j4'` instead and mark it `// ADR-pending`. It writes a stripped `arm9.elf`, `arm9-debug.elf` and `VERSION`, and prints `.itcm`/`.dtcm` usage from `arm-none-eabi-size`.
   - **runtime-artifact.md.** Name the paired ARM7 (`$BLOCKSDS/sys/arm7/main_core/arm7_maxmod.elf`). State which tree the `VERSION` hash covers, because `runtime/dist/` lies inside `runtime/`.
2. **The M1 path (platform init, NitroFS, log, timer harness).** Hybrid: the init and log items come first, because the selftest (task 3) needs them for CP-B; hello on the DS and the timer harness follow for CP-C (M1). Standard fallback: all of it before the rest of the selftest ROM.
   - **Init.** Call `nitroFSInit` → `soundEnable()` → `mmInitDefault("nitro:/soundbank.bin")` and check every result. A failed `nitroFSInit` writes `strerror(errno)` in a `DSD|ERR` line.
   - **hello on the DS.** Stage `fixtures/bytecode/hello.dsdb` as `game.dsdb` under `fixtures/runtime/`. Pack it with `dsdude build … --runtime runtime/dist/arm9.elf --skip-compile --skip-assets` (see `contracts/cli.md`) or with `packRom()`. It must print `DSD|READY` and `DSD|LOG|hello` exactly once each on both emulators. Also log a 300-char line and a line containing `%`.
   - **Timer harness.** Use cascaded hardware timers (ticks x 2 = ARM9 cycles) on melonDS with JIT off. The workload is WS2's `bench.dsda`, assembled with `packages/dsdb` and run as a >= 4 KB straight-line block in main RAM. Report through `DSD|LOG`.
3. **The selftest ROM (`runtime/selftest/`), checked with `dsdude screenshot`.** It must show:
   - 128 sprites per screen with extended palettes and 128-byte-aligned frames (including one 8x8 4bpp sprite);
   - two GRF text BGs (BG1) and the BG0 UI layer;
   - touch and D-pad input, logged;
   - a maxmod effect and module;
   - NitroFS, the log path and the error console;
   - a timed 1 MB NitroFS read;
   - `cstack=` in `DSD|MEM`;
   - the scanline page (N 64x64 normal or affine sprites on one line, with the D-pad stepping N).

   Make the GRFs and the soundbank from `fixtures/assets/` with the section 2.9 lines, and record the commands in `fixtures/runtime/`.
4. **Then: implement `dsd_platform.h` and compile the core with the DS Makefile; the DS timer harness for the M1 benchmark; the `.itcm`/`.dtcm` report.**
   - OAM: `oamInit(&oamMain, SpriteMapping_1D_128, true)` and the sub-screen equivalent, a per-screen OBJ VRAM allocator, and OAM submitted at VBlank.
   - `ui_text/ui_fill/ui_clear`.
   - Input with `touchRead`/`scanKeys`.
   - An RNG seed from the RTC plus the frame counter.
   - WS2's room-load primitives: `setBrightness` blanking, freeing the old set, and loading effects and music.
   - The red error box with START-to-restart.
5. **Phase-0 spikes 10 (graphics) and 11 (audio), 12 and 14 with WS2.**
   - Spikes 10 and 11 run in your first week. WS5 is a cloud stream without mmutil, so you run both sides of spike 11: the mmutil side and the ROM side (standard fallback: the ROM side only; WS5 repeats the mmutil side on its first day).
   - Spike 12 is due by CP-C, and spike 14 runs at M1 on both emulators. WS2 (cloud) supplies the host side; you run the DS side locally, including the DS compile of WS2's core.
   - Spike 15 runs with the user, if a flashcart exists.
   - Results go into your status file; a failure becomes an ADR.

## Definition of done (section 6 WS3)

- The selftest ROM's `dsdude screenshot` at frame N matches its golden PNG.
- The selftest ROM boots in melonDS and DeSmuME with its `DSD|` lines captured, and on hardware later.
- `hello.dsdb` prints on both emulators by M1, with no duplicate lines on melonDS.
- `arm9.elf` builds reproducibly with `npm run build:runtime` and is committed with its `VERSION`.
- ITCM usage is <= 24 KB, and the memory/usage report matches C8.
- `DSD|STAT` shows 60 fps with the 300-instance stress fixture by M4 (standard fallback: handed to WS8 via `docs/kickoff/ws8.md`).

**Hand-off.** Hybrid (and upgraded): WS3 keeps slot 2 after M1 and continues with perf/hardware work alongside WS2 until this DoD is met, including the M4 stress check (week 8-9) and the hardware notes (DLDI/argv, scanline limits, GDB attach recipe). Slot 2 then stays free for short local fix sessions. Standard fallback: hands slot 1 to WS8 after M1 (~week 5-6), once the platform layer, selftest ROM, timer harness and npm run build:runtime are done; the M4 stress check and hardware notes pass to WS8 via docs/kickoff/ws8.md. Later fixes in WS3's paths run as short WS3 sessions.

## Testing in isolation and verifying without eyes

**Isolation:** the selftest ROM needs no core, no compiler and no asset pipeline. Its GRFs and soundbank come from `fixtures/runtime/`, made by hand with the installed grit/mmutil. The M1 path needs only `fixtures/bytecode/` and WS2's core.

**Without eyes:**
- **Log lines.** Verify with the `DSD|` lines (READY/LOG/ERR/MEM/STAT/EXIT per C8) that `dsdude play` / EmulatorManager captures. It drops the `DSD|PAD|` lines. Lines arrive live because of the flush pad, or at graceful Stop (`taskkill /PID`, `/F` after 2 s).
- **Screenshots.** `dsdude screenshot <rom> --frames N [--keys file] --out dir` writes top and bottom PNGs via py-desmume 0.0.9 with SDL_VIDEODRIVER=dummy and SDL_AUDIODRIVER=dummy. Read them with the image-capable Read tool.
- **Goldens.** py-desmume generates the goldens itself; keep them under `fixtures/runtime/`. Judge a hung ROM from the screenshot content (a hang shows white), not from `is_running()`.
- Ask the user only when a screenshot is ambiguous.

## Coordination

- **Status file.** Keep `docs/status/ws3.md` current: progress, spike results, leftovers and `ADR-pending` markers.
- **Contract tiers (section 7.4).** T0 is a direct commit plus a CHANGELOG line. T1 is one commit with a minor bump, regenerated outputs and a `contracts/CHANGELOG.md` entry. T2 needs a co-signed ADR.
- **Where to send requests.** C11/C8/C13 go to WS2 as a new `docs/adr/NNNN-<title>.md`; WS2 (cloud) sees it only after WS0 merges and pushes, so commit ADRs promptly. CLI/EmulatorManager issues go to WS1, and to WS8 from CP-C (standard fallback: WS0 until WS8 starts).
- **Cloud streams.** WS2, WS4, WS5, WS7 and the optional WS6b run as cloud sessions (`docs/kickoff/README.md` section 8) and never write your paths. WS0 fetches their pushes from `origin`, integrates them into `main` and pushes `main` and the tags back, so their work reaches you only through `git merge main`; never push, and never merge `origin/*` or `claude/*` refs. Local-only checks of their work that fall to you: the DS compile of WS2's core, spikes 11, 12 and 14, and the M1 benchmark. Record each DS-only failure in your status file (plus an ADR if it needs a contract change); WS0 turns it into an `IF-` entry in that stream's status file, which you never edit.
- **Integration feedback.** WS0 may append `IF-` entries under `## Integration feedback` at the end of `docs/status/ws3.md`. Fix open entries first, keep that section last, and never edit it. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading; WS0 re-runs the check and appends the resolved line.
- **Merging.** Merge `main` daily, after `git restore package-lock.json`, and never rebase once WS0 has merged any of your commits.
- **Checkpoints** (CP-A D+3, CP-B D+7, CP-C D+14, then weekly; the standard fallback adds each hand-off): commit, update your status file, then leave the branch alone until WS0 reports the merge.

## Machine limits and gotchas

- **Memory.** 11.3 GB RAM. Hybrid (local side at standard-mode limits) allows **one emulator window machine-wide**, shared with WS0, WS1/WS8 and WS6; the upgraded fallback allows one per worktree. Check first with `Get-Process electron, melonDS, DeSmuME* -ErrorAction SilentlyContinue`. Close the emulator after each test. Build with `make -j4`.
- **Spawning.** Give every process a timeout. Run bash as `bash.exe -lc` with CHERE_INVOKING=1 and single-quoted inner strings. Start emulators without `windowsHide`. Tools need `C:\msys64\opt\wonderful\bin` on PATH, or they exit 0xC0000135 silently.
- **Files and tools.** Makefiles are LF; write outputs in binary mode. Never run `pacman`/`wf-pacman`. mwccarm and dsd are not in the pipeline.
- **ARM and ITCM.** The `.arm.c` suffix selects ARM mode; `ITCM_CODE` does not. `vm.arm.c` carries `#pragma GCC optimize ("no-gcse", "no-crossjumping")`. The ITCM ceiling is 24 KB, because libnds vectors already sit in ITCM.
- **VRAM.** Map banks A-I per section 3.3 (B = `VRAM_B_MAIN_BG_0x06000000`, E = BG extended palettes). Write extended palettes while their bank is mapped as LCD, then remap. OBJ frames go at 128-byte offsets.
- **GRF loading.** `grfLoadPath` loads into malloc'd buffers (pointer-to-NULL). `dmaCopy` them to VRAM, then free in LIFO order. Never pass VRAM as the destination.
- **Audio.** `mmLoadEffect` returns 1 (bad id) or 2 (load failed); both become R5xx. Call `mmEffectRelease` after one-shots, and count invalid handles in `sfx_drop`.
- **Log writer.** Choose one protocol from the emulator ID at `0x04FFFA00`. On melonDS/no$gba, write `0x04FFFA10` raw with the newline; elsewhere, use a legacy-signature RAM stub. Never use `nocashMessage()`. Keep buffers in main RAM, because melonDS does not map DTCM. After each READY, ERR and STAT line, write at least five `DSD|PAD|` lines of <= 1023 chars.
- **Layers.** BG0 is the UI layer (4bpp, priority 0, with the font from `runtime/data/`). BG1 is the room background (8bpp, extended palette slot 1). The error box and the SELECT console use BG0, not `consoleInit`.

## References

- PLAN.md: 2.3, 2.4, 2.6, 2.9, 3.3, 5 C3, C8, C11, C13, 6 WS3, 7.1 spikes 10, 11, 12, 14, 15, 8 M0, M1, M4, 9 risks 3, 14, 17, 20, 21, 25; also 7.2-7.4.
- `docs/research/01-toolchain.md`, `03-emulator.md`, `05-hardware.md`, `verification.md` claims 2, 4, 5, 6, 9, 13.
