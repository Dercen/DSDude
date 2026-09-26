// SPDX-License-Identifier: Zlib
//
// ds_mem.h: memory figures for DSD|MEM (C8): the C-stack high-water mark and free heap.

#ifndef DSD_DS_MEM_H
#define DSD_DS_MEM_H

#include <stdint.h>

// Fills the unused part of the C stack (DTCM, from __dtcm_start up to just below the caller's frame) with a
// pattern. Call first thing in main().
void ds_cstack_paint(void);

// The C stack's size (__sp_usr - __dtcm_start; runtime/dist/VERSION `cstack`) and its high-water mark in bytes:
// everything above the lowest word the pattern no longer holds.
uint32_t ds_cstack_total(void);
uint32_t ds_cstack_used(void);

// Heap bytes malloc can still hand out: free blocks inside the heap plus the untouched rest up to the limit.
uint32_t ds_heap_free(void);

#endif // DSD_DS_MEM_H
