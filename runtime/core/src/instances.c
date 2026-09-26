// instances.c: the instance pool (instances.h).
#include "instances.h"

#include <string.h>

#include "fixed.h"
#include "heap.h"
#include "vm.h"
#include "world.h"

// GML defaults for a new instance (Q20.12 where the field is).
#define DEFAULT_GRAVITY_DIRECTION (270 * DSD_FX_ONE) // gravity pulls down
#define DEFAULT_IMAGE_SPEED DSD_FX_ONE               // one frame per step
#define DEFAULT_SCALE DSD_FX_ONE
#define ALARM_OFF (-1)

DsdInstances dsd_instances;

void dsd_inst_reset(void) {
    DsdInstances *in = &dsd_instances;
    in->count = 0;
    in->next_id = DSD_FIRST_INSTANCE_ID;
    // The free list hands out block 0 first, then 1, ... (popped from the end).
    in->free_count = DSD_C13_INSTANCES_MAX;
    for (uint32_t i = 0; i < DSD_C13_INSTANCES_MAX; i++) {
        in->free_list[i] = (uint16_t)(DSD_C13_INSTANCES_MAX - 1 - i);
        in->pool[i].state = DSD_INST_FREE;
    }
    for (uint32_t m = 0; m < DSD_RT_OVERFLOW_MAPS; m++) in->maps[m].in_use = 0;
}

uint32_t dsd_inst_new(const DsdWorld *w, uint32_t obj, int32_t x, int32_t y, uint32_t screen) {
    DsdInstances *all = &dsd_instances;
    if (all->free_count == 0) return DSD_NO_INST;
    uint32_t idx = all->free_list[--all->free_count];
    DsdInstance *in = &all->pool[idx];
    const DsdObject *o = &w->objects[obj];
    memset(in, 0, sizeof *in);
    in->id = all->next_id++;
    in->object = (uint16_t)obj;
    in->state = DSD_INST_LIVE;
    in->screen = (uint8_t)screen;
    in->x = in->xprevious = in->xstart = x;
    in->y = in->yprevious = in->ystart = y;
    in->gravity_direction = DEFAULT_GRAVITY_DIRECTION;
    in->sprite_index = o->sprite;
    in->image_speed = DEFAULT_IMAGE_SPEED;
    in->image_xscale = DEFAULT_SCALE;
    in->image_yscale = DEFAULT_SCALE;
    in->depth = o->depth;
    for (uint32_t a = 0; a < DSD_C13_ALARMS; a++) in->alarm[a] = ALARM_OFF;
    in->visible = o->visible;
    in->outside = DSD_OUTSIDE_NEVER_IN;
    for (uint32_t s = 0; s < DSD_C13_USER_SLOTS_PER_OBJECT; s++) in->slots[s] = (DsdValue){DSD_TAG_UNSET, 0};
    all->order[all->count++] = (uint16_t)idx;
    return idx;
}

// Returns an instance's overflow map to the pool.
static void release_map(DsdInstance *in) {
    if (in->overflow != 0) dsd_instances.maps[in->overflow - 1].in_use = 0;
    in->overflow = 0;
}

void dsd_inst_kill(uint32_t idx) { dsd_instances.pool[idx].state = DSD_INST_DEAD; }

void dsd_inst_sweep(void) {
    DsdInstances *all = &dsd_instances;
    uint32_t w = 0;
    for (uint32_t i = 0; i < all->count; i++) {
        uint32_t idx = all->order[i];
        DsdInstance *in = &all->pool[idx];
        if (in->state == DSD_INST_DEAD) {
            release_map(in);
            in->state = DSD_INST_FREE;
            all->free_list[all->free_count++] = (uint16_t)idx;
        } else {
            all->order[w++] = (uint16_t)idx;
        }
    }
    all->count = w;
}

void dsd_inst_clear(void) {
    DsdInstances *all = &dsd_instances;
    for (uint32_t i = 0; i < all->count; i++) all->pool[all->order[i]].state = DSD_INST_DEAD;
    dsd_inst_sweep();
}

uint32_t dsd_inst_find_id(int32_t id) {
    // The list is in creation order, which is id order: binary search.
    DsdInstances *all = &dsd_instances;
    uint32_t lo = 0;
    uint32_t hi = all->count;
    while (lo < hi) {
        uint32_t mid = lo + (hi - lo) / 2;
        int32_t mid_id = all->pool[all->order[mid]].id;
        if (mid_id == id) {
            uint32_t idx = all->order[mid];
            return all->pool[idx].state == DSD_INST_LIVE ? idx : DSD_NO_INST;
        }
        if (mid_id < id) lo = mid + 1;
        else hi = mid;
    }
    return DSD_NO_INST;
}

// ---- Motion -----------------------------------------------------------------------------------------------------

void dsd_inst_sync_polar(DsdInstance *in) {
    in->speed = dsd_fx_hypot(in->hspeed, in->vspeed);
    // Screen y points down, directions turn counter-clockwise: the angle of (h, -v).
    if (in->hspeed != 0 || in->vspeed != 0) in->direction = dsd_fx_atan2_deg(-(int64_t)in->vspeed, in->hspeed);
}

// speed * trig / 4096 in 64 bits, truncated toward zero (the fixed multiply rule).
static int32_t scaled(int32_t speed, int32_t trig) {
    int64_t p = (int64_t)speed * trig;
    return dsd_lo32(p >= 0 ? (p >> DSD_FX_SHIFT) : -((-p) >> DSD_FX_SHIFT));
}

void dsd_inst_sync_cartesian(DsdInstance *in) {
    in->hspeed = scaled(in->speed, dsd_fx_dcos(in->direction));
    in->vspeed = -scaled(in->speed, dsd_fx_dsin(in->direction));
}

// ---- Overflow maps ----------------------------------------------------------------------------------------------

DsdValue *dsd_inst_overflow(uint32_t idx, uint32_t sym, bool create) {
    DsdInstance *in = &dsd_instances.pool[idx];
    if (in->overflow != 0) {
        DsdOverflowMap *m = &dsd_instances.maps[in->overflow - 1];
        for (uint32_t e = 0; e < m->used; e++) {
            if (m->sym[e] == sym) return &m->value[e];
        }
        if (!create || m->used == DSD_OVERFLOW_ENTRIES) return 0;
        m->sym[m->used] = sym;
        m->value[m->used] = (DsdValue){DSD_TAG_UNSET, 0};
        return &m->value[m->used++];
    }
    if (!create) return 0;
    for (uint32_t k = 0; k < DSD_RT_OVERFLOW_MAPS; k++) {
        DsdOverflowMap *m = &dsd_instances.maps[k];
        if (m->in_use) continue;
        m->in_use = 1;
        m->used = 1;
        m->sym[0] = sym;
        m->value[0] = (DsdValue){DSD_TAG_UNSET, 0};
        in->overflow = (uint8_t)(k + 1);
        return &m->value[0];
    }
    return 0;
}

void dsd_inst_mark_roots(DsdVm *vm) {
    DsdInstances *all = &dsd_instances;
    for (uint32_t i = 0; i < all->count; i++) {
        const DsdInstance *in = &all->pool[all->order[i]];
        for (uint32_t s = 0; s < DSD_C13_USER_SLOTS_PER_OBJECT; s++) dsd_heap_mark(&vm->heap, in->slots[s]);
        if (in->overflow != 0) {
            const DsdOverflowMap *m = &all->maps[in->overflow - 1];
            for (uint32_t e = 0; e < m->used; e++) dsd_heap_mark(&vm->heap, m->value[e]);
        }
    }
}
