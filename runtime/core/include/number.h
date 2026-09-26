// number.h: DSS number semantics on value cells: int32/Q20.12 promotion for + - * / div mod, negation, comparison
// and rounding (contracts/language.md section 4; PLAN.md 2.8).
//
// Every operation returns a DSD_NUM_* status (fixed.h) and writes its result cell to *out:
//   - DSD_NUM_OK: exact (or the contract's defined wrap, e.g. INT_MIN / -1);
//   - DSD_NUM_OVERFLOW: int32 overflow in + - *, or a mixed result outside Q20.12; *out holds the wrapped release
//     result, and debug builds raise R52x instead of using it;
//   - DSD_NUM_DIV_ZERO: / div mod by zero; *out is int 0 and the VM always raises R5xx;
//   - DSD_NUM_NOT_NUMBER: an operand is not INT or REAL; *out is undefined and the VM raises R5xx.
#ifndef DSD_NUMBER_H
#define DSD_NUMBER_H

#include <stdbool.h>
#include <stdint.h>

#include "fixed.h"
#include "value.h"

// Arithmetic operators. int op int stays int for + - * div; anything with a fraction becomes REAL (and stays REAL
// even when whole).
int32_t dsd_num_add(DsdValue a, DsdValue b, DsdValue *out);
int32_t dsd_num_sub(DsdValue a, DsdValue b, DsdValue *out);
int32_t dsd_num_mul(DsdValue a, DsdValue b, DsdValue *out);
// `/`: an int when both are ints that divide exactly; otherwise the exact quotient truncated toward zero to 1/4096,
// or, when that does not fit Q20.12, the truncated int quotient.
int32_t dsd_num_div(DsdValue a, DsdValue b, DsdValue *out);
// `div`: integer division truncating toward zero; a REAL operand is floored to an int first.
int32_t dsd_num_idiv(DsdValue a, DsdValue b, DsdValue *out);
// `mod` / `%`: a - b * trunc(a / b); the remainder takes the dividend's sign; fractions allowed.
int32_t dsd_num_mod(DsdValue a, DsdValue b, DsdValue *out);
// Unary minus.
int32_t dsd_num_neg(DsdValue a, DsdValue *out);

// Numeric view used by comparisons: INT, BOOL and INST compare as their int payload, ASSET as its index, REAL as its
// Q20.12 value. Writes the value scaled to Q.12 in 64 bits (exact for every int32) and returns false for anything
// else (strings, arrays, undefined).
bool dsd_num_view_q12(DsdValue v, int64_t *q12);

// Ordering of two numeric views: *order = -1, 0 or 1. Int-vs-fixed compares exactly ((int64)a << 12 against b).
int32_t dsd_num_cmp(DsdValue a, DsdValue b, int32_t *order);

// floor/ceil/round (half away from zero) of a number, as an int32 (DSS returns ints from all three).
int32_t dsd_num_floor(DsdValue a, int32_t *out);
int32_t dsd_num_ceil(DsdValue a, int32_t *out);
int32_t dsd_num_round(DsdValue a, int32_t *out);

#endif // DSD_NUMBER_H
