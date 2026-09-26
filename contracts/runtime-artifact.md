# C8: Runtime artifact

Version: 0.1.0 · Owner: WS3 · Changes: see the tiers in contracts/README.md

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
| `tree` | The git tree hash of `runtime/` **without `runtime/dist/`** (below). |
| `blocksds` | The BlocksDS version that built it (`wf-config`, via `detectToolchain()`). |
| `arm7` | `$BLOCKSDS/sys/arm7/main_core/arm7_maxmod.elf`. |
| `arm9_sha256` | SHA-256 of `arm9.elf`, lowercase hex. |
| `itcm` | `.itcm` bytes, libnds's exception vectors included. Ceiling 24576. |
| `dtcm` | `.dtcm` + `.sbss` bytes. Ceiling `dtcm_data`. |
| `dtcm_data` | `__dtcm_data_size` in bytes. |
| `cstack` | The C stack in bytes: `__sp_usr - __dtcm_start`. It is the total in `DSD\|MEM`'s `cstack=used/total` (KB there). |
| `image` | The ARM9 static image in main RAM, loaded sections plus `.bss`: `__end__ - 0x02000000`. Budget 0.7 MB (716,800 bytes, PLAN.md 3.3). |

**Which tree `tree` covers.** `runtime/dist/` sits inside `runtime/`, and a commit cannot contain its own hash, so
`tree` is the hash `git write-tree --prefix=runtime/` gives for `runtime/` **with `runtime/dist/` removed**: the core,
`gen/`, `platform/`, `data/`, `selftest/`, `host/`, `tests/`, `src/`, both Makefiles and the package files, as they
are in the working tree (tracked and untracked files, minus `.gitignore`d ones). The build stages them into a
throwaway index and never touches the real one. When `dist/` is committed together with the sources it was built
from, `tree` equals `git rev-parse <commit>:runtime` computed with `dist/` left out, so a stale `dist/` shows as a
`tree` mismatch.

## What a ROM gives the runtime

- NitroFS (C3 layout, `contracts/assetpack.md`). The runtime reads `nitro:/game.dsdb` (required) and
  `nitro:/soundbank.bin` (optional: without it maxmod is not started and sound calls do nothing).
- Boot order: log protocol chosen from `0x04FFFA00` (C8) → `nitroFSInit(NULL)` → `soundEnable()` →
  `mmInitDefault("nitro:/soundbank.bin")` when the file exists → load `game.dsdb` → `DSD|READY|<runtime>|<abi>`.
- A boot failure prints one `DSD|ERR|<code>||||0|<message>` line (no object, event or file) and stops. The codes
  are provisional until WS2's R5xx catalog has them (ADR-0004): R580 NitroFS not mounted (the message names
  `strerror(errno)`), R581 `game.dsdb` missing, damaged or built for another ABI, R582 soundbank not loaded.

Until WS2's loader and VM are linked, the runtime checks only the `game.dsdb` header (magic, major 0, ABI hash),
prints `DSD|READY` and idles (ADR-0004).

## How to change me

- T0 (wording): WS3 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new `VERSION` key, a new optional NitroFS file, a larger budget): minor version bump + CHANGELOG entry in one
  commit; WS0 reviews within 24 hours.
- T2 (renaming or removing a file or key, another ARM7, a new required NitroFS file): an ADR co-signed by WS1/WS8
  (packRom, BuildService), WS2 and WS6.
