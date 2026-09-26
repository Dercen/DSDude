// table.c: the builtin dispatch tables, indexed by the dense runtime index (CALLN's C operand) that
// tools/gen-builtins.ts assigns in runtime/gen/builtins_table.h. Builtins without an entry in dsd_builtin_fn are not
// implemented yet: calling one raises R582.
#include "bi.h"
#include "errors.h"
#include "fixed.h"
#include "number.h"

// Names and argument counts, straight from the generated table.
#define DSD_BI_INFO_(index, name, min_args, max_args, pure) [index] = {#name, min_args, max_args},
const DsdBuiltinInfo dsd_builtin_info[DSD_BUILTIN_FUNC_COUNT] = {DSD_BUILTIN_FUNCS(DSD_BI_INFO_)};
#undef DSD_BI_INFO_

// Implementations by name; designated initializers leave the rest NULL.
#define IMPL(name) [DSD_BI_##name] = dsd_bi_##name
const DsdBuiltinFn dsd_builtin_fn[DSD_BUILTIN_FUNC_COUNT] = {
    IMPL(floor),          IMPL(ceil),       IMPL(round),           IMPL(abs),
    IMPL(sign),           IMPL(frac),       IMPL(sqrt),            IMPL(min),
    IMPL(max),            IMPL(clamp),      IMPL(lerp),            IMPL(dsin),
    IMPL(dcos),           IMPL(point_distance), IMPL(point_direction), IMPL(lengthdir_x),
    IMPL(lengthdir_y),    IMPL(show_debug_message), IMPL(string),  IMPL(assert),
};
#undef IMPL

// ---- Shared helpers (bi.h) --------------------------------------------------------------------------------------

bool dsd_bi_want_number(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i) {
    if (dsd_is_number(args[i])) return true;
    DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_ARGUMENT);
    dsd_text_str(&t, dsd_builtin_info[bi].name);
    dsd_text_str(&t, " needs a number here, but got ");
    dsd_text_str(&t, dsd_value_kind(args[i]));
    return false;
}

bool dsd_bi_arg_q12(DsdVm *vm, uint32_t bi, const DsdValue *args, uint32_t i, int64_t *q12) {
    if (!dsd_bi_want_number(vm, bi, args, i)) return false;
    return dsd_num_view_q12(args[i], q12);
}

bool dsd_bi_real_result(DsdVm *vm, int64_t q12, DsdValue *out) {
    *out = dsd_real(dsd_lo32(q12));
    if (dsd_fits32(q12) || !vm->debug) return true;
    dsd_vm_error(vm, DSD_R_FIXED_RANGE, "A number with a fraction got too big (past +-524287.99)");
    return false;
}

bool dsd_bi_status(DsdVm *vm, uint32_t bi, int32_t status, DsdValue result) {
    if (status != DSD_NUM_NOT_NUMBER) return dsd_vm_number_status(vm, status, result);
    DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_ARGUMENT);
    dsd_text_str(&t, dsd_builtin_info[bi].name);
    dsd_text_str(&t, " needs numbers here");
    return false;
}
