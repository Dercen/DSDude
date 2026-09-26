// motion.c: motion builtins over the instance's speed/direction and hspeed/vspeed (two views of one motion,
// contracts/events.md step 6). Directions are degrees, counter-clockwise, y pointing down.
#include "bi.h"
#include "engine.h"
#include "fixed.h"

// len * trig / 4096 in 64 bits, truncated toward zero (the fixed multiply rule).
static int32_t scaled(int64_t len, int32_t trig) {
    int64_t p = len * trig;
    return dsd_lo32(p >= 0 ? (p >> DSD_FX_SHIFT) : -((-p) >> DSD_FX_SHIFT));
}

// Degrees reduced to [0, 360) (Q20.12).
static int32_t normalize_degrees(int64_t d) {
    int64_t r;
    dsd_div64(d, DSD_DEG_FULL_FX, 0, &r);
    return (int32_t)(r < 0 ? r + DSD_DEG_FULL_FX : r);
}

// The running instance, or NULL (then these builtins do nothing).
static DsdInstance *me(const DsdVm *vm) { return vm->self == DSD_VM_NO_INST ? 0 : dsd_inst_at(vm->self); }

bool dsd_bi_motion_add(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t dir;
    int32_t speed;
    if (!dsd_bi_arg_q12(vm, DSD_BI_motion_add, args, 0, &dir) || !dsd_bi_arg_q20(vm, DSD_BI_motion_add, args, 1, &speed)) {
        return false;
    }
    DsdInstance *in = me(vm);
    if (in != 0) {
        in->hspeed += scaled(speed, dsd_fx_dcos(dir));
        in->vspeed -= scaled(speed, dsd_fx_dsin(dir));
        dsd_inst_sync_polar(in);
    }
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_motion_set(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t dir;
    int32_t speed;
    if (!dsd_bi_arg_q12(vm, DSD_BI_motion_set, args, 0, &dir) || !dsd_bi_arg_q20(vm, DSD_BI_motion_set, args, 1, &speed)) {
        return false;
    }
    DsdInstance *in = me(vm);
    if (in != 0) {
        in->direction = normalize_degrees(dir);
        in->speed = speed;
        dsd_inst_sync_cartesian(in);
    }
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_move_towards_point(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t x;
    int64_t y;
    int32_t speed;
    if (!dsd_bi_arg_q12(vm, DSD_BI_move_towards_point, args, 0, &x) ||
        !dsd_bi_arg_q12(vm, DSD_BI_move_towards_point, args, 1, &y) ||
        !dsd_bi_arg_q20(vm, DSD_BI_move_towards_point, args, 2, &speed)) {
        return false;
    }
    DsdInstance *in = me(vm);
    if (in != 0) {
        in->direction = dsd_fx_atan2_deg(in->y - y, x - in->x); // point_direction from the instance to (x, y)
        in->speed = speed;
        dsd_inst_sync_cartesian(in);
    }
    args[0] = dsd_undef();
    return true;
}

// One axis of move_wrap: leaving by more than `margin` past one side comes back that far past the other.
static int32_t wrap_axis(int32_t pos, int64_t size, int64_t margin) {
    int64_t span = size + 2 * margin;
    if (pos < -margin) return dsd_lo32(pos + span);
    if (pos >= size + margin) return dsd_lo32(pos - span);
    return pos;
}

bool dsd_bi_move_wrap(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t margin;
    if (!dsd_bi_arg_q12(vm, DSD_BI_move_wrap, args, 2, &margin)) return false;
    DsdInstance *in = me(vm);
    if (in != 0) {
        const DsdRoom *rm = &vm->world->rooms[dsd_engine.room];
        if (dsd_truthy(args[0])) in->x = wrap_axis(in->x, (int64_t)rm->width * DSD_FX_ONE, margin);
        if (dsd_truthy(args[1])) in->y = wrap_axis(in->y, (int64_t)rm->height * DSD_FX_ONE, margin);
    }
    args[0] = dsd_undef();
    return true;
}
