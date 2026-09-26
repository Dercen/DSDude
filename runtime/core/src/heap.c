// heap.c: the text-and-list arena and its mark-compact collector (heap.h).
//
// Layout: objects are bump-allocated back to back, each `{u32 slot; u32 bytes}` followed by `bytes` payload bytes
// (a multiple of 4). An object whose slot no longer points at it (an array that grew, a freed slot) is garbage and
// disappears at the next compaction. Compaction slides live objects down in address order, so the arena never
// fragments and a collection's result depends only on the allocation history.
#include "heap.h"

#include <string.h>

#include "vm.h"

#define WORD_MASK 3u              // payloads are rounded up to 4-byte multiples
#define ARRAY_HEADER_BYTES 8u     // u32 len, u32 cap before the cells (arrays.c)

// Worklist of arrays whose elements still need marking (each slot is pushed at most once per collection).
static uint32_t g_mark_stack[DSD_RT_HEAP_SLOTS];
static uint32_t g_mark_sp;

static uint32_t round4(uint32_t n) { return (n + WORD_MASK) & ~WORD_MASK; }

// Object header fields at arena offset `off`.
static uint32_t hdr_slot(const DsdHeap *h, uint32_t off) {
    uint32_t v;
    memcpy(&v, h->arena + off, sizeof v);
    return v;
}
static uint32_t hdr_bytes(const DsdHeap *h, uint32_t off) {
    uint32_t v;
    memcpy(&v, h->arena + off + sizeof(uint32_t), sizeof v);
    return v;
}
static void hdr_write(DsdHeap *h, uint32_t off, uint32_t slot, uint32_t bytes) {
    memcpy(h->arena + off, &slot, sizeof slot);
    memcpy(h->arena + off + sizeof(uint32_t), &bytes, sizeof bytes);
}

void dsd_heap_reset(DsdHeap *h) {
    h->used = 0;
    h->slot_high = 0;
    h->free_head = DSD_HEAP_NONE;
    h->temp_count = 0;
    h->collections = 0;
}

uint32_t dsd_heap_payload_bytes(const DsdHeap *h, uint32_t slot) { return hdr_bytes(h, h->slot_off[slot]); }

void dsd_heap_pin(DsdHeap *h, DsdValue v) { h->temp_roots[h->temp_count++] = v; }

void dsd_heap_unpin(DsdHeap *h) { h->temp_count--; }

// ---- Collection -------------------------------------------------------------------------------------------------

void dsd_heap_mark(DsdHeap *h, DsdValue v) {
    uint32_t s = dsd_heap_slot_of(v);
    if (s == DSD_HEAP_NONE || s >= h->slot_high || h->slot_kind[s] == DSD_HEAP_KIND_FREE || h->mark[s]) return;
    h->mark[s] = 1;
    // Arrays go on the worklist so their elements get marked too.
    if (h->slot_kind[s] == DSD_HEAP_KIND_ARR) g_mark_stack[g_mark_sp++] = s;
}

// Marks everything reachable from the roots: registers, globals, pinned values and the engine's (mark_extra).
static void mark_roots(DsdVm *vm) {
    DsdHeap *h = &vm->heap;
    g_mark_sp = 0;
    for (uint32_t r = 0; r < vm->top; r++) dsd_heap_mark(h, vm->regs[r]);
    for (uint32_t g = 0; g < vm->prog->glob_count; g++) {
        if (vm->global_set[g >> 3] & (1u << (g & 7u))) dsd_heap_mark(h, vm->globals[g]);
    }
    for (uint32_t t = 0; t < h->temp_count; t++) dsd_heap_mark(h, h->temp_roots[t]);
    if (vm->mark_extra != 0) vm->mark_extra(vm);
    while (g_mark_sp > 0) {
        uint32_t s = g_mark_stack[--g_mark_sp];
        const uint8_t *p = dsd_heap_payload_c(h, s);
        uint32_t len;
        memcpy(&len, p, sizeof len);
        const DsdValue *cells = (const DsdValue *)(p + ARRAY_HEADER_BYTES);
        for (uint32_t i = 0; i < len; i++) dsd_heap_mark(h, cells[i]);
    }
}

void dsd_heap_collect(DsdVm *vm) {
    DsdHeap *h = &vm->heap;
    h->collections++;
    memset(h->mark, 0, h->slot_high);
    mark_roots(vm);
    // Slide the live objects down: an object is live when its slot is in use, still points at it, and is marked.
    uint32_t src = 0;
    uint32_t dst = 0;
    while (src < h->used) {
        uint32_t slot = hdr_slot(h, src);
        uint32_t total = DSD_HEAP_HEADER_BYTES + hdr_bytes(h, src);
        bool live = slot < h->slot_high && h->slot_kind[slot] != DSD_HEAP_KIND_FREE && h->slot_off[slot] == src &&
                    h->mark[slot];
        if (live) {
            if (dst != src) memmove(h->arena + dst, h->arena + src, total);
            h->slot_off[slot] = dst;
            dst += total;
        }
        src += total;
    }
    h->used = dst;
    // Free every unmarked slot, and rebuild the free list in ascending order (so reuse order is reproducible).
    h->free_head = DSD_HEAP_NONE;
    for (uint32_t s = h->slot_high; s-- > 0;) {
        if (!h->mark[s]) h->slot_kind[s] = DSD_HEAP_KIND_FREE;
        if (h->slot_kind[s] == DSD_HEAP_KIND_FREE) {
            h->slot_off[s] = h->free_head;
            h->free_head = s;
        }
    }
}

// ---- Allocation -------------------------------------------------------------------------------------------------

// True when `total` more arena bytes (and a slot, if asked) are available, collecting once if they are not.
static bool reserve(DsdVm *vm, uint32_t total, bool need_slot) {
    DsdHeap *h = &vm->heap;
    for (int attempt = 0; attempt < 2; attempt++) {
        bool bytes_ok = total <= sizeof h->arena - h->used;
        bool slot_ok = !need_slot || h->free_head != DSD_HEAP_NONE || h->slot_high < DSD_RT_HEAP_SLOTS;
        if (bytes_ok && slot_ok) return true;
        if (attempt == 0) dsd_heap_collect(vm);
    }
    return false;
}

uint32_t dsd_heap_alloc(DsdVm *vm, uint32_t kind, uint32_t bytes) {
    DsdHeap *h = &vm->heap;
    if (bytes > sizeof h->arena) return DSD_HEAP_NONE;
    uint32_t b = round4(bytes);
    if (!reserve(vm, DSD_HEAP_HEADER_BYTES + b, true)) return DSD_HEAP_NONE;
    uint32_t slot;
    if (h->free_head != DSD_HEAP_NONE) {
        slot = h->free_head;
        h->free_head = h->slot_off[slot];
    } else {
        slot = h->slot_high++;
    }
    uint32_t off = h->used;
    hdr_write(h, off, slot, b);
    h->used += DSD_HEAP_HEADER_BYTES + b;
    h->slot_off[slot] = off;
    h->slot_kind[slot] = (uint8_t)kind;
    h->mark[slot] = 0;
    return slot;
}

bool dsd_heap_resize(DsdVm *vm, uint32_t slot, uint32_t bytes) {
    DsdHeap *h = &vm->heap;
    if (bytes > sizeof h->arena) return false;
    uint32_t b = round4(bytes);
    if (!reserve(vm, DSD_HEAP_HEADER_BYTES + b, false)) return false;
    // After a possible collection the old object may have moved: read its position only now.
    uint32_t old_off = h->slot_off[slot];
    uint32_t old_b = hdr_bytes(h, old_off);
    uint32_t off = h->used;
    hdr_write(h, off, slot, b);
    memcpy(h->arena + off + DSD_HEAP_HEADER_BYTES, h->arena + old_off + DSD_HEAP_HEADER_BYTES, old_b < b ? old_b : b);
    h->used += DSD_HEAP_HEADER_BYTES + b;
    h->slot_off[slot] = off; // the old copy is garbage now
    return true;
}
