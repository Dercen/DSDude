# WS3 DS platform layer status

Mode: **hybrid**, local slot 2. Launched 2026-09-26 (after `start-ws3`). Branch `ws3-platform`; `main` merged
daily (last: `73756aa`, checkpoint-25; dist rebuilt for WS2's step 12, conformance:ds 46/46). Toolchain: BlocksDS 1.24.0 (GCC 16.2.0) from WS1's install.

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
- **Hardware follow-up (run 1 results, WS0 relay): done** (34e3b06). Mode and ARM9 clock on the bench
  and page 4; the bench forces 67 MHz and links its workloads (no NitroFS needed; both the tag-checked and the II
  sets on one screen); R584 shows the boot diagnosis; hardware set 2 rebuilt from current dist; C13 scanline
  proposal; DS-mode analysis. See "Hardware results (spike 15)".
- **Hardware ROM set (spike 15; WS0 relay: an original 3DS with TWiLight Menu++): ready** (f23500a;
  and "Hardware run" below). `npm run hardware -w runtime` builds five ROMs into `<DSDUDE_HOME>/hardware/` and
  checks each headless first: the selftest (new page 4 "results" shows the boot figures on screen, incl. the raw
  `0x04FFFA00` bytes), the M1 bench (now one ROM running the full, baseline and loop workloads and showing the VM
  figures on the top screen), `hello` and spike 12's numeric hashes on a screen-log runtime (`make DSD_SCREENLOG=1`
  mirrors every `DSD|` line onto the bottom screen; test builds only), and `samples/flappy` with the shipped
  runtime. The boot path needed no change (`nitroFSInit(NULL)` uses `argv[0]`, which TWiLight passes).
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
  - **Key-script cases on the DS: done** (see the next commit). `make DSD_SCRIPTED=1` builds a test runtime
    (`build/dsdude_runtime_scripted.elf`) whose `dsd_plat_read_input` replays `nitro:/input.keys` per core frame
    through WS2's own parser (`runtime/host/keys.c`, linked unchanged), so host frame numbers line up exactly;
    `conformance:ds` uses it for cases with a key script. **41 of 41 pass, none skipped** (v2-05 input, v3-02
    anim/outside/touch included). The shipped `dist/` ELFs contain none of it (byte-identical; no `host_keys`
    symbols).
  - **`DSD|MEM` `snd` on the DS: done** (see the next commit). `ds_snd.c` indexes `soundbank.bin` at start-up
    (header counts + `*maxmod*`, entry sizes, each module's sample ids from its MAS sample info, msl_id at byte 10)
    and `dsd_plat_mem_report` counts every distinct resident sample once plus each loaded module. Checked: the
    selftest's blip + loop + module = 15,360 B, `snd=15/768`; `samples/flappy` on the DS reports `snd=27/768`
    (its 27,012-byte bank, all loaded), with 3 sprites, 3 standard palettes and `fps=59/60`.
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
  - **Spike 14, cache-resident loop vs straight-line** (`loopDsda`: the first 10 units of the mix, 400 bytes,
    run 12 times through ADDI/CMPJ/JMP; about the same op count as the 4.8 KB block): melonDS **34.81 vs 35.06
    cycles/op** (equal within 1 %: melonDS does not model the data cache); py-desmume **47.71 vs 57.62** (the loop
    17 % cheaper there). What the D-cache is worth on hardware needs spike 15 (a flashcart run). `npm run bench`
    now reports it every run (`LOOP` lines).
  - **Re-run after WS2's f636475 (step 12: op_CALLN_QUICK, one-store SYNC_PC, run_plain back in ITCM), main 73756aa:**
    melonDS, **II mix 25.11 cycles/op = 44,605 ops/frame: PASS** (gate 44,000; target 25.46); tag-checked 29.00 =
    38,631 (FAIL). Loop 28.87 / 25.12; BL = long. Per-opcode: **CALLN 51.8 -> 42.9**; CMPJII+JMP 25.2, CMPJ+JMP 29.9,
    ADDII 24.0, ADD 31.9, MULII 27.0, MUL 32.9, GETSLOT 27.0, SETSLOT 24.0, MOV 18.0, LOADI 15.0. predecode=10/256.
    **ITCM 15,376 B of 24 KB** (run_plain back in ITCM). Hardware set 3 rebuilt from this dist (unreleased,
    `<DSDUDE_HOME>/hardware-set3/`; its 2-bench.nds gives 29.00 / 25.11 on melonDS); set 2 unchanged.
  - **Re-run after WS2's 837fe60 (pre-decoded code, direct threading), main 9ff97c1:** `DSD|MEM predecode=10/256` in
    the bench room (1 in the baseline's), so the threaded path is in use. melonDS VM, gate mix tag-checked **29.94
    cycles/op = 37,419 ops/frame**; II **26.06 = 42,990**: both still FAIL 44,000, the II mix 0.60 cycles/op above
    the 25.46 target. Loop 29.78 / 26.05; BL = long. Per-opcode: CMPJ+JMP 34.4 -> 29.9, **CMPJII+JMP 30.5 -> 25.2**,
    **CALLN 62.8 -> 51.8**; ADD 31.9, ADDII 24.0, MUL 32.9, MULII 27.0, GETSLOT 27.0, SETSLOT 24.0, MOV 18.0, LOADI
    15.0 (unchanged). **ITCM 8,344 B** (run_plain moved to main RAM): ~15.6 KB of the 24 KB ceiling free. Hardware set
    3 built (not handed out) at `<DSDUDE_HOME>/hardware-set3/` (`npm run hardware -w runtime -- --out
    hardware-set3`); its 2-bench.nds gives 29.94 / 26.06 on melonDS.
  - **Re-run after WS2's 82488bc (CALLN budget), c29babf (cached slot pointer), ae8daf7 (ADDII/SUBII/MULII/CMPJII),
    main d50546c:** melonDS, gate mix as bench.dsdb has it (tag-checked): VM **31.76 cycles/op = 35,266 ops/frame**;
    the same mix with ADD/SUB/MUL/CMPJ as the II forms (opcode bytes rewritten as WS2's tests do, `rewriteToII`):
    **28.27 = 39,629**. Both FAIL melonDS's 44,000 (both pass the hardware bar 35,000, the tag-checked one barely).
    Loop 31.62 / 28.22; BL = long (31.76). Per-opcode: LOADI 15.0, MOV 18.0, SETSLOT 24.0 (was 31.9), GETSLOT 27.0
    (was 35.9), ADD 31.9 / ADDII 25.0, MUL 32.9 / MULII 27.0, CMPJ+JMP 34.4 / CMPJII+JMP 30.5, CALLN 62.8 (was 69.7).
  - **Derating reference for the hardware run:** the `2-bench.nds` the user has (built at main 0e67e27, before the
    last two VM changes) is byte-identical to `.dsdude/build/a31d213c5f10ff6f/game.nds`, which gives **35.05 VM
    cycles/op (31,958 ops/frame), loop 34.80, memprobe main 3.51 / dtcm 1.57** on melonDS. The melonDS derating =
    the hardware's VM cycles/op for that ROM / 35.05.
  - **Re-run after WS2's f22071e (watchdog settled at control transfers) + cd2e295, main 6057408:** melonDS VM
    **33.20 cycles/op = 33,744 ops/frame: still FAIL** (gate 44,000); loop 32.95; per-frame overhead 16,552; BL
    33.30. Per-opcode (before -> now): LOADI 18.1 -> 15.0, MOV 21.0 -> 18.0, ADD 34.9 -> 31.9, MUL 35.9 -> 32.9,
    SETSLOT 34.9 -> 31.9, GETSLOT 38.9 -> 35.9, CMPJ+JMP 34.2 -> 33.2, **CALLN 64.8 -> 69.7 (slower)**. ITCM 10,344 B.
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
- Task 5. Spikes (spike 14's DS side: see "M1 benchmark" above, loop variant included):
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
  - **Spike 12 (numeric harness, DS side): PASS** (2026-09-26). WS2's `fixtures/bytecode/runtime/numeric-hashes.dsdb`
    (trig, atan2, sqrt, div, mul, lengthdir, string, random hashes; seed 20260926) around `runtime/dist/arm9.elf`
    prints exactly `numeric-hashes.out` (the host's lines at -O2, trap and -O0) on **melonDS 1.1 and DeSmuME
    0.9.13 windows** and in py-desmume (`conformance:ds`): the ARM9 build's numbers match the host's bit for bit.
  - Spike 14 (M1): DS side done (see "M1 benchmark"); the gate itself is WS2's to close.

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


## Hardware results (spike 15)

**Run 1** (2026-09-26; the user's original 3DS, TWiLight Menu++ default settings; ROMs built at main `0e67e27`; source:
WS0's docs/status/ws0.md "Hardware results"). **Page 4 showed 16,184 KB heap free, i.e. TWiLight ran the ROMs in DSi
mode**, possibly with the ARM9 at 134 MHz, so the speed figures below are provisional.
- **Passed:** `5-flappy` plays with sound; `3-hello` prints `READY|0.1.0|f1d376bb`, `LOG|hello`, `EXIT|0`;
  `4-numeric` matches every host line (**spike 12 holds on hardware**); page 3's error box is readable; page 4:
  `0x04FFFA00` bytes all 00 (so the log protocol is the legacy stub, as designed), 1 MB NitroFS read **232 ms,
  4,401 KB/s** from the SD card, maxmod codes as expected (load=0 blip=0 loop=0, bad id=1, handle=1, active=1),
  C stack 3,068 of 11,200 B.
- **M1 bench (provisional, DSi mode):** VM 27.15 cycles/op = 41,261 ops/frame (the same ROM on melonDS: 35.05 /
  31,958), loop 18.03 cycles/op (melonDS 34.80), memprobe main 1.11 / dtcm 0.85 (melonDS 3.51 / 1.57), per-frame
  overhead 22,047 cycles. The memprobe's DTCM figure below 1 cycle per load and the loop's 18 cycles point to a
  134 MHz ARM9 (the timer runs at 33.51 MHz either way, so every figure is 67 MHz-equivalent time).
- **Scanline limit (selftest page 2):** the largest N with every ring complete was normal **33** (2,178 OBJ line
  cycles), affine **15** (2,070), affine double-size **8** (2,128); one more costs 2,244 / 2,208 / 2,394 and drops
  rings. So the real per-line limit is **between 2,178 and 2,207** cycles under C13's cost model (2 + width per
  normal OBJ; 10 + 2 x width per affine one, doubled width for double-size), above the ~2,124 estimate.
- **DS mode (TWiLight per-game "Run in: DS mode"): every NitroFS ROM stops with R584** ("The game file could not be
  read (file system)"); the error box renders fine. See "DS mode and NitroFS" below.

**Timing basis.** The bench's cycles are ARM9 cycles at 67 MHz: `cpuStartTiming` cascades timers 0+1 at the 33.51
MHz bus clock and the bench multiplies the ticks by 2. In DSi mode at 134 MHz the figures still measure time, but
they are not a DS's. Since `34e3b06` the bench forces 67 MHz in DSi mode (`setCpuClock(false)`) and
prints the mode and both clocks on screen ("DS mode, ARM9 67 MHz (boot 67)"); selftest page 4 shows them too.

**C13 `scanlineObjCycles` (WS2's contract, seeded by WS0; a proposal, not an edit):** raise the warning threshold
from 1,200 (the GBA's figure) to **2,048**. The 3DS measurement puts the hard per-line limit at 2,178-2,207 cycles
with DISPCNT bit 23 clear (the runtime's setting), and 2,048 keeps a ~6 % margin below the lowest safe measured
value while no longer warning on scenes that hardware draws fully. Suggested CHANGELOG line: "C13 0.2.0 (T1):
scanlineObjCycles 1200 -> 2048 (hardware: 2,178 OBJ line cycles drew fully, 2,208 dropped; WS3 spike 15)". If the
DS-mode re-run shows a different limit, the lower one wins. The selftest's scanline page now marks lines above
2,178 in red and shows "3DS: 2178 ok, 2208 drops".

**DS mode and NitroFS.** NitroFS finds the ROM through `argv[0]` (the homebrew argv protocol) and, on an SD card,
reads it through FAT: the DSi SD driver in DSi mode, a **DLDI driver the loader patches into the ROM** in DS mode.
Emulators use card reads instead (BlocksDS filesystem guide). In DSi mode TWiLight passes `argv[0]` and the DSi SD
driver works, which is why run 1 passed. In DS mode, either `argv[0]` is missing or the ROM's DLDI stub stays
"Default (No interface)", so FAT and NitroFS fail. The public TWiLight/nds-bootstrap docs do not say which. Since
this change the R584 box and the log say exactly that: mode, `argc`, `argv[0]`, the DLDI driver's name, whether
`fatInitDefault` works and `nitroFSInit`'s errno (checked on a ROM without NitroFS: "DS mode, argc=1 /
argv0=fat:/nofs.nds / DLDI: Default (No interface) / FAT failed, errno 19 (No such device)").
- **What users set for now (to go into the manual):** on a DSi or 3DS with TWiLight Menu++, run DSDude games with
  the per-game setting **"Run in: DSi mode"** (the default worked). On a DS or DS Lite with a flashcard, start
  them from a loader that passes `argv` and DLDI-patches homebrew, e.g. the NDS Homebrew Menu
  (BlocksDS filesystem guide). This is confirmed or corrected by the DS-mode photo.
- `2-bench.nds` no longer needs NitroFS: its workloads are linked into the ELF, and a missing NitroFS only shows as
  "NitroFS not mounted" on its screen. So a DS-mode speed figure is possible either way.

## Hardware run (spike 15): steps for the user

Hardware: an original Nintendo 3DS that starts `.nds` files through **TWiLight Menu++** (nds-bootstrap). Nothing
prints to a PC on hardware, so every ROM shows its result **on screen**: read the numbers out or take a photo.

**Boot path.** Our ROMs mount NitroFS with `nitroFSInit(NULL)`: it opens the `.nds` through `argv[0]`, which
TWiLight Menu++ passes (the SD path), and falls back to card reads, which nds-bootstrap patches. No code change was
needed. If a ROM ever shows a red box "Your game stopped" with code **R584**, NitroFS did not mount: note the whole
message (it names the reason) and which TWiLight Menu++ settings were used.

**1. Copy the files.** Build them with `npm run hardware -w runtime` (already built, 2026-09-26). Copy the five files
from `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws3\.dsdude\hardware\` to the SD card, into any folder
TWiLight Menu++ shows, e.g. `sd:/dsdude/`:
`1-selftest.nds`, `2-bench.nds`, `3-hello.nds`, `4-numeric.nds`, `5-flappy.nds` (set 2, built at main `b75cd6f`
plus this batch: current VM, on-screen mode/clock, R584 diagnosis, the bench without NitroFS). Start each from TWiLight Menu++;
to leave one, restart the console or use TWiLight Menu++'s return-to-menu combination.

**2. `1-selftest.nds`** (about 2 minutes). Sound on.
- It starts on **page 1**: rows of small red, blue, green and cyan balls on both screens over a sky-and-grass
  background, white/yellow text at the top of each screen, a small orange box top right of the bottom screen.
  Expect a short blip at start and a looping tune. Check: A plays the blip again; touching the bottom screen moves
  the small yellow square to the stylus; the D-pad moves it; B makes the background scroll and the balls change.
  Report anything missing, garbled or flickering.
- Press **L** once: **page 4, results**. Photograph the bottom screen (1 MB read time, maxmod codes, the
  `0x04FFFA00` bytes, stack and heap). The "expected" lines at the bottom say what the codes should be.
- Press **L** again: **page 3**, the red error box. Check that it is readable.
- Press **L** again: **page 2, the scanline page** (the most important part). The top screen shows N rings side
  by side on one line; the bottom screen shows N's line cost. **UP/DOWN** change N by 1, **LEFT/RIGHT** by 8,
  **A** switches between `normal`, `affine` and `affine2x`. For each of the three modes: raise N until the rings on
  the right start to vanish or flicker, and write down the **largest N at which every ring is complete** and the
  "OBJ line cycles" number shown for it. Report three pairs (mode, N, cycles).
- **SELECT** opens the log console (and closes it); a photo of it helps if anything looked wrong.

**3. `2-bench.nds`** (the M1 benchmark; about 10 seconds). Wait until the top screen shows "Photograph this
screen.", then photograph it. Row 3 says the mode and ARM9 clock ("DS mode, ARM9 67 MHz" is what we want). It shows
two sets: the gate mix as it is ("tag-checked") and with int-specialised ops ("II"): "VM ... cyc/op ... ops/fr" and
"loop ...", plus "load main / dtcm" and "NitroFS ok / not mounted" (either is fine; the bench needs no NitroFS). On
melonDS this exact ROM shows 31.77 / 28.27 VM cycles/op.

**DS-mode re-run (after run 1).** In TWiLight Menu++, open each ROM's per-game settings and set **"Run in: DS mode"**
and **"ARM9 CPU speed: 67 MHz (NTR)"**, then: photograph `2-bench.nds`'s top screen; start `1-selftest.nds` and
`3-hello.nds` and, if the red box appears, photograph it whole (its lines name the mode, argv, DLDI driver and error);
if the selftest starts, repeat the scanline page (three pairs) and photograph page 4.

**4. `3-hello.nds`.** The bottom screen should read `READY|0.1.0|f1d376bb`, `LOG|hello`, `EXIT|0`. A photo is
enough.

**5. `4-numeric.nds`** (spike 12 on hardware). The bottom screen should read exactly:
```
READY|0.1.0|f1d376bb
LOG|trig 2802 7574
LOG|atan2 33076 23775
LOG|sqrt 20444 21605
LOG|div 51 59715
LOG|mul 47882 38740
LOG|lengthdir 29239 47856
LOG|string 5784 62728
LOG|random 43187 48735
EXIT|0
```
Photograph it; any different number names the area that differs on hardware.

**6. `5-flappy.nds`** (the sample game, built end to end). Press **A** or tap the bottom screen to flap. Report
whether it plays smoothly, with sound, and anything that looks wrong.

**Send back:** the photos (or readouts) from steps 2 (page 4 and the three scanline pairs), 3, 4 and 5, and notes
from 2 and 6. WS0 relays them to WS3 and WS2.

## Integration feedback
