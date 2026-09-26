// fixed.c: integer and Q20.12 kernels: the one division path, fixed multiply/divide, rounding, square roots,
// degree trig over the vendored libnds LUTs and the octant-LUT atan2 (PLAN.md 2.4, 2.8; contracts/language.md 4).
//
// Portability notes (PLAN.md risk 25): only fixed-width types; no floats; no negative left shifts (multiplications
// instead); right shifts of negative values rely on GCC's documented arithmetic shift, which both targets use.
#include "fixed.h"

#include "vendor/nds_shim.h"
#include "vendor/trig_lut.h"

// ---- Local constants -----------------------------------------------------------------------------------------
// One libnds LUT step in Q20.12 degrees: a quarter turn (90 degrees) spans 128 entries, so 90 * 4096 / 128 = 2880.
#define LUT_STEP_DEG_FX ((90 * DSD_FX_ONE) / DSD_NDS_LUT_QUARTER)
// The TAN_LUT index of 45 degrees (tan = 1): the last entry an octant ever needs.
#define LUT_OCTANT_LAST (DSD_NDS_LUT_QUARTER / 2)
// Ratios fed to the octant search are 16.16 fixed point, the TAN_LUT format (tan(45) = 1.0 = 65536).
#define TAN_RATIO_SHIFT 16
#define TAN_RATIO_ONE ((int64_t)1 << TAN_RATIO_SHIFT)
// Largest magnitude kept before a ratio or a square: below 2^31, so `x << 16` and `x * x` fit 64 bits.
#define MAG31_MAX 0x7FFFFFFFull
// Whole-circle constants in Q20.12 degrees.
#define DEG_45_FX (45 * DSD_FX_ONE)
#define DEG_90_FX (90 * DSD_FX_ONE)
#define DEG_180_FX (180 * DSD_FX_ONE)
#define DEG_360_FX (360 * DSD_FX_ONE)

// Magnitude of a 64-bit value as u64 (correct for INT64_MIN too).
static uint64_t mag64(int64_t v) { return v < 0 ? 0u - (uint64_t)v : (uint64_t)v; }

// ---- Division ------------------------------------------------------------------------------------------------

int32_t dsd_div64(int64_t num, int64_t den, int64_t *quot, int64_t *rem) {
    int64_t q = 0;
    int64_t r = 0;
    int32_t status = DSD_NUM_OK;
    if (den == 0) {
        // Always an error at language level (R5xx); the outputs are defined as 0 so callers never read garbage.
        status = DSD_NUM_DIV_ZERO;
    } else if (den == -1) {
        // Covers INT64_MIN / -1 (and INT_MIN / -1 widened): negate in unsigned arithmetic so it wraps instead of
        // being undefined. The remainder of any division by -1 is 0.
        q = (int64_t)(0u - (uint64_t)num);
    } else {
        // C99: truncation toward zero, remainder with the dividend's sign: exactly the DS divider's semantics.
        q = num / den;
        r = num % den;
    }
    if (quot) *quot = q;
    if (rem) *rem = r;
    return status;
}

int32_t dsd_div64_32(int64_t num, int32_t den, int32_t *status) {
    int64_t q;
    int32_t st = dsd_div64(num, den, &q, 0);
    if (status) *status = st;
    return dsd_lo32(q); // DIV_64_32 hands back the low 32 bits of the 64-bit quotient
}

int64_t dsd_div_round64(int64_t num, int64_t den) {
    int64_t q;
    int64_t r;
    dsd_div64(num, den, &q, &r);
    // Round half away from zero: bump the magnitude when the remainder is at least half the divisor. Compared as
    // |r| >= |den| - |r| so nothing can overflow.
    uint64_t mr = mag64(r);
    uint64_t md = mag64(den);
    if (mr != 0 && mr >= md - mr) q += ((num < 0) != (den < 0)) ? -1 : 1;
    return q;
}

// ---- Q20.12 arithmetic ---------------------------------------------------------------------------------------

// Truncating (toward zero) conversion of a 64-bit Q24.24 product back to Q.12.
static int64_t shr12_trunc(int64_t p) { return p >= 0 ? (p >> DSD_FX_SHIFT) : -((-p) >> DSD_FX_SHIFT); }

int32_t dsd_fx_mul(int32_t a, int32_t b, int32_t *out) {
    // |a * b| <= 2^62, so the product and its negation fit int64.
    int64_t q = shr12_trunc((int64_t)a * b);
    *out = dsd_lo32(q);
    return dsd_fits32(q) ? DSD_NUM_OK : DSD_NUM_OVERFLOW;
}

int32_t dsd_fx_div(int32_t a, int32_t b, int32_t *out) {
    int64_t q;
    // (a << 12) / b, written as a multiplication so a negative a is not a negative left shift.
    int32_t st = dsd_div64((int64_t)a * DSD_FX_ONE, b, &q, 0);
    *out = dsd_lo32(q);
    if (st != DSD_NUM_OK) return st;
    return dsd_fits32(q) ? DSD_NUM_OK : DSD_NUM_OVERFLOW;
}

int32_t dsd_fx_floor(int32_t q) { return q >> DSD_FX_SHIFT; }

int32_t dsd_fx_ceil(int32_t q) { return (int32_t)(-((-(int64_t)q) >> DSD_FX_SHIFT)); }

int32_t dsd_fx_trunc(int32_t q) { return (int32_t)shr12_trunc(q); }

int32_t dsd_fx_round(int32_t q) {
    // Add one half to the magnitude, then truncate: half away from zero. 64-bit so q near INT32_MAX cannot wrap.
    int64_t m = (int64_t)q;
    return (int32_t)(m >= 0 ? (m + DSD_FX_HALF) >> DSD_FX_SHIFT : -((-m + DSD_FX_HALF) >> DSD_FX_SHIFT));
}

// ---- Square roots --------------------------------------------------------------------------------------------

uint32_t dsd_isqrt64(uint64_t n) {
    // Digit-by-digit (base 4) integer square root: exact floor, 32 iterations at most, no division.
    uint64_t rem = n;
    uint64_t root = 0;
    uint64_t bit = (uint64_t)1 << 62; // the highest power of four a u64 holds
    while (bit > n) bit >>= 2;
    while (bit != 0) {
        if (rem >= root + bit) {
            rem -= root + bit;
            root = (root >> 1) + bit;
        } else {
            root >>= 1;
        }
        bit >>= 2;
    }
    return (uint32_t)root;
}

uint32_t dsd_sqrtf32(uint32_t a) { return dsd_isqrt64((uint64_t)a << DSD_FX_SHIFT); }

// ---- Degree trig ---------------------------------------------------------------------------------------------

int32_t dsd_deg_to_brad(int64_t deg_fx) {
    // brad = deg * 32768 / 360 = deg_fx / 45 (DSD_DEG_FX_PER_BRAD), rounded; then reduced to one turn. Masking the
    // two's-complement bits is the mathematical modulo for negative angles too.
    int64_t brad = dsd_div_round64(deg_fx, DSD_DEG_FX_PER_BRAD);
    return (int32_t)((uint64_t)brad & DSD_BRAD_MASK);
}

int32_t dsd_fx_dsin(int64_t deg_fx) { return sinLerp((s16)dsd_deg_to_brad(deg_fx)); }

int32_t dsd_fx_dcos(int64_t deg_fx) { return cosLerp((s16)dsd_deg_to_brad(deg_fx)); }

// atan(small / big) in Q20.12 degrees for 0 <= small < big: [0, 45]. Interpolates linearly between the TAN_LUT
// entries around the 16.16 ratio, rounding the step fraction half away from zero.
static int32_t octant_atan_deg(uint64_t small, uint64_t big) {
    // Scale both down together until they fit 31 bits, so `small << 16` fits int64 (the ratio barely changes).
    while (big > MAG31_MAX) {
        big >>= 1;
        small >>= 1;
    }
    int64_t ratio;
    dsd_div64((int64_t)(small << TAN_RATIO_SHIFT), (int64_t)big, &ratio, 0);
    // Scaling can make small == big; the last octant entry (tan 45 in the LUT is 65535) caps the ratio.
    if (ratio > TAN_LUT[LUT_OCTANT_LAST]) ratio = TAN_LUT[LUT_OCTANT_LAST];
    // Binary search for the entry i with TAN_LUT[i] <= ratio < TAN_LUT[i + 1], within [0, 45] degrees.
    int32_t lo = 0;
    int32_t hi = LUT_OCTANT_LAST;
    while (lo < hi) {
        int32_t mid = (lo + hi + 1) / 2;
        if (TAN_LUT[mid] <= ratio) lo = mid;
        else hi = mid - 1;
    }
    int32_t deg = lo * LUT_STEP_DEG_FX;
    if (lo < LUT_OCTANT_LAST) {
        int64_t span = (int64_t)TAN_LUT[lo + 1] - TAN_LUT[lo];
        deg += (int32_t)dsd_div_round64((ratio - TAN_LUT[lo]) * LUT_STEP_DEG_FX, span);
    }
    return deg;
}

int32_t dsd_fx_atan2_deg(int64_t dy, int64_t dx) {
    if (dx == 0 && dy == 0) return 0; // GML's point_direction of a point to itself
    uint64_t ax = mag64(dx);
    uint64_t ay = mag64(dy);
    // Angle inside the first quadrant, [0, 90]. The diagonal is special-cased so multiples of 45 are exact.
    int32_t a;
    if (ax == ay) a = DEG_45_FX;
    else if (ay < ax) a = octant_atan_deg(ay, ax);
    else a = DEG_90_FX - octant_atan_deg(ax, ay);
    // Unfold the quadrant from the signs (y up, counter-clockwise).
    int32_t r;
    if (dx >= 0 && dy >= 0) r = a;
    else if (dx < 0 && dy >= 0) r = DEG_180_FX - a;
    else if (dx < 0) r = DEG_180_FX + a;
    else r = DEG_360_FX - a;
    return r == DEG_360_FX ? 0 : r; // keep the result in [0, 360)
}

int32_t dsd_fx_hypot(int64_t dx, int64_t dy) {
    uint64_t ax = mag64(dx);
    uint64_t ay = mag64(dy);
    // A leg of 2^31 or more makes the distance at least that long, past what Q20.12 holds: saturate. Otherwise
    // both magnitudes are below 2^31, so ax^2 + ay^2 < 2^63 fits u64.
    if (ax > MAG31_MAX || ay > MAG31_MAX) return INT32_MAX;
    // sqrt of a sum of Q.12 squares (Q.24) is Q.12 again.
    uint32_t r = dsd_isqrt64(ax * ax + ay * ay);
    return r > (uint32_t)INT32_MAX ? INT32_MAX : (int32_t)r;
}
