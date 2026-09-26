// SPDX-License-Identifier: Zlib
//
// DS or DSi mode, and the ARM9 clock (ds_sys.h).

#include <stdio.h>

#include <nds.h>

#include "ds_sys.h"

bool ds_sys_dsi_mode(void)
{
    return isDSiMode();
}

uint32_t ds_sys_arm9_mhz(void)
{
    // SCFG registers exist only in DSi mode; in DS mode the ARM9 always runs at 67 MHz.
    return isDSiMode() && (REG_SCFG_CLK & SCFG_CLK_ARM9_TWL) ? 134u : 67u;
}

uint32_t ds_sys_force_67mhz(void)
{
    uint32_t was = ds_sys_arm9_mhz();
    if (isDSiMode())
        setCpuClock(false);
    return was;
}

const char *ds_sys_describe(void)
{
    static char text[32];
    snprintf(text, sizeof(text), "%s mode, ARM9 %lu MHz", isDSiMode() ? "DSi" : "DS", (unsigned long)ds_sys_arm9_mhz());
    return text;
}
