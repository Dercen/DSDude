// game.c: the core's top level (game.h): load game.dsdb, print DSD|READY, seed the RNG, run a program-form __main.
// Room games (OBJS/ROOM) run in the engine (engine.c), one dsd_game_frame per frame.
#include "game.h"

#include "dsd_log.h"
#include "engine.h"
#include "dsd_platform.h"
#include "dsd_random.h"
#include "errors.h"

#define DSDB_PATH "game.dsdb"  // NitroFS root (C3)
#define MAIN_FUNC 0u           // FUNC 0 is __main in program form (C2)
#define EXIT_NORMAL 0          // DSD|EXIT code for a normal end

// The DSDB image: 4-byte aligned, because the loader reads its records in place.
static _Alignas(4) uint8_t g_dsdb[DSD_C13_DSDB_MAX_BYTES];
static DsdProgram g_prog;
static DsdWorld g_world;
static DsdVm g_vm;
// The 4 KB register stack (DTCM on the DS, PLAN.md 3.3).
DSD_DTCM_BSS static DsdValue g_regs[DSD_RT_REG_STACK_CELLS];
// Current state, so dsd_game_frame after an end does nothing.
static int32_t g_state = DSD_GAME_EXITED;

// Reports the VM's error and marks the game failed.
static int32_t fail_vm(void) {
    dsd_report_vm_error(&g_vm);
    g_state = DSD_GAME_FAILED;
    return g_state;
}

// Reports a load error (R58x) and marks the game failed.
static int32_t fail_load(int32_t code, const char *detail) {
    dsd_report_load_error(code, detail);
    g_state = DSD_GAME_FAILED;
    return g_state;
}

// A platform start-up failure (dsd_plat_init), reported like an engine error with no object, event or file.
static int32_t fail_init(int32_t rc) {
    if (rc != DSD_PLAT_ELOAD) return fail_load(DSD_R_NO_FILE, "file system");
    dsd_fatal f = {"R571", "", "", "soundbank.bin", 0, "soundbank.bin could not be loaded"};
    dsd_log_error(&f);
    dsd_plat_fatal(&f);
    g_state = DSD_GAME_FAILED;
    return g_state;
}

int32_t dsd_game_boot(void) {
    int32_t rc = dsd_plat_init();
    if (rc != DSD_PLAT_OK) return fail_init(rc);
    int32_t size = dsd_plat_read_file(DSDB_PATH, g_dsdb, sizeof g_dsdb);
    if (size == DSD_PLAT_ETOOBIG) return fail_load(DSD_R_FILE_TOO_BIG, DSDB_PATH);
    if (size < 0) return fail_load(DSD_R_NO_FILE, DSDB_PATH);
    DsdLoadError err;
    if (dsd_load(&g_prog, g_dsdb, (uint32_t)size, &err) != DSD_R_NONE) return fail_load(err.code, err.detail);
    if (g_prog.glob_count > DSD_RT_GLOBALS_MAX) return fail_load(DSD_R_FILE_TOO_BIG, "globals");
    if (dsd_world_load(&g_world, &g_prog, &err) != DSD_R_NONE) return fail_load(err.code, err.detail);

    dsd_log_ready();
    // A non-zero header seed (a build with --seed N) always wins over the platform's (C2, C11).
    dsd_rng_seed(g_prog.seed != 0 ? g_prog.seed : dsd_plat_rng_seed());
    dsd_vm_init(&g_vm, &g_prog, g_regs);

    if (g_prog.first_room != DSDB_NONE) {
        g_state = dsd_engine_boot(&g_vm, &g_prog, &g_world);
        return g_state == DSD_GAME_FAILED ? fail_vm() : g_state;
    }

    // Program form: __main once, then DSD|EXIT|0 (C2, C8).
    DsdValue result;
    dsd_vm_frame_reset(&g_vm);
    if (dsd_vm_call(&g_vm, MAIN_FUNC, 0, 0, &result) != DSD_R_NONE) return fail_vm();
    dsd_log_exit(EXIT_NORMAL);
    g_state = DSD_GAME_EXITED;
    return g_state;
}

int32_t dsd_game_frame(void) {
    if (g_state != DSD_GAME_RUNNING) return g_state;
    g_state = dsd_engine_frame();
    return g_state == DSD_GAME_FAILED ? fail_vm() : g_state;
}

const DsdVm *dsd_game_vm(void) { return &g_vm; }

int dsd_core_main(void) {
    int32_t st = dsd_game_boot();
    while (st == DSD_GAME_RUNNING) st = dsd_game_frame();
    return st == DSD_GAME_EXITED ? 0 : 1;
}
