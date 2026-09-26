// SPDX-License-Identifier: Zlib
//
// ds_platform.h: the DS platform layer's private interface (WS3). The public seam is WS2's C11 dsd_platform.h
// (implemented in ds_plat.c); this header holds what main.c, ds_plat.c and the selftest share.

#ifndef DSD_DS_PLATFORM_H
#define DSD_DS_PLATFORM_H

#include <setjmp.h>
#include <stdbool.h>
#include <stdint.h>

// Whether nitro:/soundbank.bin was found and maxmod initialised (a game without sounds has no soundbank).
extern bool ds_sound_ready;

// Where START on the error box jumps back to (main sets it with setjmp, then ds_restart_armed = true).
extern jmp_buf ds_restart_point;
extern bool ds_restart_armed;

// The M1 timer harness sets this: dsd_plat_frame_end then does the frame's CPU work (building OAM) but neither
// waits for VBlank nor commits to the hardware, so a timed run measures computation only.
extern bool ds_frame_nowait;

// The M1 timer harness sets this to read another NitroFS file whenever the core asks for "game.dsdb", so one ROM
// can boot several workloads in turn. NULL: no override.
extern const char *ds_game_file;

// The M1 timer harness sets this to serve "game.dsdb" from memory (a workload linked into the ELF), so it needs no
// NitroFS. NULL: no override. Checked before ds_game_file.
extern const void *ds_game_image;
extern uint32_t ds_game_image_size;

// Hardware test builds set this: dsd_plat_frame_end draws the mirrored log (ds_ui console) over the bottom screen.
extern bool ds_screen_log;

// Set by the M1 timer harness, whose workloads are linked into the ELF: a NitroFS that does not mount is then not an
// error (ds_platform_init returns DSD_PLAT_OK without sound), so the bench runs on any loader.
extern bool ds_nitrofs_optional;

// Why NitroFS did not mount, for the R584 error box and the log (empty when it mounted): DS/DSi mode, argc and
// argv[0] from the loader (the homebrew argv protocol), the DLDI driver's name, fatInitDefault's result and
// nitroFSInit's errno. Lines are separated by '\n'.
extern char ds_boot_diag[256];

// The first call runs the boot order of PLAN.md 3.3, nitroFSInit -> soundEnable() -> mmInitDefault
// ("nitro:/soundbank.bin", only when that file exists), and returns DSD_PLAT_OK, DSD_PLAT_ENOENT (NitroFS not
// mounted; errno is logged as a DSD|LOG line) or DSD_PLAT_ELOAD (the soundbank did not load). Later calls return the
// first result: NitroFS and maxmod are started once per power-on, also across restarts.
int32_t ds_platform_init(void);

// The red error box on the bottom screen for an error whose DSD|ERR line is already printed, then a wait for
// START, which restarts through ds_restart_point (or waits forever when nothing is armed).
__attribute__((noreturn)) void ds_error_screen(const char *code, const char *where, const char *message);

#endif // DSD_DS_PLATFORM_H
