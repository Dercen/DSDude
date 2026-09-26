// test_trig.c: the vendored libnds trig LUTs (integrity), degree dsin/dcos, and the octant-LUT atan2 behind
// point_direction (exact at multiples of 45, within tolerance elsewhere, always in [0, 360)).
#include <stddef.h>

#include "fixed.h"
#include "test.h"
#include "vendor/nds_shim.h"
#include "vendor/trig_lut.h"

// FNV-1a 32 parameters (the same hash C2 uses for the ABI hash).
#define FNV_BASIS 0x811C9DC5u
#define FNV_PRIME 0x01000193u
// Checksums of the vendored tables at libnds 7fd8ccb, as little-endian bytes. A mismatch means the vendored copy
// was edited: re-vendor from the pinned commit instead.
#define SIN_LUT_FNV 0xD185CB04u
#define TAN_LUT_FNV 0xCEAD6D0Au
// Degree sweep: whole degrees 0..359 at this radius (Q20.12) for the atan2 round trip.
#define SWEEP_RADIUS_FX (1000 * DSD_FX_ONE)
// Largest atan2 error accepted in the sweep: 0.05 degrees in Q20.12 (the LUT steps are 0.7 degrees wide).
#define ATAN_TOLERANCE_FX (DSD_FX_ONE / 20)
// Largest |sin^2 + cos^2 - 1| accepted, in Q.24 (sin and cos are Q.12): about 0.2 %.
#define PYTHAGORAS_TOLERANCE_Q24 (1 << 15)
// Q20.12 degrees helper.
#define DEG(n) ((int64_t)(n) * DSD_FX_ONE)

// FNV-1a over n little-endian values of the given byte width.
static uint32_t fnv_le(const void *base, int32_t n, int32_t width) {
    uint32_t h = FNV_BASIS;
    for (int32_t i = 0; i < n; i++) {
        uint32_t v = width == 2 ? ((const uint16_t *)base)[i] : (uint32_t)((const int32_t *)base)[i];
        for (int32_t b = 0; b < width; b++) {
            h ^= (v >> (8 * b)) & 0xFFu;
            h *= FNV_PRIME;
        }
    }
    return h;
}

static void test_luts(void) {
    CHECK_EQ(fnv_le(SIN_LUT, DSD_NDS_LUT_QUARTER + 1, 2), SIN_LUT_FNV);
    CHECK_EQ(fnv_le(TAN_LUT, DSD_NDS_LUT_QUARTER + 1, 4), TAN_LUT_FNV);
    CHECK_EQ(SIN_LUT[0], 0);
    CHECK_EQ(SIN_LUT[DSD_NDS_LUT_QUARTER / 2], 23170); // sin 45 in 1.15
    CHECK_EQ(SIN_LUT[DSD_NDS_LUT_QUARTER], 32768);     // sin 90
    CHECK_EQ(TAN_LUT[DSD_NDS_LUT_QUARTER / 2], 65535); // tan 45 in 16.16
    // libnds's own functions, straight: a quarter turn is 8192 binary units.
    CHECK_EQ(sinLerp(8192), DSD_FX_ONE);
    CHECK_EQ(cosLerp(0), DSD_FX_ONE);
    CHECK_EQ(sinLerp(-8192), -DSD_FX_ONE);
}

static void test_dsin_dcos(void) {
    // Exact at multiples of 90, any number of turns, negative angles too.
    static const int32_t deg[] = {0, 90, 180, 270, 360, -90, 450, 720, -360};
    static const int32_t sin_want[] = {0, 4096, 0, -4096, 0, -4096, 4096, 0, 0};
    static const int32_t cos_want[] = {4096, 0, -4096, 0, 4096, 0, 0, 4096, 4096};
    for (size_t i = 0; i < sizeof deg / sizeof deg[0]; i++) {
        CHECK_EQ(dsd_fx_dsin(DEG(deg[i])), sin_want[i]);
        CHECK_EQ(dsd_fx_dcos(DEG(deg[i])), cos_want[i]);
    }
    CHECK_EQ(dsd_fx_dsin(DEG(30)), DSD_FX_HALF);
    CHECK_EQ(dsd_fx_dcos(DEG(60)), DSD_FX_HALF);
    // libnds sinLerp is not exactly odd: its final >> 3 floors, so sin(-30) is -2049/4096 (prints "-0.5"). Pinned
    // as the DS computes it.
    CHECK_EQ(dsd_fx_dsin(DEG(-30)), -DSD_FX_HALF - 1);
    CHECK_EQ(dsd_deg_to_brad(DEG(-90)), 3 * 8192);
    CHECK_EQ(dsd_deg_to_brad(DEG(1) * 1000000), dsd_deg_to_brad(DEG(1000000 % 360)));
    // sin^2 + cos^2 stays close to 1 over a fine sweep (every 1/4 degree).
    for (int32_t q = 0; q < 360 * 4; q++) {
        int64_t d = (int64_t)q * DSD_FX_ONE / 4;
        int64_t s = dsd_fx_dsin(d);
        int64_t c = dsd_fx_dcos(d);
        int64_t err = s * s + c * c - (int64_t)DSD_FX_ONE * DSD_FX_ONE;
        if (!CHECK(err < PYTHAGORAS_TOLERANCE_Q24 && err > -PYTHAGORAS_TOLERANCE_Q24)) break;
    }
}

static void test_atan2(void) {
    // The eight multiples of 45 are exact at every scale, including 64-bit differences.
    static const int32_t dir_x[] = {1, 1, 0, -1, -1, -1, 0, 1};
    static const int32_t dir_y[] = {0, 1, 1, 1, 0, -1, -1, -1};
    static const int64_t scale[] = {1, 7, DSD_FX_ONE, (int64_t)1 << 40};
    for (size_t k = 0; k < sizeof scale / sizeof scale[0]; k++) {
        for (int32_t i = 0; i < 8; i++) {
            CHECK_EQ(dsd_fx_atan2_deg(dir_y[i] * scale[k], dir_x[i] * scale[k]), 45 * i * DSD_FX_ONE);
        }
    }
    CHECK_EQ(dsd_fx_atan2_deg(0, 0), 0);
    CHECK_EQ(dsd_fx_atan2_deg(INT64_MIN, INT64_MIN), 225 * DSD_FX_ONE);
    // Round trip over whole degrees: atan2(r sin d, r cos d) is d within tolerance and always in [0, 360).
    for (int32_t d = 0; d < 360; d++) {
        int64_t y = (int64_t)dsd_fx_dsin(DEG(d)) * SWEEP_RADIUS_FX / DSD_FX_ONE;
        int64_t x = (int64_t)dsd_fx_dcos(DEG(d)) * SWEEP_RADIUS_FX / DSD_FX_ONE;
        int32_t a = dsd_fx_atan2_deg(y, x);
        int64_t err = (int64_t)a - DEG(d);
        if (err > DEG(180)) err -= DEG(360); // 359.99 vs 0
        if (err < -DEG(180)) err += DEG(360);
        if (!CHECK(a >= 0 && a < DEG(360))) break;
        if (!CHECK(err <= ATAN_TOLERANCE_FX && err >= -ATAN_TOLERANCE_FX)) break;
    }
    // Monotonic within an octant: growing y at fixed x never decreases the angle.
    int32_t prev = 0;
    for (int32_t y = 0; y <= 1000; y++) {
        int32_t a = dsd_fx_atan2_deg(y, 1000);
        if (!CHECK(a >= prev)) break;
        prev = a;
    }
}

void suite_trig(void) {
    test_luts();
    test_dsin_dcos();
    test_atan2();
}
