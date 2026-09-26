// strings.c: string values (dsd_strings.h): STRS constants read in place, dynamic strings in the heap.
#include "dsd_strings.h"

#include <string.h>

#include "errors.h"
#include "heap.h"
#include "vm.h"

#define LEN_BYTES 4u                 // u32 length before a heap string's bytes
// UTF-8 lead-byte ranges and payload masks.
#define UTF8_CONT_MASK 0xC0u         // continuation bytes are 10xxxxxx
#define UTF8_CONT 0x80u
#define UTF8_LEAD2 0xC0u
#define UTF8_LEAD3 0xE0u
#define UTF8_LEAD4 0xF0u
#define UTF8_LEAD5 0xF8u
#define UTF8_MAX1 0x7Fu              // largest code point per encoded length
#define UTF8_MAX2 0x7FFu
#define UTF8_MAX3 0xFFFFu
#define UTF8_MAX4 0x10FFFFu
#define SURROGATE_LO 0xD800u
#define SURROGATE_HI 0xDFFFu
#define BITS6 6u
#define LOW6 0x3Fu

// ---- Values -----------------------------------------------------------------------------------------------------

const char *dsd_str_bytes(const DsdVm *vm, int32_t handle, uint32_t *len) {
    if (handle >= 0) return dsd_prog_str(vm->prog, (uint32_t)handle, len);
    const uint8_t *p = dsd_heap_payload_c(&vm->heap, (uint32_t)(-(handle + 1)));
    memcpy(len, p, sizeof *len);
    return (const char *)(p + LEN_BYTES);
}

bool dsd_str_new(DsdVm *vm, uint32_t len, DsdValue *out, char **dst) {
    uint32_t slot = len > DSD_C13_STRING_ARENA_BYTES ? DSD_HEAP_NONE
                                                     : dsd_heap_alloc(vm, DSD_HEAP_KIND_STR, LEN_BYTES + len + 1);
    if (slot == DSD_HEAP_NONE) {
        dsd_vm_error(vm, DSD_R_TEXT_MEMORY, "The game ran out of memory for text and lists");
        return false;
    }
    uint8_t *p = dsd_heap_payload(&vm->heap, slot);
    memcpy(p, &len, sizeof len);
    p[LEN_BYTES + len] = '\0';
    *dst = (char *)(p + LEN_BYTES);
    *out = (DsdValue){DSD_TAG_STR, -(int32_t)slot - 1};
    return true;
}

bool dsd_str_from(DsdVm *vm, const char *bytes, uint32_t len, DsdValue *out) {
    char *dst;
    if (!dsd_str_new(vm, len, out, &dst)) return false;
    if (len != 0) memcpy(dst, bytes, len);
    return true;
}

bool dsd_str_concat(DsdVm *vm, DsdValue a, DsdValue b, DsdValue *out) {
    uint32_t la;
    uint32_t lb;
    dsd_str_bytes(vm, a.payload, &la);
    dsd_str_bytes(vm, b.payload, &lb);
    // Keep both alive across the allocation, then read their bytes at their (possibly new) positions.
    dsd_heap_pin(&vm->heap, a);
    dsd_heap_pin(&vm->heap, b);
    char *dst;
    bool ok = dsd_str_new(vm, la + lb, out, &dst);
    dsd_heap_unpin(&vm->heap);
    dsd_heap_unpin(&vm->heap);
    if (!ok) return false;
    const char *pa = dsd_str_bytes(vm, a.payload, &la);
    const char *pb = dsd_str_bytes(vm, b.payload, &lb);
    memcpy(dst, pa, la);
    memcpy(dst + la, pb, lb);
    return true;
}

int32_t dsd_str_compare(const DsdVm *vm, int32_t a, int32_t b) {
    uint32_t la;
    uint32_t lb;
    const char *pa = dsd_str_bytes(vm, a, &la);
    const char *pb = dsd_str_bytes(vm, b, &lb);
    int32_t c = memcmp(pa, pb, la < lb ? la : lb); // memcmp compares as unsigned char: code-point order
    if (c != 0) return c < 0 ? -1 : 1;
    return la < lb ? -1 : (la > lb ? 1 : 0);
}

// ---- UTF-8 ------------------------------------------------------------------------------------------------------

uint32_t dsd_utf8_char_len(const char *s, uint32_t len, uint32_t i) {
    uint8_t c = (uint8_t)s[i];
    uint32_t n = 1;
    if (c >= UTF8_LEAD4 && c < UTF8_LEAD5) n = 4;
    else if (c >= UTF8_LEAD3 && c < UTF8_LEAD4) n = 3;
    else if (c >= UTF8_LEAD2 && c < UTF8_LEAD3) n = 2;
    // A truncated or malformed sequence counts as single bytes.
    if (n > len - i) return 1;
    for (uint32_t k = 1; k < n; k++) {
        if (((uint8_t)s[i + k] & UTF8_CONT_MASK) != UTF8_CONT) return 1;
    }
    return n;
}

uint32_t dsd_utf8_count(const char *s, uint32_t len) {
    uint32_t n = 0;
    for (uint32_t i = 0; i < len; i += dsd_utf8_char_len(s, len, i)) n++;
    return n;
}

uint32_t dsd_utf8_decode(const char *s, uint32_t len, uint32_t i) {
    uint32_t n = dsd_utf8_char_len(s, len, i);
    uint8_t c = (uint8_t)s[i];
    if (n == 1) return c;
    // The lead byte keeps 7 - n payload bits; each continuation byte adds 6.
    uint32_t cp = c & ((1u << (7 - n)) - 1u);
    for (uint32_t k = 1; k < n; k++) cp = (cp << BITS6) | ((uint8_t)s[i + k] & LOW6);
    return cp;
}

uint32_t dsd_utf8_encode(uint32_t cp, char *out) {
    if (cp <= UTF8_MAX1) {
        out[0] = (char)cp;
        return 1;
    }
    if (cp > UTF8_MAX4 || (cp >= SURROGATE_LO && cp <= SURROGATE_HI)) return 0;
    uint32_t n = cp <= UTF8_MAX2 ? 2 : (cp <= UTF8_MAX3 ? 3 : 4);
    static const uint8_t lead[5] = {0, 0, UTF8_LEAD2, UTF8_LEAD3, UTF8_LEAD4};
    for (uint32_t k = n - 1; k > 0; k--) {
        out[k] = (char)(UTF8_CONT | (cp & LOW6));
        cp >>= BITS6;
    }
    out[0] = (char)(lead[n] | cp);
    return n;
}
