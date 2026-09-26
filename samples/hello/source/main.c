// SPDX-License-Identifier: CC0-1.0
//
// samples/hello (C14): mounts NitroFS, reads nitro:/hello.txt and prints every line of it as DSD|LOG|<line>
// through the C8 writer, then the flush pad. Repacking another nitrofs folder changes the output without a
// compile (spike 8 packs a 300-character line and a line with '%'). If nitro:/nopad exists, the pad is skipped.
// Afterwards every key press prints DSD|LOG|key <buttons>, followed by the pad.
// Top screen: a solid blue backdrop. Bottom screen: a text console with the same information.

#include <stdio.h>
#include <string.h>

#include <filesystem.h>
#include <nds.h>

#include "dsd_log.h"

#define HELLO_MAX 8192

static char hello_text[HELLO_MAX + 1];

static bool file_exists(const char *path)
{
    FILE *f = fopen(path, "rb");
    if (f == NULL)
        return false;
    fclose(f);
    return true;
}

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    dsd_log_protocol protocol = dsd_log_init();

    videoSetMode(MODE_0_2D);
    setBackdropColor(RGB15(4, 12, 31));
    consoleDemoInit();

    printf("DSDude hello\n\n");
    printf("emulator: %s\n", dsd_log_emulator_id()[0] ? dsd_log_emulator_id() : "(none)");
    printf("log: %s\n\n", protocol == DSD_LOG_RAW ? "0x04FFFA10" : "legacy stub");

    bool pad = true;
    if (!nitroFSInit(NULL))
    {
        printf("nitroFSInit failed\n");
        dsd_log_line("DSD|LOG|hello: nitroFSInit failed");
    }
    else
    {
        pad = !file_exists("nitro:/nopad");
        FILE *f = fopen("nitro:/hello.txt", "rb");
        if (f == NULL)
        {
            printf("nitro:/hello.txt missing\n");
            dsd_log_line("DSD|LOG|hello: nitro:/hello.txt missing");
        }
        else
        {
            size_t n = fread(hello_text, 1, HELLO_MAX, f);
            fclose(f);
            hello_text[n] = '\0';
            // Drop one trailing newline so a file "hello\n" prints exactly DSD|LOG|hello.
            if (n > 0 && hello_text[n - 1] == '\n')
                hello_text[--n] = '\0';
            if (n > 0 && hello_text[n - 1] == '\r')
                hello_text[--n] = '\0';
            dsd_log_text("DSD|LOG|", hello_text);
            printf("%.200s\n", hello_text);
        }
    }

    if (pad)
        dsd_log_pad();

    // Each key press prints DSD|LOG|key <buttons> (the ADR-0003 button names), so an emulator's key map can be
    // checked from the log.
    static const char *const key_names[12] = {
        "A", "B", "SELECT", "START", "RIGHT", "LEFT", "UP", "DOWN", "R", "L", "X", "Y"
    };
    while (1)
    {
        swiWaitForVBlank();
        scanKeys();
        uint32_t down = keysDown();
        if ((down & 0x0FFF) == 0)
            continue;

        char line[96] = "DSD|LOG|key";
        for (int i = 0; i < 12; i++)
        {
            if (down & BIT(i))
            {
                strcat(line, " ");
                strcat(line, key_names[i]);
            }
        }
        dsd_log_line(line);
        printf("%s\n", line + 8);
        if (pad)
            dsd_log_pad();
    }
}
