// SPDX-License-Identifier: Zlib
//
// dsd_platform.h (C11 0.2.0) on the DS: libnds + maxmod behind the core's seam (PLAN.md 3.3, 5.2 C11). The core
// runs the frame loop; this file keeps the hardware state: sprites and palettes per screen, the submitted shadow
// OAM, the UI layer, BG1 scroll, loaded sounds.

#include <stdio.h>
#include <string.h>
#include <time.h>

#include <maxmod9.h>
#include <nds.h>

#include "dsd_platform.h"
#include "ds_gfx.h"
#include "ds_log.h"
#include "ds_mem.h"
#include "ds_platform.h"
#include "ds_snd.h"
#include "ds_ui.h"
#include "ds_video.h"

#ifdef DSD_SCRIPTED_INPUT
// Test builds only (runtime/Makefile DSD_SCRIPTED=1): input replays nitro:/input.keys per core frame, in the C8 key
// format, through WS2's own parser (runtime/host/keys.c, linked unchanged), so a host key script lines up with the
// DS frame for frame. The shipped runtime never contains this.
#include "host.h"
static HostKeyScript g_keys;
static bool g_keys_loaded;
static uint32_t g_core_frame; // frames completed since dsd_plat_init, the host's frame number
static char g_keys_text[64 * 1024];
static char g_keys_err[HOST_KEY_ERR_MAX];

static void load_key_script(void)
{
    g_keys_loaded = false;
    g_core_frame = 0;
    FILE *f = fopen("nitro:/input.keys", "rb");
    if (f == NULL)
        return;
    size_t n = fread(g_keys_text, 1, sizeof(g_keys_text) - 1, f);
    fclose(f);
    g_keys_loaded = host_keys_parse(&g_keys, g_keys_text, (uint32_t)n, g_keys_err, sizeof(g_keys_err));
    if (!g_keys_loaded)
        ds_log_linef("DSD|LOG|input.keys: %s", g_keys_err);
}
#endif

#define DS_MAX_SPRITES 128  // sprite handles per room (both screens)
#define DS_MAX_SOUNDS 64    // effects/modules loaded per room
#define DS_SFX_TRACKED 16   // effect handles kept for dsd_plat_sfx_stop (maxmod has 16 channels)
#define DS_OBJ_PALETTES 16  // per screen: 16 standard (4bpp) and 16 extended (8bpp) OBJ palettes
#define DS_PATH_MAX 160

typedef struct {
    ds_sprite spr;
    uint8_t screen;
    uint8_t palette; // standard palette (4bpp) or extended palette (8bpp) index
} ds_plat_sprite;

static ds_plat_sprite g_sprites[DS_MAX_SPRITES];
static uint32_t g_sprite_count;
static uint32_t g_pal16[DS_SCREENS], g_pal256[DS_SCREENS];

static dsd_oam_entry g_oam[DS_SCREENS][128];
static uint32_t g_oam_n[DS_SCREENS];
static dsd_affine g_aff[DS_SCREENS][32];
static uint32_t g_aff_n[DS_SCREENS];
static int32_t g_scroll_x[DS_SCREENS], g_scroll_y[DS_SCREENS];

static uint16_t g_sfx_loaded[DS_MAX_SOUNDS];
static uint32_t g_sfx_loaded_n;
static uint16_t g_mod_loaded[DS_MAX_SOUNDS];
static uint32_t g_mod_loaded_n;
static struct { mm_sfxhand handle; uint16_t id; } g_sfx_playing[DS_SFX_TRACKED];
static uint32_t g_sfx_next;
static mm_byte g_sfx_volume = 255;

bool ds_frame_nowait = false;

static volatile uint32_t g_vblanks;
static uint32_t g_vblanks_at_init;
static char g_path[DS_PATH_MAX];

static void on_vblank(void)
{
    g_vblanks++;
}

static const char *nitro_path(const char *path)
{
    snprintf(g_path, sizeof(g_path), "nitro:/%s", path);
    return g_path;
}

// ---- Lifecycle and frame ----------------------------------------------------------------------------------------

int32_t dsd_plat_init(void)
{
    // Also the restart path (START on the error box runs dsd_core_main again): reset video and every table.
    ds_video_init();
    ds_ui_init();
    dsd_plat_assets_free();
    memset(g_oam_n, 0, sizeof(g_oam_n));
    memset(g_aff_n, 0, sizeof(g_aff_n));
    memset(g_scroll_x, 0, sizeof(g_scroll_x));
    memset(g_scroll_y, 0, sizeof(g_scroll_y));
    g_sfx_volume = 255;
    irqSet(IRQ_VBLANK, on_vblank);
    irqEnable(IRQ_VBLANK);
    g_vblanks_at_init = g_vblanks;
    // NitroFS and maxmod start once; later calls return the first result.
    int32_t rc = ds_platform_init();
#ifdef DSD_SCRIPTED_INPUT
    if (rc == DSD_PLAT_OK)
        load_key_script();
#endif
    return rc;
}

void dsd_plat_frame_begin(void)
{
    ds_ui_clear(DS_TOP);
    ds_ui_clear(DS_BOTTOM);
}

// Copies a screen's submitted shadow OAM into libnds's OAM buffer (the core already sorted, capped and flagged it).
static void build_oam(int s)
{
    OamState *oam = ds_oam(s);
    oamClear(oam, 0, 128);
    for (uint32_t k = 0; k < g_aff_n[s]; k++)
        oamAffineTransformation(oam, (int)k, g_aff[s][k].pa, g_aff[s][k].pb, g_aff[s][k].pc, g_aff[s][k].pd);
    for (uint32_t i = 0; i < g_oam_n[s]; i++)
    {
        const dsd_oam_entry *e = &g_oam[s][i];
        if (e->sprite >= g_sprite_count || g_sprites[e->sprite].screen != s)
            continue;
        const ds_plat_sprite *sp = &g_sprites[e->sprite];
        bool affine = (e->flags & DSD_OAM_AFFINE) != 0;
        oamSet(oam, (int)i, e->x, e->y, e->priority, sp->palette, sp->spr.size, sp->spr.format,
               ds_obj_frame_ptr(s, &sp->spr, e->frame), affine ? e->affine : -1,
               affine && (e->flags & DSD_OAM_DOUBLE) != 0, false, !affine && (e->flags & DSD_OAM_HFLIP) != 0,
               !affine && (e->flags & DSD_OAM_VFLIP) != 0, false);
    }
}

void dsd_plat_frame_end(void)
{
#ifdef DSD_SCRIPTED_INPUT
    g_core_frame++;
#endif
    for (int s = 0; s < DS_SCREENS; s++)
    {
        build_oam(s);
        bgSetScroll(ds_bg1[s], g_scroll_x[s], g_scroll_y[s]);
    }
    if (ds_frame_nowait)
        return;
    swiWaitForVBlank();
    oamUpdate(&oamMain);
    oamUpdate(&oamSub);
    bgUpdate();
    ds_ui_commit();
}

void dsd_plat_read_input(dsd_input *out)
{
    static const uint32_t keys[DSD_BTN_COUNT] = {
        KEY_A, KEY_B, KEY_X, KEY_Y, KEY_L, KEY_R, KEY_START, KEY_SELECT, KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT,
    };
#ifdef DSD_SCRIPTED_INPUT
    if (g_keys_loaded)
    {
        host_keys_state(&g_keys, g_core_frame, out);
        return;
    }
#endif
    scanKeys();
    uint32_t held = keysHeld();
    memset(out, 0, sizeof(*out));
    for (uint32_t b = 0; b < DSD_BTN_COUNT; b++)
        if (held & keys[b])
            out->held |= 1u << b;
    if (held & KEY_TOUCH)
    {
        touchPosition t;
        touchRead(&t);
        out->touching = 1;
        out->touch_x = t.px;
        out->touch_y = t.py;
    }
}

// ---- Files ------------------------------------------------------------------------------------------------------

int32_t dsd_plat_read_file(const char *path, void *buf, uint32_t cap)
{
    FILE *f = fopen(nitro_path(path), "rb");
    if (f == NULL)
        return DSD_PLAT_ENOENT;
    int32_t rc = DSD_PLAT_EIO;
    if (fseek(f, 0, SEEK_END) == 0)
    {
        long size = ftell(f);
        if (size >= 0 && (unsigned long)size > cap)
            rc = DSD_PLAT_ETOOBIG;
        else if (size >= 0 && fseek(f, 0, SEEK_SET) == 0 && fread(buf, 1, (size_t)size, f) == (size_t)size)
            rc = (int32_t)size;
    }
    fclose(f);
    return rc;
}

// ---- Log output (C8) --------------------------------------------------------------------------------------------

void dsd_plat_log(const char *line, uint32_t len)
{
    ds_log_write(line, len);
}

void dsd_plat_log_flush(void)
{
    ds_log_pad();
}

void dsd_plat_fatal(const dsd_fatal *err)
{
    static char where[160];
    where[0] = '\0';
    if (err->object[0] != '\0' || err->event[0] != '\0')
        snprintf(where, sizeof(where), "%s%s%s", err->object, err->object[0] && err->event[0] ? " / " : "",
                 err->event);
    if (err->file[0] != '\0')
    {
        size_t n = strlen(where);
        // The file goes on its own line of the error box (ds_ui_error_box wraps at '\n').
        if (err->line > 0)
            snprintf(where + n, sizeof(where) - n, "%s%s line %ld", n ? "\n" : "", err->file, (long)err->line);
        else
            snprintf(where + n, sizeof(where) - n, "%s%s", n ? "\n" : "", err->file);
    }
    ds_error_screen(err->code, where, err->message); // START: back to main, which runs dsd_core_main again
}

void dsd_plat_mem_report(dsd_mem_report *out)
{
    memset(out, 0, sizeof(*out));
    out->heap_free_kb = ds_heap_free() / 1024u;
    out->cstack_used_kb = (ds_cstack_used() + 1023u) / 1024u;
    out->cstack_total_kb = ds_cstack_total() / 1024u;
    for (int s = 0; s < DS_SCREENS; s++)
    {
        out->objvram_used_kb[s] = (ds_obj_used(s) + 1023u) / 1024u;
        out->pal16_used[s] = g_pal16[s];
        out->pal256_used[s] = g_pal256[s];
    }
    // Resident sound data from soundbank.bin's own sizes (ds_snd.c): maxmod does not report it.
    out->snd_used_kb = (ds_snd_resident(g_sfx_loaded, g_sfx_loaded_n, g_mod_loaded, g_mod_loaded_n) + 1023u) / 1024u;
}

// ---- Graphics ---------------------------------------------------------------------------------------------------

// C11 0.3.0: the core gives the OBJ box (info->width x info->height) and the frame count; the platform fills bpp.
int32_t dsd_plat_sprite_load(uint32_t screen, const char *grf_path, dsd_sprite_info *info)
{
    info->bpp = 0;
    if (screen >= DS_SCREENS || g_sprite_count >= DS_MAX_SPRITES)
        return DSD_PLAT_ENOMEM;
    ds_grf g;
    int err = ds_grf_load(nitro_path(grf_path), &g);
    if (err == GRF_FILE_NOT_OPENED)
        return DSD_PLAT_ENOENT;
    if (err != GRF_NO_ERROR)
        return DSD_PLAT_ELOAD;

    int w = info->width, h = info->height, frames = info->frames;
    int bpp = g.hdr.gfxAttr;
    uint32_t *pals = bpp == 8 ? &g_pal256[screen] : &g_pal16[screen];
    int32_t rc = DSD_PLAT_OK;
    ds_plat_sprite *sp = &g_sprites[g_sprite_count];
    // The GRF must match what the core expects: its width is the box width and it has frames * height rows.
    if ((bpp != 4 && bpp != 8) || frames < 1 || (int)g.hdr.gfxWidth != w || (int)g.hdr.gfxHeight < frames * h ||
        !ds_obj_is_size(w, h))
        rc = DSD_PLAT_ELOAD;
    else if (*pals >= DS_OBJ_PALETTES)
        rc = DSD_PLAT_ENOMEM;
    else if (!ds_obj_upload((int)screen, &g, w, h, frames, &sp->spr))
        rc = DSD_PLAT_ENOMEM;
    if (rc == DSD_PLAT_OK)
    {
        // Sprites never share colour sets in 0.1 (C3): one palette each.
        sp->screen = (uint8_t)screen;
        sp->palette = (uint8_t)*pals;
        if (g.pal != NULL)
            ds_obj_palette((int)screen, bpp, sp->palette, g.pal, (int)(g.pal_size / 2));
        (*pals)++;
        info->bpp = (uint16_t)bpp;
        rc = (int32_t)g_sprite_count++;
    }
    ds_grf_free(&g);
    return rc;
}

int32_t dsd_plat_bg_load(uint32_t screen, const char *grf_path)
{
    if (screen >= DS_SCREENS)
        return DSD_PLAT_ELOAD;
    if (grf_path == NULL)
    {
        bgHide(ds_bg1[screen]);
        return DSD_PLAT_OK;
    }
    int err = ds_bg_load((int)screen, nitro_path(grf_path));
    if (err == GRF_FILE_NOT_OPENED)
        return DSD_PLAT_ENOENT;
    if (err != GRF_NO_ERROR)
        return DSD_PLAT_ELOAD;
    bgShow(ds_bg1[screen]);
    return DSD_PLAT_OK;
}

void dsd_plat_bg_scroll(uint32_t screen, int32_t x, int32_t y)
{
    if (screen >= DS_SCREENS)
        return;
    g_scroll_x[screen] = x;
    g_scroll_y[screen] = y;
}

void dsd_plat_oam_submit(uint32_t screen, const dsd_oam_entry *list, uint32_t n, const dsd_affine *affine,
                         uint32_t naffine)
{
    if (screen >= DS_SCREENS)
        return;
    g_oam_n[screen] = n > 128 ? 128 : n;
    g_aff_n[screen] = naffine > 32 ? 32 : naffine;
    memcpy(g_oam[screen], list, g_oam_n[screen] * sizeof(*list));
    if (g_aff_n[screen] > 0)
        memcpy(g_aff[screen], affine, g_aff_n[screen] * sizeof(*affine));
}

// ---- UI layer ---------------------------------------------------------------------------------------------------

void dsd_plat_ui_text(uint32_t screen, int32_t cx, int32_t cy, const char *str, uint32_t len, uint32_t colour)
{
    if (screen < DS_SCREENS)
        ds_ui_textn((int)screen, cx, cy, str, len, (int)colour);
}

void dsd_plat_ui_fill(uint32_t screen, int32_t cx, int32_t cy, int32_t cw, int32_t ch, uint32_t colour)
{
    if (screen < DS_SCREENS)
        ds_ui_fill((int)screen, cx, cy, cw, ch, (int)colour);
}

void dsd_plat_ui_clear(uint32_t screen)
{
    if (screen < DS_SCREENS)
        ds_ui_clear((int)screen);
}

// ---- Sound ------------------------------------------------------------------------------------------------------
// Effect handles are kept (not mmEffectRelease'd) so dsd_plat_sfx_stop can cancel them: maxmod cannot cancel a
// released effect. A stale handle is harmless: maxmod checks its counter bits.

int32_t dsd_plat_sfx_play(uint32_t sound_id)
{
    if (!ds_sound_ready)
        return -1;
    mm_sound_effect fx = {.id = sound_id, .rate = 1024, .handle = 0, .volume = g_sfx_volume, .panning = 128};
    mm_sfxhand h = mmEffectEx(&fx);
    if (h == 0)
        return -1; // no free channel: the core counts sfx_drop
    g_sfx_playing[g_sfx_next].handle = h;
    g_sfx_playing[g_sfx_next].id = (uint16_t)sound_id;
    g_sfx_next = (g_sfx_next + 1) % DS_SFX_TRACKED;
    return (int32_t)h;
}

void dsd_plat_sfx_stop(uint32_t sound_id)
{
    if (!ds_sound_ready)
        return;
    for (uint32_t i = 0; i < DS_SFX_TRACKED; i++)
        if (g_sfx_playing[i].handle != 0 && g_sfx_playing[i].id == sound_id)
        {
            mmEffectCancel(g_sfx_playing[i].handle);
            g_sfx_playing[i].handle = 0;
        }
}

void dsd_plat_music_play(uint32_t module_id)
{
    if (ds_sound_ready)
        mmStart(module_id, MM_PLAY_LOOP);
}

void dsd_plat_music_stop(void)
{
    if (ds_sound_ready)
        mmStop();
}

bool dsd_plat_music_active(void)
{
    return ds_sound_ready && mmActive();
}

void dsd_plat_volume(int32_t volume_fx)
{
    if (volume_fx < 0)
        volume_fx = 0;
    if (volume_fx > 4096)
        volume_fx = 4096;
    g_sfx_volume = (mm_byte)(volume_fx * 255 / 4096);
    if (ds_sound_ready)
    {
        mmSetModuleVolume((mm_word)(volume_fx / 4));
        mmSetEffectsVolume((mm_word)(volume_fx / 4));
    }
}

// ---- Room loading -----------------------------------------------------------------------------------------------

void dsd_plat_screens_blank(bool blank)
{
    ds_set_brightness(blank ? -16 : 0);
}

void dsd_plat_assets_free(void)
{
    if (ds_sound_ready)
    {
        mmStop();
        mmEffectCancelAll();
        for (uint32_t i = 0; i < g_mod_loaded_n; i++)
            mmUnload(g_mod_loaded[i]);
        for (uint32_t i = 0; i < g_sfx_loaded_n; i++)
            mmUnloadEffect(g_sfx_loaded[i]);
    }
    g_mod_loaded_n = g_sfx_loaded_n = 0;
    memset(g_sfx_playing, 0, sizeof(g_sfx_playing));
    g_sprite_count = 0;
    for (int s = 0; s < DS_SCREENS; s++)
    {
        ds_obj_reset(s);
        g_pal16[s] = g_pal256[s] = 0;
        g_oam_n[s] = g_aff_n[s] = 0;
        bgHide(ds_bg1[s]);
    }
}

static int32_t mm_result(mm_word r)
{
    return r == 0 ? DSD_PLAT_OK : r == 1 ? DSD_PLAT_EBADID : DSD_PLAT_ELOAD;
}

int32_t dsd_plat_sfx_load(uint32_t sound_id)
{
    if (!ds_sound_ready || g_sfx_loaded_n >= DS_MAX_SOUNDS)
        return DSD_PLAT_ELOAD;
    int32_t rc = mm_result(mmLoadEffect(sound_id));
    if (rc == DSD_PLAT_OK)
        g_sfx_loaded[g_sfx_loaded_n++] = (uint16_t)sound_id;
    return rc;
}

int32_t dsd_plat_music_load(uint32_t module_id)
{
    if (!ds_sound_ready || g_mod_loaded_n >= DS_MAX_SOUNDS)
        return DSD_PLAT_ELOAD;
    int32_t rc = mm_result(mmLoad(module_id));
    if (rc == DSD_PLAT_OK)
        g_mod_loaded[g_mod_loaded_n++] = (uint16_t)module_id;
    return rc;
}

// ---- Time and randomness ----------------------------------------------------------------------------------------

// VBlanks at the nominal 60 Hz: DSD|STAT then reports fps=60 when every frame fits one VBlank.
uint32_t dsd_plat_millis(void)
{
    return (g_vblanks - g_vblanks_at_init) * 1000u / 60u;
}

uint32_t dsd_plat_rng_seed(void)
{
    // RTC seconds mixed with the VBlank count (PLAN.md 5.2 C11); never 0.
    uint32_t seed = (uint32_t)time(NULL) * 2654435761u ^ (g_vblanks * 40503u + 1u);
    return seed != 0 ? seed : 1u;
}
