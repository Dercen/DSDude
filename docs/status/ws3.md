# WS3 DS platform layer status

Mode: **hybrid**, local slot 2. Launched 2026-09-26 (after `start-ws3`). Branch `ws3-platform`; `main` merged
daily (last: `21768ff`). Toolchain: BlocksDS 1.24.0 (GCC 16.2.0) from WS1's install.

## Progress

Legend: todo / in progress / done (<sha>).

- Task 1. `runtime/Makefile`, `runtime/package.json`, `npm run build:runtime`, `contracts/runtime-artifact.md`:
  **done** (ec80829; contract and manual c6ea857).
  - **Makefile** as PLAN 6 WS3 (`SOURCEDIRS := core/src platform/ds/src`, `INCLUDEDIRS := core/include gen`,
    `BINDIRS := data`, `LIBS := -lmm9 -lnds9`, `LIBDIRS := $(BLOCKSDS)/libs/maxmod`, `CFLAGS := -std=c11 -fwrapv
    -fno-strict-aliasing -funsigned-char` before the include). Default goal: `dist/arm9.elf` (stripped) +
    `dist/arm9-debug.elf`; no ROM. `DSD_SELFTEST=1` builds the selftest ROM instead.
  - **Finding: libnds headers do not compile under strict `-std=c11`** (`asm volatile` in `ndstypes.h`
    `COMPILER_MEMORY_BARRIER`, used by `video.h`/`videoGL.h` inlines). `platform/**` and `selftest/**` add
    `-std=gnu11` (the later `-std` wins). The core never includes libnds and stays ISO C11, identical to the host
    flags. Recorded in `contracts/runtime-artifact.md`.
  - **DTCM**: `__dtcm_data_size=0x1200` at the top of DTCM, IRQ/SVC stacks 0x100; the C stack below gets 11,200
    bytes and cannot grow into the VM data. The link fails if DTCM data outgrows 0x1200.
  - **M1 switch**: `make DSD_VM_BL=1` builds `core/src/vm.arm.c` with `-marm` and without `-mlong-calls`.
  - **Build**: `npm run build:runtime -w runtime` → C4 `buildRuntime({runtimeDir})` (no ADR needed) → size/nm
    report → `dist/VERSION`. Now: itcm 1,088 B / 24 KB, dtcm 0 / 4.5 KB, cstack 11,200 B, image 112,412 B / 0.7 MB.
  - **Reproducible** (`-ffile-prefix-map`; a copy built elsewhere gave identical MD5s). **VERSION** `tree` = git
    tree of `runtime/` without `dist/`; checked equal to the committed tree.
  - **DS compile of WS2's core** at `829b00d` (`fixed.c`, `number.c`, `numfmt.c`, `vendor/trig.c`): clean with
    `-Wall -Wextra`.
- Task 2. M1 path: **in progress**.
  - Init, log writer, error box: **done** (ec80829, 237f847). `nitroFSInit` → `soundEnable` → `mmInitDefault`
    when `nitro:/soundbank.bin` exists, every result checked; a failure prints one `DSD|ERR` (R580-R582,
    ADR-0004) and shows the red box with START to restart (setjmp back to `main`). Checked headless: a ROM without
    `game.dsdb` prints `DSD|ERR|R581||||0|The game's code is missing from the ROM. Build the game again.` once and
    shows the box.
  - `fixtures/runtime/dsdb-hello/nitrofs/game.dsda` (+ `.dsdb` by `tools/gen-dsdb.ts`) packed around
    `runtime/dist/arm9.elf`: `DSD|READY|0.1.0|0dd9987a` **exactly once on melonDS 1.1 (window, raw protocol),
    DeSmuME 0.9.13 (window, legacy stub) and py-desmume**; nothing else, as the boot stub has no VM.
  - 300-char line, `%` line and CR/LF splitting: checked through the same writer in the selftest (below).
  - todo: `DSD|LOG|hello` needs WS2's VM (ADR-0004 stub until then); the timer harness (M1, with `bench.dsda`).
- Task 3. Selftest ROM: **done** (237f847). `runtime/selftest/`, assets in `fixtures/runtime/selftest/`.
  - Page 1: 128 sprites per screen (16x16 8bpp, 3 frames, 4 extended OBJ palettes; the bottom's 128th is an 8x8
    4bpp sprite in its own 128-byte slot), GRF room BG on BG1 of both screens (ext palette slot 1), BG0 UI text,
    a filled rectangle and the 16 UI colours, touch/D-pad moving the 8x8 sprite, A = blip effect, B = scroll and
    animate. Page 2: scanline page (n 64x64 sprites on one line; normal / affine / affine double-size; the
    C13 cycle formula on screen). Page 3: the error box. SELECT: the console overlay.
  - `npm run selftest -w runtime`: 5 cases (boot, input, scanline, error-box, console) through `dsdude
    screenshot`, pixel-exact against `golden/*.png` plus log patterns; **all PASS, twice in a row**. The boot
    screen is still (py-desmume is not cycle-exact between runs: the 1 MB read varied by 1 us), so moving things
    are behind B.
  - **Both emulators, windowed** (`dsdude build fixtures/runtime/selftest --runtime
    runtime/build/dsdude_selftest.elf --skip-compile --skip-assets`, `dsdude play ... --seconds 10`): melonDS 1.1
    (`emulator=melonDS 1.1 log=raw`) and DeSmuME 0.9.13 (`log=legacy`) each printed all 30 lines once (READY,
    every grf/bg/mm/nitrofs/text line, MEM, 8 STAT lines at fps=60 with 128+128 sprites); no duplicates on melonDS.
  - **1 MB NitroFS read** (sets the room-load budget): **melonDS 423,177 us (2,419 KB/s)**; DeSmuME 322,484 us
    (3,175 KB/s); py-desmume 322,447 us. Byte sum correct on all three.
  - **`DSD|MEM`**: `heapfree=3909,objvram_top=5/128,objvram_bot=1/128,cstack=4/10` (KB; C-stack high-water from a
    painted stack: ~4 KB used by the printf-heavy selftest of 10.9 KB).
- Task 4. `dsd_platform.h` implementation: todo (C11 owed by WS2 at CP-A). The pieces exist in `platform/ds/src`:
  VRAM/OAM (`ds_video`), UI layer (`ds_ui`), GRF/OBJ allocator/BG (`ds_gfx`), memory figures (`ds_mem`).
- Task 5. Spikes:
  - **Spike 10 (graphics): PASS.** grit 1.24.0 with the PLAN 2.9 sprite, 4bpp and BG lines; the ROM uses the 3.3
    bank table, 128-byte-aligned frames (strides 256/128/4096 logged) and the UI layer. The screenshot shows the
    source PNGs' colours exactly: 0 of 6,144 background pixels and 0 of 96 opaque sprite pixels differ at RGB555
    (now a check in `npm run selftest`). One finding: `GRFHeader.mapAttr` holds the map format
    (`GRF_BGFMT_SBB_8BPP` = 2), not "16" as libnds's comment says.
  - **Spike 11 (audio, both sides): PASS.** mmutil side: `blip.wav` (no loop), `loop.wav` (fmt/smpl/data only,
    loop 1000-1999) and a generated XM went through `mmutil ... -d -o<abs> -h<abs>` (attached options, cwd a scratch
    dir), exit 0, ids `SFX_BLIP 0, SFX_LOOP 1, MOD_SELFTEST 0`; `mmutil -V` = `mmutil v1.24.0-dirty`, the same
    BlocksDS release as libmm9. ROM side (all three emulators): `mmInitDefault`=ok, `mmLoad`=0, `mmLoadEffect`=0
    and 0, a bad id =1, `mmEffect`=handle 1, after 60 frames `mmActive()`=1 at row 11. WS5's XM fixture is not on
    main yet; `make_assets.py` writes its own minimal XM.
  - Spike 12 (by CP-C), 14 (M1): todo; need WS2's harness and VM.

## Reports to other streams (for WS0 to route)

- **WS1: a fresh `DSDUDE_HOME` makes melonDS 1.1 crash** (exit 0xC0000409 within 2 s, no log). When
  `melonDS.toml` does not exist, `writeMelonDsConfig` writes `patchToml(null, overrides)`, a partial file, and
  melonDS fail-fasts on it, truncating it to 0 bytes; every later launch then crashes the same way. Reproduced
  with WS1's own `samples/hello` ROM in this worktree. With no `melonDS.toml` at all melonDS starts and writes its
  full default (3,239 bytes); patching that full file works (`DSD|LOG|hello`). Likely fix: when the file is
  missing, seed it with melonDS's default (or launch once without it) before patching. This hits every new user's
  first Play. Worked around here by letting melonDS write its default.
- **WS2 (C11, with ADR-0004):** the UI colour argument of `dsd_plat_ui_text/ui_fill` is taken as an index 0-15 in
  PLAN 5.2's order (`c_white c_black c_red c_green c_blue c_yellow c_orange c_purple c_gray c_ltgray c_dkgray
  c_aqua c_fuchsia c_lime c_maroon c_navy`); please state it in `dsd_platform.h`.

## Open ADR-pending markers

- ADR-0004 (proposed, WS3 → WS2): core entry point `dsd_core_main`, line/pad split between core and platform,
  `dsd_plat_fatal` + platform R5xx codes R580-R583, `dsd_plat_mem`. Markers in `runtime/platform/ds/src/main.c`,
  `ds_boot_stub.c`/`.h`, `ds_platform.h`.

## Leftovers

- none yet.

## Integration feedback
