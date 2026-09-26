// collision.c: the Collisions stage's grid broadphase (collision.h).
//
// A spatial hash: the room plane is cut into CELL_PX-pixel cells, and cell (cx, cy) of screen s lands in bucket
// ((s * GRID_SIDE + cy mod GRID_SIDE) * GRID_SIDE + cx mod GRID_SIDE). Far-apart cells may share a bucket, which
// only adds candidates the caller's overlap test drops. Buckets are filled by a counting sort into one entry array,
// so a build costs O(instances + covered cells) with no allocation. A box spanning more than GRID_SIDE cells on an
// axis wraps onto every bucket of that axis, so each box covers at most GRID_SIDE x GRID_SIDE buckets. If the
// entries would overflow, the grid degrades to "every instance is a candidate", which is still exact.
#include "collision.h"

#include <string.h>

#include "dsd_limits.h"
#include "dsd_platform.h"
#include "fixed.h"
#include "instances.h"

#define CELL_SHIFT_PX 6                                  // cells of 64 pixels (1 << 6): about a large sprite
#define CELL_SHIFT (DSD_FX_SHIFT + CELL_SHIFT_PX)       // Q20.12 room coordinate -> cell
#define GRID_SIDE 16                                     // buckets per axis and screen (a power of two)
#define GRID_MASK (GRID_SIDE - 1)
#define BUCKETS (DSD_SCREEN_COUNT * GRID_SIDE * GRID_SIDE)
#define ENTRIES_MAX 8192u                                // (instance, bucket) pairs per build
#define POOL DSD_C13_INSTANCES_MAX

static DsdBox g_box[POOL];                   // by snapshot position
static bool g_has_box[POOL];
static uint8_t g_screen[POOL];
static uint32_t g_count;                     // snapshot size of the last build
static bool g_overflow;                      // too many entries: every instance is a candidate
static uint16_t g_bucket_start[BUCKETS + 1]; // counting-sort offsets into g_entries
static uint16_t g_entries[ENTRIES_MAX];      // snapshot positions, grouped by bucket, ascending within a bucket
static uint32_t g_seen[POOL];                // candidate de-duplication stamps, by snapshot position
static uint32_t g_stamp;
static uint32_t g_epoch;                     // dsd_geom_epoch at the last build

// The inclusive cell range [lo, hi] of a box edge pair, clipped to GRID_SIDE cells (more would wrap onto every
// bucket anyway). Right and bottom edges are exclusive, so the last covered cell holds edge - 1.
static void cell_span(int64_t lo_edge, int64_t hi_edge, int64_t *lo, int64_t *hi) {
    *lo = lo_edge >> CELL_SHIFT;
    *hi = hi_edge > lo_edge ? (hi_edge - 1) >> CELL_SHIFT : *lo;
    if (*hi - *lo >= GRID_SIDE) *hi = *lo + GRID_SIDE - 1;
}

// Calls fn(bucket, ctx) once for every bucket snapshot position i's box covers.
static void for_buckets(uint32_t i, void (*fn)(uint32_t bucket, uint32_t i, void *ctx), void *ctx) {
    int64_t x0;
    int64_t x1;
    int64_t y0;
    int64_t y1;
    cell_span(g_box[i].left, g_box[i].right, &x0, &x1);
    cell_span(g_box[i].top, g_box[i].bottom, &y0, &y1);
    uint32_t base = (uint32_t)g_screen[i] * GRID_SIDE * GRID_SIDE;
    for (int64_t cy = y0; cy <= y1; cy++) {
        for (int64_t cx = x0; cx <= x1; cx++) {
            fn(base + ((uint32_t)cy & GRID_MASK) * GRID_SIDE + ((uint32_t)cx & GRID_MASK), i, ctx);
        }
    }
}

// Build pass 1: count entries per bucket.
static void count_bucket(uint32_t bucket, uint32_t i, void *ctx) {
    (void)i;
    (*(uint32_t *)ctx)++;
    g_bucket_start[bucket + 1]++;
}

// Build pass 2: place snapshot position i in the bucket (positions arrive ascending, so buckets stay sorted).
static void fill_bucket(uint32_t bucket, uint32_t i, void *ctx) {
    uint16_t *next = ctx;
    g_entries[next[bucket]++] = (uint16_t)i;
}

void dsd_coll_build(const DsdWorld *w, const uint16_t *snap, uint32_t n) {
    g_count = n;
    g_epoch = dsd_geom_epoch;
    for (uint32_t i = 0; i < n; i++) {
        const DsdInstance *in = dsd_inst_at(snap[i]);
        g_has_box[i] = dsd_inst_live(snap[i]) && dsd_geom_bbox(w, in, false, 0, 0, &g_box[i]);
        g_screen[i] = in->screen;
    }
    memset(g_bucket_start, 0, sizeof g_bucket_start);
    uint32_t total = 0;
    for (uint32_t i = 0; i < n; i++) {
        if (g_has_box[i]) for_buckets(i, count_bucket, &total);
    }
    g_overflow = total > ENTRIES_MAX;
    if (g_overflow) return;
    for (uint32_t b = 0; b < BUCKETS; b++) g_bucket_start[b + 1] += g_bucket_start[b];
    static uint16_t next[BUCKETS];
    memcpy(next, g_bucket_start, sizeof next);
    for (uint32_t i = 0; i < n; i++) {
        if (g_has_box[i]) for_buckets(i, fill_bucket, next);
    }
}

bool dsd_coll_stale(void) { return g_epoch != dsd_geom_epoch; }

bool dsd_coll_box(uint32_t i, DsdBox *out) {
    if (!g_has_box[i]) return false;
    *out = g_box[i];
    return true;
}

// Collection state for gather_bucket.
typedef struct Gather {
    uint32_t self;
    uint32_t from;
    uint16_t *out;
    uint32_t n;
} Gather;

// Adds the unseen positions >= from (other than self) of one bucket to the candidates.
static void gather_bucket(uint32_t bucket, uint32_t i, void *ctx) {
    (void)i;
    Gather *g = ctx;
    for (uint32_t e = g_bucket_start[bucket]; e < g_bucket_start[bucket + 1]; e++) {
        uint32_t j = g_entries[e];
        if (j < g->from || j == g->self || g_seen[j] == g_stamp) continue;
        g_seen[j] = g_stamp;
        g->out[g->n++] = (uint16_t)j;
    }
}

uint32_t dsd_coll_candidates(uint32_t i, uint32_t from, uint16_t *out) {
    if (!g_has_box[i]) return 0;
    Gather g = {i, from, out, 0};
    if (g_overflow) {
        for (uint32_t j = from; j < g_count; j++) {
            if (j != i && g_has_box[j] && g_screen[j] == g_screen[i]) out[g.n++] = (uint16_t)j;
        }
        return g.n;
    }
    if (++g_stamp == 0) { // the stamp wrapped: forget every old mark
        memset(g_seen, 0, sizeof g_seen);
        g_stamp = 1;
    }
    for_buckets(i, gather_bucket, &g);
    // Creation order: insertion sort (candidate lists are short; the buckets are sorted already).
    for (uint32_t a = 1; a < g.n; a++) {
        uint16_t v = out[a];
        uint32_t b = a;
        for (; b > 0 && out[b - 1] > v; b--) out[b] = out[b - 1];
        out[b] = v;
    }
    return g.n;
}
