// dsd_arrays.h: array values (language.md section 4 "Arrays"): 0-based, shared by reference, growing on write with
// new elements filled with 0. An ARR payload is a heap slot (heap.h) whose payload is
// `{u32 len; u32 cap; DsdValue cells[cap]}`.
//
// Every function that can allocate may move every heap object and raises R560 (or R550 for a position past
// DSD_RT_ARRAY_MAX_LEN) itself when it returns false. The array and the values passed in are pinned for the call.
#ifndef DSD_ARRAYS_H
#define DSD_ARRAYS_H

#include <stdbool.h>
#include <stdint.h>

#include "value.h"

typedef struct DsdVm DsdVm;

// A new array of `len` elements, each int 0.
bool dsd_arr_new(DsdVm *vm, uint32_t len, DsdValue *out);
// Length of an ARR value.
uint32_t dsd_arr_len(const DsdVm *vm, DsdValue arr);
// The cells of an ARR value (valid until the next allocation).
DsdValue *dsd_arr_cells(DsdVm *vm, DsdValue arr);
const DsdValue *dsd_arr_cells_c(const DsdVm *vm, DsdValue arr);
// arr[index] = v, growing the array (new elements 0) when index >= length.
bool dsd_arr_set(DsdVm *vm, DsdValue arr, uint32_t index, DsdValue v);
// Removes `count` elements starting at `index` (clipped to the length).
void dsd_arr_delete(DsdVm *vm, DsdValue arr, uint32_t index, uint32_t count);
// Removes and returns the last element (undefined for an empty array).
DsdValue dsd_arr_pop(DsdVm *vm, DsdValue arr);

#endif // DSD_ARRAYS_H
