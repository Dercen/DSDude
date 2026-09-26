// drawlist.h: the per-frame sprite draw list and the shadow OAM it becomes (PLAN.md 3.3 "Sprites"; C11
// dsd_plat_oam_submit). Draw calls queue entries during the Draw stage; dsd_draw_commit sorts them, applies the OAM
// rules (flip bits, affine sets with double size, the 128-sprite and 32-affine caps per screen) and hands each
// screen's list to the platform, so the host and the DS submit identical lists.
#ifndef DSD_DRAWLIST_H
#define DSD_DRAWLIST_H

#include <stdbool.h>
#include <stdint.h>

#include "dsd_limits.h"
#include "dsd_platform.h"
#include "vm.h"

// Queued draw calls per screen and frame: twice the 128 OAM entries, so culled off-screen calls rarely crowd out
// visible ones (more are dropped and counted in oam_drop).
#define DSD_RT_DRAWS_PER_SCREEN (2 * DSD_C13_SPRITES_PER_SCREEN)

// Per-screen results of the last committed frame (DSD|STAT spr_top/spr_bot, oam_drop, aff_drop).
typedef struct DsdDrawStats {
    uint32_t sprites[DSD_SCREEN_COUNT]; // OAM entries submitted per screen
    uint32_t oam_drop;     // draws beyond 128 visible per screen (or beyond the queue)
    uint32_t aff_drop;     // rotated or scaled draws beyond 32 affine sets per screen, drawn unrotated
} DsdDrawStats;

extern DsdDrawStats dsd_draw_stats;

// Empties the queues (start of the Draw stage).
void dsd_draw_begin(void);
// Queues sprite asset `sprite`, frame `frame` (any int: reduced modulo the frame count) at room position (x, y)
// (Q20.12) on the current draw screen, with scale and angle (Q20.12; angle in degrees, counter-clockwise), stacked
// by (depth, instance id) of instance `idx`. Raises R572 when the sprite is not loaded on that screen.
bool dsd_draw_sprite(DsdVm *vm, uint32_t idx, uint32_t sprite, int32_t frame, int32_t x, int32_t y, int32_t xscale,
                     int32_t yscale, int32_t angle);
// draw_self for instance idx (the default draw of a visible instance without a Draw event).
bool dsd_draw_self(DsdVm *vm, uint32_t idx);
// Sorts, builds and submits both screens' shadow OAM (end of the Draw stage).
void dsd_draw_commit(void);

#endif // DSD_DRAWLIST_H
