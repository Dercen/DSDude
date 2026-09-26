// SPDX-License-Identifier: Zlib
//
// ds_platform.h: the DS platform layer's private interface (WS3). The public seam is WS2's C11 dsd_platform.h;
// this header holds what main.c and the platform files share.

#ifndef DSD_DS_PLATFORM_H
#define DSD_DS_PLATFORM_H

#include <setjmp.h>
#include <stdbool.h>

// Platform R5xx codes. ADR-pending ADR-0004: proposed to WS2 for runtime/core/diagnostics/catalog.json.
#define DSD_R_NITROFS "R580"      // NitroFS could not be mounted
#define DSD_R_DSDB_MISSING "R581" // nitro:/game.dsdb missing, damaged or built for another runtime
#define DSD_R_SOUNDBANK "R582"    // mmInitDefault("nitro:/soundbank.bin") failed
#define DSD_R_SFX_LOAD "R583"     // mmLoadEffect returned 1 (bad id) or 2 (load failed)

// Whether nitro:/soundbank.bin was found and maxmod initialised (a game without sounds has no soundbank).
extern bool ds_sound_ready;

// Where START on the error box jumps back to (main sets it with setjmp, then ds_restart_armed = true).
extern jmp_buf ds_restart_point;
extern bool ds_restart_armed;

// Boot order (PLAN.md 3.3): nitroFSInit -> soundEnable() -> mmInitDefault("nitro:/soundbank.bin"), each result
// checked. A failure is fatal (ds_fatal). Call after ds_video_init and ds_ui_init, so the error box can show.
void ds_platform_init(void);

// Prints `DSD|ERR|<code>||||0|<message>` (a platform error has no object, event or file), shows the red error
// box on the bottom screen, and waits for START, which restarts through ds_restart_point (or waits forever when
// nothing is armed). '|' in `message` is kept: the message is the line's last field (C8).
__attribute__((noreturn)) void ds_fatal(const char *code, const char *message);

// The error box and START wait alone, for an error whose DSD|ERR line was already printed (the core's errors).
__attribute__((noreturn)) void ds_error_screen(const char *code, const char *where, const char *message);

#endif // DSD_DS_PLATFORM_H
