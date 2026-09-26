// dsd_random.h: the core's PRNG, xorshift32 (language.md section 7: "Random numbers come from the core's
// xorshift32"). One stream for the whole game; identical on the host and the DS for the same seed.
#ifndef DSD_RANDOM_H
#define DSD_RANDOM_H

#include <stdint.h>

// xorshift32 cannot leave state 0, so a zero seed (header 0 and a platform seed of 0) is replaced by this.
#define DSD_RNG_ZERO_SEED 0x6D2B79F5u

void dsd_rng_seed(uint32_t seed);
uint32_t dsd_rng_state(void);            // the current state (traced by the host runner)
uint32_t dsd_rng_next(void);             // next 32-bit value
uint32_t dsd_rng_below(uint32_t bound);  // uniform in [0, bound) by rejection; bound 0 gives 0

#endif // DSD_RANDOM_H
