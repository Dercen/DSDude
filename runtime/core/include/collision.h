// collision.h: the broadphase of the Collisions stage (PLAN.md 3.3 "collision.c": a grid broadphase, matching only
// instances on the same screen; contracts/events.md section 6 for the rules).
//
// The grid indexes a stage snapshot (positions in creation order) by bounding box, so each instance meets only the
// instances whose boxes share a cell with its own, instead of every instance. It is a filter only: the caller
// still checks liveness, object and box overlap, and rebuilds the grid when an event changed any box input
// (dsd_geom_epoch), so results equal the direct pairwise checks exactly.
#ifndef DSD_COLLISION_H
#define DSD_COLLISION_H

#include <stdbool.h>
#include <stdint.h>

#include "geometry.h"
#include "world.h"

// Indexes the instances snap[0..n) (pool indices; dead ones and ones without a sprite are left out) with their
// current boxes.
void dsd_coll_build(const DsdWorld *w, const uint16_t *snap, uint32_t n);
// True when a box input changed since the last build (dsd_geom_epoch moved).
bool dsd_coll_stale(void);
// The box of snapshot position i as of the last build; false when it has none (dead, or no sprite).
bool dsd_coll_box(uint32_t i, DsdBox *out);
// Snapshot positions >= `from`, other than i, whose boxes may overlap position i's (same screen), ascending.
// Returns their count (0 when i has no box).
uint32_t dsd_coll_candidates(uint32_t i, uint32_t from, uint16_t *out);

#endif // DSD_COLLISION_H
