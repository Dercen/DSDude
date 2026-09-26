// heap.h: the text-and-list arena (C13 stringArenaBytes, PLAN.md 3.3): one fixed arena holding dynamic strings and
// arrays, reached through stable handles (slots), reclaimed by a mark-compact collector.
//
// - Handles never change: a STR payload < 0 is slot -(payload + 1), an ARR payload is its slot. Objects move only
//   inside the arena, and the slot table follows them.
// - Collection runs only when an allocation does not fit (or the slot table is full), so its timing depends only on
//   what the program allocated: identical on the host and the DS. It costs the VM's hot path nothing (no reference
//   counts). Roots: the live registers [0, vm->top), the assigned globals, the temporary roots below and, from the
//   engine on, instance variables.
// - **Any allocation may move every object.** Fetch byte or element pointers after the last allocation of an
//   operation, and keep every value an allocation must not lose in a register, a global or a temporary root.
#ifndef DSD_HEAP_H
#define DSD_HEAP_H

#include <stdbool.h>
#include <stdint.h>

#include "dsd_limits.h"
#include "value.h"

typedef struct DsdVm DsdVm;

#define DSD_HEAP_NONE 0xFFFFFFFFu      // "no slot" (allocation failed; end of the free list)
#define DSD_HEAP_KIND_FREE 0u          // slot kinds
#define DSD_HEAP_KIND_STR 1u
#define DSD_HEAP_KIND_ARR 2u
#define DSD_HEAP_HEADER_BYTES 8u       // per object: u32 slot, u32 payload bytes
#define DSD_HEAP_TEMP_ROOTS 8u         // values C code can pin across allocations

typedef struct DsdHeap {
    _Alignas(8) uint8_t arena[DSD_C13_STRING_ARENA_BYTES];
    uint32_t used;                               // bytes of arena in use (live and not yet collected)
    uint32_t slot_off[DSD_RT_HEAP_SLOTS];        // arena offset of each slot's object header; next free slot if free
    uint8_t slot_kind[DSD_RT_HEAP_SLOTS];        // DSD_HEAP_KIND_*
    uint8_t mark[DSD_RT_HEAP_SLOTS];             // collector mark bits (one byte each for simple indexing)
    uint32_t slot_high;                          // slots handed out at least once: [0, slot_high)
    uint32_t free_head;                          // first free slot below slot_high, or DSD_HEAP_NONE
    DsdValue temp_roots[DSD_HEAP_TEMP_ROOTS];    // pinned values (dsd_heap_pin)
    uint32_t temp_count;
    uint32_t collections;                        // how many times the collector ran (tests, DSD|MEM)
} DsdHeap;

// Empties the heap (boot, game_restart).
void dsd_heap_reset(DsdHeap *h);
// Allocates an object with `bytes` payload bytes (rounded up to 4) of `kind`, collecting first if needed. Returns
// its slot, or DSD_HEAP_NONE when even a collection cannot make room (the caller raises R560).
uint32_t dsd_heap_alloc(DsdVm *vm, uint32_t kind, uint32_t bytes);
// Gives `slot` a new payload of `bytes` bytes (for growing arrays), copying the first min(old, new) payload bytes.
// The slot keeps its handle. Returns false when there is no room (R560).
bool dsd_heap_resize(DsdVm *vm, uint32_t slot, uint32_t bytes);
// Runs the collector now.
void dsd_heap_collect(DsdVm *vm);
// Pins / unpins a value across allocations (LIFO; at most DSD_HEAP_TEMP_ROOTS at once).
void dsd_heap_pin(DsdHeap *h, DsdValue v);
void dsd_heap_unpin(DsdHeap *h);

// An object's payload and its size in bytes. Valid until the next allocation.
static inline uint8_t *dsd_heap_payload(DsdHeap *h, uint32_t slot) {
    return h->arena + h->slot_off[slot] + DSD_HEAP_HEADER_BYTES;
}
static inline const uint8_t *dsd_heap_payload_c(const DsdHeap *h, uint32_t slot) {
    return h->arena + h->slot_off[slot] + DSD_HEAP_HEADER_BYTES;
}
uint32_t dsd_heap_payload_bytes(const DsdHeap *h, uint32_t slot);

// The heap slot a value refers to, or DSD_HEAP_NONE (numbers, constant strings, ...).
static inline uint32_t dsd_heap_slot_of(DsdValue v) {
    if (v.tag == DSD_TAG_STR && v.payload < 0) return (uint32_t)(-(v.payload + 1));
    if (v.tag == DSD_TAG_ARR) return (uint32_t)v.payload;
    return DSD_HEAP_NONE;
}

#endif // DSD_HEAP_H
