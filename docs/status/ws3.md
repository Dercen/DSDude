# WS3 DS platform layer status

Mode: **hybrid**, local slot 2. Launched 2026-09-26 (after `start-ws3`). Branch `ws3-platform` from `main` at
`829b00d`. Toolchain: BlocksDS 1.24.0 (GCC 16.2.0) from WS1's install.

## Progress

Legend: todo / in progress / done (<sha>).

- Task 1. `runtime/Makefile`, `runtime/package.json`, `npm run build:runtime`, `contracts/runtime-artifact.md`:
  **done** (ec80829; contract and manual 2 commits later).
  - **Makefile** as PLAN 6 WS3 (`SOURCEDIRS := core/src platform/ds/src`, `INCLUDEDIRS := core/include gen`,
    `BINDIRS := data`, `LIBS := -lmm9 -lnds9`, `LIBDIRS := $(BLOCKSDS)/libs/maxmod`, `CFLAGS := -std=c11 -fwrapv
    -fno-strict-aliasing -funsigned-char` before the include). Default goal: `dist/arm9.elf` (stripped) +
    `dist/arm9-debug.elf`; no ROM.
  - **Finding: libnds headers do not compile under strict `-std=c11`** (`asm volatile` in `ndstypes.h`
    `COMPILER_MEMORY_BARRIER`, used by `video.h`/`videoGL.h` inlines). `platform/**` therefore adds `-std=gnu11`
    (a target-specific flag; the later `-std` wins). The core never includes libnds and stays ISO C11, identical to
    the host flags. Recorded in `contracts/runtime-artifact.md`.
  - **DTCM**: `__dtcm_data_size=0x1200` (VM register stack 4 KB + dispatch table + slack) at the top of DTCM, IRQ/SVC
    stacks 0x100; the C stack below it gets 11,200 bytes and cannot grow into the data. Link fails if DTCM data
    outgrows 0x1200.
  - **M1 switch**: `make DSD_VM_BL=1` builds `core/src/vm.arm.c` with `-marm` and without `-mlong-calls`.
  - **Build**: `npm run build:runtime -w runtime` = `runtime/src/build-runtime.ts` → C4 `buildRuntime({runtimeDir})`
    (no ADR needed: it targets `runtime/` directly) → `arm-none-eabi-size -A` + `nm` → `dist/VERSION` + report.
    First report: itcm 1,088 B / 24 KB, dtcm 0 / 4.5 KB, cstack 11,200 B, image 92,692 B / 0.7 MB.
  - **Reproducible**: `-ffile-prefix-map` for the build dir; a copy built in another folder gave identical MD5s for
    both ELFs; no worktree path in `arm9-debug.elf`.
  - **VERSION** hash covers the git tree of `runtime/` **without `runtime/dist/`**, from the working tree via a
    throwaway index (tested against a temp repo). Paired ARM7: `arm7_maxmod.elf`.
  - **DS compile of WS2's core** (`fixed.c`, `number.c`, `numfmt.c`, `vendor/trig.c` at `829b00d`): clean, no
    warnings with `-Wall -Wextra`.
  - Tests: runtime 9 (vitest), Biome and `tsc -b runtime` clean.
- Task 2. M1 path: **in progress**.
  - Init (`nitroFSInit` → `soundEnable` → `mmInitDefault` when `nitro:/soundbank.bin` exists; every result checked,
    failures print `DSD|ERR` with R580/R582, `strerror(errno)` for NitroFS) and the C8 log writer (one protocol from
    `0x04FFFA00`, main-RAM buffers, six 1023-char pad lines after READY/ERR/STAT): done.
  - `fixtures/runtime/dsdb-hello/nitrofs/game.dsda` (copy of `fixtures/bytecode/hello.dsda`, `.dsdb` by
    `tools/gen-dsdb.ts`). Packed with `dsdude build ... --runtime runtime/dist/arm9.elf --skip-compile
    --skip-assets`; `dsdude screenshot --frames 90` (py-desmume, legacy protocol) logged exactly
    `["DSD|READY|0.1.0|0dd9987a"]`.
  - todo: melonDS and DeSmuME windows (the emulator slot was taken by another stream's DeSmuME at the time); a
    300-char line and a `%` line; `DSD|LOG|hello` needs WS2's VM (ADR-0004 stub until then); timer harness.
- Task 3. Selftest ROM: todo (next; CP-B = M0 needs its screenshots, logged touch, a logged maxmod effect).
- Task 4. `dsd_platform.h` implementation: todo (C11 owed by WS2 at CP-A).
- Task 5. Spikes 10, 11 (both sides), 12, 14: todo.

## Open ADR-pending markers

- ADR-0004 (proposed, WS3 → WS2): core entry point `dsd_core_main`, line/pad split between core and platform,
  `dsd_plat_fatal` + platform R5xx codes R580-R583, `dsd_plat_mem`. Markers in `runtime/platform/ds/src/main.c`,
  `ds_boot_stub.c`/`.h`, `ds_platform.h`.

## Leftovers

- none yet.

## Integration feedback
