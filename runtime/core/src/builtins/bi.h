// bi.h: private helpers and declarations shared by the builtin implementations in runtime/core/src/builtins/.
#ifndef DSD_BI_H
#define DSD_BI_H

#include <stdbool.h>
#include <stdint.h>

#include "builtins.h"
#include "vm.h"

// Checks that args[i] is a number (INT or REAL); otherwise raises R542 naming builtin `bi` and returns false.
bool dsd_bi_want_number(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i);
// A number argument as Q.12 in 64 bits (exact for every int32). Raises R542 like dsd_bi_want_number.
bool dsd_bi_arg_q12(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, int64_t *q12);
// Stores a 64-bit Q.12 result as a REAL; outside Q20.12 raises R521 in debug builds (release wraps).
bool dsd_bi_real_result(DsdVm *vm, int64_t q12, DsdValue *out);
// Maps a number-layer status (fixed.h) to R52x/R530 (dsd_vm_number_status), or R542 naming builtin `bi` for
// values that are not numbers; true when execution continues.
bool dsd_bi_status(DsdVm *vm, uint32_t bi, int32_t status, DsdValue result);

// ---- Implementations, by file -----------------------------------------------------------------------------------
// math.c
bool dsd_bi_floor(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_ceil(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_round(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_abs(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_sign(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_frac(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_sqrt(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_min(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_max(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_clamp(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_lerp(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_dsin(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_dcos(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_point_distance(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_point_direction(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_lengthdir_x(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_lengthdir_y(DsdVm *vm, DsdValue *args, uint32_t argc);
// output.c
bool dsd_bi_show_debug_message(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_string(DsdVm *vm, DsdValue *args, uint32_t argc);
bool dsd_bi_assert(DsdVm *vm, DsdValue *args, uint32_t argc);

#endif // DSD_BI_H
