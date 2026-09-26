// random.c: xorshift32 (Marsaglia 2003, shifts 13/17/5) and an unbiased bounded draw.
#include "dsd_random.h"

#define XS_SHIFT_A 13
#define XS_SHIFT_B 17
#define XS_SHIFT_C 5

static uint32_t g_state = DSD_RNG_ZERO_SEED;

void dsd_rng_seed(uint32_t seed) { g_state = seed != 0 ? seed : DSD_RNG_ZERO_SEED; }

uint32_t dsd_rng_state(void) { return g_state; }

uint32_t dsd_rng_next(void) {
    uint32_t x = g_state;
    x ^= x << XS_SHIFT_A;
    x ^= x >> XS_SHIFT_B;
    x ^= x << XS_SHIFT_C;
    g_state = x;
    return x;
}

uint32_t dsd_rng_below(uint32_t bound) {
    if (bound == 0) return 0;
    // Reject the top partial range so every residue is equally likely. 0u - bound == 2^32 - bound (mod 2^32), and
    // (2^32 - bound) % bound == 2^32 % bound: the count of values to reject.
    uint32_t reject = (0u - bound) % bound;
    uint32_t v;
    do {
        v = dsd_rng_next();
    } while (v < reject);
    return v % bound;
}
