// strings.c: the string store (dsd_strings.h): constants read from STRS in place, dynamic strings bump-allocated
// in the text arena.
#include "dsd_strings.h"

#include <string.h>

// Dynamic handles are negative: slot 0 is -1, slot 1 is -2, ...
static uint32_t slot_of(int32_t handle) { return (uint32_t)(-(handle + 1)); }
static int32_t handle_of(uint32_t slot) { return -(int32_t)slot - 1; }

void dsd_strings_reset(DsdStrings *s) {
    s->used = 0;
    s->slot_count = 0;
}

const char *dsd_str_bytes(const DsdStrings *s, const DsdProgram *prog, int32_t handle, uint32_t *len) {
    if (handle >= 0) return dsd_prog_str(prog, (uint32_t)handle, len);
    uint32_t slot = slot_of(handle);
    *len = s->slot_len[slot];
    return (const char *)&s->bytes[s->slot_off[slot]];
}

bool dsd_str_make(DsdStrings *s, const char *a, uint32_t alen, const char *b, uint32_t blen, DsdValue *out) {
    uint64_t need = (uint64_t)alen + blen + 1; // + NUL
    if (s->slot_count >= DSD_RT_STRING_SLOTS || need > sizeof s->bytes - s->used) return false;
    uint8_t *dst = &s->bytes[s->used];
    if (alen != 0) memcpy(dst, a, alen);
    if (blen != 0) memcpy(dst + alen, b, blen);
    dst[alen + blen] = '\0';
    uint32_t slot = s->slot_count++;
    s->slot_off[slot] = s->used;
    s->slot_len[slot] = alen + blen;
    s->used += (uint32_t)need;
    out->tag = DSD_TAG_STR;
    out->payload = handle_of(slot);
    return true;
}

int32_t dsd_str_compare(const DsdStrings *s, const DsdProgram *prog, int32_t a, int32_t b) {
    uint32_t la;
    uint32_t lb;
    const char *pa = dsd_str_bytes(s, prog, a, &la);
    const char *pb = dsd_str_bytes(s, prog, b, &lb);
    int32_t c = memcmp(pa, pb, la < lb ? la : lb); // memcmp compares as unsigned char: code-point order
    if (c != 0) return c < 0 ? -1 : 1;
    return la < lb ? -1 : (la > lb ? 1 : 0);
}
