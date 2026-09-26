// instances.h: the instance pool (PLAN.md 3.3, 6 WS2): C13 instancesMax fixed blocks of at most instanceBlockBytes,
// each a native struct of the built-in variables followed by the object's user variables as 8-byte cells.
//
// - Positions, speeds, directions and image values are stored untagged as Q20.12; reading them gives REAL cells
//   (printing and comparison hide the representation). Ints (depth, alarms, screen) read as INT cells.
// - A user slot starts as DSD_TAG_UNSET, an internal tag that never reaches a script: reading it is R500 (rule 1).
// - The live list is kept in creation order, which is also id order (ids only grow), so an id is found by binary
//   search. A destroyed instance leaves the list at the end of the frame (contracts/events.md section 2).
#ifndef DSD_INSTANCES_H
#define DSD_INSTANCES_H

#include <stdbool.h>
#include <stdint.h>

#include "builtins_table.h"
#include "dsd_limits.h"
#include "value.h"

typedef struct DsdVm DsdVm;
typedef struct DsdWorld DsdWorld;

#define DSD_TAG_UNSET 0xFFu          // internal: a user slot or overflow entry never assigned
#define DSD_NO_INST 0xFFFFFFFFu      // "no instance" as a pool index
#define DSD_FIRST_INSTANCE_ID 100001 // GML's first instance id
#define DSD_OVERFLOW_ENTRIES 8u      // per-instance overflow map for names outside the slot layout (rule 1)
#define DSD_RT_OVERFLOW_MAPS 64u     // overflow maps in use at once

// Instance states.
#define DSD_INST_FREE 0u
#define DSD_INST_LIVE 1u
#define DSD_INST_DEAD 2u             // destroyed this frame: skipped by everything, freed at the end of the frame

// Outside Room tracking (contracts/events.md section 5).
#define DSD_OUTSIDE_NEVER_IN 0u      // has not been inside the room yet: cannot fire
#define DSD_OUTSIDE_IN 1u            // inside or overlapping the room
#define DSD_OUTSIDE_FIRED 2u         // fired; fires again only after re-entering

// Dense built-in variable indices by name (GETBI/SETBI Bx, from runtime/gen/builtins_table.h): DSD_BV_x, ...
#define DSD_BV_ENUM_(index, name, global, readonly, array_len) DSD_BV_##name = index,
enum { DSD_BUILTIN_VARS(DSD_BV_ENUM_) };
#undef DSD_BV_ENUM_

typedef struct DsdInstance {
    int32_t id;                  // DSD_FIRST_INSTANCE_ID and up
    uint16_t object;             // OBJS index
    uint8_t state;               // DSD_INST_*
    uint8_t screen;              // 0 top, 1 bottom
    int32_t x, y;                // Q20.12 (as every field below up to depth, unless noted)
    int32_t xprevious, yprevious;
    int32_t xstart, ystart;
    int32_t hspeed, vspeed;      // the motion; speed/direction are kept in sync with them
    int32_t speed, direction;    // direction in degrees, [0, 360)
    int32_t gravity, gravity_direction, friction;
    int32_t sprite_index;        // ASET index or -1 (not Q20.12)
    int32_t image_index, image_speed;
    int32_t image_xscale, image_yscale, image_angle;
    int32_t depth;               // int
    int32_t alarm[DSD_C13_ALARMS]; // ints; -1 = off
    uint8_t visible;
    uint8_t outside;             // DSD_OUTSIDE_*
    uint8_t touched;             // the stylus went down on this instance (for touch_released)
    uint8_t overflow;            // overflow map index + 1; 0 = none
    DsdValue slots[DSD_C13_USER_SLOTS_PER_OBJECT];
} DsdInstance;
_Static_assert(sizeof(DsdInstance) <= DSD_C13_INSTANCE_BLOCK_BYTES, "instance block exceeds C13 instanceBlockBytes");

// An overflow map: up to 8 names reached dynamically that are not in the object's slot layout.
typedef struct DsdOverflowMap {
    uint32_t sym[DSD_OVERFLOW_ENTRIES];
    DsdValue value[DSD_OVERFLOW_ENTRIES];
    uint8_t used;                // entries in use
    uint8_t in_use;              // the map is owned by an instance
} DsdOverflowMap;

typedef struct DsdInstances {
    DsdInstance pool[DSD_C13_INSTANCES_MAX];
    uint16_t order[DSD_C13_INSTANCES_MAX]; // pool indices in creation (= id) order, live and dead-this-frame
    uint32_t count;
    uint16_t free_list[DSD_C13_INSTANCES_MAX];
    uint32_t free_count;
    int32_t next_id;
    DsdOverflowMap maps[DSD_RT_OVERFLOW_MAPS];
} DsdInstances;

// The game's instances (one pool; the engine owns it).
extern DsdInstances dsd_instances;

// Empties the pool (boot); ids restart only here.
void dsd_inst_reset(void);
// Takes a block for a new instance of `obj` at (x, y) (Q20.12) on `screen`, with the object's defaults and every
// user slot unset, and appends it to the live list. Does not run Create. Returns the pool index, or DSD_NO_INST when
// the pool is full (the caller raises R583-style "too many instances").
uint32_t dsd_inst_new(const DsdWorld *w, uint32_t obj, int32_t x, int32_t y, uint32_t screen);
// Marks an instance dead (it stays in the list until dsd_inst_sweep).
void dsd_inst_kill(uint32_t idx);
// Frees the dead instances and compacts the live list (end of frame).
void dsd_inst_sweep(void);
// Removes every instance without Destroy events (room change).
void dsd_inst_clear(void);
// Pool index of a live instance by id, or DSD_NO_INST.
uint32_t dsd_inst_find_id(int32_t id);
static inline DsdInstance *dsd_inst_at(uint32_t idx) { return &dsd_instances.pool[idx]; }
static inline bool dsd_inst_live(uint32_t idx) {
    return idx != DSD_NO_INST && dsd_instances.pool[idx].state == DSD_INST_LIVE;
}

// ---- Motion (speed/direction and hspeed/vspeed are two views of one motion) -------------------------------------
// After hspeed/vspeed changed: speed = |(h, v)|, direction = their angle (y down); direction stays when both are 0.
void dsd_inst_sync_polar(DsdInstance *in);
// After speed/direction changed: hspeed = speed * cos(direction), vspeed = -speed * sin(direction).
void dsd_inst_sync_cartesian(DsdInstance *in);

// ---- User variables ---------------------------------------------------------------------------------------------
// The overflow entry for symbol `sym` of instance `idx`; with `create`, adds it (unset) when missing. NULL when
// missing (without create) or when the map or the map pool is full (with create).
DsdValue *dsd_inst_overflow(uint32_t idx, uint32_t sym, bool create);

// Marks every heap value held by instance variables (the collector's instance roots).
void dsd_inst_mark_roots(DsdVm *vm);

#endif // DSD_INSTANCES_H
