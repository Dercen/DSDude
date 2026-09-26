// test_programs.c: whole-program runs through dsd_game_boot on the host platform, compared with goldens:
//   - conformance tiers: only the DSD|LOG| lines, against fixtures/conformance/expected/** (contract C6), for WS2's
//     hand-assembled programs and for WS4's compiler output (fixtures/compiler/conformance, reached by merging WS4);
//   - runtime fixtures (fixtures/bytecode/*.out, fixtures/bytecode/runtime/*.out): the full output, READY and
//     EXIT/ERR included, so error codes, object/event/file/line and messages are pinned.
#include <stdio.h>
#include <string.h>

#include "collision.h"
#include "drawlist.h"
#include "engine.h"
#include "fixed.h"
#include "font8x8.h"
#include "game.h"
#include "host.h"
#include "test.h"

// Captured protocol output of one run.
#define CAPTURE_MAX (256 * 1024)
#define EXPECT_MAX (256 * 1024)
#define TRACE_MAX (1024 * 1024) // a 600-frame trace (~210 KB for Flappy)
#define LOG_PREFIX "DSD|LOG|"
#define RUN_SEED 1u // every run passes a seed (CLAUDE.md: always --seed N)
#define DRAW_FRAMES 60 // tier v4 runs: one DSD|STAT period
#define CONFORMANCE_FRAMES 100 // upper bound for the room-game conformance programs (they exit sooner)
#define STRESS_FRAMES 180 // v4-03-stress: three DSD|STAT periods
#define DSDB_ABI_OFFSET 8 // the ABI hash in a DSDB header (contracts/dsdb.md, header word 2)
#define DSDB_ABI_BYTES 4
#define FNV_OFFSET 0x811C9DC5u // FNV-1a 32 offset basis
#define FNV_PRIME 0x01000193u  // FNV-1a 32 prime

static char g_capture[CAPTURE_MAX];
static uint32_t g_capture_len;
static char g_expected[EXPECT_MAX];
static char g_filtered[CAPTURE_MAX];

// HostLogSink: appends each line to g_capture.
static void capture(const char *line, uint32_t len, void *ctx) {
    (void)ctx;
    if (g_capture_len + len >= CAPTURE_MAX) return;
    memcpy(g_capture + g_capture_len, line, len);
    g_capture_len += len;
    g_capture[g_capture_len] = '\0';
}

// Key script of the running case (static: the host keeps a pointer to it).
static HostKeyScript g_keys;
static char g_key_text[EXPECT_MAX];

// Boots one program with output captured, runs up to `frames` frames with the key script `keys` (or none), and
// returns the game state.
static int32_t run_frames(const char *root, uint32_t frames, const char *keys) {
    g_capture_len = 0;
    g_capture[0] = '\0';
    const HostKeyScript *ks = NULL;
    if (keys != NULL) {
        char err[HOST_KEY_ERR_MAX];
        int32_t n = dsd_test_read_file(keys, g_key_text, sizeof g_key_text);
        if (!CHECK(n >= 0) || !CHECK(host_keys_parse(&g_keys, g_key_text, (uint32_t)n, err, sizeof err))) return -1;
        ks = &g_keys;
    }
    HostConfig cfg = {root, RUN_SEED, ks, capture, NULL};
    host_configure(&cfg);
    int32_t st = dsd_game_boot();
    for (uint32_t f = 0; f < frames && st == DSD_GAME_RUNNING; f++) st = dsd_game_frame();
    return st;
}

static int32_t run_program(const char *root) { return run_frames(root, 0, NULL); }

// Keeps only the lines of `text` that start with `prefix`, into out.
static void keep_lines(const char *text, const char *prefix, char *out, uint32_t cap) {
    uint32_t n = 0;
    size_t plen = strlen(prefix);
    while (*text != '\0') {
        const char *nl = strchr(text, '\n');
        size_t len = nl ? (size_t)(nl - text) + 1 : strlen(text);
        if (strncmp(text, prefix, plen) == 0 && n + len < cap) {
            memcpy(out + n, text, len);
            n += (uint32_t)len;
        }
        text += len;
    }
    out[n] = '\0';
}

// Reads an expected-output file with '\r' removed (goldens compare after stripping \r).
static bool read_expected(const char *path) {
    int32_t n = dsd_test_read_file(path, g_expected, EXPECT_MAX - 1);
    if (!CHECK(n >= 0)) return false;
    uint32_t w = 0;
    for (int32_t i = 0; i < n; i++) {
        if (g_expected[i] != '\r') g_expected[w++] = g_expected[i];
    }
    g_expected[w] = '\0';
    return true;
}

// One program and its golden.
typedef struct ProgramCase {
    const char *dsdb;
    const char *expected;
    bool log_only;     // compare only DSD|LOG| lines (conformance goldens)
    int32_t state;     // the final state: DSD_GAME_EXITED, DSD_GAME_FAILED, or DSD_GAME_RUNNING after `frames`
    uint32_t frames;   // frames to run a room game for (--frames); 0 for program form
    const char *keys;  // key script (--input), or NULL
} ProgramCase;

static const ProgramCase CASES[] = {
    {"fixtures/bytecode/hello.dsdb", "fixtures/bytecode/hello.out", false, DSD_GAME_EXITED, 0, NULL},
    {"fixtures/bytecode/conformance/v0-01.dsdb", "fixtures/conformance/expected/v0/01-arith.log", true,
     DSD_GAME_EXITED, 0, NULL},
    {"fixtures/bytecode/conformance/v0-02.dsdb", "fixtures/conformance/expected/v0/02-fixed.log", true,
     DSD_GAME_EXITED, 0, NULL},
    {"fixtures/bytecode/conformance/v0-03.dsdb", "fixtures/conformance/expected/v0/03-compare.log", true,
     DSD_GAME_EXITED, 0, NULL},
    {"fixtures/bytecode/conformance/v0-04.dsdb", "fixtures/conformance/expected/v0/04-control.log", true,
     DSD_GAME_EXITED, 0, NULL},
    {"fixtures/bytecode/conformance/v0-05.dsdb", "fixtures/conformance/expected/v0/05-functions.log", true,
     DSD_GAME_EXITED, 0, NULL},
    // WS4's compiler output for the same programs (fixtures/compiler, regenerated by WS4): compiler + runtime.
    {"fixtures/compiler/conformance/v0/01-arith.dsdb", "fixtures/conformance/expected/v0/01-arith.log", true,
     DSD_GAME_EXITED, 0, NULL},
    {"fixtures/compiler/conformance/v0/02-fixed.dsdb", "fixtures/conformance/expected/v0/02-fixed.log", true,
     DSD_GAME_EXITED, 0, NULL},
    {"fixtures/compiler/conformance/v0/03-compare.dsdb", "fixtures/conformance/expected/v0/03-compare.log", true,
     DSD_GAME_EXITED, 0, NULL},
    {"fixtures/compiler/conformance/v0/04-control.dsdb", "fixtures/conformance/expected/v0/04-control.log", true,
     DSD_GAME_EXITED, 0, NULL},
    {"fixtures/compiler/conformance/v0/05-functions.dsdb", "fixtures/conformance/expected/v0/05-functions.log",
     true, DSD_GAME_EXITED, 0, NULL},
    // WS4's programs 6-10 (tiers v1-v4). The room games end themselves (DSD|EXIT) well within CONFORMANCE_FRAMES.
    {"fixtures/compiler/conformance/v1/06-strings.dsdb", "fixtures/conformance/expected/v1/06-strings.log", true,
     DSD_GAME_EXITED, 0, NULL},
    {"fixtures/compiler/conformance/v1/07-arrays.dsdb", "fixtures/conformance/expected/v1/07-arrays.log", true,
     DSD_GAME_EXITED, 0, NULL},
    {"fixtures/compiler/conformance/v2/08-instances.dsdb", "fixtures/conformance/expected/v2/08-instances.log",
     true, DSD_GAME_EXITED, CONFORMANCE_FRAMES, NULL},
    {"fixtures/compiler/conformance/v3/09-with.dsdb", "fixtures/conformance/expected/v3/09-with.log", true,
     DSD_GAME_EXITED, CONFORMANCE_FRAMES, NULL},
    {"fixtures/compiler/conformance/v4/10-rooms.dsdb", "fixtures/conformance/expected/v4/10-rooms.log", true,
     DSD_GAME_EXITED, CONFORMANCE_FRAMES, NULL},
    // Tier v1 (strings and arrays), hand-assembled by WS2 before WS4's programs 6-10 landed; kept as runtime goldens.
    {"fixtures/bytecode/v1-01-strings.dsdb", "fixtures/bytecode/v1-01-strings.out", false, DSD_GAME_EXITED, 0, NULL},
    {"fixtures/bytecode/v1-02-arrays.dsdb", "fixtures/bytecode/v1-02-arrays.out", false, DSD_GAME_EXITED, 0, NULL},
    {"fixtures/bytecode/v1-03-collector.dsdb", "fixtures/bytecode/v1-03-collector.out", false, DSD_GAME_EXITED, 0, NULL},
    {"fixtures/bytecode/runtime/err-index.dsdb", "fixtures/bytecode/runtime/err-index.out", false, DSD_GAME_FAILED, 0, NULL},
    {"fixtures/bytecode/runtime/err-not-a-list.dsdb", "fixtures/bytecode/runtime/err-not-a-list.out", false,
     DSD_GAME_FAILED, 0, NULL},
    // Tier v2 (instances and events), hand-assembled room games: full output after the given frames.
    {"fixtures/bytecode/v2-01-lifecycle.dsdb", "fixtures/bytecode/v2-01-lifecycle.out", false, DSD_GAME_RUNNING, 3, NULL},
    {"fixtures/bytecode/v2-02-with.dsdb", "fixtures/bytecode/v2-02-with.out", false, DSD_GAME_RUNNING, 1, NULL},
    {"fixtures/bytecode/v2-03-rooms.dsdb", "fixtures/bytecode/v2-03-rooms.out", false, DSD_GAME_RUNNING, 3, NULL},
    {"fixtures/bytecode/v2-04-end.dsdb", "fixtures/bytecode/v2-04-end.out", false, DSD_GAME_EXITED, 5, NULL},
    {"fixtures/bytecode/v2-05-input.dsdb", "fixtures/bytecode/v2-05-input.out", false, DSD_GAME_RUNNING, 10,
     "fixtures/bytecode/v2-05-input.keys"},
    {"fixtures/bytecode/v2-06-motion.dsdb", "fixtures/bytecode/v2-06-motion.out", false, DSD_GAME_RUNNING, 3, NULL},
    // Tier v3 (collisions, places, animation, Outside Room, touch), room games with SPRG sprite geometry.
    {"fixtures/bytecode/v3-01-collide.dsdb", "fixtures/bytecode/v3-01-collide.out", false, DSD_GAME_RUNNING, 15, NULL},
    {"fixtures/bytecode/v3-02-anim-outside-touch.dsdb", "fixtures/bytecode/v3-02-anim-outside-touch.out", false,
     DSD_GAME_RUNNING, 10, "fixtures/bytecode/v3-02-anim-outside-touch.keys"},
    // Tier v4 (draw): 60 frames, so the golden pins one DSD|STAT line with the sprite counts.
    {"fixtures/bytecode/v4-01-draw.dsdb", "fixtures/bytecode/v4-01-draw.out", false, DSD_GAME_RUNNING, DRAW_FRAMES, NULL},
    {"fixtures/bytecode/v4-02-caps.dsdb", "fixtures/bytecode/v4-02-caps.out", false, DSD_GAME_RUNNING, DRAW_FRAMES, NULL},
    // 320 instances with collisions that move and destroy: the golden matches the pre-broadphase direct checks.
    {"fixtures/bytecode/v4-03-stress.dsdb", "fixtures/bytecode/v4-03-stress.out", false, DSD_GAME_RUNNING,
     STRESS_FRAMES, NULL},
    {"fixtures/bytecode/bench.dsdb", "fixtures/bytecode/bench.out", false, DSD_GAME_RUNNING, 2, NULL},
    {"fixtures/bytecode/runtime/err-unset-slot.dsdb", "fixtures/bytecode/runtime/err-unset-slot.out", false,
     DSD_GAME_FAILED, 2, NULL},
    {"fixtures/bytecode/runtime/cmpj.dsdb", "fixtures/bytecode/runtime/cmpj.out", false, DSD_GAME_EXITED, 0, NULL},
    {"fixtures/bytecode/runtime/strings.dsdb", "fixtures/bytecode/runtime/strings.out", false, DSD_GAME_EXITED, 0, NULL},
    {"fixtures/bytecode/runtime/err-assert.dsdb", "fixtures/bytecode/runtime/err-assert.out", false,
     DSD_GAME_FAILED, 0, NULL},
    {"fixtures/bytecode/runtime/err-compare.dsdb", "fixtures/bytecode/runtime/err-compare.out", false,
     DSD_GAME_FAILED, 0, NULL},
    {"fixtures/bytecode/runtime/err-divzero.dsdb", "fixtures/bytecode/runtime/err-divzero.out", false,
     DSD_GAME_FAILED, 0, NULL},
    {"fixtures/bytecode/runtime/err-draw-not-loaded.dsdb", "fixtures/bytecode/runtime/err-draw-not-loaded.out", false,
     DSD_GAME_FAILED, 1, NULL},
    // Spike 12's numeric harness: the same lines from every host build (-O2, trap, -O0) and from the DS.
    {"fixtures/bytecode/runtime/numeric-hashes.dsdb", "fixtures/bytecode/runtime/numeric-hashes.out", false,
     DSD_GAME_EXITED, 0, NULL},
    // Debug arithmetic (header flags 0): the first overflow stops the game with R520 (test_release_flag runs the
    // same program as a release build).
    {"fixtures/bytecode/runtime/wrap.dsdb", "fixtures/bytecode/runtime/wrap.out", false, DSD_GAME_FAILED, 0, NULL},
    {"fixtures/bytecode/runtime/err-overflow.dsdb", "fixtures/bytecode/runtime/err-overflow.out", false,
     DSD_GAME_FAILED, 0, NULL},
    {"fixtures/bytecode/runtime/err-recursion.dsdb", "fixtures/bytecode/runtime/err-recursion.out", false,
     DSD_GAME_FAILED, 0, NULL},
    {"fixtures/bytecode/runtime/err-string-plus-number.dsdb", "fixtures/bytecode/runtime/err-string-plus-number.out",
     false, DSD_GAME_FAILED, 0, NULL},
    {"fixtures/bytecode/runtime/err-unset-global.dsdb", "fixtures/bytecode/runtime/err-unset-global.out", false,
     DSD_GAME_FAILED, 0, NULL},
    {"fixtures/bytecode/runtime/err-watchdog.dsdb", "fixtures/bytecode/runtime/err-watchdog.out", false,
     DSD_GAME_FAILED, 0, NULL},
};

static void test_cases(void) {
    for (size_t i = 0; i < sizeof CASES / sizeof CASES[0]; i++) {
        const ProgramCase *c = &CASES[i];
        int32_t st = run_frames(c->dsdb, c->frames, c->keys);
        if (!dsd_test_check_i64(st, c->state, __FILE__, __LINE__, c->dsdb)) continue;
        dsd_test_check_i64(host_fatal_seen(), c->state == DSD_GAME_FAILED, __FILE__, __LINE__, c->dsdb);
        if (!read_expected(c->expected)) continue;
        dsd_test_mask_abi(g_capture);
        dsd_test_mask_abi(g_expected);
        if (c->log_only) {
            keep_lines(g_capture, LOG_PREFIX, g_filtered, sizeof g_filtered);
            dsd_test_check_str(g_filtered, g_expected, __FILE__, __LINE__, c->dsdb);
        } else {
            dsd_test_check_str(g_capture, g_expected, __FILE__, __LINE__, c->dsdb);
        }
    }
}

static void test_missing_file(void) {
    CHECK_EQ(run_program("fixtures/bytecode/no-such-game.dsdb"), DSD_GAME_FAILED);
    CHECK_STR(g_capture, "DSD|ERR|R584|||game.dsdb|0|The game file could not be read (game.dsdb)\n");
    CHECK(host_fatal_seen());
}

static void test_core_main(void) {
    // C11 0.2.0: the DS entry point runs the whole game; 0 after DSD|EXIT, 1 after DSD|ERR.
    HostConfig cfg = {"fixtures/bytecode/hello.dsdb", RUN_SEED, NULL, capture, NULL};
    g_capture_len = 0;
    host_configure(&cfg);
    CHECK_EQ(dsd_core_main(), 0);
    static char hello[CAPTURE_MAX];
    snprintf(hello, sizeof hello, "%sDSD|LOG|hello\nDSD|EXIT|0\n", dsd_test_ready_line());
    CHECK_STR(g_capture, hello);
    // No file system (the host's dsd_plat_init fails without a root): R584, and dsd_core_main returns 1.
    HostConfig none = {NULL, RUN_SEED, NULL, capture, NULL};
    g_capture_len = 0;
    g_capture[0] = '\0';
    host_configure(&none);
    CHECK_EQ(dsd_core_main(), 1);
    CHECK_STR(g_capture, "DSD|ERR|R584|||game.dsdb|0|The game file could not be read (file system)\n");
}

static void test_repeatable(void) {
    // Booting again resets every piece of state: the second run prints the same bytes.
    static char first[CAPTURE_MAX];
    run_program("fixtures/bytecode/conformance/v0-05.dsdb");
    memcpy(first, g_capture, g_capture_len + 1);
    run_program("fixtures/bytecode/conformance/v0-05.dsdb");
    CHECK_STR(g_capture, first);
}

static void test_collector_ran(void) {
    // v1-03 makes ~2.3 MB of short-lived text in a 192 KB arena: the collector must have run, and the output (checked
    // in test_cases) shows the live list survived it.
    run_program("fixtures/bytecode/v1-03-collector.dsdb");
    CHECK(dsd_game_vm()->heap.collections > 0);
}

// Runs a room game for `frames` frames writing its --trace to `path` (under runtime/build-host/, which exists
// whenever the tests run). False when the trace could not be written.
static bool trace_run(const char *dsdb, uint32_t frames, const char *keys, const char *path) {
    FILE *f = fopen(path, "wb");
    if (f == NULL) return false;
    g_capture_len = 0;
    char err[HOST_KEY_ERR_MAX];
    int32_t n = dsd_test_read_file(keys, g_key_text, sizeof g_key_text);
    bool ok = n >= 0 && host_keys_parse(&g_keys, g_key_text, (uint32_t)n, err, sizeof err);
    HostConfig cfg = {dsdb, RUN_SEED, &g_keys, capture, NULL};
    host_configure(&cfg);
    int32_t st = dsd_game_boot();
    for (uint32_t fr = 0; ok && fr < frames && st == DSD_GAME_RUNNING; fr++) {
        st = dsd_game_frame();
        ok = st != DSD_GAME_FAILED && host_trace_frame(f, fr);
    }
    return fclose(f) == 0 && ok;
}

// FNV-1a 32 of n bytes (the same hash C2 uses for the ABI hash).
static uint32_t fnv1a(const char *p, int32_t n) {
    uint32_t h = FNV_OFFSET;
    for (int32_t i = 0; i < n; i++) {
        h ^= (uint8_t)p[i];
        h *= FNV_PRIME;
    }
    return h;
}

static void test_flappy_deterministic(void) {
    // The DoD run on the host: WS4's compiled Flappy, 600 frames, the DoD key script. Two runs must trace
    // identically, and while flappy.dsdb is the one the fingerprints were made from, the trace must match them: the
    // Linux and MinGW builds then agree byte for byte (the DoD's cross-compiler identity check).
    static char a[TRACE_MAX];
    static char b[TRACE_MAX];
    static char dsdb_bytes[EXPECT_MAX];
    const char *dsdb = "fixtures/compiler/samples/flappy.dsdb";
    const char *keys = "fixtures/runtime-core/flappy-keys.txt";
    if (!CHECK(trace_run(dsdb, 600, keys, "runtime/build-host/flappy-a.jsonl"))) return;
    if (!CHECK(trace_run(dsdb, 600, keys, "runtime/build-host/flappy-b.jsonl"))) return;
    int32_t na = dsd_test_read_file("runtime/build-host/flappy-a.jsonl", a, TRACE_MAX);
    int32_t nb = dsd_test_read_file("runtime/build-host/flappy-b.jsonl", b, TRACE_MAX);
    CHECK(na > 0 && na == nb && memcmp(a, b, (size_t)na) == 0);
    // Fingerprints: "dsdb 0x........" and "trace 0x........ <bytes>".
    char want[EXPECT_MAX];
    int32_t nw = dsd_test_read_file("fixtures/runtime-core/flappy-trace.fnv", want, EXPECT_MAX - 1);
    int32_t nd = dsd_test_read_file(dsdb, dsdb_bytes, EXPECT_MAX);
    if (!CHECK(nw > 0 && nd > DSDB_ABI_OFFSET + DSDB_ABI_BYTES)) return;
    want[nw] = '\0';
    // The ABI hash field is zeroed first: an append to builtins.json changes it in every DSDB without changing
    // what Flappy does, so the trace check keeps running.
    memset(dsdb_bytes + DSDB_ABI_OFFSET, 0, DSDB_ABI_BYTES);
    char got[EXPECT_MAX];
    snprintf(got, sizeof got, "dsdb 0x%08x\ntrace 0x%08x %d\n", (unsigned)fnv1a(dsdb_bytes, nd), (unsigned)fnv1a(a, na),
             (int)na);
    // The trace line decides: an unchanged trace passes whatever happened to the DSDB bytes. A changed trace fails,
    // unless the DSDB changed too (WS4 recompiled Flappy): then it is noted and skipped until WS2 re-pins it.
    const char *want_trace = strchr(want, '\n');
    const char *got_trace = strchr(got, '\n');
    if (want_trace != NULL && got_trace != NULL && strcmp(want_trace, got_trace) == 0) return;
    if (strncmp(got, want, strlen("dsdb 0x00000000")) != 0) {
        printf("note: %s changed since fixtures/runtime-core/flappy-trace.fnv was made and so did its trace; the\n"
               "      trace check is skipped. Check and re-pin it (fixtures/runtime-core/README.md); the new\n"
               "      fingerprints are:\n%s",
               dsdb, got);
        return;
    }
    if (!CHECK_STR(got, want)) printf("      the trace is runtime/build-host/flappy-a.jsonl\n");
}

// ---- Tier v4: the shadow OAM (drawlist.c) -------------------------------------------------------------------------

// Sprite assets of v4-01-draw.dsda in ASET order, and the flag combinations the checks expect.
#define SPR_A 0u
#define SPR_C 1u
#define SPR_W 2u
#define FLIPS (DSD_OAM_HFLIP | DSD_OAM_VFLIP)
#define ROTATED (DSD_OAM_AFFINE | DSD_OAM_DOUBLE)
#define AFFINE_ONE 256 // 1.0 in an 8.8 affine parameter

// Checks one OAM entry against the expected position, sprite, frame and flags (priority 1: sprites in 0.1).
static void check_entry(const dsd_oam_entry *o, uint32_t screen, uint32_t sprite, int32_t x, int32_t y,
                        uint32_t frame, uint32_t flags, int line) {
    const char *what = "OAM entry (failures report the checking line)";
    dsd_test_check_i64(o->x, x, __FILE__, line, what);
    dsd_test_check_i64(o->y, y, __FILE__, line, what);
    dsd_test_check_i64(o->sprite, dsd_engine.sprite_handle[screen][sprite], __FILE__, line, what);
    dsd_test_check_i64(o->frame, frame, __FILE__, line, what);
    dsd_test_check_i64(o->flags, flags, __FILE__, line, what);
    dsd_test_check_i64(o->priority, 1, __FILE__, line, what);
}

static void test_draw_oam(void) {
    // v4-01-draw, top view (16, 0), bottom view (0, 8). Positions are derived by hand in fixtures/bytecode/README.md.
    CHECK_EQ(run_frames("fixtures/bytecode/v4-01-draw.dsdb", 1, NULL), DSD_GAME_RUNNING);
    const HostScreenOam *top = host_oam(DSD_SCREEN_TOP);
    const HostScreenOam *bot = host_oam(DSD_SCREEN_BOTTOM);
    if (CHECK_EQ(top->n, 6) && CHECK_EQ(top->naffine, 1)) {
        // depth -3: obj_rot, spr_c (12x10 in a 16x16 box, origin 2,3) at (128, 96) turned 90 degrees. Animation
        // (image_speed 1) ran before Draw, so image_index is 1.
        check_entry(&top->list[0], DSD_SCREEN_TOP, SPR_C, 101, 74, 1, ROTATED, __LINE__);
        CHECK_EQ(top->list[0].affine, 0);
        CHECK_EQ(top->affine[0].pa, 0);
        CHECK_EQ(top->affine[0].pb, -AFFINE_ONE);
        CHECK_EQ(top->affine[0].pc, AFFINE_ONE);
        CHECK_EQ(top->affine[0].pd, 0);
        // depth 0: obj_flip, both scales -1; image_index 4 + 1 wrapped past 3 frames to 2.
        check_entry(&top->list[1], DSD_SCREEN_TOP, SPR_C, 70, 47, 2, FLIPS, __LINE__);
        // depth 2: obj_drawer's calls in order (the 360-degree one needs no affine set; the off-screen one is gone).
        check_entry(&top->list[2], DSD_SCREEN_TOP, SPR_W, 184, 20, 0, 0, __LINE__);
        check_entry(&top->list[3], DSD_SCREEN_TOP, SPR_A, 6, 142, 0, 0, __LINE__);
        // depth 5: the two obj_plain instances by id (the invisible obj_hidden draws nothing).
        check_entry(&top->list[4], DSD_SCREEN_TOP, SPR_A, 16, 42, 0, 0, __LINE__);
        check_entry(&top->list[5], DSD_SCREEN_TOP, SPR_A, 36, 42, 0, 0, __LINE__);
    }
    if (CHECK_EQ(bot->n, 1)) check_entry(&bot->list[0], DSD_SCREEN_BOTTOM, SPR_A, 42, 44, 0, 0, __LINE__);

    // v4-02-caps: 130 rotated instances on one screen. 128 are shown (the last two by id are dropped), the first 32
    // take affine sets, the other 96 draw unrotated.
    CHECK_EQ(run_frames("fixtures/bytecode/v4-02-caps.dsdb", 1, NULL), DSD_GAME_RUNNING);
    top = host_oam(DSD_SCREEN_TOP);
    CHECK_EQ(dsd_draw_stats.sprites[DSD_SCREEN_TOP], DSD_C13_SPRITES_PER_SCREEN);
    CHECK_EQ(dsd_draw_stats.oam_drop, 2);
    CHECK_EQ(dsd_draw_stats.aff_drop, DSD_C13_SPRITES_PER_SCREEN - DSD_C13_AFFINE_PER_SCREEN);
    if (CHECK_EQ(top->n, DSD_C13_SPRITES_PER_SCREEN) && CHECK_EQ(top->naffine, DSD_C13_AFFINE_PER_SCREEN)) {
        // Instance 0 at (0, 50), origin at the box centre: the double-size area is centred there.
        check_entry(&top->list[0], DSD_SCREEN_TOP, SPR_A, -16, 34, 0, ROTATED, __LINE__);
        const dsd_affine *m = &top->affine[0];
        CHECK(m->pa == m->pd && m->pb == -m->pc && m->pa > 0 && m->pc > 0); // 45 degrees, scale 1
        CHECK_EQ(top->list[31].affine, 31);
        // Instance 32 at (32, 50) found no set left: drawn plain.
        check_entry(&top->list[32], DSD_SCREEN_TOP, SPR_A, 24, 42, 0, 0, __LINE__);
    }
}

// ---- Tier v4: screens (runtime/host/gfx.c, png.c; C8 "Screens") --------------------------------------------------

#define SCREENS_ROOT "fixtures/runtime-core/v4-screens"
#define SCREENS_DIR "runtime/build-host/screens" // exists whenever the tests run (the build directory)
#define FONT_BIN "runtime/data/font8x8.bin"
#define RGB555_YELLOW 0x03FFu        // c_yellow (31, 31, 0), red in the low bits as the DS stores it
#define RGB555_PLACEHOLDER 0x7C1Fu   // the host's outline for sprites without a GRF (magenta)
// Pinned renders of v4-screens after frame 1 (FNV-1a 32 over the RGB555 pixels, little-endian). The pixels were
// checked against the source PNGs by runtime/tests/check_screens.mjs (81,820 pixels exact, the rotated sprite
// within the DS's corner sampling); re-check with it before re-pinning.
#define SCREENS_TOP_FNV 0xee384e63u
#define SCREENS_PAN_FRAMES 5         // v4-screens in its second room, rm_pan
#define SCREENS_PAN_TOP_FNV 0x53d4e2d1u
#define SCREENS_PAN_BOTTOM_FNV 0xccea9dc5u
#define SCREENS_BOTTOM_FNV 0xa6e26ecdu
// A 256x192 RGB PNG from host_png_write: signature 8, IHDR 12 + 13, IDAT 12 + 2 + 192 * 769 + 3 stored-block
// headers of 5 + Adler-32 4, IEND 12.
#define SCREEN_PNG_BYTES (8 + 25 + 12 + 2 + 192 * 769 + 3 * 5 + 4 + 12)

static HostScreen g_screen;

// FNV-1a 32 of one rendered screen's pixels, byte order fixed (low byte first) so both compilers agree.
static uint32_t screen_hash(uint32_t screen) {
    host_render_screen(screen, g_screen);
    uint32_t h = FNV_OFFSET;
    for (int32_t y = 0; y < DSD_SCREEN_H; y++) {
        for (int32_t x = 0; x < DSD_SCREEN_W; x++) {
            h = (h ^ (g_screen[y][x] & 0xFFu)) * FNV_PRIME;
            h = (h ^ (uint32_t)(g_screen[y][x] >> 8)) * FNV_PRIME;
        }
    }
    return h;
}

static void test_screens(void) {
    // The host's font copy matches the DS build's.
    static char font[HOST_FONT_BYTES + 1];
    CHECK_EQ(dsd_test_read_file(FONT_BIN, font, sizeof font), HOST_FONT_BYTES);
    CHECK(memcmp(font, HOST_FONT8X8, HOST_FONT_BYTES) == 0);

    CHECK_EQ(run_frames(SCREENS_ROOT, 1, NULL), DSD_GAME_RUNNING);
    uint32_t top = screen_hash(DSD_SCREEN_TOP);
    // draw_rectangle's yellow cells, and the top view's rows past the background image (grit padding: backdrop).
    CHECK_EQ(g_screen[168][0], RGB555_YELLOW);
    CHECK_EQ(g_screen[190][0], 0);
    uint32_t bottom = screen_hash(DSD_SCREEN_BOTTOM);
    bool pinned = CHECK_EQ(top, SCREENS_TOP_FNV);
    pinned = CHECK_EQ(bottom, SCREENS_BOTTOM_FNV) && pinned;
    if (!pinned) {
        fprintf(stderr, "  v4-screens: top 0x%08x, bottom 0x%08x\n", top, bottom);
    }
    CHECK(host_png_screens(SCREENS_DIR));
    static char png[SCREEN_PNG_BYTES + 1];
    CHECK_EQ(dsd_test_read_file(SCREENS_DIR "/top.png", png, sizeof png), SCREEN_PNG_BYTES);
    CHECK(memcmp(png + 1, "PNG", 3) == 0 && memcmp(png + SCREEN_PNG_BYTES - 8, "IEND", 4) == 0);

    // Frame 5: room_goto at the end of frame 3 loaded rm_pan (a new asset set), whose Step pans the top view.
    CHECK_EQ(run_frames(SCREENS_ROOT, SCREENS_PAN_FRAMES, NULL), DSD_GAME_RUNNING);
    CHECK_EQ(dsd_engine.view_x[DSD_SCREEN_TOP], 6);
    CHECK_EQ(dsd_engine.view_y[DSD_SCREEN_TOP], 2);
    uint32_t pan_top = screen_hash(DSD_SCREEN_TOP);
    uint32_t pan_bottom = screen_hash(DSD_SCREEN_BOTTOM);
    CHECK_EQ(g_screen[0][0], 0); // the bottom screen has no background, sprites or UI left: all backdrop
    pinned = CHECK_EQ(pan_top, SCREENS_PAN_TOP_FNV);
    pinned = CHECK_EQ(pan_bottom, SCREENS_PAN_BOTTOM_FNV) && pinned;
    if (!pinned) fprintf(stderr, "  v4-screens frame 5: top 0x%08x, bottom 0x%08x\n", pan_top, pan_bottom);

    // Without GRFs (a .dsdb root) sprites draw as outlines of their boxes: v4-01's obj_plain at (16, 42).
    CHECK_EQ(run_frames("fixtures/bytecode/v4-01-draw.dsdb", 1, NULL), DSD_GAME_RUNNING);
    host_render_screen(DSD_SCREEN_TOP, g_screen);
    CHECK_EQ(g_screen[42][16], RGB555_PLACEHOLDER);
    CHECK_EQ(g_screen[43][17], 0);
}

// ---- The collision broadphase (collision.c) -----------------------------------------------------------------------

#define HUGE_SCALE (64 * DSD_FX_ONE) // 16x16 balls grown to 1024 pixels: every box covers every bucket

// Checks the broadphase's promise on the live instances: every same-screen pair with overlapping boxes is among
// the candidates, and candidate lists are ascending. Returns the number of overlapping pairs seen.
static uint32_t check_candidates(void) {
    static uint16_t snap[DSD_C13_INSTANCES_MAX];
    static uint16_t cand[DSD_C13_INSTANCES_MAX];
    static bool listed[DSD_C13_INSTANCES_MAX];
    const DsdWorld *w = dsd_engine.world;
    uint32_t n = dsd_instances.count;
    memcpy(snap, dsd_instances.order, n * sizeof snap[0]);
    dsd_coll_build(w, snap, n);
    uint32_t pairs = 0;
    bool ok = true;
    for (uint32_t i = 0; i < n; i++) {
        uint32_t m = dsd_coll_candidates(i, 0, cand);
        memset(listed, 0, sizeof listed);
        for (uint32_t c = 0; c < m; c++) {
            listed[cand[c]] = true;
            ok = ok && (c == 0 || cand[c - 1] < cand[c]);
        }
        DsdBox a;
        DsdBox b;
        if (!dsd_coll_box(i, &a)) continue;
        for (uint32_t j = 0; j < n; j++) {
            if (j == i || !dsd_coll_box(j, &b) || dsd_inst_at(snap[j])->screen != dsd_inst_at(snap[i])->screen) continue;
            if (!dsd_box_overlap(&a, &b)) continue;
            pairs++;
            ok = ok && listed[j];
        }
    }
    CHECK(ok);
    return pairs;
}

static void test_broadphase(void) {
    CHECK_EQ(run_frames("fixtures/bytecode/v4-03-stress.dsdb", DRAW_FRAMES, NULL), DSD_GAME_RUNNING);
    CHECK(check_candidates() > 0);
    // Huge boxes overflow the grid's entries: every instance becomes a candidate, still exact.
    for (uint32_t i = 0; i < dsd_instances.count; i++) {
        DsdInstance *in = dsd_inst_at(dsd_instances.order[i]);
        in->image_xscale = in->image_yscale = HUGE_SCALE;
    }
    CHECK(check_candidates() > 0);
}

// ---- Debug and release builds (ADR-pending ADR-0008: DSDB header flags bit 0) --------------------------------------

#define WRAP_DSDB "fixtures/bytecode/runtime/wrap.dsdb"
#define WRAP_RELEASE_COPY "runtime/build-host/wrap-release.dsdb" // the build directory exists whenever tests run
#define WRAP_BAD_COPY "runtime/build-host/wrap-bad-flags.dsdb"
#define HEADER_FLAGS_OFFSET 22 // contracts/dsdb.md section 2: u16 flags
#define FLAG_RELEASE 0x01u
#define FLAG_UNKNOWN 0x02u     // a bit no runtime knows yet

// Writes a copy of `src` with header flags `flags` (the low byte) to `dst`. False on an I/O error.
static bool write_with_flags(const char *src, const char *dst, uint8_t flags) {
    static char bytes[EXPECT_MAX];
    int32_t n = dsd_test_read_file(src, bytes, sizeof bytes);
    if (n <= HEADER_FLAGS_OFFSET) return false;
    bytes[HEADER_FLAGS_OFFSET] = (char)flags;
    FILE *f = fopen(dst, "wb");
    if (f == NULL) return false;
    bool ok = fwrite(bytes, 1, (size_t)n, f) == (size_t)n;
    return fclose(f) == 0 && ok;
}

static void test_release_flag(void) {
    // Release: every overflow wraps (int32 and Q20.12) and the program runs to the end.
    if (CHECK(write_with_flags(WRAP_DSDB, WRAP_RELEASE_COPY, FLAG_RELEASE))) {
        CHECK_EQ(run_program(WRAP_RELEASE_COPY), DSD_GAME_EXITED);
        if (CHECK(read_expected("fixtures/bytecode/runtime/wrap-release.out"))) {
            dsd_test_mask_abi(g_capture);
            dsd_test_mask_abi(g_expected);
            CHECK_STR(g_capture, g_expected);
        }
    }
    // An unknown flag means a newer format: refused like a different runtime (R581).
    if (CHECK(write_with_flags(WRAP_DSDB, WRAP_BAD_COPY, FLAG_UNKNOWN))) {
        CHECK_EQ(run_program(WRAP_BAD_COPY), DSD_GAME_FAILED);
        CHECK(strstr(g_capture, "DSD|ERR|R581|") != NULL);
    }
}

void suite_programs(void) {
    test_cases();
    test_collector_ran();
    test_draw_oam();
    test_screens();
    test_broadphase();
    test_release_flag();
    test_flappy_deterministic();
    test_missing_file();
    test_core_main();
    test_repeatable();
}
