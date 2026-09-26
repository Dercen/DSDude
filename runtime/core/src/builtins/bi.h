// bi.h: private helpers and declarations shared by the builtin implementations in runtime/core/src/builtins/.
#ifndef DSD_BI_H
#define DSD_BI_H

#include <stdbool.h>
#include <stdint.h>

#include "builtins.h"
#include "vm.h"

// Checks that args[i] is a number (INT or REAL); otherwise raises R542 naming builtin `bi` and returns false.
bool dsd_bi_want_number(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i);
// A number argument as Q.12 in 64 bits (exact for every int32). Raises R542 like dsd_bi_want_number.
bool dsd_bi_arg_q12(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, int64_t *q12);
// Checks that args[i] is a string / an array; otherwise raises R542 naming builtin `bi`.
bool dsd_bi_want_string(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i);
bool dsd_bi_want_array(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i);
// An `int` argument: a number, floored when it has a fraction. Raises R542 like dsd_bi_want_number.
bool dsd_bi_arg_int(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, int32_t *out);
// An asset argument of kind `kind` (DSD_ASSET_*); its index in *index. Raises R542 naming `what` otherwise.
bool dsd_bi_arg_asset(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, uint32_t kind, const char *what,
                      uint32_t *index);
// A number argument as Q20.12 in 32 bits (positions); outside the range raises R521 (debug builds).
bool dsd_bi_arg_q20(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, int32_t *out);
// Stores a 64-bit Q.12 result as a REAL; outside Q20.12 raises R521 in debug builds (release wraps).
bool dsd_bi_real_result(DsdVm *vm, int64_t q12, DsdValue *out);
// Maps a number-layer status (fixed.h) to R52x/R530 (dsd_vm_number_status), or R542 naming builtin `bi` for
// values that are not numbers; true when execution continues.
bool dsd_bi_status(DsdVm *vm, uint32_t bi, int32_t status, DsdValue result);

// ---- Implementations, by file -----------------------------------------------------------------------------------
// math.c
bool dsd_bi_floor(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_ceil(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_round(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_abs(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_sign(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_frac(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_sqrt(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_min(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_max(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_clamp(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_lerp(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_dsin(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_dcos(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_point_distance(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_point_direction(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_lengthdir_x(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_lengthdir_y(DsdVm *vm, DsdValue *args, uint32_t argc);
// text.c
bool dsd_bi_real(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_string_length(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_string_char_at(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_string_upper(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_string_lower(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_string_repeat(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_chr(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_ord(DsdVm *vm, DsdValue *args, uint32_t argc);
// lists.c
bool dsd_bi_array_length(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_array_push(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_array_pop(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_array_create(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_array_delete(DsdVm *vm, DsdValue *args, uint32_t argc);
// randomness.c
bool dsd_bi_random(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_random_range(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_irandom(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_irandom_range(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_choose(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_randomize(DsdVm *vm, DsdValue *args, uint32_t argc);
// world.c (instances, places, events, rooms)
bool dsd_bi_instance_create(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_instance_destroy(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_instance_exists(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_instance_number(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_instance_find(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_instance_nearest(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_instance_place(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_place_meeting(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_position_meeting(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_place_free(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_collision_rectangle(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_collision_point(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_distance_to_object(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_event_inherited(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_event_user(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_room_goto(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_room_goto_next(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_room_goto_previous(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_room_restart(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_game_restart(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_game_end(DsdVm *vm, DsdValue *args, uint32_t argc);
// input.c
bool dsd_bi_button_check(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_button_pressed(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_button_released(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_touch_check(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_touch_pressed(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_touch_released(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_touch_in_instance(DsdVm *vm, DsdValue *args, uint32_t argc);
// motion.c
bool dsd_bi_motion_add(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_motion_set(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_move_towards_point(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_move_wrap(DsdVm *vm, DsdValue *args, uint32_t argc);
// media.c (audio and the UI layer)
bool dsd_bi_audio_play_sound(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_audio_stop_sound(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_audio_play_music(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_audio_stop_music(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_audio_set_volume(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_audio_is_playing(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_draw_text(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_draw_set_screen(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_draw_set_color(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_draw_rectangle(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_draw_clear(DsdVm *vm, DsdValue *args, uint32_t argc);
// output.c
bool dsd_bi_show_debug_message(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_string(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_assert(DsdVm *vm, DsdValue *args, uint32_t argc);

#endif // DSD_BI_H
