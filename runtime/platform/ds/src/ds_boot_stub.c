// SPDX-License-Identifier: Zlib
//
// ADR-pending ADR-0004: until C11 names the core's entry point and WS2's loader lands, this stub checks the DSDB
// header (contracts/dsdb.md section 2) and prints DSD|READY, so the platform path (NitroFS, log writer, flush pad)
// runs on both emulators before the core does. It is deleted when main.c calls the core.

#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "builtins_table.h"
#include "ds_boot_stub.h"
#include "ds_log.h"
#include "ds_platform.h"

#define DSD_GAME_PATH "nitro:/game.dsdb"

static uint32_t ds_le32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

void ds_boot_stub_run(void)
{
    uint8_t header[32];

    FILE *f = fopen(DSD_GAME_PATH, "rb");
    if (f == NULL)
        ds_fatal(DSD_R_DSDB_MISSING, "The game's code is missing from the ROM. Build the game again.");
    size_t n = fread(header, 1, sizeof(header), f);
    fclose(f);

    if (n != sizeof(header) || memcmp(header, "DSDB", 4) != 0 || (header[4] | (header[5] << 8)) != 0)
        ds_fatal(DSD_R_DSDB_MISSING, "The game's code is damaged. Build the game again.");

    // The loader's words (docs/kickoff/ws2.md task 2); the code is WS2's to assign.
    if (ds_le32(header + 8) != DSD_ABI_HASH)
        ds_fatal(DSD_R_DSDB_MISSING, "This ROM was built for a different DSDude runtime. Build the game again.");

    ds_log_linef("DSD|READY|%s|%08lx", DSD_RUNTIME_VERSION, (unsigned long)DSD_ABI_HASH);
}
