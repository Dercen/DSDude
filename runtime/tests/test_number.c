// test_number.c: DSS number semantics on cells (contracts/language.md section 4): promotion, `/`, `div`, `mod`,
// overflow statuses, comparison and rounding.
#include "number.h"
#include "test.h"

// Q20.12 helpers for readable literals.
#define FX(n) ((int32_t)((n) * DSD_FX_ONE))
#define I(n) dsd_int(n)
#define R(n) dsd_real(FX(n))

// Runs a binary operator and checks status, tag and payload in one line.
typedef int32_t (*BinOp)(DsdValue a, DsdValue b, DsdValue *out);
static void expect(BinOp op, DsdValue a, DsdValue b, int32_t want_st, uint32_t want_tag, int32_t want_payload,
                   int line) {
    DsdValue out = dsd_undef();
    int32_t st = op(a, b, &out);
    dsd_test_check_i64(st, want_st, __FILE__, line, "status");
    dsd_test_check_i64(out.tag, want_tag, __FILE__, line, "tag");
    dsd_test_check_i64(out.payload, want_payload, __FILE__, line, "payload");
}
#define EXPECT(op, a, b, st, tag, payload) expect(op, a, b, st, tag, payload, __LINE__)

static void test_add_sub_mul(void) {
    EXPECT(dsd_num_add, I(2), I(3), DSD_NUM_OK, DSD_TAG_INT, 5);
    EXPECT(dsd_num_add, I(1), R(0.5), DSD_NUM_OK, DSD_TAG_REAL, FX(1.5));
    // A fixed result stays fixed even when whole.
    EXPECT(dsd_num_add, R(0.5), R(0.5), DSD_NUM_OK, DSD_TAG_REAL, FX(1));
    // int32 overflow: flagged, and the release result wraps.
    EXPECT(dsd_num_add, I(INT32_MAX), I(1), DSD_NUM_OVERFLOW, DSD_TAG_INT, INT32_MIN);
    EXPECT(dsd_num_sub, I(INT32_MIN), I(1), DSD_NUM_OVERFLOW, DSD_TAG_INT, INT32_MAX);
    // Mixed arithmetic outside Q20.12: 524287 + 1.0 = 524288.
    EXPECT(dsd_num_add, I(524287), R(1), DSD_NUM_OVERFLOW, DSD_TAG_REAL, INT32_MIN);
    EXPECT(dsd_num_sub, R(0.25), I(1), DSD_NUM_OK, DSD_TAG_REAL, FX(-0.75));
    EXPECT(dsd_num_mul, I(6), I(7), DSD_NUM_OK, DSD_TAG_INT, 42);
    EXPECT(dsd_num_mul, I(65536), I(65536), DSD_NUM_OVERFLOW, DSD_TAG_INT, 0);
    EXPECT(dsd_num_mul, I(3), R(0.5), DSD_NUM_OK, DSD_TAG_REAL, FX(1.5));
    EXPECT(dsd_num_mul, R(0.5), R(-0.5), DSD_NUM_OK, DSD_TAG_REAL, FX(-0.25));
    EXPECT(dsd_num_mul, I(300000), R(2), DSD_NUM_OVERFLOW, DSD_TAG_REAL, dsd_lo32((int64_t)600000 * DSD_FX_ONE));
    // Non-numbers.
    DsdValue out;
    CHECK_EQ(dsd_num_add(dsd_bool(true), I(1), &out), DSD_NUM_NOT_NUMBER);
    CHECK_EQ(dsd_num_mul(I(1), dsd_undef(), &out), DSD_NUM_NOT_NUMBER);
}

static void test_divide(void) {
    // `/`: exact int division stays int.
    EXPECT(dsd_num_div, I(6), I(3), DSD_NUM_OK, DSD_TAG_INT, 2);
    EXPECT(dsd_num_div, I(-6), I(3), DSD_NUM_OK, DSD_TAG_INT, -2);
    EXPECT(dsd_num_div, I(INT32_MIN), I(-1), DSD_NUM_OK, DSD_TAG_INT, INT32_MIN); // wraps by contract
    // Otherwise the exact quotient truncated toward zero to 1/4096.
    EXPECT(dsd_num_div, I(7), I(2), DSD_NUM_OK, DSD_TAG_REAL, FX(3.5));
    EXPECT(dsd_num_div, I(1), I(3), DSD_NUM_OK, DSD_TAG_REAL, 1365);
    EXPECT(dsd_num_div, I(-1), I(3), DSD_NUM_OK, DSD_TAG_REAL, -1365);
    EXPECT(dsd_num_div, R(1), I(4), DSD_NUM_OK, DSD_TAG_REAL, FX(0.25));
    EXPECT(dsd_num_div, R(3), R(1.5), DSD_NUM_OK, DSD_TAG_REAL, FX(2));
    EXPECT(dsd_num_div, I(1), R(0.25), DSD_NUM_OK, DSD_TAG_REAL, FX(4));
    // Beyond Q20.12 the truncated int quotient: 400000 / 0.5 = 800000; 1000001 / 2 = 500000.5 -> fits, stays fixed;
    // 2000001 / 2 = 1000000.5 -> int 1000000.
    EXPECT(dsd_num_div, I(400000), R(0.5), DSD_NUM_OK, DSD_TAG_INT, 800000);
    EXPECT(dsd_num_div, I(1000001), I(2), DSD_NUM_OK, DSD_TAG_REAL, FX(500000.5));
    EXPECT(dsd_num_div, I(2000001), I(2), DSD_NUM_OK, DSD_TAG_INT, 1000000);
    EXPECT(dsd_num_div, I(-2000001), I(2), DSD_NUM_OK, DSD_TAG_INT, -1000000);
    // Beyond int32 even as an int: INT_MIN / (1/4096) = -2^43 wraps and is flagged.
    EXPECT(dsd_num_div, I(INT32_MIN), dsd_real(1), DSD_NUM_OVERFLOW, DSD_TAG_INT, 0);
    // Division by zero, int or fixed.
    EXPECT(dsd_num_div, I(1), I(0), DSD_NUM_DIV_ZERO, DSD_TAG_INT, 0);
    EXPECT(dsd_num_div, R(1.5), R(0), DSD_NUM_DIV_ZERO, DSD_TAG_INT, 0);
}

static void test_idiv_mod(void) {
    // `div` truncates toward zero; fixed operands are floored first.
    EXPECT(dsd_num_idiv, I(7), I(2), DSD_NUM_OK, DSD_TAG_INT, 3);
    EXPECT(dsd_num_idiv, I(-7), I(2), DSD_NUM_OK, DSD_TAG_INT, -3);
    EXPECT(dsd_num_idiv, R(7.9), I(2), DSD_NUM_OK, DSD_TAG_INT, 3);
    EXPECT(dsd_num_idiv, R(-7.5), I(2), DSD_NUM_OK, DSD_TAG_INT, -4); // floor(-7.5) = -8
    EXPECT(dsd_num_idiv, I(INT32_MIN), I(-1), DSD_NUM_OK, DSD_TAG_INT, INT32_MIN);
    EXPECT(dsd_num_idiv, I(5), R(0.5), DSD_NUM_DIV_ZERO, DSD_TAG_INT, 0); // 0.5 floors to 0
    // `mod`: a - b * trunc(a / b), the dividend's sign, fractions allowed.
    EXPECT(dsd_num_mod, I(7), I(3), DSD_NUM_OK, DSD_TAG_INT, 1);
    EXPECT(dsd_num_mod, I(-7), I(3), DSD_NUM_OK, DSD_TAG_INT, -1);
    EXPECT(dsd_num_mod, I(7), I(-3), DSD_NUM_OK, DSD_TAG_INT, 1);
    EXPECT(dsd_num_mod, I(INT32_MIN), I(-1), DSD_NUM_OK, DSD_TAG_INT, 0);
    EXPECT(dsd_num_mod, R(5.5), I(2), DSD_NUM_OK, DSD_TAG_REAL, FX(1.5));
    EXPECT(dsd_num_mod, R(-5.5), I(2), DSD_NUM_OK, DSD_TAG_REAL, FX(-1.5));
    EXPECT(dsd_num_mod, I(7), R(2.5), DSD_NUM_OK, DSD_TAG_REAL, FX(2));
    EXPECT(dsd_num_mod, I(INT32_MAX), R(0.75), DSD_NUM_OK, DSD_TAG_REAL, FX(0.25)); // 2147483647 = 0.75*2863311529 + 0.25
    EXPECT(dsd_num_mod, I(1), I(0), DSD_NUM_DIV_ZERO, DSD_TAG_INT, 0);
    EXPECT(dsd_num_mod, R(1), R(0), DSD_NUM_DIV_ZERO, DSD_TAG_INT, 0);
}

static void test_neg_cmp_round(void) {
    DsdValue out;
    CHECK_EQ(dsd_num_neg(I(5), &out), DSD_NUM_OK);
    CHECK(out.tag == DSD_TAG_INT && out.payload == -5);
    CHECK_EQ(dsd_num_neg(R(0.5), &out), DSD_NUM_OK);
    CHECK(out.tag == DSD_TAG_REAL && out.payload == FX(-0.5));
    CHECK_EQ(dsd_num_neg(I(INT32_MIN), &out), DSD_NUM_OVERFLOW);
    CHECK_EQ(out.payload, INT32_MIN);
    CHECK_EQ(dsd_num_neg(dsd_bool(false), &out), DSD_NUM_NOT_NUMBER);

    int32_t ord;
    CHECK_EQ(dsd_num_cmp(I(1), R(1), &ord), DSD_NUM_OK); // 0.5 + 0.5 == 1 holds
    CHECK_EQ(ord, 0);
    CHECK_EQ(dsd_num_cmp(I(1), dsd_real(FX(1) - 1), &ord), DSD_NUM_OK);
    CHECK_EQ(ord, 1);
    CHECK_EQ(dsd_num_cmp(I(INT32_MAX), R(0.5), &ord), DSD_NUM_OK); // exact in 64 bits, no wrap
    CHECK_EQ(ord, 1);
    CHECK_EQ(dsd_num_cmp(I(INT32_MIN), R(-524288), &ord), DSD_NUM_OK);
    CHECK_EQ(ord, -1);
    CHECK_EQ(dsd_num_cmp(dsd_bool(true), I(1), &ord), DSD_NUM_OK); // true is 1
    CHECK_EQ(ord, 0);
    CHECK_EQ(dsd_num_cmp(dsd_asset(DSD_ASSET_OBJECT, 3), I(3), &ord), DSD_NUM_OK); // asset ids by index
    CHECK_EQ(ord, 0);
    CHECK_EQ(dsd_num_cmp(dsd_undef(), I(0), &ord), DSD_NUM_NOT_NUMBER);

    int32_t n;
    CHECK_EQ(dsd_num_floor(R(-2.5), &n), DSD_NUM_OK);
    CHECK_EQ(n, -3);
    CHECK_EQ(dsd_num_ceil(R(-2.5), &n), DSD_NUM_OK);
    CHECK_EQ(n, -2);
    CHECK_EQ(dsd_num_round(R(-2.5), &n), DSD_NUM_OK);
    CHECK_EQ(n, -3);
    CHECK_EQ(dsd_num_round(I(7), &n), DSD_NUM_OK);
    CHECK_EQ(n, 7);
    CHECK_EQ(dsd_num_round(dsd_undef(), &n), DSD_NUM_NOT_NUMBER);
}

void suite_number(void) {
    test_add_sub_mul();
    test_divide();
    test_idiv_mod();
    test_neg_cmp_round();
}
