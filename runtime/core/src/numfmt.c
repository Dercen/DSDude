// numfmt.c: the core's own number formatter (contracts/language.md section 4 "Printing"). No libc printf: its
// %f is floating point and its output is not ours to pin.
//
// The divisions here are unsigned and by the constants 10 and 100 (or by 4096 via a shift), so none of the guarded
// cases of fixed.c's division path (zero, INT_MIN / -1) can occur.
#include "numfmt.h"

#include "fixed.h"

#define DEC_BASE 10u          // decimal digits
#define FRAC_SCALE 100u       // two printed decimals: work in hundredths
#define DIGITS_MAX 10         // a u32 has at most 10 decimal digits

// Writes the decimal digits of u (no sign) at buf and returns their count.
static int32_t put_u32(uint32_t u, char *buf) {
    char rev[DIGITS_MAX];
    int32_t n = 0;
    do {
        rev[n++] = (char)('0' + u % DEC_BASE);
        u /= DEC_BASE;
    } while (u != 0);
    for (int32_t i = 0; i < n; i++) buf[i] = rev[n - 1 - i];
    return n;
}

int32_t dsd_fmt_int(int32_t v, char *buf) {
    int32_t len = 0;
    // Magnitude in unsigned arithmetic, so INT_MIN needs no special case.
    uint32_t mag = v < 0 ? 0u - (uint32_t)v : (uint32_t)v;
    if (v < 0) buf[len++] = '-';
    len += put_u32(mag, buf + len);
    buf[len] = '\0';
    return len;
}

int32_t dsd_fmt_fixed(int32_t q12, char *buf) {
    // |q| * 100 / 4096, rounded half away from zero, computed on the magnitude: the exact Q20.12 value in hundredths.
    uint64_t mag = q12 < 0 ? 0u - (uint64_t)(int64_t)q12 : (uint64_t)q12;
    uint64_t scaled = mag * FRAC_SCALE;
    uint64_t hundredths = (scaled + DSD_FX_HALF) >> DSD_FX_SHIFT;
    uint32_t whole = (uint32_t)(hundredths / FRAC_SCALE);
    uint32_t frac = (uint32_t)(hundredths % FRAC_SCALE);
    int32_t len = 0;
    if (q12 < 0 && hundredths != 0) buf[len++] = '-'; // a value that rounds to 0 prints "0", never "-0"
    len += put_u32(whole, buf + len);
    if (frac != 0) {
        buf[len++] = '.';
        buf[len++] = (char)('0' + frac / DEC_BASE);
        if (frac % DEC_BASE != 0) buf[len++] = (char)('0' + frac % DEC_BASE); // drop a trailing zero
    }
    buf[len] = '\0';
    return len;
}

int32_t dsd_fmt_number(DsdValue v, char *buf) {
    if (v.tag == DSD_TAG_INT) return dsd_fmt_int(v.payload, buf);
    if (v.tag == DSD_TAG_REAL) return dsd_fmt_fixed(v.payload, buf);
    buf[0] = '\0';
    return 0;
}
