// SPDX-License-Identifier: Zlib
//
// The DSDude runtime's ARM9 entry point (WS3). Picks the log protocol, runs the platform init, then hands over to
// the core.

#include <nds.h>

#include "ds_boot_stub.h"
#include "ds_log.h"
#include "ds_platform.h"

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    ds_log_init();

    videoSetMode(MODE_0_2D);
    videoSetModeSub(MODE_0_2D);
    setBackdropColor(RGB15(0, 0, 0));
    setBackdropColorSub(RGB15(0, 0, 0));

    ds_platform_init();

    // ADR-pending ADR-0004: the core's entry point is not named yet (C11); the stub loads game.dsdb's header and
    // prints DSD|READY until WS2's loader and VM replace it.
    ds_boot_stub_run();

    for (;;)
        swiWaitForVBlank();
}
