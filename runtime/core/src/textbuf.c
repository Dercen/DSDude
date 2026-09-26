// textbuf.c: bounded text builder (textbuf.h).
#include "textbuf.h"

#include "numfmt.h"

#define HEX_DIGITS 8u    // a u32 in hex
#define NIBBLE_BITS 4u
#define NIBBLE_MASK 0xFu

void dsd_text_init(DsdText *t, char *buf, uint32_t cap) {
    t->buf = buf;
    t->cap = cap;
    t->len = 0;
    buf[0] = '\0';
}

void dsd_text_bytes(DsdText *t, const char *bytes, uint32_t n) {
    uint32_t room = t->cap - 1 - t->len;
    if (n > room) n = room;
    for (uint32_t i = 0; i < n; i++) t->buf[t->len + i] = bytes[i];
    t->len += n;
    t->buf[t->len] = '\0';
}

void dsd_text_str(DsdText *t, const char *s) {
    uint32_t n = 0;
    while (s[n] != '\0') n++;
    dsd_text_bytes(t, s, n);
}

void dsd_text_char(DsdText *t, char c) { dsd_text_bytes(t, &c, 1); }

void dsd_text_int(DsdText *t, int32_t v) {
    char tmp[DSD_NUMFMT_BUF];
    dsd_text_bytes(t, tmp, (uint32_t)dsd_fmt_int(v, tmp));
}

void dsd_text_uint(DsdText *t, uint32_t v) {
    // Reuse the signed formatter for the int32 range; larger values print their high part first.
    static const uint32_t ten = 10u;
    if (v > (uint32_t)INT32_MAX) {
        dsd_text_uint(t, v / ten);
        dsd_text_char(t, (char)('0' + v % ten));
        return;
    }
    dsd_text_int(t, (int32_t)v);
}

void dsd_text_hex8(DsdText *t, uint32_t v) {
    static const char digits[] = "0123456789abcdef";
    char out[HEX_DIGITS];
    for (uint32_t i = 0; i < HEX_DIGITS; i++) {
        out[HEX_DIGITS - 1 - i] = digits[(v >> (i * NIBBLE_BITS)) & NIBBLE_MASK];
    }
    dsd_text_bytes(t, out, HEX_DIGITS);
}
