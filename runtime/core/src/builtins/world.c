// world.c: builtins over instances, places, events and rooms (builtins.json ids 0-13, 22, 38-43).
//
// Places and collisions use bboxes (geometry.h) and only match instances on the same screen as the instance asking
// (contracts/events.md section 6). A rectangle (collision_rectangle) covers [min, max) on each axis, like a bbox.
#include "bi.h"
#include "engine.h"
#include "errors.h"
#include "fixed.h"
#include "geometry.h"

#define NOONE_VALUE DSD_INST_NOONE // what "no instance" returns (the noone constant)
#define USER_EVENTS 8               // user_0 .. user_7

// Candidates for the place/collision queries (no script runs while they are in use).
static uint16_t g_list[DSD_C13_INSTANCES_MAX];

static DsdValue inst_value(uint32_t idx) { return idx == DSD_NO_INST ? dsd_int(NOONE_VALUE) : dsd_inst(dsd_inst_at(idx)->id); }

// The object argument of an instance query: an object, an instance, all (instance_* and place_* accept all three).
static bool query_target(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i) {
    DsdValue v = args[i];
    bool ok = v.tag == DSD_TAG_ASSET ? ((uint32_t)v.payload >> DSD_ASSET_KIND_SHIFT) == DSD_ASSET_OBJECT
                                     : v.tag == DSD_TAG_INST || v.tag == DSD_TAG_INT;
    if (ok) return true;
    DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_ARGUMENT);
    dsd_text_str(&t, dsd_builtin_info[bi].name);
    dsd_text_str(&t, " needs an object or an instance here, but got ");
    dsd_text_str(&t, dsd_value_kind(v));
    return false;
}

// The screen queries compare against: self's, or none (every screen) without an instance.
static int32_t query_screen(const DsdVm *vm) { return vm->self == DSD_VM_NO_INST ? -1 : dsd_inst_at(vm->self)->screen; }

// The first instance the target names (not self, on `screen` unless -1) whose bbox overlaps `box`, or DSD_NO_INST.
static uint32_t first_overlap(const DsdVm *vm, DsdValue target, const DsdBox *box, int32_t screen) {
    uint32_t n = dsd_engine_targets(target, g_list, DSD_C13_INSTANCES_MAX);
    for (uint32_t i = 0; i < n; i++) {
        const DsdInstance *in = dsd_inst_at(g_list[i]);
        DsdBox b;
        if (g_list[i] == vm->self || (screen >= 0 && in->screen != screen)) continue;
        if (dsd_geom_bbox(vm->world, in, false, 0, 0, &b) && dsd_box_overlap(box, &b)) return g_list[i];
    }
    return DSD_NO_INST;
}

// The first instance the target names (not self, same screen) whose bbox contains (x, y), or DSD_NO_INST.
static uint32_t first_at_point(const DsdVm *vm, DsdValue target, int64_t x, int64_t y) {
    DsdBox point = {x, y, x + 1, y + 1}; // the 1/4096-pixel cell at the point
    return first_overlap(vm, target, &point, query_screen(vm));
}

// instance_place / place_meeting / place_free: the first instance overlapping self's bbox moved to (x, y).
static bool place_query(DsdVm *vm, uint32_t bi, DsdValue *args, DsdValue target, uint32_t *found) {
    int32_t x;
    int32_t y;
    if (!dsd_bi_arg_q20(vm, bi, args, 0, &x) || !dsd_bi_arg_q20(vm, bi, args, 1, &y)) return false;
    DsdBox box;
    *found = DSD_NO_INST;
    if (vm->self != DSD_VM_NO_INST && dsd_geom_bbox(vm->world, dsd_inst_at(vm->self), true, x, y, &box)) {
        *found = first_overlap(vm, target, &box, query_screen(vm));
    }
    return true;
}

// ---- Instances ----------------------------------------------------------------------------------------------------

bool dsd_bi_instance_create(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int32_t x;
    int32_t y;
    uint32_t obj;
    if (!dsd_bi_arg_q20(vm, DSD_BI_instance_create, args, 0, &x) ||
        !dsd_bi_arg_q20(vm, DSD_BI_instance_create, args, 1, &y) ||
        !dsd_bi_arg_asset(vm, DSD_BI_instance_create, args, 2, DSD_ASSET_OBJECT, "an object", &obj)) {
        return false;
    }
    uint32_t idx;
    // The object's Screen property picks the screen (PLAN.md 3.3); other in its Create event is the creator.
    if (!dsd_engine_create(obj, x, y, vm->world->objects[obj].screen, vm->self, &idx)) return false;
    args[0] = dsd_inst(dsd_inst_at(idx)->id);
    return !vm->halted; // the Create event may have run HALT (builtins.h)
}

bool dsd_bi_instance_destroy(DsdVm *vm, DsdValue *args, uint32_t argc) {
    DsdValue target = argc == 0 ? dsd_int(DSD_INST_SELF) : args[0];
    if (argc > 0 && !query_target(vm, DSD_BI_instance_destroy, args, 0)) return false;
    // Destroy events may create instances: only the instances that exist now are candidates.
    uint32_t n = dsd_engine_targets(target, g_list, DSD_C13_INSTANCES_MAX);
    static uint16_t victims[DSD_C13_INSTANCES_MAX];
    for (uint32_t i = 0; i < n; i++) victims[i] = g_list[i];
    for (uint32_t i = 0; i < n; i++) {
        if (!dsd_engine_destroy(victims[i])) return false;
    }
    args[0] = dsd_undef();
    return !vm->halted; // a Destroy event may have run HALT (builtins.h)
}

bool dsd_bi_instance_exists(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!query_target(vm, DSD_BI_instance_exists, args, 0)) return false;
    args[0] = dsd_bool(dsd_engine_targets(args[0], g_list, 1) == 1);
    return true;
}

bool dsd_bi_instance_number(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!query_target(vm, DSD_BI_instance_number, args, 0)) return false;
    args[0] = dsd_int((int32_t)dsd_engine_targets(args[0], g_list, DSD_C13_INSTANCES_MAX));
    return true;
}

bool dsd_bi_instance_find(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int32_t k;
    if (!query_target(vm, DSD_BI_instance_find, args, 0) || !dsd_bi_arg_int(vm, DSD_BI_instance_find, args, 1, &k)) {
        return false;
    }
    uint32_t n = dsd_engine_targets(args[0], g_list, DSD_C13_INSTANCES_MAX);
    args[0] = k >= 0 && (uint32_t)k < n ? inst_value(g_list[k]) : dsd_int(NOONE_VALUE);
    return true;
}

bool dsd_bi_instance_nearest(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t x;
    int64_t y;
    if (!dsd_bi_arg_q12(vm, DSD_BI_instance_nearest, args, 0, &x) ||
        !dsd_bi_arg_q12(vm, DSD_BI_instance_nearest, args, 1, &y) ||
        !query_target(vm, DSD_BI_instance_nearest, args, 2)) {
        return false;
    }
    uint32_t n = dsd_engine_targets(args[2], g_list, DSD_C13_INSTANCES_MAX);
    uint32_t best = DSD_NO_INST;
    int32_t best_d = INT32_MAX;
    for (uint32_t i = 0; i < n; i++) {
        const DsdInstance *in = dsd_inst_at(g_list[i]);
        int32_t d = dsd_fx_hypot(in->x - x, in->y - y);
        if (d < best_d) { // ties keep the earliest-created
            best_d = d;
            best = g_list[i];
        }
    }
    args[0] = inst_value(best);
    return true;
}

bool dsd_bi_instance_place(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    uint32_t found;
    if (!query_target(vm, DSD_BI_instance_place, args, 2) || !place_query(vm, DSD_BI_instance_place, args, args[2], &found)) {
        return false;
    }
    args[0] = inst_value(found);
    return true;
}

bool dsd_bi_place_meeting(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    uint32_t found;
    if (!query_target(vm, DSD_BI_place_meeting, args, 2) || !place_query(vm, DSD_BI_place_meeting, args, args[2], &found)) {
        return false;
    }
    args[0] = dsd_bool(found != DSD_NO_INST);
    return true;
}

bool dsd_bi_place_free(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    uint32_t found;
    if (!place_query(vm, DSD_BI_place_free, args, dsd_int(DSD_INST_ALL), &found)) return false;
    args[0] = dsd_bool(found == DSD_NO_INST);
    return true;
}

bool dsd_bi_position_meeting(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t x;
    int64_t y;
    if (!dsd_bi_arg_q12(vm, DSD_BI_position_meeting, args, 0, &x) ||
        !dsd_bi_arg_q12(vm, DSD_BI_position_meeting, args, 1, &y) ||
        !query_target(vm, DSD_BI_position_meeting, args, 2)) {
        return false;
    }
    args[0] = dsd_bool(first_at_point(vm, args[2], x, y) != DSD_NO_INST);
    return true;
}

bool dsd_bi_collision_point(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t x;
    int64_t y;
    if (!dsd_bi_arg_q12(vm, DSD_BI_collision_point, args, 0, &x) ||
        !dsd_bi_arg_q12(vm, DSD_BI_collision_point, args, 1, &y) ||
        !query_target(vm, DSD_BI_collision_point, args, 2)) {
        return false;
    }
    args[0] = inst_value(first_at_point(vm, args[2], x, y));
    return true;
}

bool dsd_bi_collision_rectangle(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t c[4];
    for (uint32_t i = 0; i < 4; i++) {
        if (!dsd_bi_arg_q12(vm, DSD_BI_collision_rectangle, args, i, &c[i])) return false;
    }
    if (!query_target(vm, DSD_BI_collision_rectangle, args, 4)) return false;
    DsdBox box = {c[0] < c[2] ? c[0] : c[2], c[1] < c[3] ? c[1] : c[3], c[0] < c[2] ? c[2] : c[0],
                  c[1] < c[3] ? c[3] : c[1]};
    args[0] = inst_value(first_overlap(vm, args[4], &box, query_screen(vm)));
    return true;
}

// Gap between two intervals [a0, a1) and [b0, b1): 0 when they overlap.
static int64_t gap(int64_t a0, int64_t a1, int64_t b0, int64_t b1) {
    if (b0 >= a1) return b0 - a1;
    if (a0 >= b1) return a0 - b1;
    return 0;
}

bool dsd_bi_distance_to_object(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!query_target(vm, DSD_BI_distance_to_object, args, 0)) return false;
    if (vm->self == DSD_VM_NO_INST) {
        args[0] = dsd_int(0);
        return true;
    }
    // Shortest distance between bboxes; an instance without a sprite is its position.
    const DsdInstance *me = dsd_inst_at(vm->self);
    DsdBox a;
    if (!dsd_geom_bbox(vm->world, me, false, 0, 0, &a)) a = (DsdBox){me->x, me->y, me->x, me->y};
    uint32_t n = dsd_engine_targets(args[0], g_list, DSD_C13_INSTANCES_MAX);
    int32_t best = -1;
    for (uint32_t i = 0; i < n; i++) {
        if (g_list[i] == vm->self) continue;
        const DsdInstance *in = dsd_inst_at(g_list[i]);
        DsdBox b;
        if (!dsd_geom_bbox(vm->world, in, false, 0, 0, &b)) b = (DsdBox){in->x, in->y, in->x, in->y};
        int32_t d = dsd_fx_hypot(gap(a.left, a.right, b.left, b.right), gap(a.top, a.bottom, b.top, b.bottom));
        if (best < 0 || d < best) best = d;
    }
    args[0] = best < 0 ? dsd_int(0) : dsd_real(best);
    return true;
}

// ---- Events -------------------------------------------------------------------------------------------------------

bool dsd_bi_event_inherited(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    args[0] = dsd_undef();
    return dsd_engine_event_inherited() && !vm->halted; // the parent's event may have run HALT (builtins.h)
}

bool dsd_bi_event_user(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int32_t n;
    if (!dsd_bi_arg_int(vm, DSD_BI_event_user, args, 0, &n)) return false;
    args[0] = dsd_undef();
    if (n < 0 || n >= USER_EVENTS || vm->self == DSD_VM_NO_INST) return true; // no such event: nothing runs
    return dsd_engine_event(vm->self, DSD_EVENT_ID(DSD_EV_USER, n), vm->other) && !vm->halted; // builtins.h
}

// ---- Rooms and the game (changes take effect at the end of the frame) ---------------------------------------------

// Raises R542 for a room step past either end of the room order.
static bool no_room(DsdVm *vm, uint32_t bi, const char *which) {
    uint32_t len;
    DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_ARGUMENT);
    dsd_text_str(&t, dsd_builtin_info[bi].name);
    dsd_text_str(&t, ": there is no room ");
    dsd_text_str(&t, which);
    dsd_text_char(&t, ' ');
    dsd_text_str(&t, dsd_prog_str(vm->prog, vm->world->rooms[dsd_engine.room].name_str, &len));
    return false;
}

bool dsd_bi_room_goto(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    uint32_t r;
    if (!dsd_bi_arg_asset(vm, DSD_BI_room_goto, args, 0, DSD_ASSET_ROOM, "a room", &r)) return false;
    dsd_engine.pending_room = r;
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_room_goto_next(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (dsd_engine.room + 1 >= vm->world->room_count) return no_room(vm, DSD_BI_room_goto_next, "after");
    dsd_engine.pending_room = dsd_engine.room + 1;
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_room_goto_previous(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (dsd_engine.room == 0) return no_room(vm, DSD_BI_room_goto_previous, "before");
    dsd_engine.pending_room = dsd_engine.room - 1;
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_room_restart(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)vm;
    (void)argc;
    dsd_engine.pending_room = dsd_engine.room;
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_game_restart(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    dsd_engine.pending_game_restart = true;
    dsd_engine.pending_room = vm->prog->first_room;
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_game_end(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)vm;
    (void)argc;
    dsd_engine.ending = true; // Game End and DSD|EXIT|0 at the end of this frame
    args[0] = dsd_undef();
    return true;
}
