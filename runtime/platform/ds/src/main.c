// SPDX-License-Identifier: Zlib
//
// The DSDude runtime's ARM9 entry point (WS3). Picks the log protocol, sets up video, the UI layer and the platform
// (NitroFS, sound), then hands over to the core.

#include <nds.h>

#include "ds_boot_stub.h"
#include "ds_log.h"
#include "ds_mem.h"
#include "ds_platform.h"
#include "ds_ui.h"
#include "ds_video.h"

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    ds_cstack_paint();
    ds_log_init();
    ds_video_init();
    ds_ui_init();
    ds_platform_init();

    // START on the error box comes back here: video and the UI layer are reset, NitroFS and sound stay up.
    if (setjmp(ds_restart_point) != 0)
    {
        ds_video_init();
        ds_ui_init();
    }
    ds_restart_armed = true;

    // ADR-pending ADR-0004: the core's entry point is not named yet (C11); the stub loads game.dsdb's header and
    // prints DSD|READY until WS2's loader and VM replace it.
    ds_boot_stub_run();

    for (;;)
        swiWaitForVBlank();
}
