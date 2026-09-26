// game.h: the core's top level: boot (load game.dsdb, DSD|READY, program form) and the per-frame entry the
// platform's main loop calls. The DS main (WS3) and the host runner (runtime/host/main.c) both drive it:
//
//     int32_t st = dsd_game_boot();
//     while (st == DSD_GAME_RUNNING) st = dsd_game_frame();
#ifndef DSD_GAME_H
#define DSD_GAME_H

#include <stdint.h>

#include "vm.h"

// Runtime version printed in DSD|READY (C8).
#define DSD_RUNTIME_VERSION "0.1.0"

// Game states returned by boot and frame.
#define DSD_GAME_RUNNING 0 // a room game: call dsd_game_frame() for the next frame
#define DSD_GAME_EXITED 1  // DSD|EXIT printed (program form finished, game_end, HALT)
#define DSD_GAME_FAILED 2  // DSD|ERR printed and dsd_plat_fatal called

// Initialises the platform, loads and checks game.dsdb, prints DSD|READY and seeds the RNG. A program-form DSDB
// then runs __main once and prints DSD|EXIT|0. Safe to call again (the host tests boot many programs).
int32_t dsd_game_boot(void);
// Runs one frame of a room game (contracts/events.md section 2); returns the new state.
int32_t dsd_game_frame(void);
// The running VM (for the host runner's trace and the tests).
const DsdVm *dsd_game_vm(void);

#endif // DSD_GAME_H
