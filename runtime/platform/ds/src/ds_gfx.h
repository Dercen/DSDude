// SPDX-License-Identifier: Zlib
//
// ds_gfx.h: GRF loading, the per-screen OBJ VRAM allocator and room backgrounds (PLAN.md 2.9 "Loading on the DS",
// 3.3 "Sprites" and "Backgrounds").

#ifndef DSD_DS_GFX_H
#define DSD_DS_GFX_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include <nds.h>

// A GRF loaded by grfLoadPath into malloc'd buffers (pointer-to-NULL destinations; never VRAM, because an
// uncompressed chunk is a raw fread into the destination).
typedef struct {
    GRFHeader hdr;
    void *gfx, *map, *pal;
    size_t gfx_size, map_size, pal_size;
} ds_grf;

// Returns GRF_NO_ERROR (0) or a GRFError. On error nothing stays allocated.
int ds_grf_load(const char *path, ds_grf *g);

// Frees the buffers in the reverse of their allocation order (palette, map, graphics: LIFO keeps the heap tidy).
void ds_grf_free(ds_grf *g);

// ---- OBJ VRAM (128 KB per screen, SpriteMapping_1D_128: 128-byte units) ------------------------------------
#define DS_OBJ_VRAM_BYTES (128 * 1024)
#define DS_OBJ_ALIGN 128

// A sprite's frames in OBJ VRAM: frame f starts at offset + f * stride.
typedef struct {
    uint32_t offset;       // bytes from the start of the screen's OBJ VRAM, 128-aligned
    uint32_t stride;       // roundUp(frame bytes, 128)
    uint32_t frame_bytes;  // w * h * bpp / 8
    uint16_t width, height, frames;
    uint8_t bpp;           // 4 or 8
    SpriteSize size;
    SpriteColorFormat format;
} ds_sprite;

// Empties the screen's allocator (room change).
void ds_obj_reset(int screen);

// Bytes in use on a screen (padded).
uint32_t ds_obj_used(int screen);

// True when w x h is one of the 12 OBJ sizes.
bool ds_obj_is_size(int w, int h);

// Uploads `frames` frames of w x h pixels (0: as many as the GRF holds) from a sprite sheet GRF (frames stacked
// vertically, width = frame width) to the screen's OBJ VRAM, each frame at a 128-byte-aligned offset. Returns false
// when w x h is not an OBJ size, the GRF has fewer frames, or OBJ VRAM is full. The palette is not touched: see
// ds_obj_palette.
bool ds_obj_upload(int screen, const ds_grf *g, int w, int h, int frames, ds_sprite *out);

// The VRAM address of a sprite frame (oamSet's gfxOffset).
const void *ds_obj_frame_ptr(int screen, const ds_sprite *s, int frame);

// Writes a sprite palette: 8bpp into extended OBJ palette `pal` (0-15), 4bpp into standard OBJ palette `pal`.
void ds_obj_palette(int screen, int bpp, int pal, const uint16_t *colors, int count);

// ---- Room backgrounds (BG1) ---------------------------------------------------------------------------------

// Loads an 8bpp text-BG GRF (tiles <= 1024, map <= 512x512) into BG1 of a screen, its palette into extended BG
// palette slot 1. Returns GRF_NO_ERROR, a GRFError, or 1 when the GRF is not an 8bpp tiled background.
int ds_bg_load(int screen, const char *path);

#endif // DSD_DS_GFX_H
