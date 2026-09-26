// number.c: DSS number semantics on value cells (contracts/language.md section 4). The kernels (division model,
// Q20.12 multiply, rounding) live in fixed.c; this file only decides representations and statuses.
#include "number.h"

// ---- Helpers -------------------------------------------------------------------------------------------------

// Q.12 value of a number cell in 64 bits: ints are scaled (exact for every int32), REALs are taken as they are.
static int64_t q12_of(DsdValue v) { return v.tag == DSD_TAG_INT ? (int64_t)v.payload * DSD_FX_ONE : v.payload; }

// True when both cells are numbers (INT or REAL); arithmetic accepts nothing else.
static bool both_numbers(DsdValue a, DsdValue b) { return dsd_is_number(a) && dsd_is_number(b); }

// Wraps a 64-bit Q.12 result into a REAL cell and reports whether it fitted Q20.12.
static int32_t real_result(int64_t q, DsdValue *out) {
    *out = dsd_real(dsd_lo32(q));
    return dsd_fits32(q) ? DSD_NUM_OK : DSD_NUM_OVERFLOW;
}

// Wraps a 64-bit integer result into an INT cell and reports whether it fitted int32.
static int32_t int_result(int64_t v, DsdValue *out) {
    *out = dsd_int(dsd_lo32(v));
    return dsd_fits32(v) ? DSD_NUM_OK : DSD_NUM_OVERFLOW;
}

// The DIV_ZERO outcome: a defined int 0 so no caller reads an uninitialised cell.
static int32_t div_zero(DsdValue *out) {
    *out = dsd_int(0);
    return DSD_NUM_DIV_ZERO;
}

// Signature shared by the three checked int32 operations of value.h.
typedef bool (*IntOvfFn)(int32_t a, int32_t b, int32_t *out);

// + and - share one shape: checked int32 when both are ints, else 64-bit Q.12 (the sum of two values below 2^43
// cannot overflow int64).
static int32_t add_or_sub(DsdValue a, DsdValue b, DsdValue *out, IntOvfFn int_op, int32_t sign) {
    if (!both_numbers(a, b)) return DSD_NUM_NOT_NUMBER;
    if (dsd_is_int(a) && dsd_is_int(b)) {
        int32_t r;
        bool ovf = int_op(a.payload, b.payload, &r);
        *out = dsd_int(r);
        return ovf ? DSD_NUM_OVERFLOW : DSD_NUM_OK;
    }
    return real_result(q12_of(a) + sign * q12_of(b), out);
}

// ---- Operators -----------------------------------------------------------------------------------------------

int32_t dsd_num_add(DsdValue a, DsdValue b, DsdValue *out) { return add_or_sub(a, b, out, dsd_add_ovf, 1); }

int32_t dsd_num_sub(DsdValue a, DsdValue b, DsdValue *out) { return add_or_sub(a, b, out, dsd_sub_ovf, -1); }

int32_t dsd_num_mul(DsdValue a, DsdValue b, DsdValue *out) {
    if (!both_numbers(a, b)) return DSD_NUM_NOT_NUMBER;
    if (dsd_is_int(a) && dsd_is_int(b)) {
        int32_t r;
        bool ovf = dsd_mul_ovf(a.payload, b.payload, &r);
        *out = dsd_int(r);
        return ovf ? DSD_NUM_OVERFLOW : DSD_NUM_OK;
    }
    if (dsd_is_real(a) && dsd_is_real(b)) {
        int32_t r;
        int32_t st = dsd_fx_mul(a.payload, b.payload, &r);
        *out = dsd_real(r);
        return st;
    }
    // int x fixed: the int is not scaled, so the product is already Q.12 and exact (|product| < 2^62).
    return real_result((int64_t)a.payload * b.payload, out);
}

int32_t dsd_num_div(DsdValue a, DsdValue b, DsdValue *out) {
    if (!both_numbers(a, b)) return DSD_NUM_NOT_NUMBER;
    if (b.payload == 0) return div_zero(out); // int 0 and REAL 0.0 both have payload 0
    int64_t q;
    int64_t r;
    if (dsd_is_int(a) && dsd_is_int(b)) {
        // Exact int division stays int. INT_MIN / -1 divides exactly and wraps to INT_MIN, as the contract says.
        dsd_div64(a.payload, b.payload, &q, &r);
        if (r == 0) {
            *out = dsd_int(dsd_lo32(q));
            return DSD_NUM_OK;
        }
    }
    // Q.12 quotient: dividing by an int keeps the numerator's Q.12 scale; dividing by a REAL needs one more 2^12 on
    // the numerator. |numerator| < 2^55 either way.
    if (dsd_is_int(b)) dsd_div64(q12_of(a), b.payload, &q, 0);
    else dsd_div64(q12_of(a) * DSD_FX_ONE, b.payload, &q, 0);
    if (dsd_fits32(q)) {
        *out = dsd_real((int32_t)q);
        return DSD_NUM_OK;
    }
    // Outside Q20.12: the truncated int quotient. Truncating the truncated Q.12 quotient again gives trunc(a / b).
    int64_t whole;
    dsd_div64(q, DSD_FX_ONE, &whole, 0);
    return int_result(whole, out);
}

// An operand of `div`: ints as they are, REALs floored to an int first.
static int32_t floored_int(DsdValue v) { return dsd_is_int(v) ? v.payload : dsd_fx_floor(v.payload); }

int32_t dsd_num_idiv(DsdValue a, DsdValue b, DsdValue *out) {
    if (!both_numbers(a, b)) return DSD_NUM_NOT_NUMBER;
    int32_t ia = floored_int(a);
    int32_t ib = floored_int(b);
    if (ib == 0) return div_zero(out);
    int64_t q;
    dsd_div64(ia, ib, &q, 0);
    *out = dsd_int(dsd_lo32(q)); // only INT_MIN div -1 exceeds int32, and it wraps by contract
    return DSD_NUM_OK;
}

int32_t dsd_num_mod(DsdValue a, DsdValue b, DsdValue *out) {
    if (!both_numbers(a, b)) return DSD_NUM_NOT_NUMBER;
    if (b.payload == 0) return div_zero(out);
    int64_t r;
    if (dsd_is_int(a) && dsd_is_int(b)) {
        dsd_div64(a.payload, b.payload, 0, &r);
        *out = dsd_int((int32_t)r); // |r| < |b| fits int32
        return DSD_NUM_OK;
    }
    // Both at Q.12: the remainder of the scaled values is the scaled remainder, with the dividend's sign.
    // |r| < min(|a|, |b|) in Q.12, and at least one of them is a REAL, so it fits.
    dsd_div64(q12_of(a), q12_of(b), 0, &r);
    *out = dsd_real((int32_t)r);
    return DSD_NUM_OK;
}

int32_t dsd_num_neg(DsdValue a, DsdValue *out) {
    if (!dsd_is_number(a)) return DSD_NUM_NOT_NUMBER;
    int32_t r;
    bool ovf = dsd_sub_ovf(0, a.payload, &r); // only -INT_MIN (or -(-524288.0)) overflows
    *out = (DsdValue){a.tag, r};
    return ovf ? DSD_NUM_OVERFLOW : DSD_NUM_OK;
}

// ---- Comparison ----------------------------------------------------------------------------------------------

bool dsd_num_view_q12(DsdValue v, int64_t *q12) {
    switch (v.tag) {
    case DSD_TAG_INT:
    case DSD_TAG_BOOL:
    case DSD_TAG_INST:
        *q12 = (int64_t)v.payload * DSD_FX_ONE;
        return true;
    case DSD_TAG_ASSET:
        *q12 = (int64_t)((uint32_t)v.payload & DSD_ASSET_INDEX_MASK) * DSD_FX_ONE;
        return true;
    case DSD_TAG_REAL:
        *q12 = v.payload;
        return true;
    default:
        return false;
    }
}

int32_t dsd_num_cmp(DsdValue a, DsdValue b, int32_t *order) {
    int64_t qa;
    int64_t qb;
    if (!dsd_num_view_q12(a, &qa) || !dsd_num_view_q12(b, &qb)) return DSD_NUM_NOT_NUMBER;
    *order = qa < qb ? -1 : (qa > qb ? 1 : 0);
    return DSD_NUM_OK;
}

// ---- Rounding to int -----------------------------------------------------------------------------------------

// Signature shared by fixed.c's Q20.12 -> int32 rounding kernels.
typedef int32_t (*FxRoundFn)(int32_t q);

// Ints pass through; REALs go through the given kernel (the whole part of a Q20.12 value always fits int32).
static int32_t round_with(DsdValue a, int32_t *out, FxRoundFn fn) {
    if (!dsd_is_number(a)) return DSD_NUM_NOT_NUMBER;
    *out = dsd_is_int(a) ? a.payload : fn(a.payload);
    return DSD_NUM_OK;
}

int32_t dsd_num_floor(DsdValue a, int32_t *out) { return round_with(a, out, dsd_fx_floor); }
int32_t dsd_num_ceil(DsdValue a, int32_t *out) { return round_with(a, out, dsd_fx_ceil); }
int32_t dsd_num_round(DsdValue a, int32_t *out) { return round_with(a, out, dsd_fx_round); }
