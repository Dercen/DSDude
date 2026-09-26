// world.c: parses and checks OBJS, ROOM and ASET (contracts/dsdb.md section 4) into DsdWorld (world.h).
#include "world.h"

#include <string.h>

#include "dsd_limits.h"
#include "errors.h"
#include "textbuf.h"

#define WORD 4u                 // every record field group is 4-byte aligned
#define OBJ_FIXED_BYTES 20u     // nameStr, parent, sprite, visible/screen/depth, slotCount/eventCount
#define PAIR_WORDS 2u           // {symbolId, slot} and {eventId, func}
#define ROOM_FIXED_BYTES 36u    // nameStr, width/height, 2 x {background, viewX, viewY}, instanceCount
#define ALARM_COUNT DSD_C13_ALARMS
#define USER_EVENTS 8u          // user_0 .. user_7
#define BUTTONS 12u             // btn_a .. btn_right

// Records a failure; returns the code for `return fail(...)`.
static int32_t fail(DsdLoadError *err, int32_t code, const char *what, uint32_t index) {
    DsdText t;
    dsd_text_init(&t, err->detail, sizeof err->detail);
    dsd_text_str(&t, what);
    dsd_text_char(&t, ' ');
    dsd_text_uint(&t, index);
    err->code = code;
    return code;
}

static uint32_t rd32(const uint8_t *p) {
    uint32_t v;
    memcpy(&v, p, sizeof v);
    return v;
}
static uint16_t rd16(const uint8_t *p) {
    uint16_t v;
    memcpy(&v, p, sizeof v);
    return v;
}

// A section's record count and offset table, checked: offsets 4-aligned and inside the section.
static bool offset_table(const DsdSection *s, uint32_t count, const uint32_t **offsets) {
    if ((uint64_t)count * WORD > s->size - WORD) return false;
    *offsets = (const uint32_t *)(s->base + WORD);
    for (uint32_t i = 0; i < count; i++) {
        uint32_t off = (*offsets)[i];
        if ((off & (WORD - 1)) != 0 || off >= s->size) return false;
    }
    return true;
}

// True when the function exists and takes no parameters (events and creation code are 0-parameter functions).
static bool event_func_ok(const DsdProgram *p, uint32_t func) { return func < p->func_count && p->funcs[func].params == 0; }

// True when ASET entry `a` exists and has kind `kind` (any of two kinds when kind2 != 0).
static bool asset_is(const DsdWorld *w, uint32_t a, uint32_t kind, uint32_t kind2) {
    return a < w->asset_count && (w->assets[a].kind == kind || (kind2 != 0 && w->assets[a].kind == kind2));
}

// Checks one event id: a known kind with an argument in range.
static bool event_id_ok(const DsdWorld *w, uint32_t id) {
    uint32_t kind = id >> DSD_EV_KIND_SHIFT;
    uint32_t arg = id & DSD_EV_ARG_MASK;
    switch (kind) {
    case DSD_EV_ALARM:
        return arg < ALARM_COUNT;
    case DSD_EV_USER:
        return arg < USER_EVENTS;
    case DSD_EV_COLLISION:
        return arg < w->object_count;
    case DSD_EV_BUTTON_PRESSED:
    case DSD_EV_BUTTON_RELEASED:
    case DSD_EV_BUTTON_HELD:
        return arg < BUTTONS;
    default:
        return kind < DSD_EV_KIND_COUNT && arg == 0;
    }
}

static int32_t load_assets(DsdWorld *w, const DsdProgram *p, DsdLoadError *err) {
    const DsdSection *s = &p->sec[DSDB_SEC_ASET];
    w->asset_count = rd32(s->base);
    if (w->asset_count > DSD_RT_ASSETS_MAX) return fail(err, DSD_R_FILE_TOO_BIG, "assets", w->asset_count);
    if ((uint64_t)w->asset_count * sizeof(DsdAssetRec) > s->size - WORD) return fail(err, DSD_R_BAD_FILE, "ASET", 0);
    w->assets = (const DsdAssetRec *)(s->base + WORD);
    for (uint32_t i = 0; i < w->asset_count; i++) {
        const DsdAssetRec *a = &w->assets[i];
        bool ok = a->kind >= DSD_ASSET_SPRITE && a->kind <= DSD_ASSET_MUSIC && a->name_str < p->str_count &&
                  a->path_str < p->str_count;
        if (!ok) return fail(err, DSD_R_BAD_FILE, "asset", i);
    }
    return DSD_R_NONE;
}

static int32_t load_objects(DsdWorld *w, const DsdProgram *p, DsdLoadError *err) {
    const DsdSection *s = &p->sec[DSDB_SEC_OBJS];
    uint32_t n = rd32(s->base);
    const uint32_t *offsets;
    if (n > DSD_RT_OBJECTS_MAX) return fail(err, DSD_R_FILE_TOO_BIG, "objects", n);
    if (!offset_table(s, n, &offsets)) return fail(err, DSD_R_BAD_FILE, "OBJS", 0);
    w->object_count = n;
    uint32_t bitset_words = (n + 31u) / 32u;
    for (uint32_t i = 0; i < n; i++) {
        const uint8_t *r = s->base + offsets[i];
        DsdObject *o = &w->objects[i];
        if ((uint64_t)offsets[i] + OBJ_FIXED_BYTES > s->size) return fail(err, DSD_R_BAD_FILE, "object", i);
        o->name_str = rd32(r);
        o->parent = (int32_t)rd32(r + 4);
        o->sprite = (int32_t)rd32(r + 8);
        o->visible = r[12];
        o->screen = r[13];
        o->depth = (int16_t)rd16(r + 14);
        o->slot_count = rd16(r + 16);
        o->event_count = rd16(r + 18);
        uint64_t need = OBJ_FIXED_BYTES + ((uint64_t)bitset_words + PAIR_WORDS * (o->slot_count + o->event_count)) * WORD;
        if (offsets[i] + need > s->size) return fail(err, DSD_R_BAD_FILE, "object", i);
        o->ancestors = (const uint32_t *)(r + OBJ_FIXED_BYTES);
        o->slots = o->ancestors + bitset_words;
        o->events = o->slots + PAIR_WORDS * o->slot_count;
        bool ok = o->name_str < p->str_count && o->visible <= 1 && o->screen <= 1 &&
                  (o->parent == -1 || (o->parent >= 0 && (uint32_t)o->parent < n)) &&
                  (o->sprite == -1 || (o->sprite >= 0 && asset_is(w, (uint32_t)o->sprite, DSD_ASSET_SPRITE, 0)));
        if (!ok) return fail(err, DSD_R_BAD_FILE, "object", i);
        for (uint32_t k = 0; k < o->slot_count; k++) {
            uint32_t sym = o->slots[PAIR_WORDS * k];
            bool slot_ok = sym < p->sym_count && o->slots[PAIR_WORDS * k + 1] < DSD_C13_USER_SLOTS_PER_OBJECT &&
                           (k == 0 || o->slots[PAIR_WORDS * (k - 1)] < sym);
            if (!slot_ok) return fail(err, DSD_R_BAD_FILE, "object slots", i);
        }
    }
    // Events and ancestry need every object parsed (collision targets, parents).
    for (uint32_t i = 0; i < n; i++) {
        const DsdObject *o = &w->objects[i];
        for (uint32_t k = 0; k < o->event_count; k++) {
            uint32_t id = o->events[PAIR_WORDS * k];
            bool ev_ok = event_id_ok(w, id) && event_func_ok(p, o->events[PAIR_WORDS * k + 1]) &&
                         (k == 0 || o->events[PAIR_WORDS * (k - 1)] < id);
            if (!ev_ok) return fail(err, DSD_R_BAD_FILE, "object events", i);
        }
        // The ancestor bitset holds exactly this object and its parent chain (so the chain has no cycle).
        uint32_t steps = 0;
        for (int32_t a = (int32_t)i; a != -1; a = w->objects[a].parent) {
            if (!dsd_world_is_a(w, i, (uint32_t)a) || ++steps > n) return fail(err, DSD_R_BAD_FILE, "object parents", i);
        }
    }
    return DSD_R_NONE;
}

static int32_t load_rooms(DsdWorld *w, const DsdProgram *p, DsdLoadError *err) {
    const DsdSection *s = &p->sec[DSDB_SEC_ROOM];
    uint32_t n = rd32(s->base);
    const uint32_t *offsets;
    if (n > DSD_RT_ROOMS_MAX) return fail(err, DSD_R_FILE_TOO_BIG, "rooms", n);
    if (!offset_table(s, n, &offsets)) return fail(err, DSD_R_BAD_FILE, "ROOM", 0);
    w->room_count = n;
    for (uint32_t i = 0; i < n; i++) {
        DsdRoom *rm = &w->rooms[i];
        uint64_t off = offsets[i];
        const uint8_t *r = s->base + off;
        if (off + ROOM_FIXED_BYTES > s->size) return fail(err, DSD_R_BAD_FILE, "room", i);
        rm->name_str = rd32(r);
        rm->width = rd16(r + 4);
        rm->height = rd16(r + 6);
        for (uint32_t sc = 0; sc < 2; sc++) {
            rm->background[sc] = (int32_t)rd32(r + 8 + sc * 12);
            rm->view_x[sc] = (int32_t)rd32(r + 12 + sc * 12);
            rm->view_y[sc] = (int32_t)rd32(r + 16 + sc * 12);
        }
        rm->inst_count = rd32(r + 32);
        off += ROOM_FIXED_BYTES;
        if (off + (uint64_t)rm->inst_count * sizeof(DsdRoomInstRec) > s->size) return fail(err, DSD_R_BAD_FILE, "room", i);
        rm->insts = (const DsdRoomInstRec *)(s->base + off);
        off += (uint64_t)rm->inst_count * sizeof(DsdRoomInstRec);
        for (uint32_t sc = 0; sc < 2; sc++) {
            if (off + WORD > s->size) return fail(err, DSD_R_BAD_FILE, "room", i);
            rm->sprite_count[sc] = rd16(s->base + off);
            rm->bg_count[sc] = rd16(s->base + off + 2);
            off += WORD;
            uint64_t k = (uint64_t)rm->sprite_count[sc] + rm->bg_count[sc];
            if (off + k * WORD > s->size) return fail(err, DSD_R_BAD_FILE, "room", i);
            rm->set[sc] = (const uint32_t *)(s->base + off);
            off += k * WORD;
        }
        if (off + WORD > s->size) return fail(err, DSD_R_BAD_FILE, "room", i);
        rm->sound_count = rd16(s->base + off);
        off += WORD;
        if (off + (uint64_t)rm->sound_count * WORD > s->size) return fail(err, DSD_R_BAD_FILE, "room", i);
        rm->sounds = (const uint32_t *)(s->base + off);
        // Field checks.
        bool ok = rm->name_str < p->str_count;
        for (uint32_t sc = 0; sc < 2 && ok; sc++) {
            ok = rm->background[sc] == -1 ||
                 (rm->background[sc] >= 0 && asset_is(w, (uint32_t)rm->background[sc], DSD_ASSET_BACKGROUND, 0));
            for (uint32_t k = 0; k < rm->sprite_count[sc] && ok; k++) ok = asset_is(w, rm->set[sc][k], DSD_ASSET_SPRITE, 0);
            for (uint32_t k = 0; k < rm->bg_count[sc] && ok; k++) {
                ok = asset_is(w, rm->set[sc][rm->sprite_count[sc] + k], DSD_ASSET_BACKGROUND, 0);
            }
        }
        for (uint32_t k = 0; k < rm->sound_count && ok; k++) ok = asset_is(w, rm->sounds[k], DSD_ASSET_SOUND, DSD_ASSET_MUSIC);
        for (uint32_t k = 0; k < rm->inst_count && ok; k++) {
            const DsdRoomInstRec *ri = &rm->insts[k];
            ok = ri->object < w->object_count && ri->screen <= 1 &&
                 (ri->creation_func == -1 || (ri->creation_func >= 0 && event_func_ok(p, (uint32_t)ri->creation_func)));
        }
        if (!ok) return fail(err, DSD_R_BAD_FILE, "room", i);
    }
    return DSD_R_NONE;
}

// SPRG (ADR-0006): every record names a sprite, and either every sprite has one or none does. A room game with
// sprites needs it (the engine takes placement and bboxes only from it); program form never uses geometry.
static int32_t load_geometry(DsdWorld *w, const DsdProgram *p, DsdLoadError *err) {
    w->sprg_count = p->sprg_count;
    w->sprg = p->sprg;
    uint32_t sprites = 0;
    for (uint32_t a = 0; a < w->asset_count; a++) sprites += w->assets[a].kind == DSD_ASSET_SPRITE;
    for (uint32_t k = 0; k < w->sprg_count; k++) {
        const DsdSprgRec *g = &w->sprg[k];
        bool ok = asset_is(w, g->asset, DSD_ASSET_SPRITE, 0) && g->width > 0 && g->height > 0 &&
                  g->bbox_left <= g->bbox_right && g->bbox_top <= g->bbox_bottom;
        if (!ok) return fail(err, DSD_R_BAD_FILE, "sprite geometry", k);
    }
    // Records are unique and sorted (loader), so "one per sprite" is a count check.
    bool complete = w->sprg_count == sprites;
    bool room_game = p->first_room != DSDB_NONE;
    if (!complete && (room_game || w->sprg_count != 0)) return fail(err, DSD_R_BAD_FILE, "sprite geometry", w->sprg_count);
    return DSD_R_NONE;
}

int32_t dsd_world_load(DsdWorld *w, const DsdProgram *prog, DsdLoadError *err) {
    int32_t rc;
    if ((rc = load_assets(w, prog, err)) != DSD_R_NONE) return rc;
    if ((rc = load_geometry(w, prog, err)) != DSD_R_NONE) return rc;
    if ((rc = load_objects(w, prog, err)) != DSD_R_NONE) return rc;
    return load_rooms(w, prog, err);
}

uint32_t dsd_world_event(const DsdWorld *w, uint32_t obj, uint32_t event_id, uint32_t *owner) {
    for (int32_t o = (int32_t)obj; o != -1; o = w->objects[o].parent) {
        const DsdObject *ob = &w->objects[o];
        // Binary search over the sorted {eventId, func} pairs.
        uint32_t lo = 0;
        uint32_t hi = ob->event_count;
        while (lo < hi) {
            uint32_t mid = lo + (hi - lo) / 2;
            uint32_t id = ob->events[PAIR_WORDS * mid];
            if (id == event_id) {
                if (owner) *owner = (uint32_t)o;
                return ob->events[PAIR_WORDS * mid + 1];
            }
            if (id < event_id) lo = mid + 1;
            else hi = mid;
        }
    }
    return DSD_NO_EVENT;
}

int32_t dsd_world_slot(const DsdWorld *w, uint32_t obj, uint32_t sym) {
    const DsdObject *ob = &w->objects[obj];
    uint32_t lo = 0;
    uint32_t hi = ob->slot_count;
    while (lo < hi) {
        uint32_t mid = lo + (hi - lo) / 2;
        uint32_t s = ob->slots[PAIR_WORDS * mid];
        if (s == sym) return (int32_t)ob->slots[PAIR_WORDS * mid + 1];
        if (s < sym) lo = mid + 1;
        else hi = mid;
    }
    return -1;
}
