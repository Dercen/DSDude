// SPDX-License-Identifier: Zlib
//
// DS platform start-up and the error screen (PLAN.md 3.3 "Audio", "Errors and console"). The R5xx codes and the
// DSD|ERR line are the core's (C11 0.2.0: R584 file system, R571 soundbank).

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <filesystem.h>
#include <maxmod9.h>
#include <nds.h>

#include "dsd_platform.h"
#include "ds_log.h"
#include "ds_platform.h"
#include "ds_ui.h"
#include "ds_video.h"

#define DSD_SOUNDBANK_PATH "nitro:/soundbank.bin"

bool ds_sound_ready = false;
jmp_buf ds_restart_point;
bool ds_restart_armed = false;

static bool ds_started = false;
static int32_t ds_start_result = DSD_PLAT_OK;

void ds_error_screen(const char *code, const char *where, const char *message)
{
    if (ds_sound_ready)
    {
        mmStop();
        mmEffectCancelAll();
    }
    for (int s = 0; s < DS_SCREENS; s++)
    {
        oamClear(ds_oam(s), 0, 128);
        oamUpdate(ds_oam(s));
    }
    ds_set_brightness(0);
    ds_ui_clear(DS_TOP);
    ds_ui_error_box(code, where, message);
    swiWaitForVBlank();
    ds_ui_commit();

    // Wait until START is pressed (a press, not a held key), then restart.
    for (;;)
    {
        swiWaitForVBlank();
        scanKeys();
        if (keysDown() & KEY_START)
            break;
    }
    if (ds_restart_armed)
        longjmp(ds_restart_point, 1);
    for (;;)
        swiWaitForVBlank();
}

static bool ds_file_exists(const char *path)
{
    FILE *f = fopen(path, "rb");
    if (f == NULL)
        return false;
    fclose(f);
    return true;
}

int32_t ds_platform_init(void)
{
    if (ds_started)
        return ds_start_result;
    ds_started = true;

    // NULL: nitroFSInit uses argv[0], then falls back to the other ways of finding the ROM (filesystem.h).
    if (!nitroFSInit(NULL))
    {
        int err = errno;
        // The core prints the R584 error; the reason is only known here, so it goes to the log first.
        ds_log_linef("DSD|LOG|nitroFSInit failed: %s", strerror(err));
        ds_start_result = DSD_PLAT_ENOENT;
        return ds_start_result;
    }

    soundEnable();

    // A game without sounds packs no soundbank; then maxmod stays off and sound calls do nothing.
    if (ds_file_exists(DSD_SOUNDBANK_PATH))
    {
        if (!mmInitDefault(DSD_SOUNDBANK_PATH))
        {
            ds_start_result = DSD_PLAT_ELOAD;
            return ds_start_result;
        }
        ds_sound_ready = true;
    }
    return ds_start_result;
}
