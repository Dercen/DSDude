// drawlist.c: sprite draw list and shadow OAM (drawlist.h; PLAN.md 3.3 "Sprites").
//
// Rules implemented here, identical on the host and the DS:
//   - entries are sorted by (depth, instance id, call order), ascending; index 0 of OAM is in front, so lower depth
//     draws in front and, at equal depth, the lower instance id (C6 "(depth, instance id)" read literally);
//   - a frame's OBJ box is its size padded to the smallest of the 12 OBJ sizes that contains it (C3 section 3);
//   - image_xscale / image_yscale of exactly +-1 with angle 0 use the flip bits, mirroring around the origin;
//   - any other scale or angle takes an affine set with double size: the scale is clamped to [1/16, 2] in magnitude,
//     the origin-to-centre vector is rotated and scaled, and the double-size half extent is subtracted;
//   - beyond 32 affine sets per screen the extras draw unrotated (flip bits from the scale signs), counted in
//     aff_drop; beyond 128 visible entries per screen the rest are dropped, counted in oam_drop;
//   - entries entirely off the screen are skipped and count for nothing.
#include "drawlist.h"

#include "dsd_platform.h"
#include "engine.h"
#include "errors.h"
#include "fixed.h"
#include "geometry.h"

#define SCALE_MIN (DSD_FX_ONE / 16)  // smallest affine scale magnitude (1/16)
#define SCALE_MAX (2 * DSD_FX_ONE)   // largest affine scale magnitude (DS sprites grow at most 2x)
#define AFFINE_ONE 256               // 1.0 in the OAM's 8.8 affine parameters
#define SPRITE_PRIORITY 1            // BG priority of sprites in 0.1 (UI layer 0, room background 2)
#define OBJ_SIZES 12                 // hardware OBJ shapes x sizes (3 x 4)

// The 12 OBJ sizes, smallest area first (C3 section 3 lists the containment order).
static const uint8_t OBJ_W[OBJ_SIZES] = {8, 16, 8, 16, 32, 8, 32, 16, 32, 64, 32, 64};
static const uint8_t OBJ_H[OBJ_SIZES] = {8, 8, 16, 16, 8, 32, 16, 32, 32, 32, 64, 64};

typedef struct DrawEntry {
    int32_t depth;
    int32_t id;
    uint32_t seq;      // call order, the last sort key
    uint16_t sprite;   // ASET index
    uint16_t frame;    // already reduced to the frame count
    int32_t x;         // room position, Q20.12
    int32_t y;
    int32_t xscale;    // Q20.12
    int32_t yscale;
    int32_t angle;     // degrees, Q20.12
} DrawEntry;

DsdDrawStats dsd_draw_stats;

static DrawEntry g_queue[DSD_SCREEN_COUNT][DSD_RT_DRAWS_PER_SCREEN];
static DrawEntry g_tmp[DSD_RT_DRAWS_PER_SCREEN]; // merge-sort buffer
static uint32_t g_count[DSD_SCREEN_COUNT];
static uint32_t g_seq;        // draw calls queued this frame (the stable sort key)
static uint32_t g_queue_drop; // draw calls that found the queue full this frame
static dsd_oam_entry g_oam[DSD_C13_SPRITES_PER_SCREEN];
static dsd_affine g_affine[DSD_C13_AFFINE_PER_SCREEN];

void dsd_draw_begin(void) {
    g_count[0] = g_count[1] = 0;
    g_seq = 0;
    g_queue_drop = 0;
}

// ---- Queueing -----------------------------------------------------------------------------------------------------

bool dsd_draw_sprite(DsdVm *vm, uint32_t idx, uint32_t sprite, int32_t frame, int32_t x, int32_t y, int32_t xscale,
                     int32_t yscale, int32_t angle) {
    const DsdEngine *e = &dsd_engine;
    if (vm->world == NULL) return true; // program form: no rooms, so nothing is ever loaded or shown
    uint32_t s = e->draw_screen;
    if (e->sprite_handle[s][sprite] < 0) {
        uint32_t len;
        DsdText t = dsd_vm_error_begin(vm, DSD_R_NOT_LOADED);
        dsd_text_str(&t, dsd_prog_str(vm->prog, e->world->assets[sprite].name_str, &len));
        dsd_text_str(&t, " is not loaded in ");
        dsd_text_str(&t, dsd_prog_str(vm->prog, e->world->rooms[e->room].name_str, &len));
        dsd_text_str(&t, s == DSD_SCREEN_TOP ? " (top screen)" : " (bottom screen)");
        return false;
    }
    if (g_count[s] == DSD_RT_DRAWS_PER_SCREEN) {
        g_queue_drop++;
        return true;
    }
    // Frames wrap in both directions: the remainder takes the dividend's sign, so a negative one moves up by n.
    uint32_t frames = e->world->assets[sprite].aux;
    int64_t n = frames == 0 ? 1 : (int64_t)frames;
    int64_t f;
    dsd_div64(frame, n, NULL, &f);
    if (f < 0) f += n;
    // Stacking keys: the drawing instance's depth and id (a draw with no instance, which only a malformed program
    // could make, stacks at depth 0 behind every instance of that depth).
    bool has_inst = idx != DSD_VM_NO_INST;
    int32_t depth = has_inst ? dsd_inst_at(idx)->depth : 0;
    int32_t id = has_inst ? dsd_inst_at(idx)->id : INT32_MAX;
    g_queue[s][g_count[s]++] = (DrawEntry){depth, id, g_seq++, (uint16_t)sprite, (uint16_t)f, x, y, xscale, yscale,
                                           angle};
    return true;
}

bool dsd_draw_self(DsdVm *vm, uint32_t idx) {
    if (idx == DSD_VM_NO_INST) return true;
    const DsdInstance *in = dsd_inst_at(idx);
    if (in->sprite_index < 0) return true; // nothing to draw
    return dsd_draw_sprite(vm, idx, (uint32_t)in->sprite_index, dsd_fx_floor(in->image_index), in->x, in->y,
                           in->image_xscale, in->image_yscale, in->image_angle);
}

// ---- Sorting ------------------------------------------------------------------------------------------------------

// True when a sorts before b: (depth, id, seq) ascending.
static bool before(const DrawEntry *a, const DrawEntry *b) {
    if (a->depth != b->depth) return a->depth < b->depth;
    if (a->id != b->id) return a->id < b->id;
    return a->seq < b->seq;
}

// Bottom-up merge sort of n entries (the key is total, so any correct sort gives the same order).
static void sort_entries(DrawEntry *v, uint32_t n) {
    for (uint32_t width = 1; width < n; width *= 2) {
        for (uint32_t lo = 0; lo < n; lo += 2 * width) {
            uint32_t mid = lo + width < n ? lo + width : n;
            uint32_t hi = lo + 2 * width < n ? lo + 2 * width : n;
            uint32_t i = lo;
            uint32_t j = mid;
            uint32_t k = lo;
            while (i < mid && j < hi) g_tmp[k++] = before(&v[j], &v[i]) ? v[j++] : v[i++];
            while (i < mid) g_tmp[k++] = v[i++];
            while (j < hi) g_tmp[k++] = v[j++];
        }
        for (uint32_t k = 0; k < n; k++) v[k] = g_tmp[k];
    }
}

// ---- Building OAM -------------------------------------------------------------------------------------------------

// The OBJ box of a width x height frame: the smallest of the 12 OBJ sizes that contains it (64x64 for larger ones,
// which C3 refuses).
static void obj_box(uint32_t width, uint32_t height, int32_t *w, int32_t *h) {
    for (uint32_t k = 0; k < OBJ_SIZES; k++) {
        if (OBJ_W[k] >= width && OBJ_H[k] >= height) {
            *w = OBJ_W[k];
            *h = OBJ_H[k];
            return;
        }
    }
    *w = OBJ_W[OBJ_SIZES - 1];
    *h = OBJ_H[OBJ_SIZES - 1];
}

// A scale clamped to [1/16, 2] in magnitude, keeping its sign (0 counts as positive).
static int32_t clamp_scale(int32_t s) {
    int32_t m = s < 0 ? -s : s;
    m = m < SCALE_MIN ? SCALE_MIN : (m > SCALE_MAX ? SCALE_MAX : m);
    return s < 0 ? -m : m;
}

// a * b / 4096 in 64 bits, truncated toward zero (the fixed multiply rule).
static int64_t mulq(int64_t a, int64_t b) {
    int64_t p = a * b;
    return p >= 0 ? (p >> DSD_FX_SHIFT) : -((-p) >> DSD_FX_SHIFT);
}

// True when the rectangle [left, left + w) x [top, top + h) (screen pixels) touches the screen.
static bool on_screen(int32_t left, int32_t top, int32_t w, int32_t h) {
    return left < DSD_SCREEN_W && left + w > 0 && top < DSD_SCREEN_H && top + h > 0;
}

// True when a draw needs no affine set: both scales are exactly +-1 and the angle is a multiple of 360 degrees.
static bool is_plain(const DrawEntry *d) {
    int64_t r;
    dsd_div64(d->angle, DSD_DEG_FULL_FX, NULL, &r);
    return r == 0 && (d->xscale == DSD_FX_ONE || d->xscale == -DSD_FX_ONE) &&
           (d->yscale == DSD_FX_ONE || d->yscale == -DSD_FX_ONE);
}

// Fills one OAM entry (and, for affine draws, its set) from a draw entry. Returns false when it is off the screen.
static bool build(const DrawEntry *d, uint32_t screen, bool plain, bool may_affine, uint32_t naff, dsd_oam_entry *o) {
    const DsdEngine *e = &dsd_engine;
    DsdSpriteGeom g;
    dsd_geom_sprite(e->world, d->sprite, &g);
    int32_t bw;
    int32_t bh;
    obj_box(g.width, g.height, &bw, &bh);
    int64_t vx = (int64_t)e->view_x[screen] * DSD_FX_ONE;
    int64_t vy = (int64_t)e->view_y[screen] * DSD_FX_ONE;
    o->sprite = (uint16_t)e->sprite_handle[screen][d->sprite];
    o->frame = d->frame;
    o->priority = SPRITE_PRIORITY;
    o->pad = 0;
    o->affine = 0;
    if (plain || !may_affine) {
        // Flip bits mirror the padded box; placing it at origin - box keeps the mirror around the origin.
        bool hflip = d->xscale < 0;
        bool vflip = d->yscale < 0;
        int32_t left = (int32_t)((d->x - vx) >> DSD_FX_SHIFT) + (hflip ? g.xorig - bw : -g.xorig);
        int32_t top = (int32_t)((d->y - vy) >> DSD_FX_SHIFT) + (vflip ? g.yorig - bh : -g.yorig);
        if (!on_screen(left, top, bw, bh)) return false;
        o->x = (int16_t)left;
        o->y = (int16_t)top;
        o->flags = (uint8_t)((hflip ? DSD_OAM_HFLIP : 0u) | (vflip ? DSD_OAM_VFLIP : 0u));
        return true;
    }
    // Affine: scale, then rotate counter-clockwise (y down) around the origin.
    int32_t sx = clamp_scale(d->xscale);
    int32_t sy = clamp_scale(d->yscale);
    int64_t c = dsd_fx_dcos(d->angle);
    int64_t s = dsd_fx_dsin(d->angle);
    // Origin-to-centre vector of the box (Q20.12), scaled, then rotated: x' = x cos + y sin, y' = -x sin + y cos.
    int64_t dx = mulq((int64_t)(bw * DSD_FX_ONE / 2 - g.xorig * DSD_FX_ONE), sx);
    int64_t dy = mulq((int64_t)(bh * DSD_FX_ONE / 2 - g.yorig * DSD_FX_ONE), sy);
    int64_t cx = d->x - vx + mulq(dx, c) + mulq(dy, s);
    int64_t cy = d->y - vy - mulq(dx, s) + mulq(dy, c);
    // The double-size area is 2w x 2h, centred on the box centre.
    int32_t left = (int32_t)((cx >> DSD_FX_SHIFT) - bw);
    int32_t top = (int32_t)((cy >> DSD_FX_SHIFT) - bh);
    if (!on_screen(left, top, 2 * bw, 2 * bh)) return false;
    // OAM holds the inverse (screen to texture) in 8.8: [cos/sx, -sin/sx; sin/sy, cos/sy].
    dsd_affine *m = &g_affine[naff];
    m->pa = (int16_t)dsd_div_round64(c * AFFINE_ONE, sx);
    m->pb = (int16_t)dsd_div_round64(-s * AFFINE_ONE, sx);
    m->pc = (int16_t)dsd_div_round64(s * AFFINE_ONE, sy);
    m->pd = (int16_t)dsd_div_round64(c * AFFINE_ONE, sy);
    o->x = (int16_t)left;
    o->y = (int16_t)top;
    o->flags = DSD_OAM_AFFINE | DSD_OAM_DOUBLE;
    o->affine = (uint8_t)naff;
    return true;
}

void dsd_draw_commit(void) {
    dsd_draw_stats.oam_drop = g_queue_drop;
    dsd_draw_stats.aff_drop = 0;
    for (uint32_t s = 0; s < DSD_SCREEN_COUNT; s++) {
        sort_entries(g_queue[s], g_count[s]);
        uint32_t n = 0;
        uint32_t naff = 0;
        for (uint32_t i = 0; i < g_count[s]; i++) {
            if (n == DSD_C13_SPRITES_PER_SCREEN) {
                dsd_draw_stats.oam_drop += g_count[s] - i; // the rest, highest depths, are dropped
                break;
            }
            const DrawEntry *d = &g_queue[s][i];
            bool plain = is_plain(d);
            bool may_affine = naff < DSD_C13_AFFINE_PER_SCREEN;
            if (!build(d, s, plain, may_affine, naff, &g_oam[n])) continue; // off the screen: costs nothing
            if (!plain && may_affine) naff++;
            if (!plain && !may_affine) dsd_draw_stats.aff_drop++; // wanted a set, none left: drew unrotated
            n++;
        }
        dsd_draw_stats.sprites[s] = n;
        dsd_plat_oam_submit(s, g_oam, n, g_affine, naff);
    }
}
