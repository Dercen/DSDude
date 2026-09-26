// platform.c: dsd_platform.h (C11) for the headless host runner. Deterministic by construction: no clocks, no
// real input, the RNG seed from --seed. Graphics, UI and sound calls are recorded later for PNG frames and traces
// (WS2 task 6); for now they accept everything and draw nothing.
#include <stdio.h>
#include <string.h>

#include "dsd_platform.h"
#include "host.h"

#define PATH_MAX_BYTES 1024           // longest file path the host builds
#define DSDB_SUFFIX ".dsdb"           // a root ending in this is served as game.dsdb
#define DSDB_NAME "game.dsdb"
#define MS_PER_SECOND 1000u
#define FRAMES_PER_SECOND 60u

static HostConfig g_cfg;
static uint32_t g_frame;    // frames completed
static bool g_fatal;        // dsd_plat_fatal was called

void host_configure(const HostConfig *cfg) {
    g_cfg = *cfg;
    g_frame = 0;
    g_fatal = false;
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

void dsd_plat_frame_begin(void) {}

void dsd_plat_frame_end(void) { g_frame++; }

void dsd_plat_read_input(dsd_input *out) { host_keys_state(g_cfg.keys, g_frame, out); }

int32_t dsd_plat_read_file(const char *path, void *buf, uint32_t cap) {
    char full[PATH_MAX_BYTES];
    if (ends_with(g_cfg.root, DSDB_SUFFIX) && strcmp(path, DSDB_NAME) == 0) {
        snprintf(full, sizeof full, "%s", g_cfg.root);
    } else {
        snprintf(full, sizeof full, "%s/%s", g_cfg.root, path);
    }
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

// ---- Graphics, UI, sound (recorded in task 6) -------------------------------------------------------------------

int32_t dsd_plat_sprite_load(uint32_t screen, const char *grf_path, dsd_sprite_info *info) {
    (void)screen;
    (void)grf_path;
    memset(info, 0, sizeof *info);
    return DSD_PLAT_ELOAD;
}

int32_t dsd_plat_bg_load(uint32_t screen, const char *grf_path) {
    (void)screen;
    (void)grf_path;
    return DSD_PLAT_ELOAD;
}

void dsd_plat_bg_scroll(uint32_t screen, int32_t x, int32_t y) {
    (void)screen;
    (void)x;
    (void)y;
}

void dsd_plat_oam_submit(uint32_t screen, const dsd_oam_entry *list, uint32_t n, const dsd_affine *affine,
                         uint32_t naffine) {
    (void)screen;
    (void)list;
    (void)n;
    (void)affine;
    (void)naffine;
}

void dsd_plat_ui_text(uint32_t screen, int32_t cx, int32_t cy, const char *str, uint32_t len, uint32_t colour) {
    (void)screen;
    (void)cx;
    (void)cy;
    (void)str;
    (void)len;
    (void)colour;
}

void dsd_plat_ui_fill(uint32_t screen, int32_t cx, int32_t cy, int32_t cw, int32_t ch, uint32_t colour) {
    (void)screen;
    (void)cx;
    (void)cy;
    (void)cw;
    (void)ch;
    (void)colour;
}

void dsd_plat_ui_clear(uint32_t screen) { (void)screen; }

int32_t dsd_plat_sfx_play(uint32_t sound_id) {
    (void)sound_id;
    return 0;
}

void dsd_plat_sfx_stop(uint32_t sound_id) { (void)sound_id; }

void dsd_plat_music_play(uint32_t module_id) { (void)module_id; }

void dsd_plat_music_stop(void) {}

void dsd_plat_volume(int32_t volume_fx) { (void)volume_fx; }

void dsd_plat_screens_blank(bool blank) { (void)blank; }

void dsd_plat_assets_free(void) {}

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
