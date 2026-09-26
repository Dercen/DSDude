// geometry.h: sprite geometry (frame size, origin, bbox) and instance bounding boxes (contracts/events.md sections
// 5 and 6: axis-aligned, scaled by image_xscale/yscale, not rotated; touching edges do not overlap).
//
// The engine's logic takes geometry only from the DSDB's SPRG records (ADR-0006), never from loaded GRF files, so
// the host (which may not have the GRFs) and the DS compute the same collisions.
#ifndef DSD_GEOMETRY_H
#define DSD_GEOMETRY_H

#include <stdbool.h>
#include <stdint.h>

#include "instances.h"
#include "world.h"

typedef struct DsdSpriteGeom {
    uint16_t width;     // one frame, pixels
    uint16_t height;
    int16_t xorig;      // origin, frame pixels
    int16_t yorig;
    int16_t bbox_left;  // inclusive bbox, frame pixels
    int16_t bbox_top;
    int16_t bbox_right;
    int16_t bbox_bottom;
} DsdSpriteGeom;

// A half-open rectangle [left, right) x [top, bottom) in Q20.12 room coordinates (64-bit: scaled edges may exceed
// the Q20.12 range without wrapping).
typedef struct DsdBox {
    int64_t left;
    int64_t top;
    int64_t right;
    int64_t bottom;
} DsdBox;

// Geometry of sprite asset `asset`.
void dsd_geom_sprite(const DsdWorld *w, uint32_t asset, DsdSpriteGeom *out);
// An instance's bbox at its position, or at (x, y) (Q20.12) when `at` is set; false when it has no sprite.
bool dsd_geom_bbox(const DsdWorld *w, const DsdInstance *in, bool at, int32_t x, int32_t y, DsdBox *out);
// True when two boxes overlap (edges that only touch do not).
static inline bool dsd_box_overlap(const DsdBox *a, const DsdBox *b) {
    return a->left < b->right && b->left < a->right && a->top < b->bottom && b->top < a->bottom;
}
// True when the point (px, py) (Q20.12) lies in the box.
static inline bool dsd_box_contains(const DsdBox *a, int64_t px, int64_t py) {
    return px >= a->left && px < a->right && py >= a->top && py < a->bottom;
}

#endif // DSD_GEOMETRY_H
