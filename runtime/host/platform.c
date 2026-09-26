// platform.c: dsd_platform.h (C11) for the headless host runner. Deterministic by construction: no clocks, no
// real input, the RNG seed from --seed. Graphics and the UI layer live in gfx.c (recorded for tests and --png-dir);
// sound calls accept everything and play nothing.
#include <stdio.h>
#include <string.h>

#include "dsd_platform.h"
#include "host.h"

#define DSDB_SUFFIX ".dsdb"           // a root ending in this is served as game.dsdb
#define DSDB_NAME "game.dsdb"
#define MS_PER_SECOND 1000u
#define FRAMES_PER_SECOND 60u

static HostConfig g_cfg;
static int32_t g_music = HOST_NO_MUSIC; // the module playing (dsd_plat_music_play .. dsd_plat_music_stop)
static uint32_t g_music_starts;         // dsd_plat_music_play calls since host_configure
static uint32_t g_frame;    // frames completed
static bool g_fatal;        // dsd_plat_fatal was called

void host_configure(const HostConfig *cfg) {
    g_cfg = *cfg;
    g_frame = 0;
    g_fatal = false;
    host_gfx_reset();
    g_music = HOST_NO_MUSIC;
    g_music_starts = 0;
}

bool host_fatal_seen(void) { return g_fatal; }

uint32_t host_frame_count(void) { return g_frame; }

// True when s ends with suffix.
static bool ends_with(const char *s, const char *suffix) {
    size_t n = strlen(s);
    size_t m = strlen(suffix);
    return n >= m && strcmp(s + n - m, suffix) == 0;
}

// ---- Lifecycle, input, files ------------------------------------------------------------------------------------

int32_t dsd_plat_init(void) { return g_cfg.root != NULL ? DSD_PLAT_OK : DSD_PLAT_ENOENT; }

void dsd_plat_frame_end(void) { g_frame++; }

void dsd_plat_read_input(dsd_input *out) { host_keys_state(g_cfg.keys, g_frame, out); }

bool host_nitro_path(const char *path, char *full, size_t cap) {
    // A .dsdb root has no NitroFS directory: only game.dsdb exists (served from the root itself).
    if (ends_with(g_cfg.root, DSDB_SUFFIX)) {
        if (strcmp(path, DSDB_NAME) != 0) return false;
        snprintf(full, cap, "%s", g_cfg.root);
        return true;
    }
    snprintf(full, cap, "%s/%s", g_cfg.root, path);
    return true;
}

int32_t dsd_plat_read_file(const char *path, void *buf, uint32_t cap) {
    char full[HOST_PATH_MAX];
    if (!host_nitro_path(path, full, sizeof full)) return DSD_PLAT_ENOENT;
    FILE *f = fopen(full, "rb");
    if (f == NULL) return DSD_PLAT_ENOENT;
    int32_t rc = DSD_PLAT_EIO;
    if (fseek(f, 0, SEEK_END) == 0) {
        long size = ftell(f);
        if (size >= 0 && (unsigned long)size > cap) {
            rc = DSD_PLAT_ETOOBIG;
        } else if (size >= 0 && fseek(f, 0, SEEK_SET) == 0 && fread(buf, 1, (size_t)size, f) == (size_t)size) {
            rc = (int32_t)size;
        }
    }
    fclose(f);
    return rc;
}

// ---- Log --------------------------------------------------------------------------------------------------------

void dsd_plat_log(const char *line, uint32_t len) {
    if (g_cfg.sink != NULL) g_cfg.sink(line, len, g_cfg.sink_ctx);
    else fwrite(line, 1, len, stdout);
}

void dsd_plat_log_flush(void) {
    if (g_cfg.sink == NULL) fflush(stdout); // the host prints no DSD|PAD| lines (C8 "Host runner")
}

void dsd_plat_fatal(const dsd_fatal *err) {
    (void)err; // already printed as DSD|ERR by the core
    g_fatal = true;
}

void dsd_plat_mem_report(dsd_mem_report *out) { memset(out, 0, sizeof *out); }

// ---- Sound ------------------------------------------------------------------------------------------------------

int32_t dsd_plat_sfx_play(uint32_t sound_id) {
    (void)sound_id;
    return 0;
}

void dsd_plat_sfx_stop(uint32_t sound_id) { (void)sound_id; }

void dsd_plat_music_play(uint32_t module_id) {
    g_music = (int32_t)module_id; // starts it from the beginning, replacing any module playing
    g_music_starts++;
}

void dsd_plat_music_stop(void) { g_music = HOST_NO_MUSIC; }

bool dsd_plat_music_active(void) { return g_music != HOST_NO_MUSIC; }

int32_t host_music_playing(void) { return g_music; }

uint32_t host_music_starts(void) { return g_music_starts; }

void dsd_plat_assets_free(void) {
    host_gfx_free();
    dsd_plat_music_stop(); // C11: freeing a room's assets stops its music
}

void dsd_plat_volume(int32_t volume_fx) { (void)volume_fx; }


int32_t dsd_plat_sfx_load(uint32_t sound_id) {
    (void)sound_id;
    return DSD_PLAT_OK;
}

int32_t dsd_plat_music_load(uint32_t module_id) {
    (void)module_id;
    return DSD_PLAT_OK;
}

// ---- Time and randomness ----------------------------------------------------------------------------------------

// Frame-based, so host runs never depend on the wall clock.
uint32_t dsd_plat_millis(void) { return g_frame * MS_PER_SECOND / FRAMES_PER_SECOND; }

uint32_t dsd_plat_rng_seed(void) { return g_cfg.seed; }
