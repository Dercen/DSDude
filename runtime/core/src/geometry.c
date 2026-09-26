// geometry.c: sprite geometry and instance bounding boxes (geometry.h).
#include "geometry.h"

#include "fixed.h"

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
