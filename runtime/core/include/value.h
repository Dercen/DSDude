// value.h: the runtime's 8-byte value cell (contracts/dsdb.md section 3; PLAN.md 2.4 and 2.8).
//
// A cell is {u32 tag; s32 payload}. Payloads are 32-bit handles (pool indices, arena offsets) or numbers, never
// pointers, so the host (64-bit pointers) and the DS (32-bit pointers) lay cells out identically. The layout is
// frozen by C2 and static_asserted below.
#ifndef DSD_VALUE_H
#define DSD_VALUE_H

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

// Cell tags (contracts/dsdb.md section 3). They are the file encoding too, so their numbers never change.
#define DSD_TAG_UNDEF 0u // payload 0
#define DSD_TAG_INT 1u   // payload: int32
#define DSD_TAG_REAL 2u  // payload: Q20.12 fixed point (value x 4096)
#define DSD_TAG_BOOL 3u  // payload: 0 or 1
#define DSD_TAG_STR 4u   // payload: string handle (a STRS index inside a DSDB file)
#define DSD_TAG_ARR 5u   // payload: array handle
#define DSD_TAG_INST 6u  // payload: instance id
#define DSD_TAG_ASSET 7u // payload: kind << 24 | index (DSD_ASSET_* kinds below)
#define DSD_TAG_COUNT 8u // number of defined tags; any tag >= this is corrupt data

// ASSET payload packing: the kind sits in the top 8 bits, the index in the low 24 (contracts/dsdb.md section 3).
#define DSD_ASSET_KIND_SHIFT 24
#define DSD_ASSET_INDEX_MASK 0x00FFFFFFu
#define DSD_ASSET_SPRITE 1u
#define DSD_ASSET_BACKGROUND 2u
#define DSD_ASSET_SOUND 3u
#define DSD_ASSET_MUSIC 4u
#define DSD_ASSET_OBJECT 5u
#define DSD_ASSET_ROOM 6u

typedef struct DsdValue {
    uint32_t tag;    // one of DSD_TAG_*
    int32_t payload; // meaning depends on tag
} DsdValue;

// The cell layout is part of the C2 container and of the 4 KB register stack budget (512 cells): pin it.
_Static_assert(sizeof(DsdValue) == 8, "DsdValue must be exactly 8 bytes (C2 cell)");
_Static_assert(offsetof(DsdValue, tag) == 0, "DsdValue.tag must come first (C2 cell)");
_Static_assert(offsetof(DsdValue, payload) == 4, "DsdValue.payload must sit at offset 4 (C2 cell)");

// Constructors. Each builds a cell from its payload; none allocates.
static inline DsdValue dsd_undef(void) { return (DsdValue){DSD_TAG_UNDEF, 0}; }
static inline DsdValue dsd_int(int32_t v) { return (DsdValue){DSD_TAG_INT, v}; }
static inline DsdValue dsd_real(int32_t q12) { return (DsdValue){DSD_TAG_REAL, q12}; }
static inline DsdValue dsd_bool(bool b) { return (DsdValue){DSD_TAG_BOOL, b ? 1 : 0}; }
static inline DsdValue dsd_inst(int32_t id) { return (DsdValue){DSD_TAG_INST, id}; }
static inline DsdValue dsd_asset(uint32_t kind, uint32_t index) {
    return (DsdValue){DSD_TAG_ASSET, (int32_t)((kind << DSD_ASSET_KIND_SHIFT) | (index & DSD_ASSET_INDEX_MASK))};
}

// Predicates used by the VM's tag checks.
static inline bool dsd_is_int(DsdValue v) { return v.tag == DSD_TAG_INT; }
static inline bool dsd_is_real(DsdValue v) { return v.tag == DSD_TAG_REAL; }
static inline bool dsd_is_number(DsdValue v) { return v.tag == DSD_TAG_INT || v.tag == DSD_TAG_REAL; }

// Checked int32 arithmetic for the debug overflow trap (PLAN.md 2.4). -fwrapv stops GCC from instrumenting
// + - * overflow, so the checks use the builtins explicitly. Each stores the wrapped (release) result in *out and
// returns true when the exact result did not fit int32.
static inline bool dsd_add_ovf(int32_t a, int32_t b, int32_t *out) { return __builtin_add_overflow(a, b, out); }
static inline bool dsd_sub_ovf(int32_t a, int32_t b, int32_t *out) { return __builtin_sub_overflow(a, b, out); }
static inline bool dsd_mul_ovf(int32_t a, int32_t b, int32_t *out) { return __builtin_mul_overflow(a, b, out); }

#endif // DSD_VALUE_H
