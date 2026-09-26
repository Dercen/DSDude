// SPDX-License-Identifier: Zlib
//
// C-stack high-water mark and free heap for DSD|MEM (C8; PLAN.md 3.3 "VM": the C stack is ~11 KB of DTCM below the
// VM's DTCM data, runtime/Makefile).

#include <malloc.h>
#include <stdint.h>

#include <nds.h>

#include "ds_mem.h"

#define DS_STACK_PATTERN 0x5AA5C33Cu
// Words left unpainted below the caller's frame: ds_cstack_paint's own frame and a margin.
#define DS_STACK_MARGIN 64

extern uint8_t __dtcm_start[];
extern uint8_t __sp_usr[];

void ds_cstack_paint(void)
{
    volatile uint32_t here = 0;
    uint32_t *lo = (uint32_t *)(void *)__dtcm_start;
    uint32_t *hi = (uint32_t *)((uintptr_t)&here & ~(uintptr_t)3) - DS_STACK_MARGIN;
    for (uint32_t *p = lo; p < hi; p++)
        *p = DS_STACK_PATTERN;
}

uint32_t ds_cstack_total(void)
{
    return (uint32_t)(__sp_usr - __dtcm_start);
}

uint32_t ds_cstack_used(void)
{
    const uint32_t *lo = (const uint32_t *)(const void *)__dtcm_start;
    const uint32_t *top = (const uint32_t *)(const void *)__sp_usr;
    const uint32_t *p = lo;
    while (p < top && *p == DS_STACK_PATTERN)
        p++;
    return (uint32_t)((const uint8_t *)top - (const uint8_t *)p);
}

uint32_t ds_heap_free(void)
{
    struct mallinfo mi = mallinfo();
    return (uint32_t)mi.fordblks + (uint32_t)(getHeapLimit() - getHeapEnd());
}
