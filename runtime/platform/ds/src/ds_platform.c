// SPDX-License-Identifier: Zlib
//
// DS platform init and fatal errors (PLAN.md 3.3 "Audio"; docs/kickoff/ws3.md task 2).

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <filesystem.h>
#include <maxmod9.h>
#include <nds.h>

#include "ds_log.h"
#include "ds_platform.h"

#define DSD_SOUNDBANK_PATH "nitro:/soundbank.bin"

bool ds_sound_ready = false;

static char ds_msg[256];

void ds_fatal(const char *code, const char *message)
{
    ds_log_linef("DSD|ERR|%s||||0|%s", code, message);
    // TODO(WS3 task 4): the red error box on the bottom screen with START to restart.
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
