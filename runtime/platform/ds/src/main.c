// SPDX-License-Identifier: Zlib
//
// The DSDude runtime's ARM9 entry point (WS3). Picks the log protocol and hands over to the core: dsd_core_main
// (C11 0.2.0) runs dsd_plat_init, loads game.dsdb, prints DSD|READY and runs the frames until the game ends.

#include <string.h>

#include <nds.h>

#include "dsd_platform.h"
#include "ds_log.h"
#include "ds_mem.h"
#include "ds_platform.h"
#include "ds_ui.h"
#include "ds_video.h"

#ifdef DSD_SCREENLOG
// Hardware test builds (runtime/Makefile DSD_SCREENLOG=1): every DSD| line also goes to the bottom screen, since
// hardware has no stdout. The shipped runtime never contains this.
static void ds_screen_tap(const char *line, size_t len)
{
    char text[33];
    size_t skip = strncmp(line, "DSD|", 4) == 0 ? 4 : 0; // "LOG|hello" is easier to read than "DSD|LOG|hello"
    size_t n = len - skip < sizeof(text) - 1 ? len - skip : sizeof(text) - 1;
    memcpy(text, line + skip, n);
    text[n] = '\0';
    ds_ui_console_add(text);
}
#endif

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    ds_cstack_paint();
    ds_log_init();
#ifdef DSD_SCREENLOG
    ds_log_set_tap(ds_screen_tap);
    ds_screen_log = true;
#endif

    // START on the error box (dsd_plat_fatal) jumps back here, and the game starts again from scratch: the core
    // re-initialises its state on entry, dsd_plat_init resets video and assets.
    setjmp(ds_restart_point);
    ds_restart_armed = true;
    dsd_core_main();

    // The game ended (DSD|EXIT) or failed without an error box: keep the last frame on screen.
    for (;;)
    {
#ifdef DSD_SCREENLOG
        ds_ui_clear(DS_BOTTOM);
        ds_ui_console_draw_titled(DS_BOTTOM, "DSDude log (hardware build)");
        swiWaitForVBlank();
        ds_ui_commit();
#else
        swiWaitForVBlank();
#endif
    }
}
