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

// The first call runs the boot order of PLAN.md 3.3, nitroFSInit -> soundEnable() -> mmInitDefault
// ("nitro:/soundbank.bin", only when that file exists), and returns DSD_PLAT_OK, DSD_PLAT_ENOENT (NitroFS not
// mounted; errno is logged as a DSD|LOG line) or DSD_PLAT_ELOAD (the soundbank did not load). Later calls return the
// first result: NitroFS and maxmod are started once per power-on, also across restarts.
int32_t ds_platform_init(void);

// The red error box on the bottom screen for an error whose DSD|ERR line is already printed, then a wait for
// START, which restarts through ds_restart_point (or waits forever when nothing is armed).
__attribute__((noreturn)) void ds_error_screen(const char *code, const char *where, const char *message);

#endif // DSD_DS_PLATFORM_H
