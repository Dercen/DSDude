// lists.c: array builtins (language.md section 4 "Arrays"). Arrays are shared by reference, so these change the
// array itself.
#include "bi.h"
#include "dsd_arrays.h"
#include "errors.h"

bool dsd_bi_array_length(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!dsd_bi_want_array(vm, DSD_BI_array_length, args, 0)) return false;
    args[0] = dsd_int((int32_t)dsd_arr_len(vm, args[0]));
    return true;
}

bool dsd_bi_array_push(DsdVm *vm, DsdValue *args, uint32_t argc) {
    if (!dsd_bi_want_array(vm, DSD_BI_array_push, args, 0)) return false;
    // Every value after the array, in order (the arguments are registers: rooted across growth).
    for (uint32_t i = 1; i < argc; i++) {
        if (!dsd_arr_set(vm, args[0], dsd_arr_len(vm, args[0]), args[i])) return false;
    }
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_array_pop(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    if (!dsd_bi_want_array(vm, DSD_BI_array_pop, args, 0)) return false;
    args[0] = dsd_arr_pop(vm, args[0]);
    return true;
}

bool dsd_bi_array_create(DsdVm *vm, DsdValue *args, uint32_t argc) {
    int32_t size;
    if (!dsd_bi_arg_int(vm, DSD_BI_array_create, args, 0, &size)) return false;
    if (size < 0) {
        DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_ARGUMENT);
        dsd_text_str(&t, "array_create needs a size of 0 or more, but got ");
        dsd_text_int(&t, size);
        return false;
    }
    DsdValue arr;
    if (!dsd_arr_new(vm, (uint32_t)size, &arr)) return false; // args[1] is a register: rooted
    DsdValue fill = argc > 1 ? args[1] : dsd_int(0);          // the default value is 0 (builtins.json)
    DsdValue *cells = dsd_arr_cells(vm, arr);
    for (int32_t i = 0; i < size; i++) cells[i] = fill;
    args[0] = arr;
    return true;
}

bool dsd_bi_array_delete(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    int32_t index;
    int32_t count;
    if (!dsd_bi_want_array(vm, DSD_BI_array_delete, args, 0) ||
        !dsd_bi_arg_int(vm, DSD_BI_array_delete, args, 1, &index) ||
        !dsd_bi_arg_int(vm, DSD_BI_array_delete, args, 2, &count)) {
        return false;
    }
    // Positions outside the list and counts <= 0 delete nothing; the count is clipped at the end.
    if (index >= 0 && count > 0) dsd_arr_delete(vm, args[0], (uint32_t)index, (uint32_t)count);
    args[0] = dsd_undef();
    return true;
}
