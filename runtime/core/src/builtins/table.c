// table.c: the builtin dispatch tables, indexed by the dense runtime index (CALLN's C operand) that
// tools/gen-builtins.ts assigns in runtime/gen/builtins_table.h. Builtins without an entry in dsd_builtin_fn are not
// implemented yet: calling one raises R582.
#include "bi.h"
#include "errors.h"
#include "fixed.h"
#include "number.h"

// Names and argument counts, straight from the generated table.
#define DSD_BI_INFO_(index, name, min_args, max_args, pure) [index] = {#name, min_args, max_args},
const DsdBuiltinInfo dsd_builtin_info[DSD_BUILTIN_FUNC_COUNT] = {DSD_BUILTIN_FUNCS(DSD_BI_INFO_)};
#undef DSD_BI_INFO_

// Implementations by name; designated initializers leave the rest NULL.
#define IMPL(name) [DSD_BI_##name] = dsd_bi_##name
const DsdBuiltinFn dsd_builtin_fn[DSD_BUILTIN_FUNC_COUNT] = {
    IMPL(floor),          IMPL(ceil),       IMPL(round),           IMPL(abs),
    IMPL(sign),           IMPL(frac),       IMPL(sqrt),            IMPL(min),
    IMPL(max),            IMPL(clamp),      IMPL(lerp),            IMPL(dsin),
    IMPL(dcos),           IMPL(point_distance), IMPL(point_direction), IMPL(lengthdir_x),
    IMPL(lengthdir_y),    IMPL(show_debug_message), IMPL(string),  IMPL(assert),
    IMPL(real),           IMPL(string_length), IMPL(string_char_at), IMPL(string_upper),
    IMPL(string_lower),   IMPL(string_repeat), IMPL(chr),            IMPL(ord),
    IMPL(array_length),   IMPL(array_push),  IMPL(array_pop),        IMPL(array_create),
    IMPL(array_delete),   IMPL(random),      IMPL(random_range),     IMPL(irandom),
    IMPL(irandom_range),  IMPL(choose),      IMPL(randomize),
    IMPL(instance_create), IMPL(instance_destroy), IMPL(instance_exists), IMPL(instance_number),
    IMPL(instance_find),  IMPL(instance_nearest), IMPL(instance_place), IMPL(place_meeting),
    IMPL(position_meeting), IMPL(place_free), IMPL(collision_rectangle), IMPL(collision_point),
    IMPL(distance_to_object), IMPL(event_inherited), IMPL(event_user), IMPL(room_goto),
    IMPL(room_goto_next), IMPL(room_goto_previous), IMPL(room_restart), IMPL(game_restart),
    IMPL(game_end),       IMPL(button_check), IMPL(button_pressed),  IMPL(button_released),
    IMPL(touch_check),    IMPL(touch_pressed), IMPL(touch_released), IMPL(touch_in_instance),
    IMPL(motion_add),     IMPL(motion_set),  IMPL(move_towards_point), IMPL(move_wrap),
    IMPL(audio_play_sound), IMPL(audio_stop_sound), IMPL(audio_play_music), IMPL(audio_stop_music),
    IMPL(audio_set_volume), IMPL(audio_is_playing), IMPL(draw_text), IMPL(draw_set_screen),
    IMPL(draw_set_color), IMPL(draw_rectangle), IMPL(draw_clear), IMPL(draw_self),
    IMPL(draw_sprite),    IMPL(draw_sprite_ext),
};
#undef IMPL

// ---- Shared helpers (bi.h) --------------------------------------------------------------------------------------

// Raises R542: builtin `bi` needs `expected` but got args[i].
static bool wrong_kind(DsdVm *vm, uint32_t bi, const char *expected, DsdValue got) {
    DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_ARGUMENT);
    dsd_text_str(&t, dsd_builtin_info[bi].name);
    dsd_text_str(&t, " needs ");
    dsd_text_str(&t, expected);
    dsd_text_str(&t, " here, but got ");
    dsd_text_str(&t, dsd_value_kind(got));
    return false;
}

bool dsd_bi_want_number(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i) {
    return dsd_is_number(args[i]) || wrong_kind(vm, bi, "a number", args[i]);
}

bool dsd_bi_want_string(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i) {
    return args[i].tag == DSD_TAG_STR || wrong_kind(vm, bi, "text", args[i]);
}

bool dsd_bi_want_array(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i) {
    return args[i].tag == DSD_TAG_ARR || wrong_kind(vm, bi, "a list", args[i]);
}

bool dsd_bi_arg_int(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, int32_t *out) {
    if (!dsd_bi_want_number(vm, bi, args, i)) return false;
    *out = dsd_is_int(args[i]) ? args[i].payload : dsd_fx_floor(args[i].payload);
    return true;
}

bool dsd_bi_arg_q12(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, int64_t *q12) {
    if (!dsd_bi_want_number(vm, bi, args, i)) return false;
    return dsd_num_view_q12(args[i], q12);
}

bool dsd_bi_arg_asset(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, uint32_t kind, const char *what,
                      uint32_t *index) {
    DsdValue v = args[i];
    if (v.tag != DSD_TAG_ASSET || ((uint32_t)v.payload >> DSD_ASSET_KIND_SHIFT) != kind) {
        return wrong_kind(vm, bi, what, v);
    }
    *index = (uint32_t)v.payload & DSD_ASSET_INDEX_MASK;
    return true;
}

bool dsd_bi_arg_q20(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, int32_t *out) {
    int64_t q;
    if (!dsd_bi_arg_q12(vm, bi, args, i, &q)) return false;
    *out = dsd_lo32(q);
    return dsd_vm_number_status(vm, dsd_fits32(q) ? DSD_NUM_OK : DSD_NUM_OVERFLOW, dsd_real(*out));
}

bool dsd_bi_real_result(DsdVm *vm, int64_t q12, DsdValue *out) {
    *out = dsd_real(dsd_lo32(q12));
    if (dsd_fits32(q12) || !vm->debug) return true;
    dsd_vm_error(vm, DSD_R_FIXED_RANGE, "A number with a fraction got too big (past +-524287.99)");
    return false;
}

bool dsd_bi_status(DsdVm *vm, uint32_t bi, int32_t status, DsdValue result) {
    if (status != DSD_NUM_NOT_NUMBER) return dsd_vm_number_status(vm, status, result);
    DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_ARGUMENT);
    dsd_text_str(&t, dsd_builtin_info[bi].name);
    dsd_text_str(&t, " needs numbers here");
    return false;
}
