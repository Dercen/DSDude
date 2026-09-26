// engine.c: the room-game engine (engine.h): the frame in contracts/events.md section 2 order, events and their
// inheritance, `with` loops and target resolution, rooms (section 4) and the DSD|STAT / DSD|MEM lines.
#include "engine.h"

#include <string.h>

#include "collision.h"
#include "drawlist.h"
#include "dsd_log.h"
#include "errors.h"
#include "fixed.h"
#include "game.h"
#include "geometry.h"

#define POOL DSD_C13_INSTANCES_MAX
#define COLLISION_LIST_MAX 4096u        // (object, collision target) pairs, own and inherited, for the whole game
#define BUTTON_EVENT_KINDS 3u           // pressed, released, held
#define PX(v) ((int32_t)(v) * DSD_FX_ONE) // whole pixels to Q20.12
#define KB 1024u
#define ROOM_ARENA_KB (DSD_C13_ROOM_ARENA_BYTES / KB)
#define MS_PER_SECOND 1000u

DsdEngine dsd_engine;

// Collision targets per object (own and inherited handlers), ascending object index, built at boot.
static uint16_t g_coll_start[DSD_RT_OBJECTS_MAX];
static uint16_t g_coll_count[DSD_RT_OBJECTS_MAX];
static uint16_t g_coll_targets[COLLISION_LIST_MAX];
// The snapshot a stage iterates (stages never nest).
static uint16_t g_snap[POOL];
// millis at the last DSD|STAT line (for fps).
static uint32_t g_stat_millis;

// ---- Errors outside script code ----------------------------------------------------------------------------------

// Starts an engine error that no instruction caused (asset loading): no object, event, file or line.
static DsdText engine_error(int32_t code) {
    DsdVm *vm = dsd_engine.vm;
    vm->pc = DSD_VM_NO_PC;
    vm->self = DSD_VM_NO_INST;
    vm->ev_id = DSD_VM_NO_EVENT;
    return dsd_vm_error_begin(vm, code);
}

// Name of string `index` of the program (NUL-terminated).
static const char *str_at(uint32_t index) {
    uint32_t len;
    return dsd_prog_str(dsd_engine.prog, index, &len);
}

// ---- Events -----------------------------------------------------------------------------------------------------

// Runs FUNC `func` as event `ev_id` of instance `self` (handler owned by object `owner`). The running context is
// restored afterwards; on an error it is kept, so the report names the failing object and event.
static bool run_handler(uint32_t func, uint32_t self, uint32_t other, uint32_t ev_id, uint32_t owner) {
    DsdVm *vm = dsd_engine.vm;
    uint32_t saved_self = vm->self;
    uint32_t saved_other = vm->other;
    uint32_t saved_ev = vm->ev_id;
    uint32_t saved_owner = vm->ev_owner;
    vm->self = self;
    vm->other = other;
    vm->ev_id = ev_id;
    vm->ev_owner = owner;
    DsdValue result;
    if (dsd_vm_call(vm, func, 0, 0, &result) != DSD_R_NONE) return false;
    vm->self = saved_self;
    vm->other = saved_other;
    vm->ev_id = saved_ev;
    vm->ev_owner = saved_owner;
    return true;
}

bool dsd_engine_event(uint32_t idx, uint32_t event_id, uint32_t other) {
    uint32_t owner;
    uint32_t func = dsd_world_event(dsd_engine.world, dsd_inst_at(idx)->object, event_id, &owner);
    return func == DSD_NO_EVENT || run_handler(func, idx, other, event_id, owner);
}

bool dsd_engine_event_inherited(void) {
    DsdVm *vm = dsd_engine.vm;
    if (vm->ev_id == DSD_VM_NO_EVENT || vm->ev_id == DSD_EV_CREATION_CODE || vm->self == DSD_VM_NO_INST) return true;
    int32_t parent = dsd_engine.world->objects[vm->ev_owner].parent;
    if (parent < 0) return true;
    uint32_t owner;
    uint32_t func = dsd_world_event(dsd_engine.world, (uint32_t)parent, vm->ev_id, &owner);
    return func == DSD_NO_EVENT || run_handler(func, vm->self, vm->other, vm->ev_id, owner);
}

bool dsd_engine_create(uint32_t obj, int32_t x, int32_t y, uint32_t screen, uint32_t creator, uint32_t *out_idx) {
    uint32_t idx = dsd_inst_new(dsd_engine.world, obj, x, y, screen);
    if (idx == DSD_NO_INST) {
        dsd_vm_error(dsd_engine.vm, DSD_R_TOO_MANY_INST, "There are too many instances at once (the most is 512)");
        return false;
    }
    *out_idx = idx;
    return dsd_engine_event(idx, DSD_EVENT_ID(DSD_EV_CREATE, 0), creator);
}

bool dsd_engine_destroy(uint32_t idx) {
    if (!dsd_inst_live(idx)) return true;
    dsd_inst_kill(idx);
    return dsd_engine_event(idx, DSD_EVENT_ID(DSD_EV_DESTROY, 0), DSD_VM_NO_INST);
}

// ---- Targets ----------------------------------------------------------------------------------------------------

// Adds idx to out when it is live and there is room; returns the new count.
static uint32_t add_live(uint16_t *out, uint32_t n, uint32_t cap, uint32_t idx) {
    if (dsd_inst_live(idx) && n < cap) out[n++] = (uint16_t)idx;
    return n;
}

uint32_t dsd_engine_targets(DsdValue target, uint16_t *out, uint32_t cap) {
    const DsdVm *vm = dsd_engine.vm;
    const DsdInstances *all = &dsd_instances;
    uint32_t n = 0;
    if (target.tag == DSD_TAG_ASSET && ((uint32_t)target.payload >> DSD_ASSET_KIND_SHIFT) == DSD_ASSET_OBJECT) {
        uint32_t obj = (uint32_t)target.payload & DSD_ASSET_INDEX_MASK;
        for (uint32_t i = 0; i < all->count; i++) {
            uint32_t idx = all->order[i];
            if (dsd_world_is_a(dsd_engine.world, all->pool[idx].object, obj)) n = add_live(out, n, cap, idx);
        }
        return n;
    }
    if (target.tag == DSD_TAG_INST) return add_live(out, n, cap, dsd_inst_find_id(target.payload));
    if (target.tag != DSD_TAG_INT) return 0;
    switch (target.payload) {
    case DSD_INST_SELF:
        return add_live(out, n, cap, vm->self);
    case DSD_INST_OTHER:
        return add_live(out, n, cap, vm->other);
    case DSD_INST_ALL:
        for (uint32_t i = 0; i < all->count; i++) n = add_live(out, n, cap, all->order[i]);
        return n;
    default: // noone, or an instance id kept in a plain number
        return target.payload >= DSD_FIRST_INSTANCE_ID ? add_live(out, n, cap, dsd_inst_find_id(target.payload)) : 0;
    }
}

uint32_t dsd_engine_target_one(DsdValue target, const char *what) {
    uint16_t one;
    if (dsd_engine_targets(target, &one, 1) == 1) return one;
    DsdVm *vm = dsd_engine.vm;
    if (target.tag == DSD_TAG_ASSET) {
        DsdText t = dsd_vm_error_begin(vm, DSD_R_NO_OBJECT_INST);
        dsd_text_str(&t, "There is no ");
        dsd_text_str(&t, str_at(dsd_engine.world->objects[(uint32_t)target.payload & DSD_ASSET_INDEX_MASK].name_str));
        dsd_text_str(&t, " in the room to read ");
        dsd_text_str(&t, what);
        dsd_text_str(&t, " from");
    } else {
        DsdText t = dsd_vm_error_begin(vm, DSD_R_NO_INSTANCE);
        dsd_text_str(&t, "There is no instance ");
        dsd_value_format(vm, target, &t);
        dsd_text_str(&t, " (it was destroyed, or never existed)");
    }
    return DSD_NO_INST;
}

// ---- `with` -----------------------------------------------------------------------------------------------------

bool dsd_with_begin(DsdValue target, DsdValue *state, bool *empty) {
    DsdEngine *e = &dsd_engine;
    DsdVm *vm = e->vm;
    if (e->with_depth == DSD_RT_WITH_DEPTH) {
        dsd_vm_error(vm, DSD_R_TOO_MANY_INST, "Too many with loops inside each other (the most is 32)");
        return false;
    }
    uint32_t base = e->with_top;
    uint32_t n = dsd_engine_targets(target, &e->with_items[base], DSD_RT_WITH_ITEMS - base);
    *empty = n == 0;
    if (n == 0) return true;
    DsdWithLoop *w = &e->with_loops[e->with_depth];
    w->base = base;
    w->count = n;
    w->pos = 0;
    w->saved_self = vm->self;
    w->saved_other = vm->other;
    e->with_top += n;
    *state = dsd_int((int32_t)e->with_depth++);
    vm->other = vm->self; // the outer self becomes other
    vm->self = e->with_items[base];
    return true;
}

// The open loop a state value names, or NULL when the value is not one (the compiler never lets that happen).
static DsdWithLoop *loop_of(DsdValue state) {
    DsdEngine *e = &dsd_engine;
    if (state.tag != DSD_TAG_INT || state.payload < 0 || (uint32_t)state.payload >= e->with_depth) return 0;
    return &e->with_loops[state.payload];
}

bool dsd_with_next(DsdValue state) {
    DsdWithLoop *w = loop_of(state);
    if (w == 0) return false;
    while (++w->pos < w->count) {
        uint32_t idx = dsd_engine.with_items[w->base + w->pos];
        if (dsd_inst_live(idx)) { // instances destroyed mid-loop are skipped (rule 3)
            dsd_engine.vm->self = idx;
            return true;
        }
    }
    return false;
}

void dsd_with_end(DsdValue state) {
    DsdWithLoop *w = loop_of(state);
    if (w == 0) return;
    dsd_engine.vm->self = w->saved_self;
    dsd_engine.vm->other = w->saved_other;
    dsd_engine.with_depth = (uint32_t)state.payload;
    dsd_engine.with_top = w->base;
}

// ---- Stages -----------------------------------------------------------------------------------------------------

// Takes the stage snapshot: the live list in creation order.
static uint32_t snapshot(void) {
    uint32_t n = dsd_instances.count;
    memcpy(g_snap, dsd_instances.order, n * sizeof g_snap[0]);
    return n;
}

// True while events should keep running this frame (HALT stops them).
static bool running(void) { return !dsd_engine.vm->halted; }

// Runs one event for every live instance of a fresh snapshot, in creation order.
static bool stage(uint32_t event_id) {
    uint32_t n = snapshot();
    for (uint32_t i = 0; i < n && running(); i++) {
        if (dsd_inst_live(g_snap[i]) && !dsd_engine_event(g_snap[i], event_id, DSD_VM_NO_INST)) return false;
    }
    return true;
}

static bool stage_alarms(void) {
    uint32_t n = snapshot();
    for (uint32_t i = 0; i < n && running(); i++) {
        uint32_t idx = g_snap[i];
        for (uint32_t a = 0; a < DSD_C13_ALARMS && dsd_inst_live(idx); a++) {
            int32_t *alarm = &dsd_inst_at(idx)->alarm[a];
            if (*alarm > 0 && --*alarm == 0) {
                *alarm = -1; // fired alarms switch off
                if (!dsd_engine_event(idx, DSD_EVENT_ID(DSD_EV_ALARM, a), DSD_VM_NO_INST)) return false;
            }
        }
    }
    return true;
}

// Runs event `id` for every live instance of the snapshot (n entries) that passes `want` (NULL: all).
static bool for_snapshot(uint32_t n, uint32_t id, bool (*want)(uint32_t idx)) {
    for (uint32_t i = 0; i < n && running(); i++) {
        uint32_t idx = g_snap[i];
        if (!dsd_inst_live(idx) || (want != 0 && !want(idx))) continue;
        if (!dsd_engine_event(idx, id, DSD_VM_NO_INST)) return false;
    }
    return true;
}

bool dsd_engine_stylus_on(uint32_t idx) {
    const DsdInstance *in = dsd_inst_at(idx);
    DsdBox box;
    return in->screen == DSD_SCREEN_BOTTOM && dsd_engine.input.touching &&
           dsd_geom_bbox(dsd_engine.world, in, false, 0, 0, &box) &&
           dsd_box_contains(&box, PX(dsd_engine.touch_x), PX(dsd_engine.touch_y));
}

// touch_pressed: the stylus went down on the instance (remembered for touch_released).
static bool touch_down_on(uint32_t idx) {
    if (!dsd_engine_stylus_on(idx)) return false;
    dsd_inst_at(idx)->touched = 1;
    return true;
}

// touch_released: the stylus lifted after touching the instance.
static bool touch_up_from(uint32_t idx) {
    if (!dsd_inst_at(idx)->touched) return false;
    dsd_inst_at(idx)->touched = 0;
    return true;
}

// Button, Touch and Global Touch events: kinds 8-16 in order, then buttons in btn_* order.
static bool stage_input(void) {
    const DsdEngine *e = &dsd_engine;
    uint32_t n = snapshot();
    uint32_t held = e->input.held;
    uint32_t masks[BUTTON_EVENT_KINDS] = {held & ~e->held_prev, e->held_prev & ~held, held};
    for (uint32_t k = 0; k < BUTTON_EVENT_KINDS; k++) {
        for (uint32_t b = 0; b < DSD_BTN_COUNT; b++) {
            if (((masks[k] >> b) & 1u) && !for_snapshot(n, DSD_EVENT_ID(DSD_EV_BUTTON_PRESSED + k, b), 0)) return false;
        }
    }
    bool down = e->input.touching && !e->touching_prev;
    bool up = !e->input.touching && e->touching_prev;
    bool on = e->input.touching;
    if (down && !for_snapshot(n, DSD_EVENT_ID(DSD_EV_TOUCH_PRESSED, 0), touch_down_on)) return false;
    if (up && !for_snapshot(n, DSD_EVENT_ID(DSD_EV_TOUCH_RELEASED, 0), touch_up_from)) return false;
    if (on && !for_snapshot(n, DSD_EVENT_ID(DSD_EV_TOUCH_HELD, 0), dsd_engine_stylus_on)) return false;
    if (down && !for_snapshot(n, DSD_EVENT_ID(DSD_EV_GLOBAL_TOUCH_PRESSED, 0), 0)) return false;
    if (up && !for_snapshot(n, DSD_EVENT_ID(DSD_EV_GLOBAL_TOUCH_RELEASED, 0), 0)) return false;
    return !on || for_snapshot(n, DSD_EVENT_ID(DSD_EV_GLOBAL_TOUCH_HELD, 0), 0);
}

// speed * trig / 4096, truncated toward zero (the fixed multiply rule).
static int32_t scaled(int32_t v, int32_t trig) {
    int64_t p = (int64_t)v * trig;
    return dsd_lo32(p >= 0 ? (p >> DSD_FX_SHIFT) : -((-p) >> DSD_FX_SHIFT));
}

// Built-in motion, one native pass (contracts/events.md step 6).
static void stage_motion(void) {
    const DsdInstances *all = &dsd_instances;
    for (uint32_t i = 0; i < all->count; i++) {
        uint32_t idx = all->order[i];
        if (!dsd_inst_live(idx)) continue;
        DsdInstance *in = dsd_inst_at(idx);
        in->xprevious = in->x;
        in->yprevious = in->y;
        if (in->friction != 0 && in->speed != 0) {
            // Friction pulls the speed toward 0 without crossing it.
            int32_t mag = in->speed < 0 ? -in->speed : in->speed;
            mag = mag > in->friction ? mag - in->friction : 0;
            in->speed = in->speed < 0 ? -mag : mag;
            dsd_inst_sync_cartesian(in);
        }
        if (in->gravity != 0) {
            in->hspeed += scaled(in->gravity, dsd_fx_dcos(in->gravity_direction));
            in->vspeed -= scaled(in->gravity, dsd_fx_dsin(in->gravity_direction)); // y points down
            dsd_inst_sync_polar(in);
        }
        in->x += in->hspeed;
        in->y += in->vspeed;
        dsd_geom_epoch++;
    }
}

// Collision events (contracts/events.md section 6): for each instance in creation order with collision handlers,
// each target object in index order, each overlapping instance of it on the same screen in creation order.
static bool stage_collisions(void) {
    const DsdWorld *w = dsd_engine.world;
    static uint16_t cand[POOL];
    uint32_t n = snapshot();
    dsd_coll_build(w, g_snap, n);
    for (uint32_t i = 0; i < n && running(); i++) {
        uint32_t a = g_snap[i];
        if (!dsd_inst_live(a)) continue;
        uint32_t obj = dsd_inst_at(a)->object;
        for (uint32_t k = 0; k < g_coll_count[obj] && dsd_inst_live(a); k++) {
            uint32_t target = g_coll_targets[g_coll_start[obj] + k];
            // Candidates in creation order from the grid. An event may move, resize or destroy anything: dead
            // instances are skipped by the checks below, and moved or resized ones make the grid stale.
            uint32_t m = dsd_coll_candidates(i, 0, cand);
            uint32_t c = 0;
            while (c < m && dsd_inst_live(a) && running()) {
                uint32_t j = cand[c++];
                uint32_t b = g_snap[j];
                DsdBox ba;
                DsdBox bb;
                if (!dsd_inst_live(b) || !dsd_world_is_a(w, dsd_inst_at(b)->object, target)) continue;
                if (!dsd_coll_box(i, &ba) || !dsd_coll_box(j, &bb) || !dsd_box_overlap(&ba, &bb)) continue;
                if (!dsd_engine_event(a, DSD_EVENT_ID(DSD_EV_COLLISION, target), b)) return false;
                // Unchanged geometry keeps the list valid; otherwise rebuild and resume after b.
                if (dsd_coll_stale()) {
                    dsd_coll_build(w, g_snap, n);
                    m = dsd_coll_candidates(i, j + 1, cand);
                    c = 0;
                }
            }
        }
    }
    return true;
}

// Animation (step 9): image_index advances by image_speed and wraps at image_number, firing Animation End.
static bool stage_animation(void) {
    const DsdWorld *w = dsd_engine.world;
    uint32_t n = snapshot();
    for (uint32_t i = 0; i < n && running(); i++) {
        uint32_t idx = g_snap[i];
        if (!dsd_inst_live(idx)) continue;
        DsdInstance *in = dsd_inst_at(idx);
        if (in->sprite_index < 0 || in->image_speed == 0) continue;
        uint32_t frames = w->assets[in->sprite_index].aux;
        int64_t span = (int64_t)(frames == 0 ? 1 : frames) * DSD_FX_ONE;
        int64_t ii = (int64_t)in->image_index + in->image_speed;
        bool wrapped = ii >= span || ii < 0;
        if (wrapped) {
            int64_t r;
            dsd_div64(ii, span, 0, &r);
            ii = r < 0 ? r + span : r;
        }
        in->image_index = (int32_t)ii;
        if (wrapped && !dsd_engine_event(idx, DSD_EVENT_ID(DSD_EV_ANIMATION_END, 0), DSD_VM_NO_INST)) return false;
    }
    return true;
}

// Outside Room (step 10, section 5): fires once when an instance that has been inside leaves the room rectangle.
static bool stage_outside(void) {
    const DsdEngine *e = &dsd_engine;
    const DsdRoom *rm = &e->world->rooms[e->room];
    DsdBox room = {0, 0, PX(rm->width), PX(rm->height)};
    uint32_t n = snapshot();
    for (uint32_t i = 0; i < n && running(); i++) {
        uint32_t idx = g_snap[i];
        if (!dsd_inst_live(idx)) continue;
        DsdInstance *in = dsd_inst_at(idx);
        DsdBox box;
        // Without a sprite the instance is its position (a point).
        bool inside = dsd_geom_bbox(e->world, in, false, 0, 0, &box) ? dsd_box_overlap(&box, &room)
                                                                      : dsd_box_contains(&room, in->x, in->y);
        if (inside) {
            in->outside = DSD_OUTSIDE_IN;
        } else if (in->outside == DSD_OUTSIDE_IN) {
            in->outside = DSD_OUTSIDE_FIRED;
            if (!dsd_engine_event(idx, DSD_EVENT_ID(DSD_EV_OUTSIDE_ROOM, 0), DSD_VM_NO_INST)) return false;
        }
    }
    return true;
}

// The default draw of an instance without a Draw event: draw_self(), run in that event's context so an error (R572)
// names the object and the Draw event (with no file or line: no script code ran).
static bool default_draw(uint32_t idx) {
    DsdVm *vm = dsd_engine.vm;
    uint32_t saved_self = vm->self;
    uint32_t saved_ev = vm->ev_id;
    uint32_t saved_owner = vm->ev_owner;
    vm->self = idx;
    vm->ev_id = DSD_EVENT_ID(DSD_EV_DRAW, 0);
    vm->ev_owner = dsd_inst_at(idx)->object;
    vm->pc = DSD_VM_NO_PC;
    if (!dsd_draw_self(vm, idx)) return false;
    vm->self = saved_self;
    vm->ev_id = saved_ev;
    vm->ev_owner = saved_owner;
    return true;
}

// Draw (step 11): visible instances run their Draw event, or draw_self() without one; then each screen's shadow OAM
// is built from the draw list and submitted (step 12's commit happens in dsd_plat_frame_end).
static bool stage_draw(void) {
    DsdEngine *e = &dsd_engine;
    uint32_t draw_id = DSD_EVENT_ID(DSD_EV_DRAW, 0);
    uint32_t n = snapshot();
    dsd_draw_begin();
    for (uint32_t i = 0; i < n && running(); i++) {
        uint32_t idx = g_snap[i];
        if (!dsd_inst_live(idx) || !dsd_inst_at(idx)->visible) continue;
        e->draw_screen = dsd_inst_at(idx)->screen;
        e->draw_screen_set = false;
        uint32_t owner;
        bool has_draw = dsd_world_event(e->world, dsd_inst_at(idx)->object, draw_id, &owner) != DSD_NO_EVENT;
        if (!(has_draw ? dsd_engine_event(idx, draw_id, DSD_VM_NO_INST) : default_draw(idx))) return false;
    }
    for (uint32_t s = 0; s < DSD_SCREEN_COUNT; s++) dsd_plat_bg_scroll(s, e->view_x[s], e->view_y[s]);
    dsd_draw_commit();
    return true;
}

// ---- Rooms ------------------------------------------------------------------------------------------------------

// True when rooms a and b load the same asset set (then a room change keeps it loaded).
static bool same_assets(uint32_t a, uint32_t b) {
    const DsdRoom *ra = &dsd_engine.world->rooms[a];
    const DsdRoom *rb = &dsd_engine.world->rooms[b];
    if (ra->sound_count != rb->sound_count || memcmp(ra->sounds, rb->sounds, ra->sound_count * sizeof(uint32_t)) != 0) {
        return false;
    }
    for (uint32_t s = 0; s < DSD_SCREEN_COUNT; s++) {
        uint32_t k = (uint32_t)ra->sprite_count[s] + ra->bg_count[s];
        if (ra->background[s] != rb->background[s] || ra->sprite_count[s] != rb->sprite_count[s] ||
            ra->bg_count[s] != rb->bg_count[s] || memcmp(ra->set[s], rb->set[s], k * sizeof(uint32_t)) != 0) {
            return false;
        }
    }
    return true;
}

// Raises an asset load error (R570/R571) naming the asset.
static bool asset_failed(int32_t code, uint32_t asset) {
    DsdText t = engine_error(code);
    dsd_text_str(&t, str_at(dsd_engine.world->assets[asset].name_str));
    dsd_text_str(&t, " could not be loaded");
    return false;
}

// Loads room r's asset set (C3): sprites and background per screen, then its sounds and music.
static bool load_assets(uint32_t r) {
    DsdEngine *e = &dsd_engine;
    const DsdWorld *w = e->world;
    const DsdRoom *rm = &w->rooms[r];
    dsd_plat_assets_free(); // also stops the music
    e->music = -1;
    memset(e->sprite_handle, 0xFF, sizeof e->sprite_handle); // -1: not loaded
    for (uint32_t s = 0; s < DSD_SCREEN_COUNT; s++) {
        for (uint32_t k = 0; k < rm->sprite_count[s]; k++) {
            uint32_t a = rm->set[s][k];
            // C11: the core supplies the frame's OBJ box (from SPRG) and the frame count (from ASET).
            DsdSpriteGeom g;
            dsd_geom_sprite(w, a, &g);
            uint32_t box_w;
            uint32_t box_h;
            dsd_geom_obj_box(g.width, g.height, &box_w, &box_h);
            dsd_sprite_info info = {(uint16_t)box_w, (uint16_t)box_h, (uint16_t)w->assets[a].aux, 0};
            int32_t h = dsd_plat_sprite_load(s, str_at(w->assets[a].path_str), &info);
            if (h < 0) return asset_failed(DSD_R_SPRITE_LOAD, a);
            e->sprite_handle[s][a] = (int16_t)h;
        }
        int32_t bg = rm->background[s];
        if (dsd_plat_bg_load(s, bg >= 0 ? str_at(w->assets[bg].path_str) : 0) < 0) {
            return asset_failed(DSD_R_SPRITE_LOAD, (uint32_t)bg);
        }
    }
    for (uint32_t k = 0; k < rm->sound_count; k++) {
        const DsdAssetRec *a = &w->assets[rm->sounds[k]];
        int32_t rc = a->kind == DSD_ASSET_MUSIC ? dsd_plat_music_load(a->aux) : dsd_plat_sfx_load(a->aux);
        if (rc != DSD_PLAT_OK) return asset_failed(DSD_R_SOUND_LOAD, rm->sounds[k]);
    }
    e->loaded_room = r;
    return true;
}

// DSD|MEM at room start (C8): the core's figures plus the platform's.
static void log_mem(void) {
    dsd_mem_report m;
    dsd_plat_mem_report(&m);
    static char line[DSD_LOG_LINE_MAX];
    DsdText t;
    dsd_text_init(&t, line, sizeof line);
    dsd_text_str(&t, "inst=");
    dsd_text_uint(&t, dsd_instances.count);
    dsd_text_char(&t, '/');
    dsd_text_uint(&t, POOL);
    dsd_text_str(&t, ",arena=0/");
    dsd_text_uint(&t, ROOM_ARENA_KB);
    dsd_text_str(&t, ",heapfree=");
    dsd_text_uint(&t, m.heap_free_kb);
    dsd_text_str(&t, ",snd=");
    dsd_text_uint(&t, m.snd_used_kb);
    dsd_text_str(&t, "/768,objvram_top=");
    dsd_text_uint(&t, m.objvram_used_kb[0]);
    dsd_text_str(&t, "/128,objvram_bot=");
    dsd_text_uint(&t, m.objvram_used_kb[1]);
    dsd_text_str(&t, "/128,pal16_top=");
    dsd_text_uint(&t, m.pal16_used[0]);
    dsd_text_str(&t, "/16,pal256_top=");
    dsd_text_uint(&t, m.pal256_used[0]);
    dsd_text_str(&t, "/16,pal16_bot=");
    dsd_text_uint(&t, m.pal16_used[1]);
    dsd_text_str(&t, "/16,pal256_bot=");
    dsd_text_uint(&t, m.pal256_used[1]);
    dsd_text_str(&t, "/16,cstack=");
    dsd_text_uint(&t, m.cstack_used_kb);
    dsd_text_char(&t, '/');
    dsd_text_uint(&t, m.cstack_total_kb);
    dsd_log_line("DSD|MEM|", t.buf, t.len);
}

// Loads room r (contracts/events.md section 4 load order): assets, placed instances (Create, then creation code),
// Game Start in the game's first room, Room Start.
static bool load_room_now(uint32_t r) {
    DsdEngine *e = &dsd_engine;
    const DsdRoom *rm = &e->world->rooms[r];
    e->room = r;
    e->pending_room = DSD_NO_ROOM;
    for (uint32_t s = 0; s < DSD_SCREEN_COUNT; s++) {
        e->view_x[s] = rm->view_x[s];
        e->view_y[s] = rm->view_y[s];
    }
    dsd_plat_screens_blank(true);
    if ((e->loaded_room == DSD_NO_ROOM || !same_assets(e->loaded_room, r)) && !load_assets(r)) return false;
    for (uint32_t k = 0; k < rm->inst_count && running(); k++) {
        const DsdRoomInstRec *ri = &rm->insts[k];
        uint32_t idx;
        if (!dsd_engine_create(ri->object, PX(ri->x), PX(ri->y), ri->screen, DSD_VM_NO_INST, &idx)) return false;
        if (ri->creation_func >= 0 && dsd_inst_live(idx) &&
            !run_handler((uint32_t)ri->creation_func, idx, DSD_VM_NO_INST, DSD_EV_CREATION_CODE, ri->object)) {
            return false;
        }
    }
    if (!e->game_started) {
        e->game_started = true;
        if (!stage(DSD_EVENT_ID(DSD_EV_GAME_START, 0))) return false;
    }
    if (!stage(DSD_EVENT_ID(DSD_EV_ROOM_START, 0))) return false;
    dsd_plat_screens_blank(false);
    log_mem();
    return true;
}

// load_room, with its duration left out of the DSD|STAT fps window: loading assets and running Create and Room Start
// events is not a frame, so the window's start moves forward by the time it took (WS3: the first STAT read fps=59).
static bool load_room(uint32_t r) {
    uint32_t start = dsd_plat_millis();
    bool ok = load_room_now(r);
    g_stat_millis += dsd_plat_millis() - start;
    return ok;
}

// A pending room change (end of frame): Room End for everyone, all instances removed (no Destroy), the new room.
static bool change_room(void) {
    DsdEngine *e = &dsd_engine;
    uint32_t target = e->pending_room;
    if (!stage(DSD_EVENT_ID(DSD_EV_ROOM_END, 0))) return false;
    dsd_inst_clear();
    if (e->pending_game_restart) {
        // game_restart: global.* cleared, Game Start again, the first room.
        e->pending_game_restart = false;
        memset(e->vm->global_set, 0, sizeof e->vm->global_set);
        e->game_started = false;
        target = e->prog->first_room;
    }
    return load_room(target);
}

// ---- Boot and frame ---------------------------------------------------------------------------------------------

// Builds the per-object collision target lists (own and inherited handlers).
static bool build_collision_lists(void) {
    const DsdWorld *w = dsd_engine.world;
    uint32_t used = 0;
    for (uint32_t o = 0; o < w->object_count; o++) {
        g_coll_start[o] = (uint16_t)used;
        g_coll_count[o] = 0;
        for (uint32_t t = 0; t < w->object_count; t++) {
            if (dsd_world_event(w, o, DSD_EVENT_ID(DSD_EV_COLLISION, t), 0) == DSD_NO_EVENT) continue;
            if (used == COLLISION_LIST_MAX) {
                DsdText tx = engine_error(DSD_R_FILE_TOO_BIG);
                dsd_text_str(&tx, "The game is too big for the DS (collision events)");
                return false;
            }
            g_coll_targets[used++] = (uint16_t)t;
            g_coll_count[o]++;
        }
    }
    return true;
}

// Game End for every instance, then DSD|EXIT|0 (game_end, HALT).
static int32_t finish(void) {
    DsdVm *vm = dsd_engine.vm;
    bool halted = vm->halted;
    vm->halted = false; // Game End runs even after HALT stopped the frame
    if (!halted && !stage(DSD_EVENT_ID(DSD_EV_GAME_END, 0))) return DSD_GAME_FAILED;
    dsd_log_exit(0);
    return DSD_GAME_EXITED;
}

int32_t dsd_engine_boot(DsdVm *vm, const DsdProgram *prog, const DsdWorld *world) {
    DsdEngine *e = &dsd_engine;
    memset(e, 0, sizeof *e);
    e->vm = vm;
    e->prog = prog;
    e->world = world;
    e->room = DSD_NO_ROOM;
    e->loaded_room = DSD_NO_ROOM;
    e->pending_room = DSD_NO_ROOM;
    e->music = -1;
    vm->world = world;
    vm->mark_extra = dsd_inst_mark_roots;
    dsd_inst_reset();
    g_stat_millis = dsd_plat_millis();
    if (!build_collision_lists()) return DSD_GAME_FAILED;
    dsd_vm_frame_reset(vm); // the first room's Create events run on frame 0's budget
    if (!load_room(prog->first_room)) return DSD_GAME_FAILED;
    return vm->halted ? finish() : DSD_GAME_RUNNING;
}

// DSD|STAT (C8), every DSD_STAT_EVERY frames.
static void log_stat(void) {
    DsdEngine *e = &dsd_engine;
    uint32_t now = dsd_plat_millis();
    uint32_t ms = now - g_stat_millis;
    g_stat_millis = now;
    static char line[DSD_LOG_LINE_MAX];
    DsdText t;
    dsd_text_init(&t, line, sizeof line);
    dsd_text_str(&t, "fps=");
    dsd_text_uint(&t, ms == 0 ? DSD_STAT_EVERY : (DSD_STAT_EVERY * MS_PER_SECOND + ms / 2) / ms);
    dsd_text_str(&t, ",inst=");
    dsd_text_uint(&t, dsd_instances.count);
    dsd_text_str(&t, ",spr_top=");
    dsd_text_uint(&t, dsd_draw_stats.sprites[DSD_SCREEN_TOP]);
    dsd_text_str(&t, ",spr_bot=");
    dsd_text_uint(&t, dsd_draw_stats.sprites[DSD_SCREEN_BOTTOM]);
    dsd_text_str(&t, ",oam_drop=");
    dsd_text_uint(&t, dsd_draw_stats.oam_drop);
    dsd_text_str(&t, ",aff_drop=");
    dsd_text_uint(&t, dsd_draw_stats.aff_drop);
    dsd_text_str(&t, ",sfx_drop=");
    dsd_text_uint(&t, e->sfx_drops);
    dsd_text_str(&t, ",ops=");
    dsd_text_uint(&t, e->ops_last);
    dsd_log_line("DSD|STAT|", t.buf, t.len);
    dsd_plat_log_flush();
}

int32_t dsd_engine_frame(void) {
    DsdEngine *e = &dsd_engine;
    DsdVm *vm = e->vm;
    dsd_vm_frame_reset(vm);
    e->with_depth = 0;
    e->with_top = 0;
    dsd_plat_frame_begin();
    // Input: read once; every event and builtin of the frame sees the same state.
    e->held_prev = e->input.held;
    e->touching_prev = e->input.touching != 0;
    dsd_plat_read_input(&e->input);
    if (e->input.touching) {
        e->touch_x = e->input.touch_x + e->view_x[DSD_SCREEN_BOTTOM];
        e->touch_y = e->input.touch_y + e->view_y[DSD_SCREEN_BOTTOM];
    }
    bool ok = stage(DSD_EVENT_ID(DSD_EV_BEGIN_STEP, 0)) && stage_alarms() && stage_input() &&
              stage(DSD_EVENT_ID(DSD_EV_STEP, 0));
    if (ok && running()) stage_motion();
    ok = ok && stage_collisions() && stage(DSD_EVENT_ID(DSD_EV_END_STEP, 0)) && stage_animation() && stage_outside() &&
         stage_draw();
    if (!ok) return DSD_GAME_FAILED;
    e->ops_last = DSD_RT_WATCHDOG_STEPS - vm->budget;
    dsd_inst_sweep();
    e->frame++;
    dsd_plat_frame_end();
    if (e->frame % DSD_STAT_EVERY == 0) log_stat(); // after frame_end, so millis cover whole frames
    if (vm->halted || e->ending) return finish();
    if (e->pending_room != DSD_NO_ROOM && !change_room()) return DSD_GAME_FAILED;
    return vm->halted ? finish() : DSD_GAME_RUNNING;
}
