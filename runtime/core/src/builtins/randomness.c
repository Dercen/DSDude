// randomness.c: random builtins over the core's xorshift32 (dsd_random.h; language.md section 7). The same seed gives
// the same numbers on the host and the DS.
//   random(n)            a fraction in [0, n) (n < 0: (n, 0]), in steps of 1/4096
//   random_range(lo, hi) lo + random(hi - lo)
//   irandom(n)           a whole number from 0 to n, both included (n < 0: from n to 0)
//   irandom_range(a, b)  a whole number from min(a, b) to max(a, b), both included
//   choose(...)          one of its arguments
//   randomize()          kept for GameMaker code; does nothing (the seed comes from the build or the platform)
#include "bi.h"
#include "dsd_random.h"
#include "fixed.h"

// A uniform draw in [0, span] for a span up to 2^32 - 1 (span + 1 = 2^32 means every u32).
static uint32_t draw_inclusive(uint32_t span) {
    return span == UINT32_MAX ? dsd_rng_next() : dsd_rng_below(span + 1u);
}

// random(n) on a Q.12 bound: a Q.12 fraction step in [0, |n|), carrying n's sign. Out of Q20.12 is R521 (debug).
static bool random_q12(DsdVm *vm, int64_t n, DsdValue *out) {
    uint64_t mag = n < 0 ? 0u - (uint64_t)n : (uint64_t)n;
    if (mag > (uint64_t)INT32_MAX + 1u) return dsd_bi_real_result(vm, n, out); // raises R521 in debug builds
    int64_t r = mag == 0 ? 0 : (int64_t)dsd_rng_below((uint32_t)mag);
    *out = dsd_real((int32_t)(n < 0 ? -r : r));
    return true;
}

bool dsd_bi_random(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t n;
    if (!dsd_bi_arg_q12(vm, DSD_BI_random, args, 0, &n)) return false;
    return random_q12(vm, n, &args[0]);
}

bool dsd_bi_random_range(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int64_t lo;
    int64_t hi;
    if (!dsd_bi_arg_q12(vm, DSD_BI_random_range, args, 0, &lo) ||
        !dsd_bi_arg_q12(vm, DSD_BI_random_range, args, 1, &hi)) {
        return false;
    }
    DsdValue r;
    if (!random_q12(vm, hi - lo, &r)) return false;
    return dsd_bi_real_result(vm, lo + r.payload, &args[0]);
}

bool dsd_bi_irandom(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int32_t n;
    if (!dsd_bi_arg_int(vm, DSD_BI_irandom, args, 0, &n)) return false;
    uint32_t span = n < 0 ? 0u - (uint32_t)n : (uint32_t)n;
    uint32_t r = draw_inclusive(span);
    args[0] = dsd_int(n < 0 ? (int32_t)(0u - r) : (int32_t)r);
    return true;
}

bool dsd_bi_irandom_range(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int32_t a;
    int32_t b;
    if (!dsd_bi_arg_int(vm, DSD_BI_irandom_range, args, 0, &a) ||
        !dsd_bi_arg_int(vm, DSD_BI_irandom_range, args, 1, &b)) {
        return false;
    }
    int32_t lo = a < b ? a : b;
    int32_t hi = a < b ? b : a;
    uint32_t span = (uint32_t)hi - (uint32_t)lo; // fits u32 for every int32 pair
    args[0] = dsd_int((int32_t)((uint32_t)lo + draw_inclusive(span)));
    return true;
}

bool dsd_bi_choose(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)vm;
    args[0] = args[dsd_rng_below(argc)];
    return true;
}

bool dsd_bi_randomize(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)vm;
    (void)argc;
    args[0] = dsd_undef();
    return true;
}
