// SPDX-License-Identifier: Zlib
//
// nds_shim.h: the small <nds/ndstypes.h> + <nds/arm9/math.h> stand-in that lets the vendored libnds trig code
// (runtime/core/src/vendor/trig.c, runtime/core/include/vendor/trig_lut.h) build in the portable core, on the host
// and on the DS alike (PLAN.md 2.4 "Trig tables"). Written for DSDude; not part of libnds.
//
// It supplies:
//   - the libnds fixed-width type names the vendored code uses;
//   - inttof32 and divf32, where divf32 is the core's model of the DS divider (DIV_64_32), never the hardware;
//   - dsd_nds_ renames of every symbol trig.c exports, so the DS link cannot clash with libnds's own trig.o and
//     no core file can call libnds's trig by accident.
#ifndef DSD_VENDOR_NDS_SHIM_H
#define DSD_VENDOR_NDS_SHIM_H

#include <stdbool.h>
#include <stdint.h>

#include "fixed.h"

// ---- Symbol renames (must precede every declaration in trig_lut.h and every definition in trig.c) ------------
#define SIN_LUT dsd_nds_SIN_LUT
#define TAN_LUT dsd_nds_TAN_LUT
#define sinLutLookup dsd_nds_sinLutLookup
#define sinLerp dsd_nds_sinLerp
#define cosLerp dsd_nds_cosLerp
#define tanLutLookup dsd_nds_tanLutLookup
#define tanLerp dsd_nds_tanLerp
#define asinComp dsd_nds_asinComp
#define asinLerp dsd_nds_asinLerp
#define acosLerp dsd_nds_acosLerp
#define atanLerp dsd_nds_atanLerp

// ---- libnds type names (nds/ndstypes.h) ----------------------------------------------------------------------
typedef uint16_t u16;
typedef int16_t s16;
typedef int32_t s32;

// ---- nds/arm9/math.h subset ----------------------------------------------------------------------------------
// int -> f32 (Q20.12). Multiplication rather than a shift, exactly as libnds writes it (no negative left shift).
#define inttof32(n) ((n) * (1 << 12))

// f32 division through the core's DIV_64_32 model (fixed.c): (num << 12) / den, truncated toward zero, low 32 bits.
// The vendored code only divides by non-zero values.
static inline int32_t divf32(int32_t num, int32_t den) {
    return dsd_div64_32((int64_t)num * DSD_FX_ONE, den, 0);
}

// ---- The LUTs, for core code that interpolates over them (fixed.c's octant atan2) ----------------------------
#define DSD_NDS_LUT_QUARTER 128 // entries per quarter turn; the arrays hold one more (LUT_SIZE + 1)
extern const u16 SIN_LUT[DSD_NDS_LUT_QUARTER + 1]; // sin over [0, 90] degrees in 1.15 fixed point
extern const s32 TAN_LUT[DSD_NDS_LUT_QUARTER + 1]; // tan over [0, 90] degrees in 16.16 fixed point

#endif // DSD_VENDOR_NDS_SHIM_H
