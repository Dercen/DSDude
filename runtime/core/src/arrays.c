// arrays.c: array values in the heap (dsd_arrays.h).
#include "dsd_arrays.h"

#include <string.h>

#include "errors.h"
#include "heap.h"
#include "vm.h"

#define HEADER_BYTES 8u    // u32 len, u32 cap
#define MIN_CAPACITY 4u    // the smallest capacity an array grows to
#define GROWTH_FACTOR 2u   // capacity doubles when an append runs out of room

// Header fields of array slot `slot`.
static uint32_t *len_field(DsdHeap *h, uint32_t slot) { return (uint32_t *)dsd_heap_payload(h, slot); }
static uint32_t *cap_field(DsdHeap *h, uint32_t slot) { return (uint32_t *)dsd_heap_payload(h, slot) + 1; }

// Payload bytes for `cap` cells.
static uint32_t bytes_for(uint32_t cap) { return HEADER_BYTES + cap * (uint32_t)sizeof(DsdValue); }

static void out_of_memory(DsdVm *vm) {
    dsd_vm_error(vm, DSD_R_TEXT_MEMORY, "The game ran out of memory for text and lists");
}

bool dsd_arr_new(DsdVm *vm, uint32_t len, DsdValue *out) {
    if (len > DSD_RT_ARRAY_MAX_LEN) {
        out_of_memory(vm);
        return false;
    }
    uint32_t cap = len < MIN_CAPACITY ? MIN_CAPACITY : len;
    uint32_t slot = dsd_heap_alloc(vm, DSD_HEAP_KIND_ARR, bytes_for(cap));
    if (slot == DSD_HEAP_NONE) {
        out_of_memory(vm);
        return false;
    }
    *len_field(&vm->heap, slot) = len;
    *cap_field(&vm->heap, slot) = cap;
    DsdValue *cells = (DsdValue *)(dsd_heap_payload(&vm->heap, slot) + HEADER_BYTES);
    for (uint32_t i = 0; i < len; i++) cells[i] = dsd_int(0);
    *out = (DsdValue){DSD_TAG_ARR, (int32_t)slot};
    return true;
}

uint32_t dsd_arr_len(const DsdVm *vm, DsdValue arr) {
    uint32_t len;
    memcpy(&len, dsd_heap_payload_c(&vm->heap, (uint32_t)arr.payload), sizeof len);
    return len;
}

DsdValue *dsd_arr_cells(DsdVm *vm, DsdValue arr) {
    return (DsdValue *)(dsd_heap_payload(&vm->heap, (uint32_t)arr.payload) + HEADER_BYTES);
}

const DsdValue *dsd_arr_cells_c(const DsdVm *vm, DsdValue arr) {
    return (const DsdValue *)(dsd_heap_payload_c(&vm->heap, (uint32_t)arr.payload) + HEADER_BYTES);
}

bool dsd_arr_set(DsdVm *vm, DsdValue arr, uint32_t index, DsdValue v) {
    DsdHeap *h = &vm->heap;
    uint32_t slot = (uint32_t)arr.payload;
    if (index >= DSD_RT_ARRAY_MAX_LEN) {
        DsdText t = dsd_vm_error_begin(vm, DSD_R_INDEX_RANGE);
        dsd_text_str(&t, "Position ");
        dsd_text_uint(&t, index);
        dsd_text_str(&t, " is too far for a list (the most is ");
        dsd_text_uint(&t, DSD_RT_ARRAY_MAX_LEN - 1);
        dsd_text_char(&t, ')');
        return false;
    }
    uint32_t len = *len_field(h, slot);
    if (index >= *cap_field(h, slot)) {
        uint32_t cap = *cap_field(h, slot) * GROWTH_FACTOR;
        if (cap < index + 1) cap = index + 1;
        if (cap > DSD_RT_ARRAY_MAX_LEN) cap = DSD_RT_ARRAY_MAX_LEN;
        // The array and the stored value survive a collection during the resize.
        dsd_heap_pin(h, arr);
        dsd_heap_pin(h, v);
        bool ok = dsd_heap_resize(vm, slot, bytes_for(cap));
        dsd_heap_unpin(h);
        dsd_heap_unpin(h);
        if (!ok) {
            out_of_memory(vm);
            return false;
        }
        *cap_field(h, slot) = cap;
    }
    DsdValue *cells = dsd_arr_cells(vm, arr);
    for (uint32_t i = len; i < index; i++) cells[i] = dsd_int(0); // fill the gap with 0
    cells[index] = v;
    if (index >= len) *len_field(h, slot) = index + 1;
    return true;
}

void dsd_arr_delete(DsdVm *vm, DsdValue arr, uint32_t index, uint32_t count) {
    uint32_t len = dsd_arr_len(vm, arr);
    if (index >= len || count == 0) return;
    if (count > len - index) count = len - index;
    DsdValue *cells = dsd_arr_cells(vm, arr);
    memmove(&cells[index], &cells[index + count], (len - index - count) * sizeof(DsdValue));
    *len_field(&vm->heap, (uint32_t)arr.payload) = len - count;
}

DsdValue dsd_arr_pop(DsdVm *vm, DsdValue arr) {
    uint32_t len = dsd_arr_len(vm, arr);
    if (len == 0) return dsd_undef();
    *len_field(&vm->heap, (uint32_t)arr.payload) = len - 1;
    return dsd_arr_cells(vm, arr)[len - 1];
}
