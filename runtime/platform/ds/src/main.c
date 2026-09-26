// SPDX-License-Identifier: Zlib
//
// The DSDude runtime's ARM9 entry point (WS3). Picks the log protocol and hands over to the core: dsd_core_main
// (C11 0.2.0) runs dsd_plat_init, loads game.dsdb, prints DSD|READY and runs the frames until the game ends.

#include <nds.h>

#include "dsd_platform.h"
#include "ds_log.h"
#include "ds_mem.h"
#include "ds_platform.h"

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    ds_cstack_paint();
    ds_log_init();

    // START on the error box (dsd_plat_fatal) jumps back here, and the game starts again from scratch: the core
    // re-initialises its state on entry, dsd_plat_init resets video and assets.
    setjmp(ds_restart_point);
    ds_restart_armed = true;
    dsd_core_main();

    // The game ended (DSD|EXIT) or failed without an error box: keep the last frame on screen.
    for (;;)
        swiWaitForVBlank();
}
