// dsd_strings.h: string values. A STR payload >= 0 is a STRS index (a constant inside the DSDB, never freed); a
// payload < 0 is a dynamic string, slot -(payload + 1) of the string table, with its bytes in the text arena
// (C13 stringArenaBytes).
//
// Named dsd_strings.h so it can never shadow the C library's <strings.h> through the -I path.
//
// This is the task-2 store: allocation only, freed wholesale by dsd_strings_reset (program end, room change).
// A collector for long-running rooms comes with arrays (WS2 task 4).
#ifndef DSD_STRINGS_H
#define DSD_STRINGS_H

#include <stdbool.h>
#include <stdint.h>

#include "dsd_limits.h"
#include "dsdb.h"
#include "value.h"

typedef struct DsdStrings {
    uint8_t bytes[DSD_C13_STRING_ARENA_BYTES]; // string bytes, each followed by a NUL
    uint32_t used;                             // bytes handed out
    uint32_t slot_off[DSD_RT_STRING_SLOTS];    // per dynamic string: offset of its bytes
    uint32_t slot_len[DSD_RT_STRING_SLOTS];    // per dynamic string: length in bytes (NUL excluded)
    uint32_t slot_count;
} DsdStrings;

// Frees every dynamic string.
void dsd_strings_reset(DsdStrings *s);
// The bytes and length of a STR payload. Constant strings come from the program's STRS.
const char *dsd_str_bytes(const DsdStrings *s, const DsdProgram *prog, int32_t handle, uint32_t *len);
// Makes a dynamic string from the concatenation of two byte runs (either may be empty). Returns false when the
// arena or the slot table is full (the caller raises R560).
bool dsd_str_make(DsdStrings *s, const char *a, uint32_t alen, const char *b, uint32_t blen, DsdValue *out);
// Byte-wise comparison of two strings (UTF-8 byte order is code-point order): <0, 0, >0.
int32_t dsd_str_compare(const DsdStrings *s, const DsdProgram *prog, int32_t a, int32_t b);

#endif // DSD_STRINGS_H
