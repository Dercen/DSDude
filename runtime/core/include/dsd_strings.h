// dsd_strings.h: string values. A STR payload >= 0 is a STRS index (a constant inside the DSDB, never freed); a
// payload < 0 is a heap string (heap.h), payload `{u32 len; u8 bytes[len]; u8 0}`.
//
// Named dsd_strings.h so it can never shadow the C library's <strings.h> through the -I path.
#ifndef DSD_STRINGS_H
#define DSD_STRINGS_H

#include <stdbool.h>
#include <stdint.h>

#include "value.h"

typedef struct DsdVm DsdVm;

// The bytes (NUL-terminated) and length of a STR payload. Valid until the next heap allocation.
const char *dsd_str_bytes(const DsdVm *vm, int32_t handle, uint32_t *len);
// Makes a new heap string of `len` bytes and returns where to write them in *dst (valid until the next allocation).
// Raises R560 and returns false when the arena is full.
bool dsd_str_new(DsdVm *vm, uint32_t len, DsdValue *out, char **dst);
// Copies bytes that do not live in the heap (scratch buffers, constants) into a new string. R560 on failure.
bool dsd_str_from(DsdVm *vm, const char *bytes, uint32_t len, DsdValue *out);
// a + b for two STR values (pinned for the allocation, so they need not be rooted elsewhere). R560 on failure.
bool dsd_str_concat(DsdVm *vm, DsdValue a, DsdValue b, DsdValue *out);
// Byte-wise comparison (UTF-8 byte order is code-point order): -1, 0 or 1.
int32_t dsd_str_compare(const DsdVm *vm, int32_t a, int32_t b);

// ---- UTF-8 helpers (string_length, string_char_at, chr, ord count code points, not bytes) ----------------------
// Bytes in the character starting at s[i] (1 for ASCII and for invalid bytes; clipped to the string's end).
uint32_t dsd_utf8_char_len(const char *s, uint32_t len, uint32_t i);
// Code points in s[0..len).
uint32_t dsd_utf8_count(const char *s, uint32_t len);
// Decodes the character at s[i] (invalid bytes decode as themselves).
uint32_t dsd_utf8_decode(const char *s, uint32_t len, uint32_t i);
// Encodes code point cp (<= 0x10FFFF) into out[4]; returns the byte count (0 for an invalid code point).
uint32_t dsd_utf8_encode(uint32_t cp, char *out);

#endif // DSD_STRINGS_H
