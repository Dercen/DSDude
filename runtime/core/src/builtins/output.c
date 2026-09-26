// output.c: printing builtins: show_debug_message (DSD|LOG, C8), string(), assert().
#include "bi.h"
#include "dsd_log.h"
#include "errors.h"

// One formatted value for DSD|LOG (main RAM, not the C stack; DSD_RT_TEXT_MAX bytes, longer values are cut).
static char g_text[DSD_RT_TEXT_MAX];

bool dsd_bi_show_debug_message(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    DsdText t;
    dsd_text_init(&t, g_text, sizeof g_text);
    dsd_value_format(vm, args[0], &t);
    dsd_log_text(t.buf, t.len);
    args[0] = dsd_undef();
    return true;
}

bool dsd_bi_string(DsdVm *vm, DsdValue *args, uint32_t argc) {
    (void)argc;
    return dsd_value_to_string(vm, args[0], &args[0]);
}

bool dsd_bi_assert(DsdVm *vm, DsdValue *args, uint32_t argc) {
    if (dsd_truthy(args[0])) {
        args[0] = dsd_undef();
        return true;
    }
    DsdText t = dsd_vm_error_begin(vm, DSD_R_ASSERT);
    dsd_text_str(&t, "Assertion failed: ");
    if (argc > 1) dsd_value_format(vm, args[1], &t);
    else dsd_text_str(&t, "the condition was false");
    return false;
}
