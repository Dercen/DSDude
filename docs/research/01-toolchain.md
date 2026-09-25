# Open DS toolchains (BlocksDS vs devkitPro) on Windows

*Research report 1 of 6, produced 2026-09-24 during DSDude planning. Reference material only; see `docs/research/README.md`.*

---

# Open Nintendo DS toolchains for a beginner IDE backend on Windows 11 (state as of 2026-09-24)

## 1. Bottom line

**Use BlocksDS (v1.24.0, released 2026-09-21) installed through the Wonderful Toolchain into the existing MSYS2 at `C:\msys64`.** It is the actively maintained open DS SDK (sdk repo pushed 2026-09-23, libnds 2026-09-21, ~monthly releases), its licenses are permissive for the parts that end up in the user's ROM (libnds Zlib, maxmod ISC, dswifi MIT, crts MPL-2.0, default ARM7 Zlib, picolibc BSD), its `ndstool` fork accepts ELF inputs, multiple `-d` NitroFS directories and PNG/GIF icons, and its libnds ships a GRF loader (`grfLoadPath`) plus `mmInitDefault("nitro:/soundbank.bin")`, which is exactly the "runtime ELF + data folder" architecture the IDE needs. devkitPro remains viable, but its wiki explicitly asks not to redistribute its binaries, its trademark policy forbids repackaging under its names, its Windows installer repo is unchanged since 2018 (v3.0.3, though it still downloads current packages), and libnds 2.0 (Nov 2024) replaced the FIFO/ARM7 layer with "calico", so older tutorials no longer apply.

The critical question (**re-pack NitroFS without recompiling**) is answered **yes**: keep the runtime's `arm9.elf` and the default `arm7_*.elf`, and re-run `ndstool -c` with new `-d` folders; ndstool only reads the ELF program headers, no compiler is involved, and it finishes in milliseconds. Details and header/CRC gotchas are in section 8.

## 2. Machine prerequisites (verified locally)

- `C:\msys64` exists with `usr\bin\bash.exe`, `usr\bin\make.exe`, `usr\bin\pacman.exe`, `ucrt64\bin\gcc.exe`; `pacman -Q` reports `base-devel 2024.11-1` and `ca-certificates 20250419-1` already installed (the two packages Wonderful's manual guide asks for). `C:\msys64\opt` exists and is empty (no Wonderful yet).
- `C:\devkitPro\devkitARM\bin` holds only 4 binutils exes (as/nm/objcopy/objdump, dated 2025-12-28). There is no pacman database, no gcc, no libnds; it is not a devkitPro installation and should be ignored (or deleted to avoid `DEVKITARM` confusion).
- `pkg.devkitpro.org` and `wonderful.asie.pl`/`blocksds.skylyrac.net` are reachable from this machine (all package DBs and pages fetched with curl).

## 3. BlocksDS: exact Windows installation

Official page: https://blocksds.skylyrac.net/docs/setup/windows/ ; Wonderful guide: https://wonderful.asie.pl/wiki/doku.php?id=getting_started

1. Download and run `https://wonderful.asie.pl/bootstrap/wf-bootstrap-windows-x86_64.exe`. It is an Inno Setup installer (`misc/windows/bootstrap-installer-x86_64.iss`): `DefaultDirName=C:\msys64`, copies files to `{app}\opt\wonderful`, creates Start Menu shortcut "Wonderful Toolchain Shell" -> `C:\msys64\opt\wonderful\wonderful_shell.cmd`. If MSYS2 is elsewhere, change the directory in the installer. Silent install should work with the standard Inno flags `/VERYSILENT /SUPPRESSMSGBOXES /DIR=C:\msys64` (Inno standard; not tested here).
2. Open "Wonderful Toolchain Shell" (do NOT use the plain MSYS2 shells; env vars will be missing) and run:
   ```
   wf-pacman -Syu wf-tools
   wf-config repo enable blocksds
   wf-pacman -Syu
   wf-pacman -S blocksds-toolchain
   wf-pacman -S blocksds-docs            # optional: examples + docs
   wf-pacman -S blocksds-nflib blocksds-nitroengine   # optional extra libs
   ```
   Update later with `wf-pacman -Syu` (run twice if wf-pacman itself updated).
3. Manual alternative (Wonderful "Windows (Manual)" page): from an MSYS2 UCRT64 shell, `pacman -S base-devel ca-certificates`, `mkdir /opt/wonderful` ("Other installation locations are not supported"), extract the bootstrap .tar.gz there, `/opt/wonderful/bin/wf-pacman -Syu wf-tools`, then `source /opt/wonderful/bin/wf-env` (which runs `wf-config env generate`).

What `wonderful_shell.cmd` actually sets (verbatim from `packages/runtime-msys2-shell/windows/wonderful_shell.cmd`), which the IDE can reproduce when spawning `C:\msys64\usr\bin\bash.exe -l`:
```
set MSYS2_PATH_TYPE=inherit
set MSYSTEM=UCRT64
set "PATH=C:\msys64\opt\wonderful\bin;%PATH%"
set BLOCKSDS=/opt/wonderful/thirdparty/blocksds/core
set BLOCKSDSEXT=/opt/wonderful/thirdparty/blocksds/external
set WONDERFUL_TOOLCHAIN=/opt/wonderful
```
Resulting Windows paths:
- Compiler: `C:\msys64\opt\wonderful\toolchain\gcc-arm-none-eabi\bin\arm-none-eabi-gcc.exe` (Makefile: `ARM_NONE_EABI_PATH ?= $(WONDERFUL_TOOLCHAIN)/toolchain/gcc-arm-none-eabi/bin/`).
- SDK root: `C:\msys64\opt\wonderful\thirdparty\blocksds\core` (`blocksds-toolchain` PKGBUILD installs to `$WF_DESTDIR/thirdparty/blocksds/core`). Inside: `tools\{ndstool,grit,mmutil,bin2c,dldipatch,dlditool,mkfatimg,squeezer,dsltool,teaktool}`, `sys\crts\ds_arm9.specs` (+ `ds_arm7.specs`, `dsi_arm9.specs`, `.ld`, `crt0.s`), `sys\arm7\main_core\arm7_{minimal,dswifi,maxmod,libxm7,dswifi_maxmod,dswifi_libxm7}[_debug].elf`, `sys\default_makefiles\{rom_arm9,rom_arm9arm7,rom_arm9teak,rom_arm9arm7teak,bin_xtensa}\Makefile`, `sys\icon.gif`, `sys\icon.bmp`, `sys\dldi_r4\r4tf.dldi`, `sys\cmake\BlocksDS.cmake`, `sys\vscode\c_cpp_properties.json`, `libs\{libnds,maxmod,dswifi,libxm7,libteak,libath6k}`, `examples\`, `templates\{rom_arm9_only,rom_combined,library_arm9_only,library_combined,dldi}`.
- Package repo used by wf-pacman: `[blocksds] Server = https://blocksds.skylyrac.net/packages/rolling/%OS%/$arch/` (from `packages/wf-pacman/repos/10-blocksds.conf`); packages built from https://github.com/blocksds/packages (mirror of codeberg).

Toolchain versions: BlocksDS changelog 1.22.3 (2026-08-08): "The Wonderful Toolchain's ARM toolchain component has been updated to binutils 2.47, GCC 16.2.0, and picolibc 1.8.12." (GCC 15.1.0 came in 1.10.0, 2025-04-25.) The GitHub mirror of `WonderfulToolchain/wonderful-packages` is stale (last push 2026-01-03, PKGBUILD still 15.2.1), so trust the changelog. `blocksds-toolchain 1.24.0` depends on `toolchain-gcc-arm-none-eabi-{binutils,gcc,gcc-libs,picolibc-generic,libstdcxx-picolibc}` and on Windows `runtime-gcc-libs`.

## 4. devkitPro: exact Windows installation

- Option A (fresh, own MSYS2 in `C:\devkitPro\msys2`): `https://github.com/devkitPro/installer/releases/download/v3.0.3/devkitProUpdater-3.0.3.exe` (release dated 2018-06-03; it is a downloader, packages are current).
- Option B (existing MSYS2; wiki "Customising Existing Pacman Install", https://devkitpro.org/wiki/devkitPro_pacman, run without sudo):
  ```
  export DEVKITPRO=/opt/devkitpro DEVKITARM=/opt/devkitpro/devkitARM
  pacman-key --recv BC26F752D25B92CE272E0F44F7FD5492264BB9D0 --keyserver keyserver.ubuntu.com
  pacman-key --lsign BC26F752D25B92CE272E0F44F7FD5492264BB9D0
  pacman -U https://pkg.devkitpro.org/devkitpro-keyring.pkg.tar.zst
  pacman-key --populate devkitpro        # only if the post-install script fails
  # /etc/pacman.conf:
  [dkp-libs]
  Server = https://pkg.devkitpro.org/packages
  [dkp-windows]
  Server = https://pkg.devkitpro.org/packages/windows/$arch/
  pacman -Syu && pacman -S nds-dev
  ```
- Current packages (read from `dkp-libs.db` / `dkp-windows.db` on 2026-09-24): `devkitARM r68-1` metapackage = `devkitarm-gcc 16.1.0-1` + `devkitarm-binutils 2.46.0-1` + `devkitarm-newlib 4.6.0.20260123-5` (r67 in Dec 2025 was GCC 15.2.0; r68 2026-06-10). `nds-dev` group: `libnds 2.0.2-1` (zlib), `calico 1.2.0-1` (ZPL, "RTOS-like bare metal platform support library"), `default-arm7 0.8.4-4`, `maxmod-nds 2.1.0-2`, `dswifi 2.1.0-1`, `libfat-nds 2.1.0-4` (now "libdvm"), `devkitarm-crtls 1.2.6-1`, `nds-cmake 1.3.1-1`, `nds-examples 20241110-1`, `ndstool 2.3.1-1` (GPL), `grit 0.10.0-1`, `mmutil 1.10.1-1`, `dstools 1.3.3-3` (ISC), `devkitARM-gdb 14.1-1`; plus portlibs (`nds-libpng 1.6.39`, `nds-zlib 1.3`, `nds-freetype 2.13.2`, ...).
- Makefile convention: `include $(DEVKITARM)/ds_rules`; `ARCH := -march=armv5te -mtune=arm946e-s`; `LDFLAGS = -specs=ds_arm9.specs` (rewritten by ds_rules to `$(CALICO)/share/ds9.specs`); `LIBS := -lnds9` (+ `-lcalico_ds9` auto-added, `-lfilesystem -lfat` when `NITRO` is set, `-lmm9` for audio); ROM rule: `ndstool -c $@ -9 $< -7 $(CALICO)/bin/ds7_maine.elf -b $(GAME_ICON) "$(GAME_TITLE);$(GAME_SUBTITLE1);$(GAME_SUBTITLE2)" -d $(NITRO_FILES)`; default icon `$(CALICO)/share/nds-icon.bmp`.
- libnds 2.0 changes (devkitPro Nov 2024 announcement): classic FIFO API removed (use calico PXI), threads/mutexes from calico, DSi Atheros Wi-Fi with WPA2.

## 5. Licenses and whether an IDE may bundle the toolchain

BlocksDS (https://blocksds.skylyrac.net/docs/guides/licenses/ and repo `licenses/`): libnds **Zlib** ("No copyright notice required in binary distributions"; FatFs permissive); Maxmod **ISC** (notice required); DSWiFi **MIT** (+ lwIP BSD-3, Mbed TLS Apache-2.0 OR GPL-2.0+); LibXM7 MIT; crts **MPL-2.0**; default ARM7 core Zlib; default Makefiles/templates **CC0-1.0**; picolibc BSD-like; libgcc/libstdc++ GPL-3 with runtime exception; host tools: ndstool **GPL-3.0**, grit **GPL-2.0**, mmutil ISC (BlocksDS fork), GCC/binutils GPL-3+ (Wonderful's GCC fork source: github.com/WonderfulToolchain/gcc). No trademark policy. Consequence: an IDE may **bundle** BlocksDS + the Wonderful ARM toolchain as long as the GPL host tools (gcc, binutils, ndstool, grit) are accompanied by license texts and a source offer/link, and ISC/MIT notices are shipped for maxmod/dswifi in generated games. Simpler for v1: auto-install via the bootstrap + `wf-pacman` (no redistribution at all), bundle later.

devkitPro: components are also GPL/zlib/ZPL, but the project's policy is explicit. Getting Started: "Please do not distribute the binaries you obtain that way or recommend that people do this instead of using pacman." Trademarks page: "Any modification of a devkitPro product, including but not limited to adding binaries, libraries, deconstructing an installation to individual components, or modifying the scripts within a devkitPro toolchain installation is no longer a devkitPro product and may not use the trademarks at all" and "you may not distribute GPL binaries without corresponding source code." Consequence: an IDE built on devkitPro must auto-install through pacman and must not ship or rebrand its binaries.

## 6. Feature coverage (BlocksDS libnds, header inventory from `blocksds/libnds`)

- Sprites/OAM (`nds/arm9/sprite.h`): `oamInit(&oamMain, SpriteMapping_1D_128, false)`, `oamAllocateGfx`, `oamSet`, `oamSetXY/Priority/Palette/Alpha/Flip/Hidden/AffineIndex`, `oamRotateScale`, `oamUpdate`, `oamClear`, `oamFreeGfx`; both engines (`oamMain`, `oamSub`).
- Backgrounds (`background.h`): `bgInit/bgInitSub/bgInitHidden(layer, BgType_Text4bpp|Text8bpp|Rotation|ExRotation|Bmp8|Bmp16, BgSize_T_256x256..., mapBase, tileBase)`, `bgGetMapPtr/bgGetGfxPtr`, `bgSetScroll/bgScroll`, `bgSetPriority`, `bgShow/bgHide`, `bgSetRotateScale`, `bgSetCenter`, `bgUpdate`, extended palettes, mosaic, windows (`window.h`).
- Dual screen: `videoSetMode/videoSetModeSub`, `vramSetBankA..I`, `vramSetPrimaryBanks`, `lcdMainOnTop/Bottom`, `consoleDemoInit()` (console on sub screen), `consoleInit(...)` on either engine, `setBrightness`.
- Input/touch (`input.h`, `touch.h`): `scanKeys`, `keysDown/Held/Up/DownRepeat`, `touchRead(&tp)` -> `tp.px/py`, `keyboard.h` on-screen keyboard.
- Console/printf: picolibc `printf` to `consoleDemoInit()` console; ANSI SGR colors; `consoleArm7Setup`; nocash debug output; assertion/exception handlers.
- Audio: Maxmod (`-lmm9`; `mmInitDefault("nitro:/soundbank.bin")` or `mmInitDefaultMem(soundbank_bin)`, `mmLoad`, `mmStart(id, MM_PLAY_LOOP)`, `mmLoadEffect`, `mmEffect`; MOD/S3M/XM/IT/WAV, hardware or software mixing, streaming), LibXM7, raw ARM9 `sound.h`, microphone.
- Filesystem: `filesystem.h` `nitroFSInit(NULL)` (read-only NitroFS, paths `nitro:/x`, `/x`, `x`), `fat.h` `fatInitDefault()` (FatFs; DLDI on flashcarts, DSi SD), standard `fopen/fread/dirent/stat`; GRF loader `grf.h` (`grfLoadPath(path, &header, &gfx, &gfxSize, &map, &mapSize, &pal, &palSize)`), `image.h/pcx.h`, BIOS decompression (`decompress.h`).
- DSi: SD/MMC (fixed for melonDS in 1.24.0), NWRAM, camera (initial), Teak DSP (`libteak`, experimental LLVM), DSWiFi WPA2 on DSi; NiFi local multiplayer on DS.
- Extras: `cothread.h` cooperative threads, timers, DMA/NDMA, 3D (`videoGL.h`, GL2D), peripherals (rumble, slot-2, motion, piano, paddle), dynamic libraries (`dsltool`).
devkitPro libnds 2.0.2 covers the same video/bg/oam/console/input surface; NitroFS via libfilesystem/libdvm; ARM7 side via calico (`ds7_maine.elf`).

## 7. Makefile conventions, C standard, docs, maintenance

BlocksDS project Makefile is variables + `include $(BLOCKSDS)/sys/default_makefiles/rom_arm9/Makefile` (CC0). Variables: `NAME`, `GAME_TITLE`, `GAME_SUBTITLE`, `GAME_AUTHOR`, `GAME_ICON` (default `$(BLOCKSDS)/sys/icon.gif`), `SOURCEDIRS`, `INCLUDEDIRS`, `GFXDIRS` (every `foo.png` + required sidecar `foo.grit` -> `grit foo.png -ftc -W1 -o build/foo` -> `foo.h` with `fooTiles/fooMap/fooPal`), `BINDIRS` (`bin2c file.bin outdir` -> `file_bin.h`, `file_bin[]`, `file_bin_size`), `AUDIODIRS` (`mmutil <files> -d -o soundbank.bin -h soundbank.h`; if `NITROFSDIR` is set the soundbank goes to NitroFS instead of being linked), `NITROFSDIR` (list of folders, each becomes `-d dir`, merged at root), `DEFINES`, `ARM7ELF` (default `arm7_maxmod.elf`; use `arm7_dswifi_maxmod.elf` for Wi-Fi), `LIBS`/`LIBDIRS`, `COMPDB=1` (compile_commands.json via `wf-compile-commands-merge`). Flags: `ARCH := -mthumb -mcpu=arm946e-s+nofp`; `CFLAGS := -Wall -O2 -ffunction-sections -fdata-sections -specs=$(BLOCKSDS)/sys/crts/ds_arm9.specs` plus `-D__NDS__ -D__BLOCKSDS__ -DARM9`; C++ adds `-fno-exceptions -fno-rtti`; files named `*.arm.c` get `-marm -mlong-calls`; link `-Wl,-Map,... -Wl,--start-group -lnds9 -lc -Wl,--end-group -specs=...`. ROM rule verbatim:
```
$(BLOCKSDS)/tools/ndstool/ndstool -c $@ -7 $(ARM7ELF) -9 $(ELF) -b $(GAME_ICON) "$(GAME_TITLE);$(GAME_SUBTITLE);$(GAME_AUTHOR)" $(NDSTOOL_ARGS)   # NDSTOOL_ARGS = -d dir [-d build/maxmod_nitrofs]
```
Other targets: `dump`, `sdimage` (`mkfatimg -t sdroot image.bin` for DSi SD emulation), `dldipatch` (`dldipatch patch $(BLOCKSDS)/sys/dldi_r4/r4tf.dldi rom.nds`). The Makefiles use `find -L`, `mkdir -p`, `rm -rf`, so run `make` from MSYS2 bash, or have the IDE call `arm-none-eabi-gcc.exe`/`ndstool.exe` directly with the same flags (`make VERBOSE=1` prints them). Alternatives already in the ecosystem: CMake (`sys/cmake`), and **ArchitectDS** (Python 3 + ninja; `Arm9Binary`, `NitroFS().add_grit([...])` converts graphics straight into GRF files in NitroFS), which the BlocksDS docs recommend because the default Makefiles "don't support ... converting graphics and storing them in the filesystem".

C standard: GCC 16.2.0 (BlocksDS) / 16.1.0 (devkitPro); no `-std` is passed, so C defaults to gnu23 and C++ to gnu++17 (GCC defaults since 15/11). picolibc vs newlib is the libc difference.

Maintenance: BlocksDS releases 1.18.1 (2026-03-07), 1.19.0/1 (03), 1.20.0 (04-26), 1.21.0/1 (06-16), 1.22.0-3 (07-15..08-08), 1.23.0 (08-24), 1.24.0 (09-21); primary host codeberg.org/blocksds (GitHub mirrors; GitHub "Releases" page is stale at v1.16.0). devkitPro: libnds last push 2026-02-19, dswifi 2026-05-04, buildscripts 2026-06-10, ndstool 2024-11-11, mmutil 2023-02, installer 2023-09. Docs: BlocksDS has a structured tutorial (basic: first_program, input, console_and_keyboard, introduction_2d, backgrounds, backgrounds_scroll, sprites, audio; intermediate: nitrofs, filesystems, dma, interrupts, gl2d, 3d, memory, arm7, peripherals; advanced: wifi, optimizing...), guides (FAQ, debugging, filesystem, libc, licenses, devkitARM porting, optimization, updating), Doxygen for libnds/maxmod/dswifi/grit, and 100+ examples. devkitPro has the wiki (some pages return 403 to non-browser fetchers), Doxygen at libnds.devkitpro.org, forum posts, and nds-examples.

## 8. Building hello-world and the NitroFS re-pack question

Minimal project (after section 3): `Makefile`
```
NAME       := hello
GAME_TITLE := Hello
SOURCEDIRS := source
NITROFSDIR := nitrofs
include $(BLOCKSDS)/sys/default_makefiles/rom_arm9/Makefile
```
`source/main.c`:
```c
#include <stdio.h>
#include <nds.h>
#include <filesystem.h>
int main(int argc, char **argv) {
    consoleDemoInit();
    if (!nitroFSInit(NULL)) perror("nitroFSInit");
    printf("Hello DS!\n");
    while (1) { swiWaitForVBlank(); scanKeys(); if (keysDown() & KEY_START) break; }
    return 0;
}
```
Build: `C:\msys64\opt\wonderful\wonderful_shell.cmd -no-start -defterm -where C:\path\hello -c "make"` (or spawn `C:\msys64\usr\bin\bash.exe -lc make` with the env from section 3). Output `hello.nds`; play with `"C:\Users\zache\Downloads\desmume-0.9.13-win64\DeSmuME_0.9.13_x64.exe" hello.nds` or `melonDS.exe hello.nds`.

**Re-packing without recompiling: yes, three ways.**
1. Runtime-ELF approach (recommended): the IDE compiles the scripting runtime once to `runtime.elf`, then on every Play runs
   `ndstool -c game.nds -9 runtime.elf -7 %BLOCKSDS%\sys\arm7\main_core\arm7_maxmod.elf -b icon.png "Title;Subtitle;Author" -d build\assets -d build\scripts` (BlocksDS ndstool: `-d directory1 <directory2> ...`, "All directories are combined in the root of the filesystem"; `-b file.[bmp|gif|png]`; `-ba` animated icon, `-bt langid "text"` per language, `-bi` static icon). ndstool detects ELF by extension or `\x7fELF` magic and copies entry/RAM address/size from program headers (`CopyFromElf`). Add `-h 0x200` for a DS-only header; with two ELFs it defaults to `0x4000` and emits DSi (`twl`) sections, unitcode 2. Omit `-7` and it falls back to `$BLOCKSDS/sys/default_arm7/arm7.elf` (needs `BLOCKSDS` env). Optional `-g CODE 01 TITLE ver`, `-uc 0` DS-only unit code, `-o logo.png`.
2. Extract/re-create from a finished ROM: `ndstool -x game.nds -9 arm9.bin -7 arm7.bin -y9 y9.bin -y7 y7.bin -d data -y overlay -t banner.bin -h header.bin` then `ndstool -c new.nds -9 arm9.bin -7 arm7.bin -h header.bin -t banner.bin -d newdata` (the header template supplies `-r9/-e9/-r7/-e7`; with raw `.bin` inputs the default header size is 0x200 and no DSi sections are produced, which emulators accept).
3. Custom packer (only if avoiding a GPL subprocess matters; not recommended): layout produced by BlocksDS ndstool: header (0x200 or 0x4000, `rom_header_size` at 0x84); ARM9 at 0x200 alignment (if header 0x4000 and `entry - ram == 0x800` it is padded to >= 0x4000 as the secure area); ARM7 next, 0x200-aligned; FNT 0x200-aligned; FAT right after FNT, 0x200-aligned, 8 bytes per file (u32 start, u32 end, absolute ROM offsets); **the 8-byte magic `NitroFS!` immediately after the FAT** (libnds's `nitroFSInit` reads it via card commands at `fatOffset + fatSize` and fails with ENODEV if absent, which is the path used on emulators and DeSmuME even though DeSmuME sets argv[0]); banner 0x200-aligned (v1 = 0x840 bytes, v3 = 0xA40, DSi = 0x23C0, with per-slot CRC-16s); files 0x200-aligned; `application_end_offset` (0x80) = 4-byte-aligned end; DSi hybrid ROMs pad total size to 0x200 and store `total_rom_size` at 0x210. Header fields: 0x20-0x2C ARM9 rom_offset/entry/ram/size, 0x30-0x3C ARM7 same, 0x40/0x44 FNT offset/size, 0x48/0x4C FAT offset/size, 0x68 banner offset, 0x6C secure-area CRC-16 of [0x4000..0x7FFF] (only meaningful with a 0x4000 header), 0xC0 156-byte Nintendo logo, 0x15C logo CRC (fixed 0xCF56), 0x15E header CRC-16 over [0x000..0x15D]. CRC-16 is GBATEK GetCRC16: init 0xFFFF, reflected polynomial 0xA001 (table C0C1,C181,C301,C601,CC01,D801,F001,A001). libnds additionally requires `fatOffset >= 0x8000 && fatSize > 0` and `fntOffset >= 0x8000`, else ENODEV, so a tiny runtime must be padded so the tables land past 0x8000. FNT format (GBATEK): main table 8 bytes per directory (u32 subtable offset from FNT base, u16 first file ID, u16 parent ID, or total directory count for root 0xF000); subtable entries: length byte (bit 7 = directory), name (ASCII 0x20-0x7E, case-sensitive, <= 127 chars, no terminator), u16 directory ID for subdirectories, 0x00 end marker; max 4096 directories, file IDs < 0xF000. `ndstool -fh file.nds` recomputes header CRCs and `-fb` the banner CRC after manual edits.
Gotchas: melonDS/DeSmuME read the ROM like a real cart, so no DLDI/argv is needed for Play; on flashcarts the loader must pass argv[0] and DLDI-patch (hbmenu/TWiLight do); NitroFS is read-only, saves go through `fopen` on the SD (`fatInitDefault`); BlocksDS 1.24.0 fixed SD init under melonDS and added no$gba workarounds.

## 9. Asset conversion tools with example command lines

grit (BlocksDS fork of devkitPro grit 0.10; options verified from `grit_main.cpp` and the coranac manual): outputs `-ftc` (C), `-fts` (asm, default), `-ftb` (raw `.img.bin/.map.bin/.pal.bin`), `-ftr` (**GRF**, RIFF container loadable with `grfLoadPath`), `-fh!` (no header), `-o name`, `-W1` (errors only), per-file `foo.grit` flag files, shared data `-pS`/`-gS` with `-O shared`, `-fx tileset.png` (shared tileset; partly broken per 1.22.3 notes), `-fw palette` (external palette). Real examples from the SDK:
- 8bpp tiled sprite sheet, magenta transparent, no map: `grit advnt.png -gB8 -gt -gTFF00FF -m! -ftc -o advnt`
- 4bpp (16-color) sprite: `grit ship.png -gB4 -gt -gTFF00FF -m! -pn16 -ftb -fh! -o ship`
- 8bpp text background with screen-block map: `grit forest_town.png -gB8 -gt -m -mLs -gTFF00FF -ftr -o forest_town` (add `-Mw2 -Mh2` for 2x2 metatiles, `-mp7` to force palette slot 7 for extended palettes)
- 4bpp background with tile/palette/flip reduction: `grit map.png -gB4 -gt -m -mLs -mRtpf -ftb -o map`
- Affine (rotation) background: `-gB8 -gt -m -mLa -mRt`; 16-bit bitmap: `-gB16 -gb -gT!`; 8-bit bitmap: `-gB8 -gb`; 3D texture: `-gx -gb -gB8 -gTFF00FF`; compression `-gzl` (LZ77), `-gzh` (Huffman), `-gzr` (RLE) for `decompress()`.
- GRF background formats exposed to the runtime: `GRF_BGFMT_SBB_4BPP/SBB_8BPP/AFF_8BPP/FLAT_8BPP/FLAT_4BPP`, texture formats A5I3/A3I5/4x4.
mmutil (`mmutil [options] input files ...`, MOD/S3M/XM/IT/WAV): `mmutil -d music.xm jump.wav explode.wav -osoundbank.bin -hsoundbank.h` (`-d` = NDS mode; header defines `MOD_MUSIC`, `SFX_JUMP`...); `-b` builds a test ROM (`mmutil -d -b song.xm -oTEST.nds`); `-m` MAS single file; `-i`, `-v`, `-p`, `-z`. bin2c: `bin2c file.bin outdir`. mkfatimg: `mkfatimg -t sdroot image.bin`. dldipatch: `dldipatch patch r4tf.dldi game.nds`. Extra: `wf-pacman -S blocksds-ptexconv` (tex4x4 textures), `squeezer` (atlas packer), NightFox's Lib (`blocksds-nflib`) for a higher-level 2D API.

## 10. Emulators for the Play button

- DeSmuME 0.9.13 x64 (already downloaded; release 2022-05-23, repo still active 2026-09-11 without a new release): `DeSmuME_0.9.13_x64.exe game.nds`; useful flags from `commandline.cpp`: `--start-paused`, `--load-slot N`, `--slot1-fat-dir DIR` (emulate a flashcart SD folder), `--console-type`, `--arm9gdb=PORT`/`--arm7gdb=PORT` (compiled only with `GDB_STUB`; availability in the official 0.9.13 Windows build not verified).
- melonDS 1.1 (2025-11-18; nightlies through 2026-08; repo pushed 2026-08-23): `melonDS.exe game.nds` (positional), `-f` fullscreen, `-b auto|always|never`; GDB stub in Config > Emu settings > Devtools (ARM9 port 3333). BlocksDS FAQ: "The recommended emulators are melonDS, DeSmuMe and no$gba"; BlocksDS 1.24.0 specifically fixed SD-card init under melonDS. Recommend melonDS as the default Play target and DeSmuME as fallback.

## Recommendations
- Adopt BlocksDS 1.24.0 + Wonderful Toolchain as the build backend; install it into the existing C:\msys64 with wf-bootstrap-windows-x86_64.exe then `wf-pacman -Syu wf-tools; wf-config repo enable blocksds; wf-pacman -Syu; wf-pacman -S blocksds-toolchain blocksds-docs`. Do not build the IDE on devkitPro: its wiki asks not to redistribute binaries and its trademark policy forbids repackaging.
- Design the IDE around a prebuilt runtime ELF: compile the script interpreter once with BlocksDS, then on every Play only run `ndstool -c game.nds -9 runtime.elf -7 $BLOCKSDS/sys/arm7/main_core/arm7_maxmod.elf -b icon.png "Title;Sub;Author" -d build/assets -d build/scripts`. This gives sub-second iteration with no compiler in the loop; recompile only when the user adds native C modules.
- Have the IDE spawn the toolchain with the exact environment of wonderful_shell.cmd (MSYSTEM=UCRT64, PATH prefixed with C:\msys64\opt\wonderful\bin, BLOCKSDS=/opt/wonderful/thirdparty/blocksds/core, BLOCKSDSEXT=..., WONDERFUL_TOOLCHAIN=/opt/wonderful) via C:\msys64\usr\bin\bash.exe -lc, or call arm-none-eabi-gcc.exe/ndstool.exe directly with the default-Makefile flags (-mthumb -mcpu=arm946e-s+nofp -O2 -ffunction-sections -fdata-sections -specs=$BLOCKSDS/sys/crts/ds_arm9.specs -D__NDS__ -D__BLOCKSDS__ -DARM9, link -lnds9 -lc, plus -lmm9 for audio).
- Store assets in NitroFS as GRF files produced by `grit ... -ftr` and load them at runtime with libnds `grfLoadPath()`; store the soundbank produced by `mmutil -d ... -osoundbank.bin -hsoundbank.h` in NitroFS and init with `mmInitDefault("nitro:/soundbank.bin")`. Name files ASCII 0x20-0x7E, <=127 chars, case-sensitive, <4096 directories.
- Never write a custom .nds packer for v1; ndstool is GPL but invoking it as a separate process is fine. If a packer is ever written, it must reproduce the 'NitroFS!' magic after the FAT, keep FNT/FAT offsets >= 0x8000, 0x200-align sections, and compute the CRC-16 (init 0xFFFF, poly 0xA001) at 0x15E, logo CRC 0xCF56 at 0x15C, and banner CRCs; otherwise run `ndstool -fh`/`-fb`.
- Make melonDS (1.1+) the default Play target (`melonDS.exe game.nds`, GDB stub on port 3333 for a future debugger) and keep the already-downloaded DeSmuME 0.9.13 as a fallback (`DeSmuME_0.9.13_x64.exe game.nds`). Let the user pick the emulator path in IDE settings.
- For toolchain distribution: v1 auto-installs (detect C:\msys64\opt\wonderful\bin\wf-pacman.exe and ...\thirdparty\blocksds\core\tools\ndstool\ndstool.exe; if missing, run the Inno installer silently with /VERYSILENT /DIR=C:\msys64 and the wf-pacman commands with --noconfirm). A later bundled distribution is legally possible if the GPL host tools (gcc, binutils, ndstool, grit) ship with license texts and a source link, and generated games include the Maxmod ISC and DSWiFi MIT notices.
- Split the work into independent Claude Code streams: (1) toolchain installer/detector + build runner, (2) C runtime on BlocksDS (VM + libnds bindings: oam*, bg*, touchRead, scanKeys, grf loader, maxmod), (3) scripting language compiler (script -> bytecode file placed in NitroFS), (4) asset pipeline (grit/mmutil wrappers with per-asset .grit flags), (5) editor UI + Play button, (6) ROM packer/emulator launcher. Streams 2-4 only need the flags and API names in this report.
- Remove or ignore C:\devkitPro\devkitARM\bin (four stray binutils exes, no libnds) so DEVKITARM does not confuse anything; the CodeWarrior mwccarm bundle is irrelevant to this IDE (no NitroSDK headers/libs exist) and should not be used as a backend.
- Immediately after installing BlocksDS, build $BLOCKSDS/examples/graphics_2d/bg_regular_nitrofs and examples/maxmod/nitrofs and run them in melonDS and DeSmuME to validate the exact ELF+NitroFS pipeline this plan depends on.

## Verified facts
- [high] BlocksDS latest version is 1.24.0 released 2026-09-21; releases since March 2026: 1.18.1, 1.19.0/1, 1.20.0, 1.21.0/1, 1.22.0-3, 1.23.0, 1.24.0. (source: https://raw.githubusercontent.com/blocksds/sdk/master/docs/content/docs/changelog.md and blocksds/packages blocksds-toolchain/PKGBUILD pkgver=1.24.0)
- [high] BlocksDS ARM toolchain is binutils 2.47, GCC 16.2.0, picolibc 1.8.12 (updated in BlocksDS 1.22.3, 2026-08-08). (source: changelog.md line ~265, 'Version 1.22.3 (2026-08-08)' SDK section)
- [high] BlocksDS Windows install commands: wf-pacman -Syu wf-tools; wf-config repo enable blocksds; wf-pacman -Syu; wf-pacman -S blocksds-toolchain; optional blocksds-docs, blocksds-nflib, blocksds-nitroengine. (source: https://blocksds.skylyrac.net/docs/setup/windows/)
- [high] Wonderful Windows bootstrap installer is https://wonderful.asie.pl/bootstrap/wf-bootstrap-windows-x86_64.exe, Inno Setup with DefaultDirName=C:\msys64, installs into {app}\opt\wonderful and creates a 'Wonderful Toolchain Shell' shortcut to opt\wonderful\wonderful_shell.cmd. (source: wonderful-packages misc/windows/bootstrap-installer-x86_64.iss; wonderful.asie.pl getting_started page)
- [high] wonderful_shell.cmd sets MSYSTEM=UCRT64, MSYS2_PATH_TYPE=inherit, PATH prefix opt/wonderful/bin, BLOCKSDS=/opt/wonderful/thirdparty/blocksds/core, BLOCKSDSEXT=/opt/wonderful/thirdparty/blocksds/external, WONDERFUL_TOOLCHAIN=/opt/wonderful. (source: wonderful-packages packages/runtime-msys2-shell/windows/wonderful_shell.cmd)
- [high] BlocksDS default Makefile compiles with -mthumb -mcpu=arm946e-s+nofp -O2 -ffunction-sections -fdata-sections -specs=$(BLOCKSDS)/sys/crts/ds_arm9.specs -D__NDS__ -D__BLOCKSDS__ -DARM9 and builds the ROM with `ndstool -c $@ -7 $(ARM7ELF) -9 $(ELF) -b $(GAME_ICON) "$(GAME_FULL_TITLE)" -d <NITROFSDIR...>`; default ARM7ELF is $(BLOCKSDS)/sys/arm7/main_core/arm7_maxmod.elf. (source: https://raw.githubusercontent.com/blocksds/sdk/master/sys/default_makefiles/rom_arm9/Makefile (downloaded verbatim))
- [high] BlocksDS ndstool accepts ELF or raw binaries for -9/-7 (detected by .elf extension or ELF magic), multiple -d directories merged at the root, -b file.[bmp|gif|png] icons, -ba/-bi/-bt banner options, -fh/-fb checksum fixers, -h size/template, -uc unit code, and DSi flags -u/-z/-a/-p/-q. (source: https://raw.githubusercontent.com/blocksds/ndstool/master/source/ndstool.cpp usage table; ndscreate.cpp HasElfExtension/HasElfHeader)
- [high] BlocksDS ndstool writes the 8-byte magic 'NitroFS!' right after the FAT, and BlocksDS libnds nitroFSInit reads it via card commands to verify cartridge reads; it also requires fatOffset >= 0x8000, fatSize > 0 and fntOffset >= 0x8000. (source: blocksds/ndstool source/ndscreate.cpp (fat_end_offset magic write) and blocksds/libnds source/arm9/libc/nitrofs_device.c nitroFSInit())
- [high] ndstool alignment: ARM9/ARM7/FNT/FAT/banner/files aligned to 0x200 (mask 0x1FF), DSi ARM9 to 0x400; header size defaults to 0x4000 when both inputs are ELF else 0x200; application_end_offset is 4-byte aligned. (source: blocksds/ndstool source/ndscreate.cpp lines 19-26, 401, 852-855)
- [high] DS ROM header offsets: 0x20-0x2C ARM9 offset/entry/ram/size, 0x30-0x3C ARM7, 0x40/0x44 FNT, 0x48/0x4C FAT, 0x68 icon/title offset, 0x6C secure-area CRC-16 of [0x4000..0x7FFF], 0x80 total used size, 0x84 header size, 0xC0 Nintendo logo, 0x15C logo CRC fixed 0xCF56, 0x15E header CRC-16 of [0x000..0x15D]; CRC-16 (GetCRC16) init 0xFFFF with reflected table ending in 0xA001. (source: https://problemkaputt.de/gbatek-ds-cartridge-header.htm and gbatek-bios-misc-functions.htm; devkitPro ndstool header.h)
- [high] BlocksDS component licenses: libnds Zlib, Maxmod ISC, DSWiFi MIT (+lwIP BSD-3, Mbed TLS Apache-2.0/GPL-2.0+), LibXM7 MIT, crts MPL-2.0, default ARM7 Zlib, default Makefiles CC0-1.0, picolibc BSD-like, libgcc/libstdc++ GPL-3 with runtime exception; ndstool GPL-3.0, grit GPL-2.0, BlocksDS mmutil ISC. (source: https://blocksds.skylyrac.net/docs/guides/licenses/ (raw licenses.md); GitHub API license fields for blocksds/ndstool, blocksds/grit, blocksds/mmutil; SPDX headers in Makefiles)
- [high] devkitPro Getting Started says 'Please do not distribute the binaries you obtain that way or recommend that people do this instead of using pacman', and the Trademarks page says any modified/deconstructed installation 'is no longer a devkitPro product and may not use the trademarks at all' and 'you may not distribute GPL binaries without corresponding source code'. (source: https://devkitpro.org/wiki/Getting_Started and https://devkitpro.org/wiki/Trademarks (fetched via curl with browser UA))
- [high] devkitPro MSYS2 setup: DEVKITPRO=/opt/devkitpro, DEVKITARM=/opt/devkitpro/devkitARM; pacman-key --recv BC26F752D25B92CE272E0F44F7FD5492264BB9D0 --keyserver keyserver.ubuntu.com; pacman-key --lsign ...; pacman -U https://pkg.devkitpro.org/devkitpro-keyring.pkg.tar.zst; add [dkp-libs] Server = https://pkg.devkitpro.org/packages and [dkp-windows] Server = https://pkg.devkitpro.org/packages/windows/$arch/; pacman -Syu; pacman -S nds-dev. (source: https://devkitpro.org/wiki/devkitPro_pacman)
- [high] Current devkitPro packages: devkitARM r68-1 (devkitarm-gcc 16.1.0-1, devkitarm-binutils 2.46.0-1, devkitarm-newlib 4.6.0.20260123-5), libnds 2.0.2-1 (zlib), calico 1.2.0-1 (ZPL), default-arm7 0.8.4-4, maxmod-nds 2.1.0-2, dswifi 2.1.0-1, libfat-nds 2.1.0-4, ndstool 2.3.1-1 (GPL), grit 0.10.0-1, mmutil 1.10.1-1, dstools 1.3.3-3, nds-examples 20241110-1, devkitARM-gdb 14.1-1. (source: https://pkg.devkitpro.org/packages/dkp-libs.db and /packages/windows/x86_64/dkp-windows.db downloaded and parsed on 2026-09-24)
- [high] devkitPro ds_rules builds ROMs with `ndstool -c $@ -9 $< -7 $(CALICO)/bin/ds7_maine.elf -b $(GAME_ICON) "$(GAME_TITLE);$(GAME_SUBTITLE1);$(GAME_SUBTITLE2)" -d $(NITRO_FILES)` and the nds-examples template uses ARCH -march=armv5te -mtune=arm946e-s with -specs=ds_arm9.specs. (source: https://raw.githubusercontent.com/devkitPro/devkitarm-rules/master/ds_rules; nds-examples templates/arm9/Makefile)
- [high] devkitPro Windows installer latest release is v3.0.3 (2018-06-03), asset devkitProUpdater-3.0.3.exe; devkitARM r67 (Dec 2025) was GCC 15.2.0 and split devkitARM into binutils/newlib/gcc packages. (source: GitHub API devkitPro/installer releases/latest; https://devkitpro.org/viewtopic.php?p=18683)
- [high] BlocksDS grit example flags: sprites `-gB8 -gt -gTFF00FF -m!`; regular bg with map `-gB8 -gt -m -mLs -gTFF00FF`; metatiles `-Mh2 -Mw2`; ext palette `-mp7`; 16-bit bitmap `-gB16 -gb -gT!`; texture `-gx -gb -gB8 -gTFF00FF`; Huffman `-gzh`; shared palette `-pS`; GRF output `-ftr`; runtime loads GRF with grfLoadPath(). (source: BlocksDS examples/*.grit files fetched raw; blocksds/grit srcgrit/grit_main.cpp; libnds include/nds/arm9/grf.h; examples/graphics_2d/bg_regular_nitrofs/source/main.c)
- [high] mmutil usage: `mmutil -d input1.xm input2.it -osoundbank.bin -hsoundbank.h`; -d NDS mode, -b test ROM, -m MAS, -i, -v, -p, -z; BlocksDS example loads it with mmInitDefault("nitro:/soundbank.bin") after nitroFSInit(NULL). (source: blocksds/mmutil readme.md; examples/maxmod/nitrofs/source/main.c)
- [high] melonDS 1.1 released 2025-11-18 (repo pushed 2026-08-23); CLI: positional nds ROM, -f fullscreen, -b auto|always|never; DeSmuME latest release 0.9.13 (2022-05-23), CLI options include --start-paused, --load-slot, --slot1-fat-dir, --arm9gdb/--arm7gdb (GDB_STUB builds only). (source: GitHub API releases; melonDS src/frontend/qt_sdl/CLI.cpp; desmume desmume/src/commandline.cpp)
- [high] BlocksDS FAQ recommends melonDS, DeSmuME and no$gba; BlocksDS uses picolibc; NitroFS on flashcarts needs DLDI + argv[0]; on emulators it works via card commands. (source: https://blocksds.skylyrac.net/docs/guides/faq/ and tutorial/intermediate/nitrofs/)
- [high] Local machine: C:\msys64 has bash/make/pacman/ucrt64 gcc, base-devel 2024.11-1 and ca-certificates 20250419-1 installed, /opt is empty; C:\devkitPro\devkitARM\bin holds only as/nm/objcopy/objdump. (source: Local ls and pacman -Q on 2026-09-24)
- [medium] GCC 16 defaults to gnu23 for C and gnu++17 for C++ when no -std is given (BlocksDS and devkitPro Makefiles pass none). (source: GCC release notes (GCC 15 switched C default to gnu23); not re-verified for 16 in this session)

## Open questions
- The BlocksDS toolchain was not actually installed or exercised on this machine (that would download several hundred MB into C:\msys64); the hello-world Makefile and direct gcc/ndstool commands are derived from the SDK's own Makefile and must be smoke-tested after install, including whether ds_arm9.specs resolves crt0/linker scripts via the BLOCKSDS env var when gcc is invoked outside the Wonderful shell.
- Whether the official DeSmuME 0.9.13 Windows build was compiled with GDB_STUB (the --arm9gdb flag exists in source but is conditional); melonDS's GDB stub is confirmed via its settings UI.
- Silent-install flags for wf-bootstrap-windows-x86_64.exe (/VERYSILENT /DIR=C:\msys64) follow standard Inno Setup behaviour but were not tested; wf-pacman --noconfirm behaviour under a non-interactive bash also needs a test.
- Exact size of the BlocksDS runtime needed to push FNT/FAT past 0x8000 for a minimal interpreter ROM (ndstool handles it automatically because ARM9 starts at 0x4000 with a 0x4000 header, but a tiny ARM9 plus a 0x200 header could place the FAT below 0x8000 and make nitroFSInit fail; verify with `ndstool -i`).
- Whether to expose NightFox's Lib (blocksds-nflib, sprites/backgrounds/infinite maps) as the runtime's 2D layer instead of raw libnds oam*/bg* calls; its license and API were not reviewed here.
- ArchitectDS (Python 3 + ninja) could replace hand-written Makefiles for the runtime build and already converts grit output straight into NitroFS GRF files; its license and Windows behaviour were not verified.
- The devkitPro wiki pages returned HTTP 403 to automated fetchers (worked with a browser User-Agent); any IDE feature that scrapes them should not rely on that.
