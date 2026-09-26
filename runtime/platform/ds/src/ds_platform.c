// SPDX-License-Identifier: Zlib
//
// DS platform init and fatal errors (PLAN.md 3.3 "Audio", "Errors and console"; docs/kickoff/ws3.md task 2).

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <filesystem.h>
#include <maxmod9.h>
#include <nds.h>

#include "ds_log.h"
#include "ds_platform.h"
#include "ds_ui.h"
#include "ds_video.h"

#define DSD_SOUNDBANK_PATH "nitro:/soundbank.bin"

bool ds_sound_ready = false;
jmp_buf ds_restart_point;
bool ds_restart_armed = false;

static char ds_msg[256];

void ds_error_screen(const char *code, const char *where, const char *message)
{
    if (ds_sound_ready)
        mmStop();
    for (int s = 0; s < DS_SCREENS; s++)
    {
        oamClear(ds_oam(s), 0, 128);
        oamUpdate(ds_oam(s));
    }
    ds_ui_error_box(code, where, message);
    swiWaitForVBlank();
    ds_ui_commit();

    // Wait until START is released, then pressed, so a held START does not restart at once.
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

void ds_fatal(const char *code, const char *message)
{
    ds_log_linef("DSD|ERR|%s||||0|%s", code, message);
    ds_error_screen(code, "", message);
}

static bool ds_file_exists(const char *path)
{
    FILE *f = fopen(path, "rb");
    if (f == NULL)
        return false;
    fclose(f);
    return true;
}

void ds_platform_init(void)
{
    // NULL: nitroFSInit uses argv[0], then falls back to the other ways of finding the ROM (filesystem.h).
    if (!nitroFSInit(NULL))
    {
        int err = errno;
        snprintf(ds_msg, sizeof(ds_msg), "The game's files could not be opened (%s). Build the game again.",
                 strerror(err));
        ds_fatal(DSD_R_NITROFS, ds_msg);
    }

    soundEnable();

    // A game without sounds packs no soundbank; then maxmod stays off and sound calls do nothing.
    if (ds_file_exists(DSD_SOUNDBANK_PATH))
    {
        if (!mmInitDefault(DSD_SOUNDBANK_PATH))
            ds_fatal(DSD_R_SOUNDBANK, "The game's sounds could not be loaded. Build the game again.");
        ds_sound_ready = true;
    }
}
