// textbuf.h: a bounded, always NUL-terminated text builder for messages and log lines. The core uses it instead of
// the printf family, whose code size and formatting the core does not need to depend on.
#ifndef DSD_TEXTBUF_H
#define DSD_TEXTBUF_H

#include <stdint.h>

typedef struct DsdText {
    char *buf;    // caller's storage
    uint32_t cap; // bytes in buf, including the NUL (>= 1)
    uint32_t len; // bytes written so far, excluding the NUL; never exceeds cap - 1 (later appends are cut off)
} DsdText;

// Starts an empty text in buf[cap].
void dsd_text_init(DsdText *t, char *buf, uint32_t cap);
// Appends n bytes (cut at the capacity).
void dsd_text_bytes(DsdText *t, const char *bytes, uint32_t n);
// Appends a NUL-terminated string.
void dsd_text_str(DsdText *t, const char *s);
// Appends one byte.
void dsd_text_char(DsdText *t, char c);
// Appends an int32 / uint32 in decimal.
void dsd_text_int(DsdText *t, int32_t v);
void dsd_text_uint(DsdText *t, uint32_t v);
// Appends v as 8 lowercase hex digits (the DSD|READY ABI hash form).
void dsd_text_hex8(DsdText *t, uint32_t v);

#endif // DSD_TEXTBUF_H
