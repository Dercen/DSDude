// math.c: number builtins (builtins.json category "math", plus the point_* / lengthdir_* geometry). Rounding
// functions return ints; the rest keep DSS's int/fixed rules (contracts/language.md section 4).
#include "bi.h"
#include "errors.h"
#include "fixed.h"
#include "number.h"
#include "numfmt.h"

// Signature of number.c's rounding functions.
typedef int32_t (*RoundFn)(DsdValue a, int32_t *out);

// floor/ceil/round share one shape: a number in, an int out.
static bool round_builtin(DsdVm *vm, uint32_t bi, DsdValue *args, RoundFn fn) {
    int32_t r;
    if (!dsd_bi_want_number(vm, bi, args, 0)) return false;
    fn(args[0], &r);
    args[0] = dsd_int(r);
    return true;
}

bool dsd_bi_floor(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return round_builtin(vm, DSD_BI_floor, args, dsd_num_floor);
}

bool dsd_bi_ceil(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return round_builtin(vm, DSD_BI_ceil, args, dsd_num_ceil);
}

bool dsd_bi_round(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return round_builtin(vm, DSD_BI_round, args, dsd_num_round);
}

bool dsd_bi_abs(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!dsd_bi_want_number(vm, DSD_BI_abs, args, 0)) return false;
    if (args[0].payload >= 0) return true; // keeps its representation
    DsdValue r;
    int32_t st = dsd_num_neg(args[0], &r);
    args[0] = r;
    return dsd_bi_status(vm, DSD_BI_abs, st, r);
}

bool dsd_bi_sign(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!dsd_bi_want_number(vm, DSD_BI_sign, args, 0)) return false;
    int32_t p = args[0].payload;
    args[0] = dsd_int(p > 0 ? 1 : (p < 0 ? -1 : 0));
    return true;
}

bool dsd_bi_frac(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!dsd_bi_want_number(vm, DSD_BI_frac, args, 0)) return false;
    if (dsd_is_int(args[0])) {
        args[0] = dsd_int(0);
        return true;
    }
    // The fraction keeps the sign, as in GML: frac(-2.5) = -0.5.
    int32_t q = args[0].payload;
    args[0] = dsd_real(q - dsd_fx_trunc(q) * DSD_FX_ONE);
    return true;
}

bool dsd_bi_sqrt(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t q;
    if (!dsd_bi_arg_q12(vm, DSD_BI_sqrt, args, 0, &q)) return false;
    if (q < 0) {
        char num[DSD_NUMFMT_BUF];
        dsd_fmt_number(args[0], num);
        DsdText t = dsd_vm_error_begin(vm, DSD_R_SQRT_NEG);
        dsd_text_str(&t, "Can't take the square root of a negative number (");
        dsd_text_str(&t, num);
        dsd_text_char(&t, ')');
        return false;
    }
    // sqrt of a Q.12 value is isqrt(q << 12) in Q.12 (q < 2^43, so q << 12 fits u64). For fixed inputs this is
    // exactly the libnds sqrtf32 model.
    args[0] = dsd_real((int32_t)dsd_isqrt64((uint64_t)q << DSD_FX_SHIFT));
    return true;
}

// min/max: the first argument that is smallest (largest), returned as it is. `want` is -1 for min, 1 for max.
static bool pick(DsdVm *vm, uint32_t bi, DsdValue *args, uint32_t argc, int32_t want) {
    uint32_t best = 0;
    for (uint32_t i = 0; i < argc; i++) {
        if (!dsd_bi_want_number(vm, bi, args, i)) return false;
        int32_t ord;
        dsd_num_cmp(args[i], args[best], &ord);
        if (ord == want) best = i;
    }
    args[0] = args[best];
    return true;
}

bool dsd_bi_min(DsdVm *vm, DsdValue *args, uint32_t argc) { return pick(vm, DSD_BI_min, args, argc, -1); }

bool dsd_bi_max(DsdVm *vm, DsdValue *args, uint32_t argc) { return pick(vm, DSD_BI_max, args, argc, 1); }

bool dsd_bi_clamp(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    for (uint32_t i = 0; i < 3; i++) {
        if (!dsd_bi_want_number(vm, DSD_BI_clamp, args, i)) return false;
    }
    int32_t ord;
    dsd_num_cmp(args[0], args[1], &ord);
    if (ord < 0) {
        args[0] = args[1];
        return true;
    }
    dsd_num_cmp(args[0], args[2], &ord);
    if (ord > 0) args[0] = args[2];
    return true;
}

bool dsd_bi_lerp(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    // a + (b - a) * t with the ordinary operator rules.
    DsdValue d;
    DsdValue m;
    int32_t st = dsd_num_sub(args[1], args[0], &d);
    if (!dsd_bi_status(vm, DSD_BI_lerp, st, d)) return false;
    st = dsd_num_mul(d, args[2], &m);
    if (!dsd_bi_status(vm, DSD_BI_lerp, st, m)) return false;
    st = dsd_num_add(args[0], m, &args[0]);
    return dsd_bi_status(vm, DSD_BI_lerp, st, args[0]);
}

bool dsd_bi_dsin(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t deg;
    if (!dsd_bi_arg_q12(vm, DSD_BI_dsin, args, 0, &deg)) return false;
    args[0] = dsd_real(dsd_fx_dsin(deg));
    return true;
}

bool dsd_bi_dcos(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t deg;
    if (!dsd_bi_arg_q12(vm, DSD_BI_dcos, args, 0, &deg)) return false;
    args[0] = dsd_real(dsd_fx_dcos(deg));
    return true;
}

// The four coordinates of point_distance / point_direction as Q.12, in 64 bits.
static bool four_coords(DsdVm *vm, uint32_t bi, const DsdValue *args, int64_t q[4]) {
    for (uint32_t i = 0; i < 4; i++) {
        if (!dsd_bi_arg_q12(vm, bi, args, i, &q[i])) return false;
    }
    return true;
}

bool dsd_bi_point_distance(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t q[4];
    if (!four_coords(vm, DSD_BI_point_distance, args, q)) return false;
    return dsd_bi_real_result(vm, dsd_fx_hypot(q[2] - q[0], q[3] - q[1]), &args[0]);
}

bool dsd_bi_point_direction(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t q[4];
    if (!four_coords(vm, DSD_BI_point_direction, args, q)) return false;
    // y points down on screen, and directions turn counter-clockwise: flip the y difference.
    args[0] = dsd_real(dsd_fx_atan2_deg(q[1] - q[3], q[2] - q[0]));
    return true;
}

// len * trig(dir) / 4096 in 64 bits, truncated toward zero (the fixed multiply rule); `sign` flips for y.
static bool lengthdir(DsdVm *vm, uint32_t bi, DsdValue *args, bool use_sin, int64_t sign) {
    int64_t len;
    int64_t dir;
    if (!dsd_bi_arg_q12(vm, bi, args, 0, &len) || !dsd_bi_arg_q12(vm, bi, args, 1, &dir)) return false;
    int64_t t = use_sin ? dsd_fx_dsin(dir) : dsd_fx_dcos(dir);
    int64_t p = len * t * sign; // |len| < 2^43, |t| <= 2^12: fits
    int64_t q = p >= 0 ? (p >> DSD_FX_SHIFT) : -((-p) >> DSD_FX_SHIFT);
    return dsd_bi_real_result(vm, q, &args[0]);
}

bool dsd_bi_lengthdir_x(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return lengthdir(vm, DSD_BI_lengthdir_x, args, false, 1);
}

bool dsd_bi_lengthdir_y(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return lengthdir(vm, DSD_BI_lengthdir_y, args, true, -1); // y down: lengthdir_y(1, 90) = -1
}
