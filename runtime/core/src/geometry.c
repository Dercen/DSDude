// geometry.c: sprite geometry and instance bounding boxes (geometry.h).
#include "geometry.h"

#include "fixed.h"

// Geometry used until sprite geometry reaches the runtime: a 16x16 frame, origin at its top-left, bbox the whole
// frame. The DSDB does not carry sprite.json's size/origin/bbox yet.
// ADR-pending ADR-0003 (docs/adr/0003-sprite-geometry-in-dsdb.md: the SPRG extension would replace this default)
#define DEFAULT_FRAME_PX 16

void dsd_geom_sprite(const DsdWorld *w, uint32_t asset, DsdSpriteGeom *out) {
    (void)w;
    (void)asset;
    out->width = DEFAULT_FRAME_PX;
    out->height = DEFAULT_FRAME_PX;
    out->xorig = 0;
    out->yorig = 0;
    out->bbox_left = 0;
    out->bbox_top = 0;
    out->bbox_right = DEFAULT_FRAME_PX - 1;
    out->bbox_bottom = DEFAULT_FRAME_PX - 1;
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
