// SPDX-License-Identifier: Zlib
//
// The M1 timer harness (PLAN.md 8 M1 "VM microbenchmark", spike 14; docs/kickoff/ws3.md task 2). Built by
// `make DSD_BENCH=1` (and `DSD_VM_BL=1` for the plain-BL variant) around WS2's core and this platform layer, packed
// with fixtures/bytecode/bench.dsdb as game.dsdb by `npm run bench -w runtime`.
//
// It boots the game like the runtime (dsd_game_boot), runs WARMUP frames normally, then times FRAMES frames of
// dsd_game_frame with the cascaded hardware timers 0+1 (libnds cpuStartTiming: bus-clock ticks; x 2 = ARM9 cycles).
// During the timed run dsd_plat_frame_end skips the VBlank wait and the hardware commits, and the log is muted, so
// the time is the frames' computation only. Every frame runs obj_bench's Step event, a 1,200-word straight-line
// block in main RAM, plus the engine's per-frame work, so the figure is conservative (WS2's host figure counts the
// same way). The result is one DSD|LOG|bench: line:
//   ops per frame = 1,120,380 x ops / cycles; the gate is >= 35,000 (>= 44,000 on melonDS, whose timing is
//   optimistic: no load-use interlocks, no D-cache).

#include <stdint.h>

#include <nds.h>

#include "dsd_platform.h"
#include "ds_log.h"
#include "ds_mem.h"
#include "ds_platform.h"
#include "engine.h"
#include "game.h"

#define WARMUP 30
#define FRAMES 600
#define FRAME_CYCLES 1120380u // ARM9 cycles per frame (560190 bus cycles x 2)
#define GATE 35000u
#define GATE_MELONDS 44000u

#ifdef DSD_VM_CALLS_BL
#define CALLS "bl"
#else
#define CALLS "long"
#endif

// Memory probe: ARM9 cycles per 32-bit load from main RAM vs DTCM, through the same unrolled loop, so the
// difference is data-access cost only. It shows how an emulator charges the VM's bytecode fetches (main RAM).
#define PROBE_WORDS 1024u
#define PROBE_PASSES 64u
static uint32_t probe_main[PROBE_WORDS]; // .bss: main RAM

__attribute__((noinline)) static uint32_t probe_sum(const volatile uint32_t *p, uint32_t words)
{
    uint32_t s = 0;
    for (uint32_t i = 0; i < words; i += 8)
        s += p[i] + p[i + 1] + p[i + 2] + p[i + 3] + p[i + 4] + p[i + 5] + p[i + 6] + p[i + 7];
    return s;
}

// Cycles x 100 per load over PROBE_PASSES passes of `words` words.
static uint32_t probe(const volatile uint32_t *p, uint32_t words)
{
    uint32_t sink = 0;
    cpuStartTiming(0);
    for (uint32_t k = 0; k < PROBE_PASSES; k++)
        sink += probe_sum(p, words);
    uint32_t ticks = cpuEndTiming();
    (void)sink;
    return (uint32_t)((uint64_t)ticks * 2u * 100u / ((uint64_t)words * PROBE_PASSES));
}

static void memory_probe(void)
{
    uint32_t dtcm[256]; // the C stack is in DTCM
    for (uint32_t i = 0; i < 256; i++)
        dtcm[i] = i;
    for (uint32_t i = 0; i < PROBE_WORDS; i++)
        probe_main[i] = i;
    // The same number of loads from each (main RAM: 1,024 words = 4 KB, the D-cache's size on hardware).
    uint32_t main_x100 = probe((const volatile uint32_t *)probe_main, PROBE_WORDS);
    uint32_t dtcm_x100 = probe((const volatile uint32_t *)dtcm, 256);
    ds_log_linef("DSD|LOG|bench: memprobe cycles_per_load main=%lu.%02lu dtcm=%lu.%02lu",
                 (unsigned long)(main_x100 / 100u), (unsigned long)(main_x100 % 100u),
                 (unsigned long)(dtcm_x100 / 100u), (unsigned long)(dtcm_x100 % 100u));
}

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    ds_cstack_paint();
    ds_log_init();

    int32_t st = dsd_game_boot();
    for (int i = 0; i < WARMUP && st == DSD_GAME_RUNNING; i++)
        st = dsd_game_frame();
    if (st != DSD_GAME_RUNNING)
    {
        ds_log_linef("DSD|LOG|bench: the game stopped before the timed run (state %ld)", (long)st);
        for (;;)
            swiWaitForVBlank();
    }

    uint64_t ops = 0;
    uint32_t frames = 0;
    ds_frame_nowait = true;
    ds_log_set_muted(true);
    swiWaitForVBlank(); // start just after a VBlank, so the VBlank handler rarely lands in the timed run
    cpuStartTiming(0);
    for (; frames < FRAMES && st == DSD_GAME_RUNNING; frames++)
    {
        st = dsd_game_frame();
        ops += dsd_engine.ops_last;
    }
    uint32_t ticks = cpuEndTiming();
    ds_log_set_muted(false);
    ds_frame_nowait = false;

    uint64_t cycles = (uint64_t)ticks * 2u;
    uint32_t cpo_x100 = cycles && ops ? (uint32_t)(cycles * 100u / ops) : 0;
    uint32_t per_frame = cycles ? (uint32_t)((uint64_t)FRAME_CYCLES * ops / cycles) : 0;
    bool melonds = ds_log_emulator_id()[0] == 'm';
    uint32_t gate = melonds ? GATE_MELONDS : GATE;
    ds_log_linef("DSD|LOG|bench: calls=%s emulator=%s frames=%lu ops=%lu ticks=%lu cycles=%lu cycles_per_op=%lu.%02lu "
                 "ops_per_frame=%lu gate=%lu %s",
                 CALLS, ds_log_emulator_id()[0] ? ds_log_emulator_id() : "(none)", (unsigned long)frames,
                 (unsigned long)ops, (unsigned long)ticks, (unsigned long)cycles, (unsigned long)(cpo_x100 / 100u),
                 (unsigned long)(cpo_x100 % 100u), (unsigned long)per_frame, (unsigned long)gate,
                 per_frame >= gate ? "PASS" : "FAIL");
    ds_log_linef("DSD|LOG|bench: cstack=%lu/%lu B", (unsigned long)ds_cstack_used(), (unsigned long)ds_cstack_total());
    memory_probe();
    ds_log_pad();

    while (st == DSD_GAME_RUNNING)
        st = dsd_game_frame();
    for (;;)
        swiWaitForVBlank();
}
