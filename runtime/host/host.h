// host.h: the host runner's platform layer (runtime/host), shared by dsdude-host (main.c) and the host test runner
// (runtime/tests). Host-only code: it may use stdio and the C library freely, never from runtime/core.
#ifndef DSD_HOST_H
#define DSD_HOST_H

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>

#include "dsd_limits.h"
#include "dsd_platform.h"

// ---- Key scripts (--input; format in contracts/log-protocol.md "Host runner") -----------------------------------
#define HOST_KEY_CHANGES_MAX 8192 // lines in one key script
#define HOST_KEY_ERR_MAX 160      // longest parse error message

// From `frame` on (until the next change), the input is `input`.
typedef struct HostKeyChange {
    uint32_t frame;
    dsd_input input;
} HostKeyChange;

typedef struct HostKeyScript {
    HostKeyChange changes[HOST_KEY_CHANGES_MAX];
    uint32_t count;
} HostKeyScript;

// Parses a key script. Returns true, or false with a "line N: ..." message in err.
bool host_keys_parse(HostKeyScript *ks, const char *text, uint32_t len, char *err, uint32_t err_cap);
// The input held at `frame` (nothing held and no touch before the first change).
void host_keys_state(const HostKeyScript *ks, uint32_t frame, dsd_input *out);
// Parses one input spec ("-", "a+right", "T128,96", "b+T3,4") into *out. False when malformed.
bool host_keys_spec(const char *spec, uint32_t len, dsd_input *out);

// ---- Configuration ----------------------------------------------------------------------------------------------

// Receives every protocol line (with its '\n') instead of stdout, e.g. to capture output in tests.
typedef void (*HostLogSink)(const char *line, uint32_t len, void *ctx);

typedef struct HostConfig {
    const char *root;            // the NitroFS directory, or a .dsdb file served as game.dsdb
    uint32_t seed;               // what dsd_plat_rng_seed returns (--seed N)
    const HostKeyScript *keys;   // NULL: no input
    HostLogSink sink;            // NULL: write lines to stdout
    void *sink_ctx;
} HostConfig;

// Applies a configuration and resets the frame counter and the fatal flag. Call before dsd_game_boot.
void host_configure(const HostConfig *cfg);
// True after the core called dsd_plat_fatal.
bool host_fatal_seen(void);
// Frames completed (dsd_plat_frame_end calls).
uint32_t host_frame_count(void);

// Longest file path the host builds.
#define HOST_PATH_MAX 1024
// The host path of NitroFS path `path` (the root directory plus the path). False when the root is a .dsdb file,
// which has no NitroFS directory (only "game.dsdb" resolves, to the root itself).
bool host_nitro_path(const char *path, char *full, size_t cap);

// ---- Shadow OAM ---------------------------------------------------------------------------------------------------

// The last list the core submitted for one screen (dsd_plat_oam_submit), kept for tests and the PNG renderer.
typedef struct HostScreenOam {
    dsd_oam_entry list[DSD_C13_SPRITES_PER_SCREEN];
    uint32_t n;
    dsd_affine affine[DSD_C13_AFFINE_PER_SCREEN];
    uint32_t naffine;
} HostScreenOam;

// Screen `screen`'s last submitted shadow OAM (empty before the first Draw stage and after a room's assets are
// freed).
const HostScreenOam *host_oam(uint32_t screen);

// ---- Graphics state and screens (gfx.c, png.c; contracts/log-protocol.md "Screens") ------------------------------

// Pixels of one rendered screen: RGB555 (bit 15 clear), row-major.
typedef uint16_t HostScreen[DSD_SCREEN_H][DSD_SCREEN_W];

// Forgets every loaded sprite and background, the OAM lists and the UI maps (host_configure calls it).
void host_gfx_reset(void);
// Frees the room's sprites and backgrounds and forgets the OAM lists (dsd_plat_assets_free's graphics half).
void host_gfx_free(void);

// ---- Music (a model of maxmod's module player, for tests of rule 8) --------------------------------------------

#define HOST_NO_MUSIC (-1)
// The module playing now (a soundbank id), or HOST_NO_MUSIC. Modules loop, so one keeps playing until stopped.
int32_t host_music_playing(void);
// How many times dsd_plat_music_play started a module since host_configure.
uint32_t host_music_starts(void);
// Composes screen `screen` as the DS shows it after the last dsd_plat_frame_end: the backdrop (black), the room
// background (BG1), the sprites (OAM entry 0 in front) and the UI layer (BG0) on top. A sprite whose GRF is not
// in the NitroFS directory (a .dsdb root) draws as the outline of its OBJ box in HOST_PLACEHOLDER_RGB.
void host_render_screen(uint32_t screen, HostScreen out);
// Writes an RGB555 image as an 8-bit RGB PNG (each channel c5 becomes c5 << 3 | c5 >> 2). False on an I/O error.
bool host_png_write(const char *path, const uint16_t *pixels, uint32_t width, uint32_t height);
// Renders both screens into `dir` (created if missing) as top.png and bottom.png. False on an I/O error.
bool host_png_screens(const char *dir);

// ---- Traces (--trace; schema in contracts/log-protocol.md "Traces") ---------------------------------------------

// Writes frame `frame`'s JSON line (engine state at the end of the frame) to f. Returns false on a write error.
bool host_trace_frame(FILE *f, uint32_t frame);

#endif // DSD_HOST_H
