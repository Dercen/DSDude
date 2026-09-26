// text.c: string builtins. Lengths and positions count characters (UTF-8 code points), positions are 1-based as in
// GML, and a position outside the string gives "". Case changes touch ASCII letters only (the DS font is ASCII).
#include <string.h>

#include "bi.h"
#include "dsd_strings.h"
#include "errors.h"
#include "fixed.h"

#define DECIMAL_BASE 10
#define FRACTION_DIGITS_MAX 9      // decimals kept when parsing (10^9 fits int64 with room for the rounding)
#define ASCII_CASE_BIT 0x20        // 'a' - 'A'
#define UTF8_MAX_BYTES 4u

// ---- real() -----------------------------------------------------------------------------------------------------

// Parses optional blanks, a sign, digits, an optional fraction and optional blanks into a number cell, with the
// literal rules (language.md section 2): whole numbers stay ints (int32), fractions round half away from zero to the
// nearest 1/4096 and must fit Q20.12. False when the text is not such a number or is out of range.
static bool parse_number(const char *s, uint32_t len, DsdValue *out) {
    uint32_t i = 0;
    while (i < len && s[i] == ' ') i++;
    bool neg = false;
    if (i < len && (s[i] == '-' || s[i] == '+')) neg = s[i++] == '-';
    int64_t whole = 0;
    uint32_t digits = 0;
    while (i < len && s[i] >= '0' && s[i] <= '9') {
        whole = whole * DECIMAL_BASE + (s[i++] - '0');
        if (whole > (int64_t)INT32_MAX + 1) return false;
        digits++;
    }
    int64_t frac = 0;      // fraction digits kept, as an integer
    int64_t scale = 1;     // 10^(digits kept)
    bool has_point = i < len && s[i] == '.';
    if (has_point) {
        i++;
        uint32_t fdigits = 0;
        while (i < len && s[i] >= '0' && s[i] <= '9') {
            if (fdigits < FRACTION_DIGITS_MAX) {
                frac = frac * DECIMAL_BASE + (s[i] - '0');
                scale *= DECIMAL_BASE;
            }
            fdigits++;
            i++;
        }
        if (fdigits == 0) return false; // a digit on both sides of the point, as for literals
    }
    while (i < len && s[i] == ' ') i++;
    if (digits == 0 || i != len) return false;
    if (!has_point) {
        int64_t v = neg ? -whole : whole;
        if (!dsd_fits32(v)) return false;
        *out = dsd_int((int32_t)v);
        return true;
    }
    int64_t q = whole * DSD_FX_ONE + dsd_div_round64(frac * DSD_FX_ONE, scale);
    if (neg) q = -q;
    if (!dsd_fits32(q)) return false;
    *out = dsd_real((int32_t)q);
    return true;
}

bool dsd_bi_real(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (dsd_is_number(args[0])) return true; // real(5) is 5
    if (!dsd_bi_want_string(vm, DSD_BI_real, args, 0)) return false;
    uint32_t len;
    const char *s = dsd_str_bytes(vm, args[0].payload, &len);
    if (parse_number(s, len, &args[0])) return true;
    DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_ARGUMENT);
    dsd_text_str(&t, "real needs text that is a number here, but got \"");
    dsd_text_bytes(&t, s, len);
    dsd_text_char(&t, '"');
    return false;
}

// ---- Lengths and characters -------------------------------------------------------------------------------------

bool dsd_bi_string_length(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!dsd_bi_want_string(vm, DSD_BI_string_length, args, 0)) return false;
    uint32_t len;
    const char *s = dsd_str_bytes(vm, args[0].payload, &len);
    args[0] = dsd_int((int32_t)dsd_utf8_count(s, len));
    return true;
}

bool dsd_bi_string_char_at(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int32_t pos;
    if (!dsd_bi_want_string(vm, DSD_BI_string_char_at, args, 0) ||
        !dsd_bi_arg_int(vm, DSD_BI_string_char_at, args, 1, &pos)) {
        return false;
    }
    uint32_t len;
    const char *s = dsd_str_bytes(vm, args[0].payload, &len);
    // Walk to character `pos` (1-based); copy it out before allocating the result.
    char ch[UTF8_MAX_BYTES];
    uint32_t n = 0;
    uint32_t i = 0;
    for (int32_t k = 1; i < len && pos >= 1; k++) {
        uint32_t cl = dsd_utf8_char_len(s, len, i);
        if (k == pos) {
            memcpy(ch, s + i, cl);
            n = cl;
            break;
        }
        i += cl;
    }
    return dsd_str_from(vm, ch, n, &args[0]);
}

// Shared by string_upper/lower: a copy with ASCII letters in [from_lo, from_hi] shifted by the case bit.
static bool change_case(DsdVm *vm, uint32_t bi, DsdValue *args, char from_lo, char from_hi) {
    if (!dsd_bi_want_string(vm, bi, args, 0)) return false;
    uint32_t len;
    dsd_str_bytes(vm, args[0].payload, &len);
    DsdValue out;
    char *dst;
    if (!dsd_str_new(vm, len, &out, &dst)) return false; // args[0] is a register: it survives a collection
    const char *s = dsd_str_bytes(vm, args[0].payload, &len);
    for (uint32_t i = 0; i < len; i++) {
        char c = s[i];
        dst[i] = (c >= from_lo && c <= from_hi) ? (char)(c ^ ASCII_CASE_BIT) : c;
    }
    args[0] = out;
    return true;
}

bool dsd_bi_string_upper(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return change_case(vm, DSD_BI_string_upper, args, 'a', 'z');
}

bool dsd_bi_string_lower(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return change_case(vm, DSD_BI_string_lower, args, 'A', 'Z');
}

bool dsd_bi_string_repeat(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int32_t count;
    if (!dsd_bi_want_string(vm, DSD_BI_string_repeat, args, 0) ||
        !dsd_bi_arg_int(vm, DSD_BI_string_repeat, args, 1, &count)) {
        return false;
    }
    uint32_t len;
    dsd_str_bytes(vm, args[0].payload, &len);
    if (count < 0) count = 0;
    uint64_t total = (uint64_t)len * (uint32_t)count;
    DsdValue out;
    char *dst;
    // A total past the arena fails inside dsd_str_new with R560.
    if (!dsd_str_new(vm, total > UINT32_MAX ? UINT32_MAX : (uint32_t)total, &out, &dst)) return false;
    const char *s = dsd_str_bytes(vm, args[0].payload, &len);
    for (int32_t k = 0; k < count; k++) memcpy(dst + (uint32_t)k * len, s, len);
    args[0] = out;
    return true;
}

bool dsd_bi_chr(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int32_t code;
    if (!dsd_bi_arg_int(vm, DSD_BI_chr, args, 0, &code)) return false;
    char buf[UTF8_MAX_BYTES];
    uint32_t n = code < 0 ? 0 : dsd_utf8_encode((uint32_t)code, buf); // no character: ""
    return dsd_str_from(vm, buf, n, &args[0]);
}

bool dsd_bi_ord(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!dsd_bi_want_string(vm, DSD_BI_ord, args, 0)) return false;
    uint32_t len;
    const char *s = dsd_str_bytes(vm, args[0].payload, &len);
    args[0] = dsd_int(len == 0 ? 0 : (int32_t)dsd_utf8_decode(s, len, 0)); // "" gives 0
    return true;
}
