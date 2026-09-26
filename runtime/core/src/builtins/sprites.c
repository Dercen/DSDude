// sprites.c: the sprite-drawing builtins (draw_self, draw_sprite, draw_sprite_ext). Each queues one entry in the
// frame's draw list (drawlist.h), stacked by the drawing instance's (depth, id) on the current draw screen; the
// shadow OAM is built from the list when the Draw stage ends.
#include "bi.h"
#include "drawlist.h"
#include "fixed.h"

// Argument positions: draw_sprite takes the first four, draw_sprite_ext all seven.
#define ARG_SPRITE 0
#define ARG_FRAME 1
#define ARG_X 2
#define ARG_Y 3
#define ARG_XSCALE 4
#define ARG_YSCALE 5
#define ARG_ANGLE 6

// Reads the four common arguments (sprite, frame, x, y) of builtin `bi`; false after raising an error.
static bool common_args(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t *sprite, int32_t *frame, int32_t *x,
                        int32_t *y) {
    return dsd_bi_arg_asset(vm, bi, args, ARG_SPRITE, DSD_ASSET_SPRITE, "a sprite", sprite) &&
           dsd_bi_arg_int(vm, bi, args, ARG_FRAME, frame) && dsd_bi_arg_q20(vm, bi, args, ARG_X, x) &&
           dsd_bi_arg_q20(vm, bi, args, ARG_Y, y);
}

bool dsd_bi_draw_self(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    args[0] = dsd_undef();
    return dsd_draw_self(vm, vm->self);
}

bool dsd_bi_draw_sprite(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    uint32_t sprite;
    int32_t frame;
    int32_t x;
    int32_t y;
    if (!common_args(vm, DSD_BI_draw_sprite, args, &sprite, &frame, &x, &y)) return false;
    args[0] = dsd_undef();
    return dsd_draw_sprite(vm, vm->self, sprite, frame, x, y, DSD_FX_ONE, DSD_FX_ONE, 0);
}

bool dsd_bi_draw_sprite_ext(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    uint32_t bi = DSD_BI_draw_sprite_ext;
    uint32_t sprite;
    int32_t frame;
    int32_t x;
    int32_t y;
    int32_t xscale;
    int32_t yscale;
    int32_t angle;
    if (!common_args(vm, bi, args, &sprite, &frame, &x, &y) || !dsd_bi_arg_q20(vm, bi, args, ARG_XSCALE, &xscale) ||
        !dsd_bi_arg_q20(vm, bi, args, ARG_YSCALE, &yscale) || !dsd_bi_arg_q20(vm, bi, args, ARG_ANGLE, &angle)) {
        return false;
    }
    args[0] = dsd_undef();
    return dsd_draw_sprite(vm, vm->self, sprite, frame, x, y, xscale, yscale, angle);
}
