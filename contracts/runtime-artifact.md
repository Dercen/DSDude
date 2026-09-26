# C8: Runtime artifact

Version: 0.3.0 · Owner: WS3 · Changes: see the tiers in contracts/README.md

What `runtime/dist/` holds, how it is built, and what a ROM packed around it expects. Written by WS3 with the first
`runtime/dist` build (2026-09-26). The protocol half of C8 is `contracts/log-protocol.md` (WS2). Sources: PLAN.md
sections 3.3, 5.2 C8 and 6 WS3; `docs/manual/runtime-build.md` has the how-to.

## Files

| File | What |
|---|---|
| `runtime/dist/arm9.elf` | The ARM9 runtime, stripped (`strip --strip-all`). `packRom()` passes it to ndstool as `-9`. |
| `runtime/dist/arm9-debug.elf` | The same link, unstripped, with symbols and DWARF: for GDB (`target remote localhost:3333`, melonDS) and for `arm-none-eabi-addr2line`. ndstool copies only loadable segments, so a ROM packed from either file has the same bytes. |
| `runtime/dist/VERSION` | Identity and memory report (below). |

All three are committed; `runtime/dist/*.elf` is excepted from `.gitignore`.

**The paired ARM7** is `$BLOCKSDS/sys/arm7/main_core/arm7_maxmod.elf` from BlocksDS 1.24.0
(`C:\msys64\opt\wonderful\thirdparty\blocksds\core\sys\arm7\main_core\arm7_maxmod.elf`, C4 `ToolPaths.arm7Elf`),
always passed to ndstool as `-7`. The ARM9 calls maxmod (`-lmm9`), which needs that ARM7; no other ARM7 works.

## Building

- `npm run build:runtime -w runtime [-- --jobs N]` runs `runtime/src/build-runtime.ts`: C4 `buildRuntime()` (make in
  `runtime/`, `bash.exe -lc 'make -jN'`, jobs from `--jobs`, else `DSDUDE_MAKE_JOBS`, else 8), then
  `arm-none-eabi-size -A` and `arm-none-eabi-nm` on `arm9-debug.elf`, then writes `VERSION` and prints the report.
  It needs BlocksDS, so only local streams run it. Exit 0 ok, 2 on a missing toolchain, a failed make or a
  budget below exceeded (C10 codes).
- `runtime/Makefile` is the BlocksDS `rom_arm9` Makefile with `SOURCEDIRS := core/src platform/ds/src`,
  `INCLUDEDIRS := core/include gen`, `BINDIRS := data`, `LIBS := -lmm9 -lnds9`, `LIBDIRS := $(BLOCKSDS)/libs/maxmod`.
  Its default goal makes only `dist/arm9.elf` and `dist/arm9-debug.elf` (no ROM).
- **Flags.** Every file: `-std=c11 -fwrapv -fno-strict-aliasing -funsigned-char -Wextra` after BlocksDS's
  `-mthumb -mcpu=arm946e-s+nofp -O2 -ffunction-sections -fdata-sections`. `platform/ds/**` adds `-std=gnu11`,
  because libnds headers use the GNU `asm` keyword; `core/**` never includes libnds and stays ISO C11, as on the
  host. `*.arm.c` files compile as ARM with `-marm -mlong-calls` (BlocksDS rule); `make DSD_VM_BL=1` builds
  `core/src/vm.arm.c` without `-mlong-calls` (the M1 switch).
- **Reproducible.** The same sources with BlocksDS 1.24.0 give byte-identical `arm9.elf` and `arm9-debug.elf` in
  any folder: `-ffile-prefix-map` strips the build directory from debug info (checked: a copy built in another
  folder has the same MD5s).
- **DTCM layout** (linker symbols set by `runtime/Makefile`): `__dtcm_data_size = 0x1200` (4.5 KB for the VM's
  `DTCM_BSS` register stack and `DTCM_DATA` dispatch table, placed at the top of DTCM), IRQ and SVC stacks 0x100
  each, 0x40 reserved. The C stack lies below the DTCM data and grows down, so it can never overwrite it; it gets
  `16384 - 0x40 - 0x100 - 0x100 - 0x1200 = 11200` bytes. DTCM data beyond 0x1200 fails the link.

## `VERSION`

UTF-8 `key=value` lines, LF, in this order. Readers ignore unknown keys.

| Key | Value |
|---|---|
| `runtime` | The runtime semver: `runtime/package.json` `version`, compiled in as `DSD_RUNTIME_VERSION` and printed in `DSD\|READY`. |
| `abi` | The ABI hash the runtime accepts, 8 lowercase hex digits (`DSD_ABI_HASH` in `runtime/gen/builtins_table.h`; C2). |
| `tree` | The git tree hash of `runtime/` **without `runtime/dist/`** (below). Informational since 0.3.0: `build_tree` is the staleness check. |
| `blocksds` | The BlocksDS version that built it (`wf-config`, via `detectToolchain()`). |
| `arm7` | `$BLOCKSDS/sys/arm7/main_core/arm7_maxmod.elf`. |
| `arm9_sha256` | SHA-256 of `arm9.elf`, lowercase hex. |
| `itcm` | `.itcm` bytes, libnds's exception vectors included. Ceiling 24576. |
| `dtcm` | `.dtcm` + `.sbss` bytes. Ceiling `dtcm_data`. |
| `dtcm_data` | `__dtcm_data_size` in bytes. |
| `cstack` | The C stack in bytes: `__sp_usr - __dtcm_start`. It is the total in `DSD\|MEM`'s `cstack=used/total` (KB there). |
| `image` | Everything static in main RAM, loaded sections plus `.bss` (the core's static pools: the DSDB buffer, instance pool, string arena): `__end__ - 0x02000000`. Information only; PLAN.md 3.3 budgets those pools separately. |
| `loaded` | The ARM9 binary itself, code and data (ITCM/DTCM copies included): `arm-none-eabi-size` text + data. Budget 0.7 MB (716,800 bytes, PLAN.md 3.3 "ARM9 image"). |
| `build_tree` | The git tree hash of **the DS build's inputs only**: `runtime/core/`, `gen/`, `platform/ds/src/`, `data/`, `Makefile`, `package.json` (`BUILD_INPUTS` in `runtime/src/artifact.ts`; what `runtime/Makefile` reads without `DSD_SELFTEST`), taken the same way as `tree`. It changes only when the ELF can, so it is the staleness check for `dist/` (below). Since 0.3.0. |

**Which tree `tree` covers.** `runtime/dist/` sits inside `runtime/`, and a commit cannot contain its own hash, so
`tree` is the hash `git write-tree --prefix=runtime/` gives for `runtime/` **with `runtime/dist/` removed**: the core,
`gen/`, `platform/`, `data/`, `selftest/`, `host/`, `tests/`, `src/`, both Makefiles and the package files, as they
are in the working tree (tracked and untracked files, minus `.gitignore`d ones). The build stages them into a
throwaway index and never touches the real one. When `dist/` is committed together with the sources it was built
from, `tree` equals `git rev-parse <commit>:runtime` computed with `dist/` left out, so a stale `dist/` shows as a
`tree` mismatch.

**Staleness (since 0.3.0).** `dist/` is current when `build_tree` equals the build inputs' tree now and
`arm9_sha256` is `dist/arm9.elf`'s. `npm run check:dist -w runtime` checks both with git and Node only (exit 0
current, 1 stale), so the cloud and CI can run it; `npm run build:runtime` prints whether `build_tree` changed. An
edit to WS2's `tests/` or `host/`, the briefs or `selftest/` leaves `build_tree`, and so `dist/`, unchanged; only
`tree` moves, and it is refreshed whenever `dist/` is rebuilt anyway.

## What a ROM gives the runtime

- NitroFS (C3 layout, `contracts/assetpack.md`). The runtime reads `nitro:/game.dsdb` (required) and
  `nitro:/soundbank.bin` (optional: without it maxmod is not started and sound calls do nothing).
- Boot: `main()` chooses the log protocol from `0x04FFFA00` (C8) and calls the core's `dsd_core_main()` (C11
  0.2.0). The core calls `dsd_plat_init()`: video, the UI layer, then once per power-on `nitroFSInit(NULL)` →
  `soundEnable()` → `mmInitDefault("nitro:/soundbank.bin")` when the file exists. Then the core loads `game.dsdb`
  and prints `DSD|READY|<runtime>|<abi>`.
- Errors are the core's (its R5xx catalog): NitroFS not mounted is R584 (the platform first logs
  `DSD|LOG|nitroFSInit failed: <strerror(errno)>`), a soundbank that does not load R571, a missing or damaged
  `game.dsdb` the loader's codes. After the `DSD|ERR` line `dsd_plat_fatal` shows the red error box on the bottom
  screen; START runs `dsd_core_main()` again from the start (NitroFS and maxmod stay up).
- After `DSD|EXIT` the last frame stays on screen.

## How to change me

- T0 (wording): WS3 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new `VERSION` key, a new optional NitroFS file, a larger budget): minor version bump + CHANGELOG entry in one
  commit; WS0 reviews within 24 hours.
- T2 (renaming or removing a file or key, another ARM7, a new required NitroFS file): an ADR co-signed by WS1/WS8
  (packRom, BuildService), WS2 and WS6.
