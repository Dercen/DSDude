// SPDX-License-Identifier: Zlib
//
// DS platform start-up and the error screen (PLAN.md 3.3 "Audio", "Errors and console"). The R5xx codes and the
// DSD|ERR line are the core's (C11 0.2.0: R584 file system, R571 soundbank).

#include <errno.h>
#include <stdio.h>
#include <string.h>

#include <fat.h>
#include <nds/arm9/dldi.h>
#include <filesystem.h>
#include <maxmod9.h>
#include <nds.h>

#include "dsd_platform.h"
#include "ds_log.h"
#include "ds_platform.h"
#include "ds_snd.h"
#include "ds_ui.h"
#include "ds_video.h"

#define DSD_SOUNDBANK_PATH "nitro:/soundbank.bin"

bool ds_sound_ready = false;
bool ds_nitrofs_optional = false;
char ds_boot_diag[256];
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

// NitroFS finds the ROM through argv[0] (the homebrew argv protocol) and, on an SD card, opens it through FAT: the
// DSi SD slot in DSi mode, a DLDI driver patched into the ROM by the loader in DS mode (BlocksDS filesystem guide).
// Emulators use card reads instead. Records each piece, so a photo of the error box says which one is missing.
static void collect_boot_diag(int nitro_errno)
{
    const struct __argv *a = __system_argv;
    bool has_argv = a->argvMagic == ARGV_MAGIC && a->argc >= 1 && a->argv != NULL && a->argv[0] != NULL;
    const char *name = io_dldi_data != NULL ? io_dldi_data->friendlyName : "(none)";
    bool fat_ok = fatInitDefault(); // diagnosis only: nitroFSInit already tried it when argv[0] named a FAT path
    snprintf(ds_boot_diag, sizeof(ds_boot_diag), "%s mode, argc=%d\nargv0=%.60s\nDLDI: %.40s\nFAT %s, errno %d (%.40s)",
             isDSiMode() ? "DSi" : "DS", has_argv ? a->argc : 0, has_argv ? a->argv[0] : "(no argv)", name,
             fat_ok ? "ok" : "failed", nitro_errno, strerror(nitro_errno));
    for (char *p = ds_boot_diag, *line = ds_boot_diag;; p++)
    {
        if (*p == '\n' || *p == '\0')
        {
            char keep = *p;
            *p = '\0';
            ds_log_linef("DSD|LOG|nitrofs: %s", line);
            *p = keep;
            if (keep == '\0')
                break;
            line = p + 1;
        }
    }
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
        // The core prints the R584 error; the reason is only known here, so it goes to the log and the box.
        collect_boot_diag(err);
        ds_start_result = ds_nitrofs_optional ? DSD_PLAT_OK : DSD_PLAT_ENOENT;
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
        ds_snd_index(DSD_SOUNDBANK_PATH); // sizes for DSD|MEM snd; a malformed table only leaves them 0
    }
    return ds_start_result;
}
