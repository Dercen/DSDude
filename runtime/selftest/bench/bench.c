// SPDX-License-Identifier: Zlib
//
// The M1 timer harness (PLAN.md 8 M1 "VM microbenchmark", spike 14 and 15; docs/kickoff/ws3.md task 2). Built by
// `make DSD_BENCH=1` (and `DSD_VM_BL=1` for the plain-BL variant) around WS2's core and this platform layer.
//
// One ROM runs up to three workloads, each booted in turn through the core (dsd_game_boot):
//   game.dsdb  WS2's fixtures/bytecode/bench.dsdb: a 1,200-word straight-line block per frame (the M1 mix);
//   base.dsdb  the same game with that Step body emptied: the per-frame engine and platform cost;
//   loop.dsdb  the same mix from a 400-byte loop (spike 14's cache-resident variant).
// For each: WARMUP frames, then FRAMES frames timed with the cascaded hardware timers 0+1 (libnds cpuStartTiming:
// bus-clock ticks; x 2 = ARM9 cycles), with dsd_plat_frame_end skipping the VBlank wait and the log muted. The VM
// alone costs (full - base) cycles over (full - base) ops. Every figure goes to the log (DSD|LOG|bench: lines) and
// to the screen, because hardware has no stdout: the user reads the top screen (spike 15).
//
// Cycles are ARM9 cycles at 67 MHz: the timers tick at the 33.51 MHz bus clock, so cycles = ticks x 2. A DSi or 3DS
// loader may start the ROM in DSi mode, where the ARM9 can run at 134 MHz; the bench then forces 67 MHz first
// (setCpuClock) so the figure is a DS's, and prints the mode and both clocks.

#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>

#include <nds.h>

#include "dsd_platform.h"
#include "ds_log.h"
#include "ds_mem.h"
#include "ds_platform.h"
#include "ds_sys.h"
#include "ds_ui.h"
#include "ds_video.h"
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

typedef struct {
    bool ran;
    uint32_t frames;
    uint64_t ops;
    uint64_t cycles;
} run_result;

// ---- Memory probe: cycles per 32-bit load from main RAM vs DTCM, through the same loop --------------------------
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

// Cycles x 100 per load.
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

// ---- One workload -------------------------------------------------------------------------------------------------
static bool file_exists(const char *path)
{
    FILE *f = fopen(path, "rb");
    if (f == NULL)
        return false;
    fclose(f);
    return true;
}

static run_result run_workload(const char *file)
{
    run_result r = {false, 0, 0, 0};
    ds_game_file = file;
    int32_t st = dsd_game_boot();
    for (int i = 0; i < WARMUP && st == DSD_GAME_RUNNING; i++)
        st = dsd_game_frame();
    if (st != DSD_GAME_RUNNING)
    {
        ds_log_linef("DSD|LOG|bench: %s stopped before the timed run (state %ld)", file, (long)st);
        return r;
    }
    ds_frame_nowait = true;
    ds_log_set_muted(true);
    swiWaitForVBlank(); // start just after a VBlank, so the VBlank handler rarely lands in the timed run
    cpuStartTiming(0);
    for (; r.frames < FRAMES && st == DSD_GAME_RUNNING; r.frames++)
    {
        st = dsd_game_frame();
        r.ops += dsd_engine.ops_last;
    }
    uint32_t ticks = cpuEndTiming();
    ds_log_set_muted(false);
    ds_frame_nowait = false;
    r.cycles = (uint64_t)ticks * 2u;
    r.ran = true;
    return r;
}

// ops per frame = FRAME_CYCLES x ops / cycles; cycles per op x 100.
static uint32_t per_frame(uint64_t ops, uint64_t cycles)
{
    return cycles ? (uint32_t)((uint64_t)FRAME_CYCLES * ops / cycles) : 0;
}

static uint32_t cpo_x100(uint64_t ops, uint64_t cycles)
{
    return ops ? (uint32_t)(cycles * 100u / ops) : 0;
}

static void log_run(const char *workload, const run_result *r, uint32_t gate)
{
    uint32_t cpo = cpo_x100(r->ops, r->cycles);
    uint32_t pf = per_frame(r->ops, r->cycles);
    ds_log_linef("DSD|LOG|bench: calls=%s emulator=%s workload=%s frames=%lu ops=%lu ticks=%lu cycles=%lu "
                 "cycles_per_op=%lu.%02lu ops_per_frame=%lu gate=%lu %s",
                 CALLS, ds_log_emulator_id()[0] ? ds_log_emulator_id() : "(none)", workload,
                 (unsigned long)r->frames, (unsigned long)r->ops, (unsigned long)(r->cycles / 2u),
                 (unsigned long)r->cycles, (unsigned long)(cpo / 100u), (unsigned long)(cpo % 100u),
                 (unsigned long)pf, (unsigned long)gate, pf >= gate ? "PASS" : "FAIL");
}

// ---- Screen ---------------------------------------------------------------------------------------------------------
static char line[64];

static void show(int row, int colour, const char *fmt, ...) __attribute__((format(printf, 3, 4)));
static void show(int row, int colour, const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(line, sizeof(line), fmt, ap);
    va_end(ap);
    ds_ui_text_panel(DS_TOP, 0, row, line, colour, DS_UI_PANEL_NAVY);
}

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    ds_cstack_paint();
    ds_log_init();
    uint32_t mhz_at_boot = ds_sys_force_67mhz();

    bool melonds = ds_log_emulator_id()[0] == 'm';
    uint32_t gate = melonds ? GATE_MELONDS : GATE;

    run_result full = run_workload("game.dsdb");
    run_result base = file_exists("nitro:/base.dsdb") ? run_workload("base.dsdb") : (run_result){false, 0, 0, 0};
    run_result loop = file_exists("nitro:/loop.dsdb") ? run_workload("loop.dsdb") : (run_result){false, 0, 0, 0};
    ds_game_file = NULL;

    if (full.ran)
        log_run("full", &full, gate);
    if (base.ran)
        log_run("base", &base, gate);
    if (loop.ran)
        log_run("loop", &loop, gate);

    // The VM alone: (full - base) and (loop - base).
    uint32_t vm_cpo = 0, vm_pf = 0, loop_cpo = 0, loop_pf = 0;
    if (full.ran && base.ran && full.ops > base.ops && full.cycles > base.cycles)
    {
        vm_cpo = cpo_x100(full.ops - base.ops, full.cycles - base.cycles);
        vm_pf = per_frame(full.ops - base.ops, full.cycles - base.cycles);
    }
    if (loop.ran && base.ran && loop.ops > base.ops && loop.cycles > base.cycles)
    {
        loop_cpo = cpo_x100(loop.ops - base.ops, loop.cycles - base.cycles);
        loop_pf = per_frame(loop.ops - base.ops, loop.cycles - base.cycles);
    }
    uint32_t mem_main = probe((const volatile uint32_t *)probe_main, PROBE_WORDS);
    uint32_t dtcm_buf[256]; // the C stack is in DTCM
    for (uint32_t i = 0; i < 256; i++)
        dtcm_buf[i] = i;
    uint32_t mem_dtcm = probe((const volatile uint32_t *)dtcm_buf, 256);
    ds_log_linef("DSD|LOG|bench: summary calls=%s vm_cycles_per_op=%lu.%02lu vm_ops_per_frame=%lu loop_cycles_per_op="
                 "%lu.%02lu loop_ops_per_frame=%lu overhead_per_frame=%lu gate=%lu %s",
                 CALLS, (unsigned long)(vm_cpo / 100u), (unsigned long)(vm_cpo % 100u), (unsigned long)vm_pf,
                 (unsigned long)(loop_cpo / 100u), (unsigned long)(loop_cpo % 100u), (unsigned long)loop_pf,
                 (unsigned long)(base.frames ? base.cycles / base.frames : 0), (unsigned long)gate,
                 vm_pf >= gate ? "PASS" : "FAIL");
    ds_log_linef("DSD|LOG|bench: memprobe cycles_per_load main=%lu.%02lu dtcm=%lu.%02lu",
                 (unsigned long)(mem_main / 100u), (unsigned long)(mem_main % 100u), (unsigned long)(mem_dtcm / 100u),
                 (unsigned long)(mem_dtcm % 100u));
    ds_log_linef("DSD|LOG|bench: cstack=%lu/%lu B", (unsigned long)ds_cstack_used(), (unsigned long)ds_cstack_total());
    ds_log_linef("DSD|LOG|bench: machine %s (ARM9 %lu MHz at boot)", ds_sys_describe(), (unsigned long)mhz_at_boot);
    ds_log_pad();

    // The result screen (hardware has no stdout): top screen, one figure per row, to read out or photograph.
    ds_ui_clear(DS_TOP);
    ds_ui_clear(DS_BOTTOM);
    show(0, DS_C_YELLOW, "DSDude M1 bench %s", DSD_RUNTIME_VERSION);
    show(1, DS_C_LTGRAY, "calls=%s emu=%s", CALLS, ds_log_emulator_id()[0] ? ds_log_emulator_id() : "(none)");
    show(2, ds_sys_dsi_mode() ? DS_C_ORANGE : DS_C_LTGRAY, "%s (boot %lu)", ds_sys_describe(),
         (unsigned long)mhz_at_boot);
    show(3, DS_C_WHITE, "VM cycles/op   %lu.%02lu", (unsigned long)(vm_cpo / 100u), (unsigned long)(vm_cpo % 100u));
    show(4, DS_C_WHITE, "VM ops/frame   %lu", (unsigned long)vm_pf);
    show(5, vm_pf >= gate ? DS_C_LIME : DS_C_RED, "gate %lu: %s", (unsigned long)gate, vm_pf >= gate ? "PASS" : "FAIL");
    show(7, DS_C_WHITE, "loop cycles/op %lu.%02lu", (unsigned long)(loop_cpo / 100u),
         (unsigned long)(loop_cpo % 100u));
    show(8, DS_C_WHITE, "loop ops/frame %lu", (unsigned long)loop_pf);
    show(10, DS_C_WHITE, "frame cycles/op %lu.%02lu", (unsigned long)(cpo_x100(full.ops, full.cycles) / 100u),
         (unsigned long)(cpo_x100(full.ops, full.cycles) % 100u));
    show(11, DS_C_WHITE, "overhead/frame %lu cyc", (unsigned long)(base.frames ? base.cycles / base.frames : 0));
    show(13, DS_C_WHITE, "load main %lu.%02lu dtcm %lu.%02lu", (unsigned long)(mem_main / 100u),
         (unsigned long)(mem_main % 100u), (unsigned long)(mem_dtcm / 100u), (unsigned long)(mem_dtcm % 100u));
    show(14, DS_C_WHITE, "full ops %lu cyc %lu", (unsigned long)full.ops, (unsigned long)full.cycles);
    show(15, DS_C_WHITE, "base ops %lu cyc %lu", (unsigned long)base.ops, (unsigned long)base.cycles);
    show(16, DS_C_WHITE, "loop ops %lu cyc %lu", (unsigned long)loop.ops, (unsigned long)loop.cycles);
    show(18, DS_C_LTGRAY, "cstack %lu/%lu B", (unsigned long)ds_cstack_used(), (unsigned long)ds_cstack_total());
    show(20, DS_C_YELLOW, "Photograph this screen.");
    for (;;)
    {
        swiWaitForVBlank();
        ds_ui_commit();
    }
}
