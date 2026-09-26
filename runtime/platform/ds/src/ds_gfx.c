// SPDX-License-Identifier: Zlib
//
// GRF loading, OBJ VRAM allocation and room backgrounds (PLAN.md 2.9, 3.3).

#include <stdlib.h>
#include <string.h>

#include <nds.h>

#include "ds_gfx.h"
#include "ds_video.h"

int ds_grf_load(const char *path, ds_grf *g)
{
    memset(g, 0, sizeof(*g));
    GRFError err = grfLoadPath(path, &g->hdr, &g->gfx, &g->gfx_size, &g->map, &g->map_size, &g->pal, &g->pal_size);
    if (err != GRF_NO_ERROR)
        ds_grf_free(g);
    return (int)err;
}

void ds_grf_free(ds_grf *g)
{
    free(g->pal);
    free(g->map);
    free(g->gfx);
    g->pal = g->map = g->gfx = NULL;
}

// ---- OBJ VRAM -----------------------------------------------------------------------------------------------

static uint32_t ds_obj_top[DS_SCREENS];

void ds_obj_reset(int screen)
{
    ds_obj_top[screen] = 0;
}

uint32_t ds_obj_used(int screen)
{
    return ds_obj_top[screen];
}

static bool ds_obj_shape(int w, int h, SpriteSize *size)
{
    static const struct { uint8_t w, h; SpriteSize size; } shapes[] = {
        {8, 8, SpriteSize_8x8},     {16, 16, SpriteSize_16x16}, {32, 32, SpriteSize_32x32},
        {64, 64, SpriteSize_64x64}, {16, 8, SpriteSize_16x8},   {32, 8, SpriteSize_32x8},
        {32, 16, SpriteSize_32x16}, {64, 32, SpriteSize_64x32}, {8, 16, SpriteSize_8x16},
        {8, 32, SpriteSize_8x32},   {16, 32, SpriteSize_16x32}, {32, 64, SpriteSize_32x64},
    };
    for (size_t i = 0; i < sizeof(shapes) / sizeof(shapes[0]); i++)
        if (shapes[i].w == w && shapes[i].h == h)
        {
            *size = shapes[i].size;
            return true;
        }
    return false;
}

static uint16_t *ds_obj_base(int screen)
{
    return screen == DS_TOP ? SPRITE_GFX : SPRITE_GFX_SUB;
}

bool ds_obj_is_size(int w, int h)
{
    SpriteSize size;
    return ds_obj_shape(w, h, &size);
}

bool ds_obj_upload(int screen, const ds_grf *g, int w, int h, int frames_wanted, ds_sprite *out)
{
    SpriteSize size;
    int bpp = g->hdr.gfxAttr;
    if (!ds_obj_shape(w, h, &size) || (bpp != 4 && bpp != 8) || g->gfx == NULL)
        return false;

    uint32_t frame_bytes = (uint32_t)(w * h * bpp / 8);
    uint32_t stride = (frame_bytes + DS_OBJ_ALIGN - 1) & ~(uint32_t)(DS_OBJ_ALIGN - 1);
    uint32_t frames = (uint32_t)(g->gfx_size / frame_bytes);
    if (frames_wanted > 0)
    {
        if ((uint32_t)frames_wanted > frames)
            return false;
        frames = (uint32_t)frames_wanted;
    }
    if (frames == 0 || ds_obj_top[screen] + frames * stride > DS_OBJ_VRAM_BYTES)
        return false;

    out->offset = ds_obj_top[screen];
    out->stride = stride;
    out->frame_bytes = frame_bytes;
    out->width = (uint16_t)w;
    out->height = (uint16_t)h;
    out->frames = (uint16_t)frames;
    out->bpp = (uint8_t)bpp;
    out->size = size;
    out->format = bpp == 8 ? SpriteColorFormat_256Color : SpriteColorFormat_16Color;

    // Frames in the file are contiguous (stride frame_bytes); in VRAM each starts on a 128-byte boundary.
    DC_FlushRange(g->gfx, g->gfx_size);
    uint8_t *base = (uint8_t *)ds_obj_base(screen);
    for (uint32_t f = 0; f < frames; f++)
        dmaCopy((const uint8_t *)g->gfx + f * frame_bytes, base + out->offset + f * stride, frame_bytes);
    ds_obj_top[screen] += frames * stride;
    return true;
}

const void *ds_obj_frame_ptr(int screen, const ds_sprite *s, int frame)
{
    return (const uint8_t *)ds_obj_base(screen) + s->offset + (uint32_t)(frame % s->frames) * s->stride;
}

void ds_obj_palette(int screen, int bpp, int pal, const uint16_t *colors, int count)
{
    if (bpp == 8)
    {
        ds_ext_palette_write(screen, false, 0, pal, colors, count);
        return;
    }
    volatile uint16_t *dst = (screen == DS_TOP ? SPRITE_PALETTE : SPRITE_PALETTE_SUB) + pal * 16;
    for (int i = 0; i < count && i < 16; i++)
        dst[i] = colors[i];
}

// ---- Room backgrounds ---------------------------------------------------------------------------------------

int ds_bg_load(int screen, const char *path)
{
    ds_grf g;
    int err = ds_grf_load(path, &g);
    if (err != GRF_NO_ERROR)
        return err;

    int w = (int)g.hdr.gfxWidth, h = (int)g.hdr.gfxHeight;
    // mapAttr is the GRF map format (GRF_BGFMT_*), not a bit depth: grit -mLs on 8bpp writes SBB_8BPP.
    if (g.hdr.gfxAttr != 8 || g.hdr.mapAttr != GRF_BGFMT_SBB_8BPP || g.gfx == NULL || g.map == NULL || w > 512 || h > 512 ||
        g.gfx_size > 1024 * 64)
    {
        ds_grf_free(&g);
        return 1;
    }

    ds_bg1_resize(screen, w, h);
    DC_FlushRange(g.gfx, g.gfx_size);
    DC_FlushRange(g.map, g.map_size);
    dmaCopy(g.gfx, bgGetGfxPtr(ds_bg1[screen]), g.gfx_size);
    // grit -mLs writes screen-block order, which is the hardware's layout for 512-wide maps too.
    dmaCopy(g.map, bgGetMapPtr(ds_bg1[screen]), g.map_size);
    if (g.pal != NULL)
        ds_ext_palette_write(screen, true, DS_BG1_EXT_SLOT, 0, g.pal, (int)(g.pal_size / 2));
    ds_grf_free(&g);
    return GRF_NO_ERROR;
}
