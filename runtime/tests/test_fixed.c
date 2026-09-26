// test_fixed.c: fixed.c kernels. The division tests compare the core's one division path with an independent
// shift-and-subtract reference divider (the DS divider's DIV_64_32 model: truncate toward zero, low 32 bits) over
// the named corners and a seeded random sweep.
#include "fixed.h"
#include "test.h"

// Random pairs checked by the division sweep.
#define DIV_SWEEP_COUNT 20000
// Random values checked by the isqrt sweep.
#define SQRT_SWEEP_COUNT 5000
// Q20.12 helpers for readable literals.
#define FX(n) ((int32_t)((n) * DSD_FX_ONE))

// Reference: restoring binary long division on the magnitudes, signs applied afterwards. Shares no code with
// fixed.c. den must be non-zero.
static void ref_divmod(int64_t num, int64_t den, int64_t *q, int64_t *r) {
    uint64_t un = num < 0 ? 0u - (uint64_t)num : (uint64_t)num;
    uint64_t ud = den < 0 ? 0u - (uint64_t)den : (uint64_t)den;
    uint64_t quo = 0;
    uint64_t rem = 0;
    for (int bit = 63; bit >= 0; bit--) {
        rem = (rem << 1) | ((un >> bit) & 1u);
        if (rem >= ud) {
            rem -= ud;
            quo |= (uint64_t)1 << bit;
        }
    }
    *q = (int64_t)(((num < 0) != (den < 0)) ? 0u - quo : quo);
    *r = (int64_t)(num < 0 ? 0u - rem : rem);
}

// A random 64-bit numerator whose magnitude spans 1..63 bits, so small, 32-bit and over-32-bit quotients all occur.
static int64_t rand_num64(void) {
    uint64_t v = ((uint64_t)dsd_test_rand() << 32) | dsd_test_rand();
    v >>= dsd_test_rand() % 64;
    return (dsd_test_rand() & 1u) ? -(int64_t)(v >> 1) : (int64_t)(v >> 1);
}

// A random non-zero 32-bit denominator with a random bit length.
static int32_t rand_den32(void) {
    int32_t d = (int32_t)(dsd_test_rand() >> (dsd_test_rand() % 32));
    return d != 0 ? d : 1;
}

static void test_division_corners(void) {
    int32_t st;
    int64_t q;
    int64_t r;
    // Division by zero: flagged, defined zero outputs.
    CHECK_EQ(dsd_div64_32(12345, 0, &st), 0);
    CHECK_EQ(st, DSD_NUM_DIV_ZERO);
    CHECK_EQ(dsd_div64(-7, 0, &q, &r), DSD_NUM_DIV_ZERO);
    CHECK_EQ(q, 0);
    CHECK_EQ(r, 0);
    // INT_MIN / -1 wraps to INT_MIN (the quotient 2^31 has low 32 bits 0x80000000).
    CHECK_EQ(dsd_div64_32(INT32_MIN, -1, &st), INT32_MIN);
    CHECK_EQ(st, DSD_NUM_OK);
    // INT64_MIN / -1 wraps too, with remainder 0, and is not undefined behaviour (the UBSan build proves it).
    CHECK_EQ(dsd_div64(INT64_MIN, -1, &q, &r), DSD_NUM_OK);
    CHECK_EQ(q, INT64_MIN);
    CHECK_EQ(r, 0);
    CHECK_EQ(dsd_div64_32(INT64_MIN, -1, 0), 0);
    // Negatives truncate toward zero; the remainder takes the dividend's sign.
    CHECK_EQ(dsd_div64(-7, 2, &q, &r), DSD_NUM_OK);
    CHECK_EQ(q, -3);
    CHECK_EQ(r, -1);
    CHECK_EQ(dsd_div64(7, -2, &q, &r), DSD_NUM_OK);
    CHECK_EQ(q, -3);
    CHECK_EQ(r, 1);
    CHECK_EQ(dsd_div64(-7, -2, &q, &r), DSD_NUM_OK);
    CHECK_EQ(q, 3);
    CHECK_EQ(r, -1);
    // A quotient over 32 bits: DIV_64_32 returns its low 32 bits. 2^40 / 3 = 366503875925 = 0x5555555555.
    CHECK_EQ(dsd_div64_32((int64_t)1 << 40, 3, 0), (int32_t)0x55555555);
    CHECK_EQ(dsd_div64_32(-((int64_t)1 << 40), 3, 0), dsd_lo32(-(int64_t)366503875925));
    // Rounded division, half away from zero.
    CHECK_EQ(dsd_div_round64(5, 2), 3);
    CHECK_EQ(dsd_div_round64(-5, 2), -3);
    CHECK_EQ(dsd_div_round64(5, -2), -3);
    CHECK_EQ(dsd_div_round64(4, 3), 1);
    CHECK_EQ(dsd_div_round64(-4, 3), -1);
    CHECK_EQ(dsd_div_round64(INT64_MAX, INT64_MAX), 1);
}

static void test_division_sweep(void) {
    for (int32_t i = 0; i < DIV_SWEEP_COUNT; i++) {
        int64_t num = rand_num64();
        int32_t den = rand_den32();
        if (dsd_test_rand() & 1u) den = -den;
        int64_t want_q;
        int64_t want_r;
        ref_divmod(num, den, &want_q, &want_r);
        int64_t q;
        int64_t r;
        int32_t st;
        if (!CHECK_EQ(dsd_div64(num, den, &q, &r), DSD_NUM_OK)) break;
        if (!CHECK_EQ(q, want_q) || !CHECK_EQ(r, want_r)) break;
        if (!CHECK_EQ(dsd_div64_32(num, den, &st), dsd_lo32(want_q))) break;
    }
}

static void test_fx_mul_div(void) {
    int32_t out;
    CHECK_EQ(dsd_fx_mul(FX(0.5), FX(0.5), &out), DSD_NUM_OK);
    CHECK_EQ(out, FX(0.25));
    CHECK_EQ(dsd_fx_mul(FX(-1.5), FX(2), &out), DSD_NUM_OK);
    CHECK_EQ(out, FX(-3));
    // Truncation toward zero, not floor: -0.5 * (1/4096) is -1/8192, which truncates to 0.
    CHECK_EQ(dsd_fx_mul(FX(-0.5), 1, &out), DSD_NUM_OK);
    CHECK_EQ(out, 0);
    CHECK_EQ(dsd_fx_mul(3, 3, &out), DSD_NUM_OK); // (3/4096)^2 = 9/2^24 -> 0
    CHECK_EQ(out, 0);
    // Out of Q20.12: 1000 * 1000 = 1e6 >= 524288.
    CHECK_EQ(dsd_fx_mul(FX(1000), FX(1000), &out), DSD_NUM_OVERFLOW);
    CHECK_EQ(out, dsd_lo32((int64_t)1000000 * DSD_FX_ONE));

    CHECK_EQ(dsd_fx_div(FX(1), FX(4), &out), DSD_NUM_OK);
    CHECK_EQ(out, FX(0.25));
    CHECK_EQ(dsd_fx_div(FX(1), FX(3), &out), DSD_NUM_OK);
    CHECK_EQ(out, 1365); // 4096 / 3 = 1365.33, truncated
    CHECK_EQ(dsd_fx_div(FX(-1), FX(3), &out), DSD_NUM_OK);
    CHECK_EQ(out, -1365);
    CHECK_EQ(dsd_fx_div(FX(1), 0, &out), DSD_NUM_DIV_ZERO);
    CHECK_EQ(out, 0);
    CHECK_EQ(dsd_fx_div(FX(400000), FX(0.5), &out), DSD_NUM_OVERFLOW);
}

static void test_rounding(void) {
    // floor / ceil / round (half away from zero) / trunc on Q20.12.
    CHECK_EQ(dsd_fx_floor(FX(2.5)), 2);
    CHECK_EQ(dsd_fx_floor(FX(-2.5)), -3);
    CHECK_EQ(dsd_fx_floor(FX(-2)), -2);
    CHECK_EQ(dsd_fx_ceil(FX(2.5)), 3);
    CHECK_EQ(dsd_fx_ceil(FX(-2.5)), -2);
    CHECK_EQ(dsd_fx_ceil(FX(2)), 2);
    CHECK_EQ(dsd_fx_round(FX(2.5)), 3);
    CHECK_EQ(dsd_fx_round(FX(-2.5)), -3);
    CHECK_EQ(dsd_fx_round(FX(2.5) - 1), 2);
    CHECK_EQ(dsd_fx_round(FX(-2.5) + 1), -2);
    CHECK_EQ(dsd_fx_trunc(FX(-2.75)), -2);
    CHECK_EQ(dsd_fx_trunc(FX(2.75)), 2);
    // Range ends: INT32_MAX is 524287.99976, INT32_MIN is -524288 exactly.
    CHECK_EQ(dsd_fx_floor(INT32_MAX), 524287);
    CHECK_EQ(dsd_fx_ceil(INT32_MAX), 524288);
    CHECK_EQ(dsd_fx_round(INT32_MAX), 524288);
    CHECK_EQ(dsd_fx_floor(INT32_MIN), -524288);
    CHECK_EQ(dsd_fx_ceil(INT32_MIN), -524288);
    CHECK_EQ(dsd_fx_round(INT32_MIN), -524288);
}

static void test_sqrt(void) {
    CHECK_EQ(dsd_isqrt64(0), 0);
    CHECK_EQ(dsd_isqrt64(1), 1);
    CHECK_EQ(dsd_isqrt64(15), 3);
    CHECK_EQ(dsd_isqrt64(16), 4);
    CHECK_EQ(dsd_isqrt64(UINT64_MAX), 0xFFFFFFFFu);
    for (int32_t i = 0; i < SQRT_SWEEP_COUNT; i++) {
        uint64_t n = (((uint64_t)dsd_test_rand() << 32) | dsd_test_rand()) >> (dsd_test_rand() % 64);
        uint64_t r = dsd_isqrt64(n);
        // floor(sqrt(n)): r^2 <= n < (r + 1)^2, written so (r + 1)^2 cannot overflow.
        if (!CHECK(r * r <= n && (r + 1) > n / (r + 1))) break;
    }
    // sqrtf32 model: floor(isqrt((u64)a << 12)).
    CHECK_EQ(dsd_sqrtf32(FX(4)), FX(2));
    CHECK_EQ(dsd_sqrtf32(FX(2)), 5792); // 1.41406
    CHECK_EQ(dsd_sqrtf32(FX(0.25)), FX(0.5));
    CHECK_EQ(dsd_sqrtf32(0xFFFFFFFFu), 4194303); // floor(sqrt(2^44 - 2^12)): just below 2^22
    // hypot: 3-4-5 exactly, saturation beyond Q20.12.
    CHECK_EQ(dsd_fx_hypot(FX(3), FX(-4)), FX(5));
    CHECK_EQ(dsd_fx_hypot(0, 0), 0);
    CHECK_EQ(dsd_fx_hypot((int64_t)1 << 40, 0), INT32_MAX);
}

void suite_fixed(void) {
    test_division_corners();
    test_division_sweep();
    test_fx_mul_div();
    test_rounding();
    test_sqrt();
}
