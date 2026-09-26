// test_heap.c: the text-and-list arena and its collector (heap.c) through the string and array APIs, on a bare VM
// whose roots are set by hand: registers [0, top) and pinned values.
#include <string.h>

#include "dsd_arrays.h"
#include "dsd_strings.h"
#include "errors.h"
#include "heap.h"
#include "vm.h"

#include "test.h"

#define GARBAGE_STRINGS 20000   // enough short strings to fill the 192 KB arena several times
#define GARBAGE_LEN 40
#define GROW_TO 3000            // array length reached one append at a time under collection pressure

static DsdVm g_vm;
static DsdProgram g_prog;       // empty program: no globals, no constant strings
static DsdValue g_regs[DSD_RT_REG_STACK_CELLS];

// A fresh VM with `live` registers counted as roots.
static void fresh(uint32_t live) {
    memset(&g_prog, 0, sizeof g_prog);
    dsd_vm_init(&g_vm, &g_prog, g_regs);
    for (uint32_t i = 0; i < DSD_RT_REG_STACK_CELLS; i++) g_regs[i] = dsd_undef();
    g_vm.top = live;
}

// Makes a string with the text of `n` repeated `len` times (garbage unless the caller keeps it).
static bool make_text(char c, uint32_t len, DsdValue *out) {
    char *dst;
    if (!dsd_str_new(&g_vm, len, out, &dst)) return false;
    memset(dst, c, len);
    return true;
}

// True when a STR value holds exactly `len` copies of c.
static bool text_is(DsdValue v, char c, uint32_t len) {
    uint32_t n;
    const char *s = dsd_str_bytes(&g_vm, v.payload, &n);
    if (n != len || s[n] != '\0') return false;
    for (uint32_t i = 0; i < n; i++) {
        if (s[i] != c) return false;
    }
    return true;
}

static void test_roots_survive(void) {
    fresh(2);
    CHECK(make_text('a', 10, &g_regs[0]));
    CHECK(dsd_arr_new(&g_vm, 3, &g_regs[1]));
    DsdValue inner;
    CHECK(make_text('b', 7, &inner));
    CHECK(dsd_arr_set(&g_vm, g_regs[1], 2, inner)); // pinned inside dsd_arr_set, then reachable through r1
    for (uint32_t i = 0; i < GARBAGE_STRINGS; i++) {
        DsdValue junk;
        if (!CHECK(make_text('z', GARBAGE_LEN, &junk))) break;
    }
    CHECK(g_vm.heap.collections > 0);
    CHECK(text_is(g_regs[0], 'a', 10));
    CHECK_EQ(dsd_arr_len(&g_vm, g_regs[1]), 3);
    CHECK(text_is(dsd_arr_cells(&g_vm, g_regs[1])[2], 'b', 7));
    CHECK_EQ(dsd_arr_cells(&g_vm, g_regs[1])[0].payload, 0);
}

static void test_garbage_reclaimed(void) {
    fresh(1);
    CHECK(make_text('k', 5, &g_regs[0]));
    DsdValue junk;
    CHECK(make_text('z', 1000, &junk));
    uint32_t before = g_vm.heap.used;
    dsd_heap_collect(&g_vm);
    CHECK(g_vm.heap.used < before);
    CHECK(text_is(g_regs[0], 'k', 5));
    // The freed slot is reused first (ascending free list), so handles stay small and reproducible.
    CHECK(make_text('n', 3, &junk));
    CHECK_EQ(dsd_heap_slot_of(junk), 1);
}

static void test_growth_under_pressure(void) {
    fresh(1);
    CHECK(dsd_arr_new(&g_vm, 0, &g_regs[0]));
    for (uint32_t i = 0; i < GROW_TO; i++) {
        DsdValue junk;
        if (!CHECK(make_text('g', GARBAGE_LEN, &junk))) break; // garbage between appends forces collections
        if (!CHECK(dsd_arr_set(&g_vm, g_regs[0], i, dsd_int((int32_t)i)))) break;
    }
    CHECK_EQ(dsd_arr_len(&g_vm, g_regs[0]), GROW_TO);
    bool ok = true;
    for (uint32_t i = 0; i < GROW_TO; i++) ok = ok && dsd_arr_cells(&g_vm, g_regs[0])[i].payload == (int32_t)i;
    CHECK(ok);
    CHECK(g_vm.heap.collections > 0);
}

static void test_full_arena(void) {
    // Everything rooted: once live data fills the arena, allocation fails cleanly with R560.
    fresh(DSD_RT_REG_STACK_CELLS);
    bool failed = false;
    for (uint32_t i = 0; i < DSD_RT_REG_STACK_CELLS && !failed; i++) failed = !make_text('f', 1024, &g_regs[i]);
    CHECK(failed);
    CHECK_EQ(g_vm.err_code, DSD_R_TEXT_MEMORY);
    CHECK(text_is(g_regs[0], 'f', 1024));
}

static void test_reproducible(void) {
    // The same allocation history gives the same arena state (collections, bytes in use, handles).
    uint32_t used[2];
    uint32_t colls[2];
    int32_t last[2];
    for (int run = 0; run < 2; run++) {
        fresh(1);
        DsdValue v = dsd_undef();
        for (uint32_t i = 0; i < GARBAGE_STRINGS / 2; i++) {
            make_text('r', (i % GARBAGE_LEN) + 1, &v);
            if (i % 7 == 0) g_regs[0] = v; // keep an occasional one
        }
        used[run] = g_vm.heap.used;
        colls[run] = g_vm.heap.collections;
        last[run] = v.payload;
    }
    CHECK_EQ(used[0], used[1]);
    CHECK_EQ(colls[0], colls[1]);
    CHECK_EQ(last[0], last[1]);
}

static void test_utf8(void) {
    const char *s = "h\xC3\xA9llo \xE2\x82\xAC!"; // "héllo €!"
    uint32_t len = (uint32_t)strlen(s);
    CHECK_EQ(dsd_utf8_count(s, len), 8);
    CHECK_EQ(dsd_utf8_decode(s, len, 1), 0xE9);
    CHECK_EQ(dsd_utf8_decode(s, len, 7), 0x20AC);
    char buf[4];
    CHECK_EQ(dsd_utf8_encode(0x20AC, buf), 3);
    CHECK(memcmp(buf, "\xE2\x82\xAC", 3) == 0);
    CHECK_EQ(dsd_utf8_encode(0xD800, buf), 0);    // surrogates are not characters
    CHECK_EQ(dsd_utf8_encode(0x110000, buf), 0);
    CHECK_EQ(dsd_utf8_count("\xC3", 1), 1);       // a truncated sequence counts as one byte
}

void suite_heap(void) {
    test_roots_survive();
    test_garbage_reclaimed();
    test_growth_under_pressure();
    test_full_arena();
    test_reproducible();
    test_utf8();
}
