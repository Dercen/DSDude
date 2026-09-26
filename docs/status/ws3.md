# WS3 DS platform layer status

Mode: **hybrid**, local slot 2. Launched 2026-09-26 (after `start-ws3`). Branch `ws3-platform`; `main` merged
daily (last: `6f5e77e`, checkpoint-14). After WS2's `ad59008` (core: release builds wrap on overflow) `check:dist` reported `dist/` stale as designed; rebuilt, `conformance:ds` 39/39 and selftest 5/5 still pass. Toolchain: BlocksDS 1.24.0 (GCC 16.2.0) from WS1's install.

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
    report → `dist/VERSION`. With the core: itcm 11,056 B / 24 KB, dtcm 4,096 / 4,608 B, cstack 11,200 B, loaded
    (code+data) 157,148 B / 0.7 MB, image (all static, pools included) 957,836 B. C8 artifact 0.2.0 (T1) moved the
    0.7 MB budget from `image` to the new `loaded` key: the core's static pools (300 KB DSDB buffer, VM string
    arena, instance pool) are budgeted separately in PLAN 3.3.
  - **Reproducible** (`-ffile-prefix-map`; a copy built elsewhere gave identical MD5s). **VERSION** `tree` = git
    tree of `runtime/` without `dist/`; checked equal to the committed tree.
  - **DS compile of WS2's core** at `829b00d` (`fixed.c`, `number.c`, `numfmt.c`, `vendor/trig.c`): clean with
    `-Wall -Wextra`.
- **C8 runtime artifact 0.3.0 (T1, agreed with WS0): done** (b3cc336). `VERSION` gains `build_tree`, the git tree
  of the DS build's inputs only (`core/`, `gen/`, `platform/ds/src/`, `data/`, `Makefile`, `package.json`), and it is
  the staleness check: `npm run check:dist -w runtime` (git + Node, runs in the cloud/CI) and `build:runtime`'s
  report. WS2 test/host edits no longer make `dist/` stale; `tree` stays, informational. No more VERSION-only
  refresh commits after merges.
- **After checkpoint-8** (`main` `b8ba3e1`): WS2's new `test_programs.c` cases pass on the DS too,
  `conformance:ds` **37 of 37** (v2-05, v3-02 skipped: key scripts); `dist/VERSION` refreshed for the new tree
  (the ELFs are unchanged).
- **C11 0.3.0 (WS0 relay, checkpoint-7): done** (e777050).
  - `dsd_plat_sprite_load` takes the OBJ box and frame count from the core (`dsd_sprite_info` in: width, height,
    frames; out: bpp) and returns `DSD_PLAT_ELOAD` when the GRF does not match (width != box width, fewer than
    frames * height rows, or not an OBJ size). `frame_height()` and the **last `ADR-pending ADR-0004` marker are
    gone**; `ds_obj_upload` takes an explicit frame count.
  - The UI colours in `dsd_platform.h` 0.3.0 (c_white 0 .. c_navy 15, RGB555 values) match `ds_ui.c` exactly.
  - `conformance:ds` masks `DSD|READY`'s ABI hash as WS2's runner does (ABI now `0xf1d376bb`) and checks it against
    `runtime/gen` separately; it writes a placeholder 8bpp GRF (grit's chunk layout, box = C3 OBJ padding of
    `size=`) for every `.asset sprite` a fixture declares, since WS2 ships none. **35 of 35 pass** (new: v3-01
    collide and err-draw-not-loaded, whose sprites now load and draw on the DS); v2-05 and v3-02 skipped (key
    scripts).
  - `samples/minimal` built end to end (`npx dsdude build samples/minimal`, WS4 + WS5 + this runtime): the player
    sprite at (128,96) on the top screen, `DSD|STAT|fps=60,...,spr_top=1`, `DSD|MEM ... objvram_top=1/128,
    pal16_top=1/16` (py-desmume, frame 180).
- **C11 0.2.0 reconciliation (WS0 relay, checkpoint-4): done** (9a2f0d6).
  - `runtime/platform/ds/src/ds_plat.c` implements every `dsd_plat_*` of WS2's `dsd_platform.h` 0.2.0; `main.c`
    only picks the log protocol and calls `dsd_core_main()`. `ds_boot_stub.c` is deleted; my provisional R580-R583
    are dropped for the core's codes (R584 file system, R571 soundbank, the loader's and R57x load codes).
  - `dsd_plat_init` is re-entrant: START on the error box longjmps to `main`, which calls `dsd_core_main()` again;
    video, the UI layer and all asset tables are reset, NitroFS and maxmod start once per power-on. Checked: the
    divide-by-zero fixture with START pressed prints `READY`, `ERR`, `READY`, `ERR`.
  - `dsd_plat_log` writes the core's line as is (`ds_log_write`), `dsd_plat_log_flush` writes the 5 KB pad.
  - **Decision (sound):** effect handles are kept, not `mmEffectRelease`d, because C11 has `dsd_plat_sfx_stop` and
    maxmod cannot cancel a released effect (maxmod9.h). This departs from PLAN 3.3's "released after one-shots";
    effects stay interruptible only by `mmEffectCancelAll` at room change.
  - **WS2's whole core compiles for the DS** (loader, VM in ARM/ITCM, engine, builtins) with no warnings under
    `-Wall -Wextra`: ITCM 11,056 B of 24 KB, DTCM 4,096 of 4,608 B, code+data 153.5 KB.
  - **`npm run conformance:ds -w runtime`** (new): reads WS2's case table from `runtime/tests/test_programs.c`,
    packs each fixture (header seed 1, as the host runs it) around `dist/arm9.elf`, runs it headless and compares
    the DS log with the host's `.out` (PAD/STAT dropped, `DSD|MEM` compared on the core's `inst`/`arena`).
    **34 of 34 pass** (hello, v0 conformance by hand and from WS4's compiler, v1 strings/arrays/collector, v2
    lifecycle/with/rooms/end/motion, bench, all 13 error fixtures); v2-05 skipped (a key script's host frame
    numbers cannot be replayed on the DS, where the core's first frame depends on boot time).
  - **`hello.dsdb` on the DS: `DSD|READY|0.1.0|0dd9987a`, `DSD|LOG|hello`, `DSD|EXIT|0`** (py-desmume).
  - Open (ADR-0004, with WS2; WS0 recorded both in the ADR's "WS0 notes"): (1) `dsd_plat_sprite_load` gets no
    frame count, so `ds_plat.c` infers the frame height (square when it divides the sheet, else the tallest OBJ
    height that does; `ADR-pending ADR-0004`); (2) the UI colour index order (PLAN 5.2 order, c_white 0 .. c_navy
    15) to be stated in `dsd_platform.h`.
  - `DSD|MEM`'s `snd` is 0 on the DS for now: maxmod does not report resident sample sizes (leftover).
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
  - **DoD item met: `hello.dsdb` prints `DSD|READY|0.1.0|0dd9987a`, `DSD|LOG|hello`, `DSD|EXIT|0` exactly once on
    melonDS 1.1 and DeSmuME 0.9.13 (windows, `dsdude play --seconds 8`) through WS2's VM**; no duplicates on melonDS.
  - **M1 timer harness: done (79c116a); the M1 VM gate is NOT met.** See "M1 benchmark" below.
- **M1 benchmark (spike 14, DS side)** (2026-09-26, 79c116a). `npm run bench -w runtime [-- --emulator melonds|desmume]
  [-- --mix]`; harness `runtime/selftest/bench/bench.c` (`make DSD_BENCH=1`, `DSD_VM_BL=1` for plain BL). It boots
  WS2's `fixtures/bytecode/bench.dsdb` through `dsd_game_boot`, runs 30 warm-up frames, then times 600
  `dsd_game_frame` calls with cascaded timers 0+1 (ticks x 2 = ARM9 cycles) while `dsd_plat_frame_end` skips the
  VBlank wait and the log is muted. A baseline (the same game with `bench_step` emptied, assembled on the fly from
  `bench.dsda`) isolates the VM: cycles/op = (full - baseline) / (ops - baseline ops).
  - **melonDS 1.1, JIT off (the gate platform):** VM **39.84 cycles/op = 28,122 ops/frame** (gate 44,000 on
    melonDS; 35,000 on hardware): **FAIL**. Whole frame (block + engine + platform) 54.50 cycles/op = 20,554
    ops/frame; per-frame overhead 16,954 cycles (1.5 % of a frame).
  - **py-desmume (DeSmuME core):** VM 67.54 cycles/op = 16,589 ops/frame; whole frame 86.10 cycles/op.
  - **`-mlong-calls` vs plain BL:** no difference (melonDS 39.84 vs 39.94 cycles/op; DeSmuME 67.54 vs 67.82).
    Kept `-mlong-calls` (the BlocksDS default). ITCM 11,056 B of 24 KB.
  - **Per-opcode, melonDS (`--mix`, 1,200 of one op minus the baseline):** LOADI 21.1, MOV 24.0, CMPJ+JMP 37.2,
    SETSLOT 37.9, ADD 37.9, MUL 38.9, GETSLOT 41.9, CALLN 84.7 cycles/op. Every op pays ~20 cycles of dispatch.
  - **Re-run after WS2's 02fb804 (dispatch table in DTCM, base in a register) + 06f668d (cheaper CALLN), main
    6f5e77e:** melonDS VM **35.06 cycles/op = 31,957 ops/frame: still FAIL** (gate 44,000; was 39.84 / 28,122);
    whole frame 49.40 / 22,677; BL 35.16 (no difference). py-desmume 57.46 / 19,497. Per-opcode, melonDS: LOADI
    18.1, MOV 21.0, CMPJ+JMP 34.2, SETSLOT 34.9, ADD 34.9, MUL 35.9, GETSLOT 38.9, CALLN 64.8. DTCM now 4,332 of
    4,608 B (the table). Dispatch is 7 instructions (`cmp`/`beq` watchdog, `ldr ins` main RAM, `sub`, `and`,
    `ldr [fp, op, lsl #2]` DTCM, `mov pc`).
  - **Memory probe** (new, in the bench): 32-bit loads through the same loop cost melonDS **3.56 cycles from main
    RAM vs 1.80 from DTCM**, so the bytecode fetch adds < 2 cycles/op there; the rest of LOADI's ~18 is
    instructions and the `mov pc` refill. DeSmuME charges 7.7 for both (it models neither).
  - **Finding for WS2 (the VM is theirs; not changed here):** the dispatch sequence in `run` (ITCM, ARM) is
    `cmp/sub/beq` (watchdog), `ldr ins,[ip],#4` (bytecode, main RAM), `ldr rT,=labels` (literal pool),
    `ldr rT,[rT,op,lsl #2]` and `mov pc,rT`. `labels` is `static const` in `.rodata`, i.e. **main RAM**
    (`labels.1` at 0x02023324), so every dispatch makes two main-RAM loads. PLAN 3.3 puts the dispatch table in DTCM
    (`DTCM_DATA`), and `__dtcm_data_size` (0x1200) has 512 B spare for its 59 x 4 bytes. Keeping the table's
    address in a register, and CALLN's 85 cycles, are the next candidates. A local experiment to measure the DTCM
    table was not run: it would have edited WS2's `vm.arm.c`. PLAN 8 M1's fallback (int-specialised opcodes) is
    WS2's call; the harness re-measures any change in one command.
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
  - Key scripts are now C8 format (ADR-0003 superseded); `runtime/src/keys.ts` translates them to ranges while
    `tools/screenshot.py` still reads ADR-0003's. The fps window now starts on a VBlank (it read 59 in the first
    second when boot ended mid-frame).
  - **1 MB NitroFS read** (sets the room-load budget): **melonDS 423,177 us (2,419 KB/s)**; DeSmuME 322,484 us
    (3,175 KB/s); py-desmume 322,447 us. Byte sum correct on all three.
  - **`DSD|MEM`**: `heapfree=3909,objvram_top=5/128,objvram_bot=1/128,cstack=4/10` (KB; C-stack high-water from a
    painted stack: ~4 KB used by the printf-heavy selftest of 10.9 KB).
- Task 4. `dsd_platform.h` implementation: **done for C11 0.2.0** (see the reconciliation above). Not yet exercised
  by a room game with sprites and backgrounds (WS2's v2 fixtures load no assets); that comes with samples/flappy.
- Task 5. Spikes (spike 14's DS side: see "M1 benchmark" above; the cache-resident loop variant is still todo):
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

- none. ADR-0004 is fully answered by C11 0.2.0 + 0.3.0 (WS0 closes it).

## Leftovers

- `DSD|MEM` `snd` on the DS (resident sample sizes from soundbank.bin).
- v2-05 (key script) on the DS: needs a way to align host frame 0 with an emulated frame.

## Integration feedback
