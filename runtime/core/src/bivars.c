// bivars.c: built-in variables (builtins.json variable entries, dense order DSD_BUILTIN_VARS) read and written as
// cells (GETBI/SETBI, GETBIX/SETBIX, GETBIO/SETBIO). Instance fields are untagged in DsdInstance; this file converts.
#include <stddef.h>

#include "engine.h"
#include "errors.h"
#include "fixed.h"
#include "geometry.h"

#define NOT_Q12 (-1) // Q20_FIELD entry for a variable that is not a plain Q20.12 instance field

// Byte offset of each variable that is a plain Q20.12 field of DsdInstance, else NOT_Q12.
static int16_t Q20_FIELD[DSD_BUILTIN_VAR_COUNT];
static bool g_q20_ready;

static void init_q20_fields(void) {
    for (uint32_t v = 0; v < DSD_BUILTIN_VAR_COUNT; v++) Q20_FIELD[v] = NOT_Q12;
    Q20_FIELD[DSD_BV_x] = offsetof(DsdInstance, x);
    Q20_FIELD[DSD_BV_y] = offsetof(DsdInstance, y);
    Q20_FIELD[DSD_BV_xprevious] = offsetof(DsdInstance, xprevious);
    Q20_FIELD[DSD_BV_yprevious] = offsetof(DsdInstance, yprevious);
    Q20_FIELD[DSD_BV_xstart] = offsetof(DsdInstance, xstart);
    Q20_FIELD[DSD_BV_ystart] = offsetof(DsdInstance, ystart);
    Q20_FIELD[DSD_BV_speed] = offsetof(DsdInstance, speed);
    Q20_FIELD[DSD_BV_direction] = offsetof(DsdInstance, direction);
    Q20_FIELD[DSD_BV_hspeed] = offsetof(DsdInstance, hspeed);
    Q20_FIELD[DSD_BV_vspeed] = offsetof(DsdInstance, vspeed);
    Q20_FIELD[DSD_BV_gravity] = offsetof(DsdInstance, gravity);
    Q20_FIELD[DSD_BV_gravity_direction] = offsetof(DsdInstance, gravity_direction);
    Q20_FIELD[DSD_BV_friction] = offsetof(DsdInstance, friction);
    Q20_FIELD[DSD_BV_image_index] = offsetof(DsdInstance, image_index);
    Q20_FIELD[DSD_BV_image_speed] = offsetof(DsdInstance, image_speed);
    Q20_FIELD[DSD_BV_image_xscale] = offsetof(DsdInstance, image_xscale);
    Q20_FIELD[DSD_BV_image_yscale] = offsetof(DsdInstance, image_yscale);
    Q20_FIELD[DSD_BV_image_angle] = offsetof(DsdInstance, image_angle);
    g_q20_ready = true;
}

// Names, global flags, read-only flags and array lengths from the generated table.
#define DSD_BV_INFO_(index, name, global, readonly, array_len) [index] = {#name, global, readonly, array_len},
static const struct {
    const char *name;
    uint8_t global;
    uint8_t readonly;
    uint8_t array_len;
} VARS[DSD_BUILTIN_VAR_COUNT] = {DSD_BUILTIN_VARS(DSD_BV_INFO_)};
#undef DSD_BV_INFO_

static int32_t *q20_field(DsdInstance *in, uint32_t var) { return (int32_t *)((uint8_t *)in + Q20_FIELD[var]); }

// Floor division of a Q20.12 value by one pixel (bbox edges to whole pixels).
static int32_t floor_px(int64_t q) { return (int32_t)(q >> DSD_FX_SHIFT); }

// ---- Reading ----------------------------------------------------------------------------------------------------

// bbox_left/top/right/bottom in whole pixels (inclusive, as GML); an instance without a sprite gives its position.
static int32_t bbox_edge(const DsdInstance *in, uint32_t var) {
    DsdBox b;
    if (!dsd_geom_bbox(dsd_engine.world, in, false, 0, 0, &b)) {
        return floor_px(var == DSD_BV_bbox_left || var == DSD_BV_bbox_right ? in->x : in->y);
    }
    switch (var) {
    case DSD_BV_bbox_left:
        return floor_px(b.left);
    case DSD_BV_bbox_top:
        return floor_px(b.top);
    case DSD_BV_bbox_right:
        return floor_px(b.right - 1); // the last pixel inside [left, right)
    default:
        return floor_px(b.bottom - 1);
    }
}

// Raises R550 for element `index` of a built-in array variable of `len` elements.
static bool index_error(uint32_t var, int32_t index) {
    DsdText t = dsd_vm_error_begin(dsd_engine.vm, DSD_R_INDEX_RANGE);
    dsd_text_str(&t, "Position ");
    dsd_text_int(&t, index);
    dsd_text_str(&t, " is outside ");
    dsd_text_str(&t, VARS[var].name);
    dsd_text_str(&t, " (it has ");
    dsd_text_uint(&t, VARS[var].array_len);
    dsd_text_str(&t, " items)");
    return false;
}

// Raises R502 when an instance variable is used with no instance running.
static bool no_instance(uint32_t var) {
    DsdText t = dsd_vm_error_begin(dsd_engine.vm, DSD_R_NO_INSTANCE);
    dsd_text_str(&t, VARS[var].name);
    dsd_text_str(&t, " needs an instance, and there is none here");
    return false;
}

bool dsd_bivar_get(uint32_t idx, uint32_t var, int32_t index, DsdValue *out) {
    const DsdEngine *e = &dsd_engine;
    if (!g_q20_ready) init_q20_fields();
    if (VARS[var].array_len != 0 && (index < 0 || index >= VARS[var].array_len)) return index_error(var, index);
    // Globals first: they need no instance.
    switch (var) {
    case DSD_BV_room:
        *out = dsd_asset(DSD_ASSET_ROOM, e->room);
        return true;
    case DSD_BV_room_width:
        *out = dsd_int(e->world->rooms[e->room].width);
        return true;
    case DSD_BV_room_height:
        *out = dsd_int(e->world->rooms[e->room].height);
        return true;
    case DSD_BV_room_speed:
        *out = dsd_int(DSD_ROOM_SPEED);
        return true;
    case DSD_BV_view_x:
        *out = dsd_int(e->view_x[index]);
        return true;
    case DSD_BV_view_y:
        *out = dsd_int(e->view_y[index]);
        return true;
    case DSD_BV_touch_x:
        *out = dsd_int(e->touch_x);
        return true;
    case DSD_BV_touch_y:
        *out = dsd_int(e->touch_y);
        return true;
    default:
        break;
    }
    if (idx == DSD_VM_NO_INST) return no_instance(var);
    DsdInstance *in = dsd_inst_at(idx);
    if (Q20_FIELD[var] != NOT_Q12) {
        *out = dsd_real(*q20_field(in, var));
        return true;
    }
    DsdSpriteGeom g = {0};
    switch (var) {
    case DSD_BV_id:
        *out = dsd_inst(in->id);
        return true;
    case DSD_BV_object_index:
        *out = dsd_asset(DSD_ASSET_OBJECT, in->object);
        return true;
    case DSD_BV_sprite_index:
        *out = in->sprite_index >= 0 ? dsd_asset(DSD_ASSET_SPRITE, (uint32_t)in->sprite_index) : dsd_int(-1);
        return true;
    case DSD_BV_sprite_width:
    case DSD_BV_sprite_height: {
        // The frame size times the scale, as GML (a mirrored sprite has a negative width).
        if (in->sprite_index >= 0) dsd_geom_sprite(e->world, (uint32_t)in->sprite_index, &g);
        bool wide = var == DSD_BV_sprite_width;
        int64_t q = (int64_t)(wide ? g.width : g.height) * (wide ? in->image_xscale : in->image_yscale);
        *out = dsd_real(dsd_lo32(q));
        return true;
    }
    case DSD_BV_image_number:
        *out = dsd_int(in->sprite_index >= 0 ? (int32_t)e->world->assets[in->sprite_index].aux : 0);
        return true;
    case DSD_BV_visible:
        *out = dsd_bool(in->visible != 0);
        return true;
    case DSD_BV_depth:
        *out = dsd_int(in->depth);
        return true;
    case DSD_BV_screen:
        *out = dsd_int(in->screen);
        return true;
    case DSD_BV_alarm:
        *out = dsd_int(in->alarm[index]);
        return true;
    default: // bbox_left, bbox_top, bbox_right, bbox_bottom
        *out = dsd_int(bbox_edge(in, var));
        return true;
    }
}

// ---- Writing ----------------------------------------------------------------------------------------------------

// Raises R542: variable `var` needs `expected` but got v.
static bool wrong_kind(uint32_t var, const char *expected, DsdValue v) {
    DsdText t = dsd_vm_error_begin(dsd_engine.vm, DSD_R_BAD_ARGUMENT);
    dsd_text_str(&t, VARS[var].name);
    dsd_text_str(&t, " needs ");
    dsd_text_str(&t, expected);
    dsd_text_str(&t, ", but got ");
    dsd_text_str(&t, dsd_value_kind(v));
    return false;
}

// A number as Q20.12 (ints are scaled; outside the range is R521 in debug builds, a wrap in release).
static bool to_q20(uint32_t var, DsdValue v, int32_t *out) {
    if (!dsd_is_number(v)) return wrong_kind(var, "a number", v);
    int64_t q = dsd_is_int(v) ? (int64_t)v.payload * DSD_FX_ONE : v.payload;
    *out = dsd_lo32(q);
    return dsd_vm_number_status(dsd_engine.vm, dsd_fits32(q) ? DSD_NUM_OK : DSD_NUM_OVERFLOW, dsd_real(*out));
}

// A number as a whole int (fractions floor).
static bool to_int(uint32_t var, DsdValue v, int32_t *out) {
    if (!dsd_is_number(v)) return wrong_kind(var, "a number", v);
    *out = dsd_is_int(v) ? v.payload : dsd_fx_floor(v.payload);
    return true;
}

// Degrees reduced to [0, 360) (Q20.12).
static int32_t normalize_degrees(int32_t d) {
    int64_t r;
    dsd_div64(d, DSD_DEG_FULL_FX, 0, &r);
    return (int32_t)(r < 0 ? r + DSD_DEG_FULL_FX : r);
}

bool dsd_bivar_set(uint32_t idx, uint32_t var, int32_t index, DsdValue v) {
    DsdEngine *e = &dsd_engine;
    if (!g_q20_ready) init_q20_fields();
    if (VARS[var].readonly) {
        DsdText t = dsd_vm_error_begin(e->vm, DSD_R_READ_ONLY);
        dsd_text_str(&t, VARS[var].name);
        dsd_text_str(&t, " can't be changed");
        return false;
    }
    if (VARS[var].array_len != 0 && (index < 0 || index >= VARS[var].array_len)) return index_error(var, index);
    int32_t n = 0;
    if (var == DSD_BV_view_x || var == DSD_BV_view_y) {
        if (!to_int(var, v, &n)) return false;
        (var == DSD_BV_view_x ? e->view_x : e->view_y)[index] = n;
        return true;
    }
    if (idx == DSD_VM_NO_INST) return no_instance(var);
    DsdInstance *in = dsd_inst_at(idx);
    if (Q20_FIELD[var] != NOT_Q12) {
        if (!to_q20(var, v, &n)) return false;
        if (var == DSD_BV_direction) n = normalize_degrees(n);
        *q20_field(in, var) = n;
        // speed/direction and hspeed/vspeed are two views of one motion.
        if (var == DSD_BV_speed || var == DSD_BV_direction) dsd_inst_sync_cartesian(in);
        if (var == DSD_BV_hspeed || var == DSD_BV_vspeed) dsd_inst_sync_polar(in);
        return true;
    }
    switch (var) {
    case DSD_BV_sprite_index:
        if (v.tag == DSD_TAG_INT && v.payload == -1) {
            in->sprite_index = -1;
            return true;
        }
        if (v.tag != DSD_TAG_ASSET || ((uint32_t)v.payload >> DSD_ASSET_KIND_SHIFT) != DSD_ASSET_SPRITE) {
            return wrong_kind(var, "a sprite", v);
        }
        in->sprite_index = (int32_t)((uint32_t)v.payload & DSD_ASSET_INDEX_MASK);
        return true;
    case DSD_BV_visible:
        in->visible = dsd_truthy(v) ? 1 : 0;
        return true;
    case DSD_BV_depth:
        return to_int(var, v, &in->depth);
    case DSD_BV_screen:
        if (!to_int(var, v, &n)) return false;
        if (n != (int32_t)DSD_SCREEN_TOP && n != (int32_t)DSD_SCREEN_BOTTOM) {
            return wrong_kind(var, "SCREEN_TOP or SCREEN_BOTTOM", v);
        }
        in->screen = (uint8_t)n;
        return true;
    default: // alarm
        return to_int(var, v, &in->alarm[index]);
    }
}
