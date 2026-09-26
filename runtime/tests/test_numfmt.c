// test_numfmt.c: string(n) formatting (contracts/language.md section 4 "Printing"), including every example the
// contract lists.
#include "numfmt.h"
#include "fixed.h"
#include "test.h"

// Formats a Q20.12 payload and compares with want.
static void fx_is(int32_t q12, const char *want, int line) {
    char buf[DSD_NUMFMT_BUF];
    dsd_fmt_fixed(q12, buf);
    dsd_test_check_str(buf, want, __FILE__, line, want);
}
#define FX_IS(q, want) fx_is((q), (want), __LINE__)

// Formats an int and compares with want.
static void int_is(int32_t v, const char *want, int line) {
    char buf[DSD_NUMFMT_BUF];
    dsd_fmt_int(v, buf);
    dsd_test_check_str(buf, want, __FILE__, line, want);
}
#define INT_IS(v, want) int_is((v), (want), __LINE__)

void suite_numfmt(void) {
    INT_IS(0, "0");
    INT_IS(42, "42");
    INT_IS(-7, "-7");
    INT_IS(INT32_MAX, "2147483647");
    INT_IS(INT32_MIN, "-2147483648");

    // The contract's examples.
    FX_IS(10240, "2.5");  // 2.5
    FX_IS(410, "0.1");    // 410/4096 = 0.10009...
    FX_IS(512, "0.13");   // 0.125 rounds half away from zero
    FX_IS(2731, "0.67");  // 2/3 as 2731/4096
    FX_IS(12288, "3");    // 3.0 drops the point
    FX_IS(-4, "0");       // -0.001 never prints -0
    FX_IS(1365, "0.33");  // 1/3
    FX_IS(-512, "-0.13"); // symmetric rounding
    // Edges.
    FX_IS(0, "0");
    FX_IS(20, "0");       // 0.00488 rounds down
    FX_IS(21, "0.01");    // 0.00513 rounds up
    FX_IS(4301, "1.05");  // keeps an inner zero
    FX_IS(41370, "10.1"); // drops a trailing zero only
    FX_IS(-6144, "-1.5");
    FX_IS(INT32_MAX, "524288");  // 524287.9997 rounds up to a whole
    FX_IS(INT32_MIN, "-524288");

    // Cells dispatch on the tag; non-numbers are left to the string layer.
    char buf[DSD_NUMFMT_BUF];
    CHECK_EQ(dsd_fmt_number(dsd_int(-12), buf), 3);
    CHECK_STR(buf, "-12");
    CHECK_EQ(dsd_fmt_number(dsd_real(DSD_FX_ONE), buf), 1);
    CHECK_STR(buf, "1");
    CHECK_EQ(dsd_fmt_number(dsd_undef(), buf), 0);
    CHECK_STR(buf, "");
}
