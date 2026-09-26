// media.c: audio builtins (maxmod through dsd_plat_sfx_* / dsd_plat_music_*) and the UI-layer drawing builtins
// (draw_text, draw_rectangle, draw_clear, draw_set_color, draw_set_screen; PLAN.md 3.3 "Backgrounds and the UI
// layer"). UI drawing snaps to 8-pixel cells of the screen, at the room position minus the screen's view.
#include "bi.h"
#include "dsd_platform.h"
#include "engine.h"
#include "errors.h"
#include "fixed.h"

#define CELL_FX (DSD_UI_CELL_PX * DSD_FX_ONE) // one UI cell in Q20.12
#define VOLUME_MAX DSD_FX_ONE                 // audio_set_volume(1)

// Raises R572 when a sound is not in the current room's loaded set (contracts/events.md section 4).
static bool sound_loaded(DsdVm *vm, uint32_t asset) {
    const DsdRoom *rm = &vm->world->rooms[dsd_engine.room];
    for (uint32_t k = 0; k < rm->sound_count; k++) {
        if (rm->sounds[k] == asset) return true;
    }
    uint32_t len;
    DsdText t = dsd_vm_error_begin(vm, DSD_R_NOT_LOADED);
    dsd_text_str(&t, dsd_prog_str(vm->prog, vm->world->assets[asset].name_str, &len));
    dsd_text_str(&t, " is not loaded in ");
    dsd_text_str(&t, dsd_prog_str(vm->prog, rm->name_str, &len));
    return false;
}

// A sound or music argument that is loaded in this room; its ASET index in *asset.
static bool sound_arg(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t kind, uint32_t *asset) {
    const char *what = kind == DSD_ASSET_MUSIC ? "music" : "a sound";
    return dsd_bi_arg_asset(vm, bi, args, 0, kind, what, asset) && sound_loaded(vm, *asset);
}

bool dsd_bi_audio_play_sound(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    uint32_t a;
    if (!sound_arg(vm, DSD_BI_audio_play_sound, args, DSD_ASSET_SOUND, &a)) return false;
    if (dsd_plat_sfx_play(vm->world->assets[a].aux) < 0) dsd_engine.sfx_drops++; // no free channel (DSD|STAT)
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_audio_stop_sound(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    uint32_t a;
    if (!sound_arg(vm, DSD_BI_audio_stop_sound, args, DSD_ASSET_SOUND, &a)) return false;
    dsd_plat_sfx_stop(vm->world->assets[a].aux);
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_audio_play_music(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    uint32_t a;
    if (!sound_arg(vm, DSD_BI_audio_play_music, args, DSD_ASSET_MUSIC, &a)) return false;
    // Rule 8: a no-op when that music is already playing.
    if (dsd_engine.music != (int32_t)a || !dsd_plat_music_active()) {
        dsd_plat_music_play(vm->world->assets[a].aux);
        dsd_engine.music = (int32_t)a;
    }
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_audio_stop_music(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)vm;
    (void)argc;
    dsd_plat_music_stop();
    dsd_engine.music = -1;
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_audio_set_volume(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t v;
    if (!dsd_bi_arg_q12(vm, DSD_BI_audio_set_volume, args, 0, &v)) return false;
    dsd_plat_volume((int32_t)(v < 0 ? 0 : (v > VOLUME_MAX ? VOLUME_MAX : v)));
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_audio_is_playing(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)vm;
    (void)argc;
    DsdValue v = args[0];
    uint32_t kind = v.tag == DSD_TAG_ASSET ? (uint32_t)v.payload >> DSD_ASSET_KIND_SHIFT : 0;
    // Music: the module playing now. Sound effects: maxmod cannot tell, so false.
    int32_t a = (int32_t)((uint32_t)v.payload & DSD_ASSET_INDEX_MASK);
    args[0] = dsd_bool(kind == DSD_ASSET_MUSIC && dsd_engine.music == a && dsd_plat_music_active());
    return true;
}

// ---- UI layer -----------------------------------------------------------------------------------------------------

// Room position (Q20.12) to a UI cell of the draw screen: minus the view, floored to 8-pixel cells.
static int32_t cell_x(int64_t x) { return (int32_t)((x - (int64_t)dsd_engine.view_x[dsd_engine.draw_screen] * DSD_FX_ONE) >> 15); }
static int32_t cell_y(int64_t y) { return (int32_t)((y - (int64_t)dsd_engine.view_y[dsd_engine.draw_screen] * DSD_FX_ONE) >> 15); }
_Static_assert(CELL_FX == (1 << 15), "cell_x/cell_y shift by 15: 8 pixels x 4096");

// Text of one value for draw_text (main RAM; longer text is cut).
static char g_text[DSD_RT_TEXT_MAX];

bool dsd_bi_draw_text(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t x;
    int64_t y;
    if (!dsd_bi_arg_q12(vm, DSD_BI_draw_text, args, 0, &x) || !dsd_bi_arg_q12(vm, DSD_BI_draw_text, args, 1, &y)) {
        return false;
    }
    DsdText t;
    dsd_text_init(&t, g_text, sizeof g_text);
    dsd_value_format(vm, args[2], &t);
    // Each '\n' continues on the next row, back at the first column.
    int32_t cx = cell_x(x);
    int32_t cy = cell_y(y);
    uint32_t start = 0;
    for (uint32_t i = 0; i <= t.len; i++) {
        if (i == t.len || t.buf[i] == '\n') {
            dsd_plat_ui_text(dsd_engine.draw_screen, cx, cy++, t.buf + start, i - start, dsd_engine.draw_colour);
            start = i + 1;
        }
    }
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_draw_set_screen(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int32_t s;
    if (!dsd_bi_arg_int(vm, DSD_BI_draw_set_screen, args, 0, &s)) return false;
    if (s != (int32_t)DSD_SCREEN_TOP && s != (int32_t)DSD_SCREEN_BOTTOM) {
        DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_ARGUMENT);
        dsd_text_str(&t, "draw_set_screen needs SCREEN_TOP or SCREEN_BOTTOM, but got ");
        dsd_text_int(&t, s);
        return false;
    }
    dsd_engine.draw_screen = (uint32_t)s;
    dsd_engine.draw_screen_set = true;
    args[0] = dsd_undef();
    return true;
}

// A UI colour argument: one of the 16 c_* colours (0-15).
static bool colour_arg(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, uint32_t *out) {
    int32_t c;
    if (!dsd_bi_arg_int(vm, bi, args, i, &c)) return false;
    if (c < 0 || c >= DSD_UI_COLOURS) {
        DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_ARGUMENT);
        dsd_text_str(&t, dsd_builtin_info[bi].name);
        dsd_text_str(&t, " needs one of the 16 c_ colours, but got ");
        dsd_text_int(&t, c);
        return false;
    }
    *out = (uint32_t)c;
    return true;
}

bool dsd_bi_draw_set_color(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!colour_arg(vm, DSD_BI_draw_set_color, args, 0, &dsd_engine.draw_colour)) return false;
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_draw_rectangle(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t c[4];
    for (uint32_t i = 0; i < 4; i++) {
        if (!dsd_bi_arg_q12(vm, DSD_BI_draw_rectangle, args, i, &c[i])) return false;
    }
    // Cells covering both corners, inclusive.
    int32_t x0 = cell_x(c[0] < c[2] ? c[0] : c[2]);
    int32_t x1 = cell_x(c[0] < c[2] ? c[2] : c[0]);
    int32_t y0 = cell_y(c[1] < c[3] ? c[1] : c[3]);
    int32_t y1 = cell_y(c[1] < c[3] ? c[3] : c[1]);
    int32_t w = x1 - x0 + 1;
    int32_t h = y1 - y0 + 1;
    uint32_t s = dsd_engine.draw_screen;
    uint32_t col = dsd_engine.draw_colour;
    if (!dsd_truthy(args[4]) || w <= 2 || h <= 2) {
        dsd_plat_ui_fill(s, x0, y0, w, h, col);
    } else { // outline: the four edges
        dsd_plat_ui_fill(s, x0, y0, w, 1, col);
        dsd_plat_ui_fill(s, x0, y1, w, 1, col);
        dsd_plat_ui_fill(s, x0, y0 + 1, 1, h - 2, col);
        dsd_plat_ui_fill(s, x1, y0 + 1, 1, h - 2, col);
    }
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_draw_clear(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    uint32_t col;
    if (!colour_arg(vm, DSD_BI_draw_clear, args, 0, &col)) return false;
    // Clears the draw screen's UI map, then fills its visible cells with the colour.
    dsd_plat_ui_clear(dsd_engine.draw_screen);
    dsd_plat_ui_fill(dsd_engine.draw_screen, 0, 0, DSD_UI_COLS, DSD_UI_ROWS, col);
    args[0] = dsd_undef();
    return true;
}
