// geometry.c: sprite geometry and instance bounding boxes (geometry.h).
#include "geometry.h"

#include "fixed.h"

uint32_t dsd_geom_epoch;

#define OBJ_SIZES 12 // hardware OBJ shapes x sizes (3 x 4)

// The 12 OBJ sizes, smallest area first; C3 guarantees the smallest containing size is unique, so the first match
// in this order is it.
static const uint8_t OBJ_W[OBJ_SIZES] = {8, 16, 8, 16, 32, 8, 32, 16, 32, 64, 32, 64};
static const uint8_t OBJ_H[OBJ_SIZES] = {8, 8, 16, 16, 8, 32, 16, 32, 32, 32, 64, 64};

void dsd_geom_obj_box(uint32_t width, uint32_t height, uint32_t *box_w, uint32_t *box_h) {
    uint32_t k = 0;
    while (k < OBJ_SIZES - 1 && (OBJ_W[k] < width || OBJ_H[k] < height)) k++;
    *box_w = OBJ_W[k];
    *box_h = OBJ_H[k];
}

void dsd_geom_sprite(const DsdWorld *w, uint32_t asset, DsdSpriteGeom *out) {
    // The SPRG record of the sprite (ADR-0006; the loader guarantees one per sprite in a room game): binary search.
    uint32_t lo = 0;
    uint32_t hi = w->sprg_count;
    while (lo < hi) {
        uint32_t mid = lo + (hi - lo) / 2;
        const DsdSprgRec *g = &w->sprg[mid];
        if (g->asset == asset) {
            *out = (DsdSpriteGeom){g->width, g->height, g->xorig, g->yorig, g->bbox_left, g->bbox_top,
                                   g->bbox_right, g->bbox_bottom};
            return;
        }
        if (g->asset < asset) lo = mid + 1;
        else hi = mid;
    }
    *out = (DsdSpriteGeom){0}; // unreachable for a loaded room game (program form has no instances)
}

// One axis of a box: the edges pos + (lo - orig) * scale and pos + (hi + 1 - orig) * scale (int x Q20.12 = Q20.12),
// ordered so a negative scale mirrors around the origin.
static void axis(int32_t pos, int32_t lo, int32_t hi, int32_t orig, int32_t scale, int64_t *a, int64_t *b) {
    int64_t e1 = (int64_t)pos + (int64_t)(lo - orig) * scale;
    int64_t e2 = (int64_t)pos + (int64_t)(hi + 1 - orig) * scale;
    *a = e1 < e2 ? e1 : e2;
    *b = e1 < e2 ? e2 : e1;
}

bool dsd_geom_bbox(const DsdWorld *w, const DsdInstance *in, bool at, int32_t x, int32_t y, DsdBox *out) {
    if (in->sprite_index < 0) return false; // no sprite, no bbox: it never collides
    DsdSpriteGeom g;
    dsd_geom_sprite(w, (uint32_t)in->sprite_index, &g);
    axis(at ? x : in->x, g.bbox_left, g.bbox_right, g.xorig, in->image_xscale, &out->left, &out->right);
    axis(at ? y : in->y, g.bbox_top, g.bbox_bottom, g.yorig, in->image_yscale, &out->top, &out->bottom);
    return true;
}
