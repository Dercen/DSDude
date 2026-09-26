// values.c: value operations shared by the VM and the builtins (vm.h): equality, kinds for messages, printing, and
// raising runtime errors.
#include <string.h>

#include "errors.h"
#include "number.h"
#include "numfmt.h"
#include "vm.h"

// ---- Errors -----------------------------------------------------------------------------------------------------

DsdText dsd_vm_error_begin(DsdVm *vm, int32_t code) {
    DsdText t;
    vm->err_code = code;
    vm->err_pc = vm->pc;
    dsd_text_init(&t, vm->err_msg, sizeof vm->err_msg);
    return t;
}

void dsd_vm_error(DsdVm *vm, int32_t code, const char *message) {
    DsdText t = dsd_vm_error_begin(vm, code);
    dsd_text_str(&t, message);
}

bool dsd_vm_number_status(DsdVm *vm, int32_t status, DsdValue result) {
    switch (status) {
    case DSD_NUM_OK:
        return true;
    case DSD_NUM_OVERFLOW:
        if (!vm->debug) return true;
        if (result.tag == DSD_TAG_INT) {
            dsd_vm_error(vm, DSD_R_INT_OVERFLOW, "A whole number got too big (past +-2147483647)");
        } else {
            dsd_vm_error(vm, DSD_R_FIXED_RANGE, "A number with a fraction got too big (past +-524287.99)");
        }
        return false;
    case DSD_NUM_DIV_ZERO:
        dsd_vm_error(vm, DSD_R_DIV_ZERO, "Can't divide by zero");
        return false;
    default:
        return false; // DSD_NUM_NOT_NUMBER: the caller words the message
    }
}

// ---- Equality and kinds -----------------------------------------------------------------------------------------

bool dsd_values_equal(const DsdVm *vm, DsdValue a, DsdValue b) {
    // Strings equal only strings, by content; a string never equals a number.
    if (a.tag == DSD_TAG_STR || b.tag == DSD_TAG_STR) {
        return a.tag == b.tag && dsd_str_compare(&vm->strings, vm->prog, a.payload, b.payload) == 0;
    }
    // undefined equals only undefined; arrays compare by reference.
    if (a.tag == DSD_TAG_UNDEF || b.tag == DSD_TAG_UNDEF) return a.tag == b.tag;
    if (a.tag == DSD_TAG_ARR || b.tag == DSD_TAG_ARR) return a.tag == b.tag && a.payload == b.payload;
    // Numbers, bools, instance ids and asset ids compare by numeric value.
    int64_t qa;
    int64_t qb;
    return dsd_num_view_q12(a, &qa) && dsd_num_view_q12(b, &qb) && qa == qb;
}

const char *dsd_value_kind(DsdValue v) {
    switch (v.tag) {
    case DSD_TAG_INT:
    case DSD_TAG_REAL:
        return "a number";
    case DSD_TAG_BOOL:
        return "true or false";
    case DSD_TAG_STR:
        return "text";
    case DSD_TAG_ARR:
        return "a list";
    case DSD_TAG_INST:
        return "an instance";
    case DSD_TAG_ASSET:
        return "an asset";
    default:
        return "undefined";
    }
}

// ---- Printing ---------------------------------------------------------------------------------------------------

// One formatted value on its way to becoming a string (main RAM, not the C stack; longer values are cut).
static char g_text_scratch[DSD_RT_TEXT_MAX];

bool dsd_value_to_string(DsdVm *vm, DsdValue v, DsdValue *out) {
    if (v.tag == DSD_TAG_STR) {
        *out = v;
        return true;
    }
    DsdText t;
    dsd_text_init(&t, g_text_scratch, sizeof g_text_scratch);
    dsd_value_format(vm, v, &t);
    if (dsd_str_make(&vm->strings, t.buf, t.len, "", 0, out)) return true;
    dsd_vm_error(vm, DSD_R_TEXT_MEMORY, "The game ran out of memory for text and lists");
    return false;
}

void dsd_value_format(const DsdVm *vm, DsdValue v, DsdText *t) {
    char num[DSD_NUMFMT_BUF];
    switch (v.tag) {
    case DSD_TAG_INT:
    case DSD_TAG_REAL:
        dsd_text_bytes(t, num, (uint32_t)dsd_fmt_number(v, num));
        break;
    case DSD_TAG_BOOL:
        dsd_text_str(t, v.payload ? "true" : "false");
        break;
    case DSD_TAG_STR: {
        uint32_t len;
        const char *bytes = dsd_str_bytes(&vm->strings, vm->prog, v.payload, &len);
        dsd_text_bytes(t, bytes, len);
        break;
    }
    case DSD_TAG_INST:
        dsd_text_int(t, v.payload);
        break;
    case DSD_TAG_ASSET:
        // Asset ids print as their index (contracts/dsdb.md section 3).
        dsd_text_int(t, (int32_t)((uint32_t)v.payload & DSD_ASSET_INDEX_MASK));
        break;
    case DSD_TAG_ARR:
        dsd_text_str(t, "[]"); // arrays arrive with arrays.c (task 4); no program can make one before that
        break;
    default:
        dsd_text_str(t, "undefined");
        break;
    }
}
