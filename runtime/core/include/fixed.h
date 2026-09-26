// fixed.h: integer and Q20.12 fixed-point kernels (PLAN.md 2.4 and 2.8; contracts/language.md section 4).
//
// Everything here is pure integer C11 and gives bit-identical results on the host (x86-64 gcc) and the DS (ARM gcc):
// no floats, no libc division helpers with implementation-defined corners, fixed-width types only.
#ifndef DSD_FIXED_H
#define DSD_FIXED_H

#include <stdbool.h>
#include <stdint.h>

// ---- Q20.12 format -------------------------------------------------------------------------------------------
#define DSD_FX_SHIFT 12                      // fractional bits of Q20.12 (libnds f32)
#define DSD_FX_ONE (1 << DSD_FX_SHIFT)       // 1.0 in Q20.12 = 4096
#define DSD_FX_HALF (DSD_FX_ONE / 2)         // 0.5 in Q20.12, the rounding midpoint
#define DSD_FX_FRAC_MASK (DSD_FX_ONE - 1)    // low 12 bits: the fractional part of a non-negative value
#define DSD_FX_INT_LIMIT 524288              // Q20.12 holds (-524288, 524288): |whole part| < 2^19

// ---- Angles --------------------------------------------------------------------------------------------------
#define DSD_DEG_FULL 360                     // degrees in a circle
#define DSD_DEG_FULL_FX (DSD_DEG_FULL * DSD_FX_ONE) // 360 degrees in Q20.12
#define DSD_BRAD_FULL 32768                  // libnds binary angle units in a circle (DEGREES_IN_CIRCLE)
#define DSD_BRAD_MASK (DSD_BRAD_FULL - 1)    // reduces a binary angle to one turn
// Q20.12 degrees per binary angle unit: 360 * 4096 / 32768 = 45 exactly, so deg_fx = brad * 45.
#define DSD_DEG_FX_PER_BRAD ((DSD_DEG_FULL * DSD_FX_ONE) / DSD_BRAD_FULL)

// ---- Status codes shared by the number layer -----------------------------------------------------------------
// The VM maps them to R5xx errors (runtime/core/diagnostics/catalog.json); overflow is an error only in debug
// builds, release builds keep the wrapped result the kernel returned alongside the status.
#define DSD_NUM_OK 0          // exact result
#define DSD_NUM_OVERFLOW 1    // result did not fit int32 / Q20.12; the output holds the wrapped low 32 bits (R52x)
#define DSD_NUM_DIV_ZERO 2    // division or modulo by zero; the output is 0 (R5xx, always an error)
#define DSD_NUM_SQRT_NEG 3    // square root of a negative number; the output is 0 (R5xx, always an error)
#define DSD_NUM_NOT_NUMBER 4  // an operand is not a number (R5xx); set by number.c, never by these kernels

// ---- Division: the one path every core division takes -------------------------------------------------------
// Signed 64-bit division truncating toward zero, remainder with the dividend's sign (C99 semantics). It tests
// den == 0 first (DSD_NUM_DIV_ZERO, *quot = *rem = 0) and INT64_MIN / -1 second (the quotient wraps to INT64_MIN,
// the remainder is 0), so no input is undefined behaviour. quot or rem may be NULL.
int32_t dsd_div64(int64_t num, int64_t den, int64_t *quot, int64_t *rem);

// The DS divider's DIV_64_32 mode: 64-bit numerator, 32-bit denominator, quotient truncated toward zero, and the
// low 32 bits returned (quotients over 32 bits wrap). den == 0 returns 0 with DSD_NUM_DIV_ZERO in *status.
// INT_MIN / -1 wraps to INT_MIN. status may be NULL.
int32_t dsd_div64_32(int64_t num, int32_t den, int32_t *status);

// 64-bit division rounded half away from zero (used for unit conversions, never for language `/`). den != 0.
int64_t dsd_div_round64(int64_t num, int64_t den);

// Low 32 bits of a 64-bit value as int32 (the release-build wrap). GCC defines the conversion as modulo 2^32.
static inline int32_t dsd_lo32(int64_t v) { return (int32_t)(uint32_t)(uint64_t)v; }
// True when v fits int32 (equivalently: when v, read as Q20.12, is inside the Q20.12 range).
static inline bool dsd_fits32(int64_t v) { return v >= INT32_MIN && v <= INT32_MAX; }

// ---- Q20.12 arithmetic ---------------------------------------------------------------------------------------
// Each returns a DSD_NUM_* status and writes the (wrapped on overflow) result to *out.
int32_t dsd_fx_mul(int32_t a, int32_t b, int32_t *out); // 64-bit product, truncated toward zero to 1/4096
int32_t dsd_fx_div(int32_t a, int32_t b, int32_t *out); // exact quotient truncated toward zero to 1/4096

// Rounding a Q20.12 value to an int32 (the whole part always fits: |q| / 4096 < 2^19).
int32_t dsd_fx_floor(int32_t q);
int32_t dsd_fx_ceil(int32_t q);
int32_t dsd_fx_round(int32_t q); // half away from zero
int32_t dsd_fx_trunc(int32_t q); // toward zero

// ---- Square roots --------------------------------------------------------------------------------------------
uint32_t dsd_isqrt64(uint64_t n);  // floor(sqrt(n)), bit-by-bit, no floats
uint32_t dsd_sqrtf32(uint32_t a);  // libnds sqrtf32 model: floor(isqrt((u64)a << 12)); a is unsigned Q20.12

// ---- Trigonometry (vendored libnds LUTs, runtime/core/src/vendor/trig.c) -------------------------------------
// Degrees (Q20.12, any value: 64-bit so int degrees convert without overflow) to a libnds binary angle in
// [0, 32768), rounded half away from zero to the nearest unit.
int32_t dsd_deg_to_brad(int64_t deg_fx);
// dsin/dcos: degrees in Q20.12 (64-bit) to a Q20.12 result in [-4096, 4096]. Exact at multiples of 90.
int32_t dsd_fx_dsin(int64_t deg_fx);
int32_t dsd_fx_dcos(int64_t deg_fx);

// Octant-LUT atan2 in degrees: the direction from the origin to (dx, dy) in a y-up frame, as Q20.12 in
// [0, 360 * 4096). Exact at multiples of 45. (0, 0) gives 0. Inputs are 64-bit so callers can pass differences
// of Q20.12 coordinates without overflow. point_direction passes (x2 - x1, y1 - y2) because DSS's y points down.
int32_t dsd_fx_atan2_deg(int64_t dy, int64_t dx);

// sqrt(dx^2 + dy^2) for 64-bit Q20.12 differences, as Q20.12 (floor). Saturates at INT32_MAX (a leg of 2^31 or
// more already exceeds the Q20.12 range).
int32_t dsd_fx_hypot(int64_t dx, int64_t dy);

#endif // DSD_FIXED_H
