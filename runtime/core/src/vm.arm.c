// vm.arm.c: the register VM (PLAN.md 2.3, 3.3; contracts/dsdb.md sections 5-6).
//
// Computed-goto dispatch: each handler ends with its own indirect jump. On the DS the BlocksDS `*.arm.c` rule
// compiles this file in ARM mode and the hot loop sits in ITCM (DSD_ITCM_CODE); on the host both attributes are
// empty. GCC's GCSE and cross-jumping would merge the handlers' dispatch jumps back into one, hurting branch
// prediction and ITCM layout, so both are off for this file.
//
// The loader has verified every instruction (registers, constants, jumps, builtins, globals, callees), so the
// handlers index without bounds checks. The watchdog (R510 past 200,000 steps per frame) counts every step exactly,
// but settles the count only at control transfers: code between two transfers runs in sequence, so the steps it took
// are `ip - seg`, where `seg` is where that straight run began (see TRANSFER below). An endless loop always
// transfers, so it is still caught; only the moment of the stop moves, from the exact 200,001st step to the next
// jump, call or return (at most one straight run later). DSD|STAT's and the traces' `ops` stay exact. CALLN
// hands a builtin the budget unsettled (see op_CALLN).
#pragma GCC optimize("no-gcse", "no-crossjumping")

#include <string.h>

#include "builtins.h"
#include "dsd_arrays.h"
#include "dsd_strings.h"
#include "engine.h"
#include "dsd_log.h"
#include "dsd_platform.h"
#include "errors.h"
#include "number.h"
#include "opcodes.h"
#include "vm.h"

// ---- Setup ------------------------------------------------------------------------------------------------------

void dsd_vm_init(DsdVm *vm, const DsdProgram *prog, DsdValue *reg_stack) {
    vm->prog = prog;
    vm->regs = reg_stack;
    vm->top = 0;
    vm->depth = 0;
    memset(vm->globals, 0, sizeof vm->globals); // UNDEF cells
    memset(vm->global_set, 0, sizeof vm->global_set);
    vm->budget = DSD_RT_WATCHDOG_STEPS;
    vm->self = DSD_VM_NO_INST;
    vm->other = DSD_VM_NO_INST;
    vm->world = 0;
    vm->ev_id = DSD_VM_NO_EVENT;
    vm->ev_owner = 0;
    vm->debug = true;
    vm->halted = false;
    vm->err_code = DSD_R_NONE;
    vm->err_pc = 0;
    vm->err_msg[0] = '\0';
    vm->pc = 0;
    dsd_heap_reset(&vm->heap);
    vm->mark_extra = 0;
}

void dsd_vm_frame_reset(DsdVm *vm) { vm->budget = DSD_RT_WATCHDOG_STEPS; }

// ---- Slow paths (out of the hot loop) ---------------------------------------------------------------------------

// Verb used in "Can't <verb> <left> and <right>" (R540), per arithmetic opcode.
static const char *arith_verb(uint32_t op) {
    switch (op) {
    case DSD_OP_ADD:
        return "add";
    case DSD_OP_SUB:
        return "subtract";
    case DSD_OP_MUL:
        return "multiply";
    case DSD_OP_MOD:
        return "take the remainder of";
    case DSD_OP_CONCAT:
        return "join";
    default:
        return "divide";
    }
}

// Raises R540 for a binary operator given values it cannot combine.
static void bad_operands(DsdVm *vm, uint32_t op, DsdValue a, DsdValue b) {
    DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_OPERANDS);
    dsd_text_str(&t, "Can't ");
    dsd_text_str(&t, arith_verb(op));
    dsd_text_char(&t, ' ');
    dsd_text_str(&t, dsd_value_kind(a));
    dsd_text_str(&t, " and ");
    dsd_text_str(&t, dsd_value_kind(b));
}

// Turns a number-layer status into a runtime error when it is one (R540 for values that are not numbers).
static bool number_status(DsdVm *vm, int32_t st, DsdValue result, uint32_t op, DsdValue a, DsdValue b) {
    if (st == DSD_NUM_NOT_NUMBER) {
        bad_operands(vm, op, a, b);
        return false;
    }
    return dsd_vm_number_status(vm, st, result);
}

// ADD SUB MUL DIV IDIV MOD beyond the int+int fast path.
static bool arith_slow(DsdVm *vm, uint32_t op, DsdValue a, DsdValue b, DsdValue *out) {
    int32_t st;
    switch (op) {
    case DSD_OP_ADD:
        if (a.tag == DSD_TAG_STR && b.tag == DSD_TAG_STR) return dsd_str_concat(vm, a, b, out);
        st = dsd_num_add(a, b, out);
        break;
    case DSD_OP_SUB:
        st = dsd_num_sub(a, b, out);
        break;
    case DSD_OP_MUL:
        st = dsd_num_mul(a, b, out);
        break;
    case DSD_OP_DIV:
        st = dsd_num_div(a, b, out);
        break;
    case DSD_OP_IDIV:
        st = dsd_num_idiv(a, b, out);
        break;
    default:
        st = dsd_num_mod(a, b, out);
        break;
    }
    return number_status(vm, st, *out, op, a, b);
}

// Operator text for R541 messages, per comparison opcode.
static const char *compare_symbol(uint32_t op) {
    static const char *const symbols[] = {"<", "<=", ">", ">="};
    return symbols[op - DSD_OP_LT];
}

// LT LE GT GE: two strings by code point, or two numeric values; anything else is R541.
static bool ordered(DsdVm *vm, uint32_t op, DsdValue a, DsdValue b, DsdValue *out) {
    int32_t ord;
    if (a.tag == DSD_TAG_STR && b.tag == DSD_TAG_STR) {
        ord = dsd_str_compare(vm, a.payload, b.payload);
    } else if (dsd_num_cmp(a, b, &ord) != DSD_NUM_OK || a.tag == DSD_TAG_STR || b.tag == DSD_TAG_STR) {
        DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_COMPARE);
        dsd_text_str(&t, "Can't compare ");
        dsd_text_str(&t, dsd_value_kind(a));
        dsd_text_str(&t, " with ");
        dsd_text_str(&t, dsd_value_kind(b));
        dsd_text_str(&t, " using ");
        dsd_text_str(&t, compare_symbol(op));
        return false;
    }
    bool r;
    switch (op) {
    case DSD_OP_LT:
        r = ord < 0;
        break;
    case DSD_OP_LE:
        r = ord <= 0;
        break;
    case DSD_OP_GT:
        r = ord > 0;
        break;
    default:
        r = ord >= 0;
        break;
    }
    *out = dsd_bool(r);
    return true;
}

// GETGLOB of a global never assigned (R501).
static void unset_global(DsdVm *vm, uint32_t index) {
    uint32_t len;
    DsdText t = dsd_vm_error_begin(vm, DSD_R_UNSET_GLOBAL);
    dsd_text_str(&t, "global.");
    dsd_text_str(&t, dsd_prog_str(vm->prog, vm->prog->glob_names[index], &len));
    dsd_text_str(&t, " was never given a value");
}

// Call nesting beyond the register stack or the call-record table (R511).
static void too_deep(DsdVm *vm) {
    DsdText t = dsd_vm_error_begin(vm, DSD_R_CALL_DEPTH);
    dsd_text_str(&t, "Too many functions were called inside each other in ");
    dsd_describe_code(vm, vm->pc, &t);
}

// The watchdog fired (R510).
static void watchdog(DsdVm *vm) {
    DsdText t = dsd_vm_error_begin(vm, DSD_R_WATCHDOG);
    dsd_describe_code(vm, vm->pc, &t);
    dsd_text_str(&t, " never finished: a loop there seems to run forever");
}

// CMPJ relations (provisional, proposed by WS2): C = 0 ==, 1 !=, 2 <, 3 <=, 4 >, 5 >=.
#define REL_EQ 0u
#define REL_NE 1u
#define REL_LT 2u
#define REL_LE 3u
#define REL_GT 4u

// CMPJ beyond the int fast path: equality by the language's `==`, orderings as LT..GE (R541 when unordered).
static bool relation_holds(DsdVm *vm, uint32_t rel, DsdValue a, DsdValue b, bool *holds) {
    if (rel == REL_EQ || rel == REL_NE) {
        *holds = dsd_values_equal(vm, a, b) == (rel == REL_EQ);
        return true;
    }
    DsdValue r;
    if (!ordered(vm, DSD_OP_LT + (rel - REL_LT), a, b, &r)) return false;
    *holds = r.payload != 0;
    return true;
}

// ---- Lists and conversions (slow paths of NEWARR GETIDX SETIDX LEN TOINT TOFIXED) -------------------------------

// Raises R551: `what` ("[]", "a list length") used on a value that is not a list.
static void not_a_list(DsdVm *vm, const char *what, DsdValue v) {
    DsdText t = dsd_vm_error_begin(vm, DSD_R_NOT_A_LIST);
    dsd_text_str(&t, "Can't use ");
    dsd_text_str(&t, what);
    dsd_text_str(&t, " on ");
    dsd_text_str(&t, dsd_value_kind(v));
    dsd_text_str(&t, ": it is not a list");
}

// A list position from a number (fixed values floor, language.md section 4); R551 for anything else.
static bool list_index(DsdVm *vm, DsdValue v, int64_t *out) {
    if (!dsd_is_number(v)) {
        not_a_list(vm, "a list position of", v);
        return false;
    }
    *out = dsd_is_int(v) ? v.payload : dsd_fx_floor(v.payload);
    return true;
}

// Raises R550 for position i of a list of `len` elements.
static void index_range(DsdVm *vm, int64_t i, uint32_t len) {
    DsdText t = dsd_vm_error_begin(vm, DSD_R_INDEX_RANGE);
    dsd_text_str(&t, "Position ");
    dsd_text_int(&t, (int32_t)i);
    dsd_text_str(&t, " is outside the list (it has ");
    dsd_text_uint(&t, len);
    dsd_text_str(&t, len == 1 ? " item)" : " items)");
}

// NEWARR: a new array of the n values at first[0..n), stored in first[0] (the values are registers: rooted).
static bool new_array(DsdVm *vm, DsdValue *first, uint32_t n) {
    DsdValue arr;
    if (!dsd_arr_new(vm, n, &arr)) return false;
    DsdValue *cells = dsd_arr_cells(vm, arr);
    for (uint32_t i = 0; i < n; i++) cells[i] = first[i];
    first[0] = arr;
    return true;
}

// GETIDX: *out = arr[idx].
static bool get_index(DsdVm *vm, DsdValue arr, DsdValue idx, DsdValue *out) {
    int64_t i;
    if (arr.tag != DSD_TAG_ARR) {
        not_a_list(vm, "[]", arr);
        return false;
    }
    if (!list_index(vm, idx, &i)) return false;
    uint32_t len = dsd_arr_len(vm, arr);
    if (i < 0 || i >= len) {
        index_range(vm, i, len);
        return false;
    }
    *out = dsd_arr_cells_c(vm, arr)[i];
    return true;
}

// SETIDX: (*target)[idx] = v, growing the list; an undefined target first becomes a new empty list (WS4's ADR-0005).
static bool set_index(DsdVm *vm, DsdValue *target, DsdValue idx, DsdValue v) {
    int64_t i;
    if (target->tag == DSD_TAG_UNDEF && !dsd_arr_new(vm, 0, target)) return false;
    if (target->tag != DSD_TAG_ARR) {
        not_a_list(vm, "[]", *target);
        return false;
    }
    if (!list_index(vm, idx, &i)) return false;
    if (i < 0) {
        index_range(vm, i, dsd_arr_len(vm, *target));
        return false;
    }
    return dsd_arr_set(vm, *target, i > (int64_t)UINT32_MAX ? UINT32_MAX : (uint32_t)i, v);
}

// LEN: elements of a list, characters (code points) of a string.
static bool length_of(DsdVm *vm, DsdValue v, DsdValue *out) {
    if (v.tag == DSD_TAG_ARR) {
        *out = dsd_int((int32_t)dsd_arr_len(vm, v));
        return true;
    }
    if (v.tag == DSD_TAG_STR) {
        uint32_t len;
        const char *s = dsd_str_bytes(vm, v.payload, &len);
        *out = dsd_int((int32_t)dsd_utf8_count(s, len));
        return true;
    }
    not_a_list(vm, "a length", v);
    return false;
}

// TOINT (floor) and TOFIXED: numbers only.
static bool convert(DsdVm *vm, bool to_fixed, DsdValue v, DsdValue *out) {
    if (!dsd_is_number(v)) {
        DsdText t = dsd_vm_error_begin(vm, DSD_R_BAD_OPERANDS);
        dsd_text_str(&t, "Can't turn ");
        dsd_text_str(&t, dsd_value_kind(v));
        dsd_text_str(&t, " into a number");
        return false;
    }
    if (!to_fixed) {
        *out = dsd_int(dsd_is_int(v) ? v.payload : dsd_fx_floor(v.payload));
        return true;
    }
    if (dsd_is_real(v)) {
        *out = v;
        return true;
    }
    int64_t q = (int64_t)v.payload * DSD_FX_ONE;
    *out = dsd_real(dsd_lo32(q));
    return dsd_vm_number_status(vm, dsd_fits32(q) ? DSD_NUM_OK : DSD_NUM_OVERFLOW, *out);
}

// ---- Instances (slow paths of GETSLOT.. SETBIO, WITH*) ---------------------------------------------------------

// Targets of SETDYN/SETBIO (an object's instances); never used re-entrantly (setting runs no script).
static uint16_t g_targets[DSD_C13_INSTANCES_MAX];

static const char *sym_name(const DsdVm *vm, uint32_t sym) {
    uint32_t len;
    return dsd_prog_str(vm->prog, vm->prog->sym_names[sym], &len);
}

// Raises R500: variable `name` of instance idx was never given a value.
static void unset_var(DsdVm *vm, uint32_t idx, const char *name) {
    uint32_t len;
    DsdText t = dsd_vm_error_begin(vm, DSD_R_UNSET_VAR);
    dsd_text_str(&t, name);
    dsd_text_str(&t, " was never given a value in ");
    dsd_text_str(&t, dsd_prog_str(vm->prog, vm->world->objects[dsd_inst_at(idx)->object].name_str, &len));
}

// Raises R502 for self/other slot access with no instance (the compiler never emits it in program form).
static void no_instance(DsdVm *vm) { dsd_vm_error(vm, DSD_R_NO_INSTANCE, "There is no instance here to hold that variable"); }

// The symbol that has slot `slot` in instance idx's object layout (for messages), or "a variable".
static const char *slot_name(const DsdVm *vm, uint32_t idx, uint32_t slot) {
    const DsdObject *o = &vm->world->objects[dsd_inst_at(idx)->object];
    for (uint32_t k = 0; k < o->slot_count; k++) {
        if (o->slots[2 * k + 1] == slot) return sym_name(vm, o->slots[2 * k]);
    }
    return "a variable";
}

// GETSLOT/GETSLOTO after the fast path missed: no instance, or a slot never assigned.
static bool get_slot(DsdVm *vm, uint32_t idx, uint32_t slot, DsdValue *out) {
    if (idx == DSD_VM_NO_INST) {
        no_instance(vm);
        return false;
    }
    DsdValue v = dsd_inst_at(idx)->slots[slot];
    if (v.tag == DSD_TAG_UNSET) {
        unset_var(vm, idx, slot_name(vm, idx, slot));
        return false;
    }
    *out = v;
    return true;
}

// The cell of variable `sym` in instance idx: its slot, or its overflow entry (created when `create`).
static DsdValue *dyn_cell(const DsdVm *vm, uint32_t idx, uint32_t sym, bool create) {
    int32_t slot = dsd_world_slot(vm->world, dsd_inst_at(idx)->object, sym);
    return slot >= 0 ? &dsd_inst_at(idx)->slots[slot] : dsd_inst_overflow(idx, sym, create);
}

// GETDYN: rA = variable `sym` of the instance a target names.
static bool get_dyn(DsdVm *vm, DsdValue target, uint32_t sym, DsdValue *out) {
    uint32_t idx = dsd_engine_target_one(target, sym_name(vm, sym));
    if (idx == DSD_NO_INST) return false;
    const DsdValue *cell = dyn_cell(vm, idx, sym, false);
    if (cell == 0 || cell->tag == DSD_TAG_UNSET) {
        unset_var(vm, idx, sym_name(vm, sym));
        return false;
    }
    *out = *cell;
    return true;
}

// The instances a write goes to: an object writes every instance of it (none is fine); an id or self/other that
// names nothing is R502.
static uint32_t write_targets(DsdValue target, const char *name) {
    uint32_t n = dsd_engine_targets(target, g_targets, DSD_C13_INSTANCES_MAX);
    if (n == 0 && target.tag != DSD_TAG_ASSET) dsd_engine_target_one(target, name); // raises R502
    return n;
}

// SETDYN: variable `sym` = v on every instance the target names.
static bool set_dyn(DsdVm *vm, DsdValue target, uint32_t sym, DsdValue v) {
    uint32_t n = write_targets(target, sym_name(vm, sym));
    if (n == 0) return vm->err_code == DSD_R_NONE || target.tag == DSD_TAG_ASSET;
    for (uint32_t i = 0; i < n; i++) {
        DsdValue *cell = dyn_cell(vm, g_targets[i], sym, true);
        if (cell == 0) {
            uint32_t len;
            DsdText t = dsd_vm_error_begin(vm, DSD_R_TOO_MANY_VARS);
            dsd_text_str(&t, dsd_prog_str(vm->prog, vm->world->objects[dsd_inst_at(g_targets[i])->object].name_str, &len));
            dsd_text_str(&t, " got more than 8 variables from outside its own code");
            return false;
        }
        *cell = v;
    }
    return true;
}

// Built-in variable names (for messages), from the generated table.
#define DSD_BV_NAME_(index, name, global, readonly, array_len) [index] = #name,
static const char *const BIVAR_NAMES[DSD_BUILTIN_VAR_COUNT] = {DSD_BUILTIN_VARS(DSD_BV_NAME_)};
#undef DSD_BV_NAME_

// SETBIO: built-in variable `var` = v on every instance the target names.
static bool set_bio(DsdValue target, uint32_t var, DsdValue v) {
    uint32_t n = write_targets(target, BIVAR_NAMES[var]);
    for (uint32_t i = 0; i < n; i++) {
        if (!dsd_bivar_set(g_targets[i], var, 0, v)) return false;
    }
    return n != 0 || target.tag == DSD_TAG_ASSET;
}

// The element index of GETBIX/SETBIX: a number, floored.
static bool element(DsdVm *vm, DsdValue v, int32_t *out) {
    int64_t i;
    if (!list_index(vm, v, &i)) return false;
    *out = (int32_t)i;
    return true;
}

// Sets up the frame of `func` at register `base`: parameters already in place, the other registers cleared to
// undefined so no stale value leaks into `var` declarations. False (R511) when the frame does not fit.
static bool enter_frame(DsdVm *vm, uint32_t func, uint32_t base) {
    const DsdFuncRec *fn = &vm->prog->funcs[func];
    if (base + fn->regs > DSD_RT_REG_STACK_CELLS) {
        too_deep(vm);
        return false;
    }
    for (uint32_t r = fn->params; r < fn->regs; r++) vm->regs[base + r] = dsd_undef();
    vm->top = base + fn->regs;
    return true;
}

// ---- The interpreter --------------------------------------------------------------------------------------------

// Runs from `func` at register `base` until the entry frame returns (DSD_R_NONE), HALT runs (DSD_R_NONE with
// vm->halted), or an error is raised (its code). The entry frame is already set up by enter_frame.
//
// Dispatch cost on the ARM946E-S (WS3's M1 benchmark): the handler table used to be a `static const` array, which
// GCC places in .rodata (main RAM), and its address came from a literal pool at every dispatch, so each opcode paid
// two main-RAM loads before the jump. Now the table lives in DTCM (C11 DSD_DTCM_DATA: one-cycle loads), filled once
// from the .rodata initialiser (label addresses exist only inside run(), so it cannot be initialised statically),
// and its base is held in a register for the whole run (see dispatch_base below).
static const void *g_dispatch[DSD_OPCODE_COUNT] DSD_DTCM_DATA;

// The slot cells of vm->self, or NULL when there is none (GETSLOT/SETSLOT's cached base).
#define SELF_SLOTS(vm) ((vm)->self != DSD_VM_NO_INST ? dsd_instances.pool[(vm)->self].slots : (DsdValue *)0)

// Keeps `p` in a register (or a DTCM stack slot) across the handlers: the empty asm hides where the value came
// from, so the compiler cannot re-materialise it from a literal pool at each use. No code is emitted.
#define DSD_OPAQUE(p) __asm__("" : "+r"(p))

DSD_ITCM_CODE static int32_t run(DsdVm *vm, uint32_t func, uint32_t base) {
    // One label per opcode number; unimplemented numbers never reach dispatch (the loader refuses them). This is
    // only the initialiser of g_dispatch, copied on the first run (HALT's slot is never empty once filled).
    static const void *const labels[DSD_OPCODE_COUNT] = {
        [DSD_OP_HALT] = &&op_HALT,       [DSD_OP_MOV] = &&op_MOV,         [DSD_OP_LOADK] = &&op_LOADK,
        [DSD_OP_LOADI] = &&op_LOADI,     [DSD_OP_LOADB] = &&op_LOADB,     [DSD_OP_LOADUNDEF] = &&op_LOADUNDEF,
        [DSD_OP_ADD] = &&op_ADD,         [DSD_OP_SUB] = &&op_SUB,         [DSD_OP_MUL] = &&op_MUL,
        [DSD_OP_DIV] = &&op_ARITH,       [DSD_OP_IDIV] = &&op_ARITH,      [DSD_OP_MOD] = &&op_ARITH,
        [DSD_OP_NEG] = &&op_NEG,         [DSD_OP_EQ] = &&op_EQ,           [DSD_OP_NE] = &&op_NE,
        [DSD_OP_LT] = &&op_ORDER,        [DSD_OP_LE] = &&op_ORDER,        [DSD_OP_GT] = &&op_ORDER,
        [DSD_OP_GE] = &&op_ORDER,        [DSD_OP_NOT] = &&op_NOT,         [DSD_OP_JMP] = &&op_JMP,
        [DSD_OP_JMPT] = &&op_JMPT,       [DSD_OP_JMPF] = &&op_JMPF,       [DSD_OP_CALLN] = &&op_CALLN,
        [DSD_OP_RET] = &&op_RET,         [DSD_OP_CONCAT] = &&op_CONCAT,   [DSD_OP_TOSTR] = &&op_TOSTR,
        [DSD_OP_GETGLOB] = &&op_GETGLOB, [DSD_OP_SETGLOB] = &&op_SETGLOB, [DSD_OP_CALL] = &&op_CALL,
        [DSD_OP_ADDI] = &&op_ARITHI,     [DSD_OP_SUBI] = &&op_ARITHI,     [DSD_OP_MULI] = &&op_ARITHI,
        [DSD_OP_NEWARR] = &&op_NEWARR,   [DSD_OP_GETIDX] = &&op_GETIDX,   [DSD_OP_SETIDX] = &&op_SETIDX,
        [DSD_OP_LEN] = &&op_LEN,         [DSD_OP_TOINT] = &&op_TOINT,     [DSD_OP_TOFIXED] = &&op_TOFIXED,
        [DSD_OP_GETSLOT] = &&op_GETSLOT, [DSD_OP_SETSLOT] = &&op_SETSLOT, [DSD_OP_GETSLOTO] = &&op_GETSLOTO,
        [DSD_OP_SETSLOTO] = &&op_SETSLOTO, [DSD_OP_GETDYN] = &&op_GETDYN, [DSD_OP_SETDYN] = &&op_SETDYN,
        [DSD_OP_GETBI] = &&op_GETBI,     [DSD_OP_SETBI] = &&op_SETBI,     [DSD_OP_GETBIX] = &&op_GETBIX,
        [DSD_OP_SETBIX] = &&op_SETBIX,   [DSD_OP_GETBIO] = &&op_GETBIO,   [DSD_OP_SETBIO] = &&op_SETBIO,
        [DSD_OP_WITHBEGIN] = &&op_WITHBEGIN, [DSD_OP_WITHNEXT] = &&op_WITHNEXT, [DSD_OP_WITHEND] = &&op_WITHEND,
        [DSD_OP_CMPJ] = &&op_CMPJ,         [DSD_OP_ADDII] = &&op_ADDII,     [DSD_OP_SUBII] = &&op_SUBII,
        [DSD_OP_MULII] = &&op_MULII,       [DSD_OP_CMPJII] = &&op_CMPJII,
    };
    if (g_dispatch[DSD_OP_HALT] == NULL) memcpy(g_dispatch, labels, sizeof labels);
    const void *const *dispatch_base = g_dispatch;
    DSD_OPAQUE(dispatch_base);
    const DsdProgram *prog = vm->prog;
    const uint32_t *const code = prog->code;
    const DsdValue *const kons = prog->kons;
    const uint32_t entry_depth = vm->depth;
    const uint32_t *ip = code + prog->funcs[func].code_start;
    // The word at ip, fetched one dispatch early (software pipelining: its load overlaps the jump to the current
    // handler instead of stalling the next dispatch). Every assignment to ip reloads it. At a function's last
    // instruction this reads one word past it, which is still inside the DSDB (CODE is never the last section);
    // that word is never executed.
    uint32_t next = *ip;
    DsdValue *R = vm->regs + base; // the running frame's r0
    // self's slot cells (NULL without a self): GETSLOT/SETSLOT index it directly instead of reloading vm->self and
    // locating the instance block each time. vm->self changes inside run() only through the `with` opcodes (which
    // refresh this); builtins that run events restore it before returning, and error paths leave run().
    DsdValue *self_slots = SELF_SLOTS(vm);
    int32_t budget = (int32_t)vm->budget; // steps left this frame, settled at transfers (never more than 200,000)
    const uint32_t *seg = ip;              // the first step of the current straight run, not yet charged
    uint32_t ins;
    DsdValue a;
    DsdValue b;
    int32_t r;

// Fetch the next instruction and jump to its handler. No per-step work: the step is charged at the next transfer.
#define DISPATCH()                                                                                                     \
    do {                                                                                                               \
        ins = next;                                                                                                    \
        next = *++ip;                                                                                                  \
        goto *dispatch_base[DSD_OP(ins)];                                                                              \
    } while (0)
// Charge the steps of the straight run that ends here (the running instruction included); R510 when the frame's
// budget is spent. Every non-sequential change of ip and every return of the budget to the caller goes through it
// (a builtin gets it unsettled: see op_CALLN).
#define SETTLE()                                                                                                       \
    do {                                                                                                               \
        budget -= (int32_t)(ip - seg);                                                                                 \
        seg = ip;                                                                                                      \
        if (budget < 0) goto watchdog_fired;                                                                           \
    } while (0)
// Settle, then continue at `target`, where the next straight run begins.
#define TRANSFER(target)                                                                                               \
    do {                                                                                                               \
        SETTLE();                                                                                                      \
        ip = (target);                                                                                                 \
        next = *ip;                                                                                                    \
        seg = ip;                                                                                                      \
    } while (0)
// A relative jump by d instructions from the next one. Forward (d >= 0) the skipped instructions never run, so
// moving `seg` by the same d keeps `ip - seg` exact with no settling (and no loop can run forward only); backward
// jumps, the only way to loop, settle and check the budget.
#define JUMP_BY(d)                                                                                                     \
    do {                                                                                                               \
        int32_t d_ = (d);                                                                                              \
        if (d_ >= 0) {                                                                                                 \
            ip += d_;                                                                                                  \
            seg += d_;                                                                                                 \
            next = *ip;                                                                                                \
        } else {                                                                                                       \
            TRANSFER(ip + d_);                                                                                         \
        }                                                                                                              \
    } while (0)
// The end of CMPJ/CMPJII: when the relation holds, skip the JMP that follows (it never runs); otherwise run that JMP
// here, from the prefetched word, instead of dispatching to it: it counts as a step, then jumps.
#define CMPJ_END(holds)                                                                                                \
    do {                                                                                                               \
        if (holds) {                                                                                                   \
            JUMP_BY(1);                                                                                                \
        } else {                                                                                                       \
            uint32_t jmp_ = next;                                                                                      \
            ip++;                                                                                                      \
            JUMP_BY(DSD_SBX(jmp_));                                                                                    \
        }                                                                                                              \
    } while (0)
// Record the running instruction's code index for errors and builtins (ip already points past it).
#define SYNC_PC() (vm->pc = (uint32_t)(ip - 1 - code))
#define RA R[DSD_A(ins)]
#define RB R[DSD_B(ins)]
#define RC R[DSD_C(ins)]

    DISPATCH();

op_HALT:
    SETTLE();
    vm->halted = true;
    vm->budget = (uint32_t)budget;
    vm->depth = entry_depth;
    return DSD_R_NONE;

op_MOV:
    RA = RB;
    DISPATCH();

op_LOADK:
    RA = kons[DSD_BX(ins)];
    DISPATCH();

op_LOADI:
    RA = dsd_int(DSD_SBX(ins));
    DISPATCH();

op_LOADB:
    RA = dsd_bool(DSD_B(ins) != 0);
    DISPATCH();

op_LOADUNDEF:
    RA = dsd_undef();
    DISPATCH();

// ADD/SUB/MUL: int32 fast path (overflow still checked), everything else through arith_slow.
op_ADD:
    a = RB;
    b = RC;
    if (a.tag == DSD_TAG_INT && b.tag == DSD_TAG_INT && !dsd_add_ovf(a.payload, b.payload, &r)) {
        RA = dsd_int(r);
        DISPATCH();
    }
    goto arith_slow_path;

op_SUB:
    a = RB;
    b = RC;
    if (a.tag == DSD_TAG_INT && b.tag == DSD_TAG_INT && !dsd_sub_ovf(a.payload, b.payload, &r)) {
        RA = dsd_int(r);
        DISPATCH();
    }
    goto arith_slow_path;

op_MUL:
    a = RB;
    b = RC;
    if (a.tag == DSD_TAG_INT && b.tag == DSD_TAG_INT && !dsd_mul_ovf(a.payload, b.payload, &r)) {
        RA = dsd_int(r);
        DISPATCH();
    }
    goto arith_slow_path;

op_ARITH: // DIV IDIV MOD
    a = RB;
    b = RC;
arith_slow_path:
    SYNC_PC();
    if (!arith_slow(vm, DSD_OP(ins), a, b, &RA)) goto failed;
    DISPATCH();

op_NEG:
    a = RB;
    if (a.tag == DSD_TAG_INT && !dsd_sub_ovf(0, a.payload, &r)) {
        RA = dsd_int(r);
        DISPATCH();
    }
    SYNC_PC();
    if (!number_status(vm, dsd_num_neg(a, &RA), RA, DSD_OP_SUB, dsd_int(0), a)) goto failed;
    DISPATCH();

op_EQ:
    RA = dsd_bool(dsd_values_equal(vm, RB, RC));
    DISPATCH();

op_NE:
    RA = dsd_bool(!dsd_values_equal(vm, RB, RC));
    DISPATCH();

op_ORDER: // LT LE GT GE
    a = RB;
    b = RC;
    if (a.tag == DSD_TAG_INT && b.tag == DSD_TAG_INT) {
        switch (DSD_OP(ins)) {
        case DSD_OP_LT:
            RA = dsd_bool(a.payload < b.payload);
            break;
        case DSD_OP_LE:
            RA = dsd_bool(a.payload <= b.payload);
            break;
        case DSD_OP_GT:
            RA = dsd_bool(a.payload > b.payload);
            break;
        default:
            RA = dsd_bool(a.payload >= b.payload);
            break;
        }
        DISPATCH();
    }
    SYNC_PC();
    if (!ordered(vm, DSD_OP(ins), a, b, &RA)) goto failed;
    DISPATCH();

op_NOT:
    RA = dsd_bool(!dsd_truthy(RB));
    DISPATCH();

op_JMP:
    JUMP_BY(DSD_SBX(ins));
    DISPATCH();

op_JMPT:
    if (dsd_truthy(RA)) JUMP_BY(DSD_SBX(ins));
    DISPATCH();

op_JMPF:
    if (!dsd_truthy(RA)) JUMP_BY(DSD_SBX(ins));
    DISPATCH();

op_CALLN: {
    uint32_t bi = DSD_C(ins);
    DsdBuiltinFn fn = dsd_builtin_fn[bi]; // never NULL: the loader refuses unimplemented builtins (R582)
    SYNC_PC();
    // A builtin may run script code (events) that charges the same budget, so it gets the budget as it stands. The
    // steps of the current straight run are not settled here (that cost WS3 ~5 cycles per CALLN): `seg` stays, and
    // the next transfer charges them, so the count stays exact; a nested event only sees them one run later.
    vm->budget = (uint32_t)budget;
    if (!fn(vm, &RA, DSD_B(ins))) {
        // Stopped: an error, or HALT inside script code the builtin ran (builtins.h). Only this path looks.
        budget = (int32_t)vm->budget;
        if (vm->halted) goto halted_inside;
        goto failed;
    }
    budget = (int32_t)vm->budget;
    DISPATCH();
}

op_CALL: {
    uint32_t callee = DSD_BX(ins);
    uint32_t callee_base = (uint32_t)(R - vm->regs) + DSD_A(ins);
    SYNC_PC();
    if (vm->depth >= DSD_RT_CALL_DEPTH_MAX) {
        too_deep(vm);
        goto failed;
    }
    DsdCallFrame *f = &vm->frames[vm->depth];
    f->func = func;
    f->ret_pc = (uint32_t)(ip - code);
    f->base = (uint32_t)(R - vm->regs);
    if (!enter_frame(vm, callee, callee_base)) goto failed;
    vm->depth++;
    func = callee;
    R = vm->regs + callee_base;
    TRANSFER(code + prog->funcs[callee].code_start);
    DISPATCH();
}

op_RET:
    // The callee's r0 is the caller's rA, so the result lands in place.
    R[0] = DSD_B(ins) ? RA : dsd_undef();
    SETTLE();
    if (vm->depth == entry_depth) {
        vm->budget = (uint32_t)budget;
        return DSD_R_NONE;
    }
    {
        const DsdCallFrame *f = &vm->frames[--vm->depth];
        func = f->func;
        R = vm->regs + f->base;
        ip = code + f->ret_pc;
        next = *ip;
        seg = ip;
        vm->top = f->base + prog->funcs[func].regs;
    }
    DISPATCH();

op_CONCAT:
    a = RB;
    b = RC;
    SYNC_PC();
    if (a.tag != DSD_TAG_STR || b.tag != DSD_TAG_STR) {
        bad_operands(vm, DSD_OP_CONCAT, a, b);
        goto failed;
    }
    if (!dsd_str_concat(vm, a, b, &RA)) goto failed;
    DISPATCH();

op_TOSTR:
    SYNC_PC();
    if (!dsd_value_to_string(vm, RB, &RA)) goto failed;
    DISPATCH();

op_GETGLOB: {
    uint32_t g = DSD_BX(ins);
    if (!(vm->global_set[g >> 3] & (1u << (g & 7u)))) {
        SYNC_PC();
        unset_global(vm, g);
        goto failed;
    }
    RA = vm->globals[g];
    DISPATCH();
}

op_SETGLOB: {
    uint32_t g = DSD_BX(ins);
    vm->globals[g] = RA;
    vm->global_set[g >> 3] |= (uint8_t)(1u << (g & 7u));
    DISPATCH();
}

// ADDI SUBI MULI: rA = rB op C, C a signed 8-bit int. The three follow ADD SUB MUL's numbering (30-32 vs 6-8).
op_ARITHI: {
    uint32_t op = DSD_OP(ins) - DSD_OP_ADDI + DSD_OP_ADD;
    int32_t k = (int8_t)DSD_C(ins);
    a = RB;
    if (a.tag == DSD_TAG_INT) {
        bool ovf = op == DSD_OP_ADD   ? dsd_add_ovf(a.payload, k, &r)
                   : op == DSD_OP_SUB ? dsd_sub_ovf(a.payload, k, &r)
                                      : dsd_mul_ovf(a.payload, k, &r);
        if (!ovf) {
            RA = dsd_int(r);
            DISPATCH();
        }
    }
    SYNC_PC();
    if (!arith_slow(vm, op, a, dsd_int(k), &RA)) goto failed;
    DISPATCH();
}

op_NEWARR:
    SYNC_PC();
    if (!new_array(vm, &RA, DSD_B(ins))) goto failed;
    DISPATCH();

op_GETIDX:
    SYNC_PC();
    if (!get_index(vm, RB, RC, &RA)) goto failed;
    DISPATCH();

op_SETIDX:
    SYNC_PC();
    if (!set_index(vm, &RA, RB, RC)) goto failed;
    DISPATCH();

op_LEN:
    SYNC_PC();
    if (!length_of(vm, RB, &RA)) goto failed;
    DISPATCH();

op_TOINT:
    SYNC_PC();
    if (!convert(vm, false, RB, &RA)) goto failed;
    DISPATCH();

op_TOFIXED:
    SYNC_PC();
    if (!convert(vm, true, RB, &RA)) goto failed;
    DISPATCH();

// CMPJ rA, rB, rel; JMP L: when the relation holds, skip the JMP (fall into the guarded code); otherwise take it.
op_CMPJ: {
    bool holds;
    a = RA;
    b = RB;
    if (a.tag == DSD_TAG_INT && b.tag == DSD_TAG_INT) {
        switch (DSD_C(ins)) {
        case REL_EQ:
            holds = a.payload == b.payload;
            break;
        case REL_NE:
            holds = a.payload != b.payload;
            break;
        case REL_LT:
            holds = a.payload < b.payload;
            break;
        case REL_LE:
            holds = a.payload <= b.payload;
            break;
        case REL_GT:
            holds = a.payload > b.payload;
            break;
        default:
            holds = a.payload >= b.payload;
            break;
        }
    } else {
        SYNC_PC();
        if (!relation_holds(vm, DSD_C(ins), a, b, &holds)) goto failed;
    }
    CMPJ_END(holds); // the verifier guarantees a JMP follows
    DISPATCH();
}

// Int-specialised ADDII/SUBII/MULII rA, rB, rC and CMPJII (the M1 fallback, PLAN.md 8): the compiler emits them only
// when both operands are proven ints, so no tag is read. A wrong program can only get a wrong number here, never
// unsafe memory access (every register index was verified). Overflow still raises R520 in debug builds and wraps in
// release builds, like ADD/SUB/MUL.
op_ADDII:
    if (!dsd_add_ovf(RB.payload, RC.payload, &r)) {
        RA = dsd_int(r);
        DISPATCH();
    }
    goto int_overflow;

op_SUBII:
    if (!dsd_sub_ovf(RB.payload, RC.payload, &r)) {
        RA = dsd_int(r);
        DISPATCH();
    }
    goto int_overflow;

op_MULII:
    if (!dsd_mul_ovf(RB.payload, RC.payload, &r)) {
        RA = dsd_int(r);
        DISPATCH();
    }
    goto int_overflow;

int_overflow: // r holds the wrapped result (__builtin_*_overflow): an error in debug builds, the value in release
    SYNC_PC();
    if (!dsd_vm_number_status(vm, DSD_NUM_OVERFLOW, dsd_int(r))) goto failed;
    RA = dsd_int(r);
    DISPATCH();

// CMPJII rA, rB, rel; JMP L: CMPJ on two proven ints (payload comparison only).
op_CMPJII: {
    int32_t x = RA.payload;
    int32_t y = RB.payload;
    bool holds;
    switch (DSD_C(ins)) {
    case REL_EQ:
        holds = x == y;
        break;
    case REL_NE:
        holds = x != y;
        break;
    case REL_LT:
        holds = x < y;
        break;
    case REL_LE:
        holds = x <= y;
        break;
    case REL_GT:
        holds = x > y;
        break;
    default:
        holds = x >= y;
        break;
    }
    CMPJ_END(holds);
    DISPATCH();
}

// User variables of self/other by slot: the hot path reads the cell straight from the instance block.
op_GETSLOT:
    if (self_slots != 0) {
        a = self_slots[DSD_B(ins)];
        if (a.tag != DSD_TAG_UNSET) {
            RA = a;
            DISPATCH();
        }
    }
    SYNC_PC();
    if (!get_slot(vm, vm->self, DSD_B(ins), &RA)) goto failed;
    DISPATCH();

op_SETSLOT:
    if (self_slots == 0) {
        SYNC_PC();
        no_instance(vm);
        goto failed;
    }
    self_slots[DSD_B(ins)] = RA;
    DISPATCH();

op_GETSLOTO:
    SYNC_PC();
    if (!get_slot(vm, vm->other, DSD_B(ins), &RA)) goto failed;
    DISPATCH();

op_SETSLOTO:
    if (vm->other == DSD_VM_NO_INST) {
        SYNC_PC();
        no_instance(vm);
        goto failed;
    }
    dsd_instances.pool[vm->other].slots[DSD_B(ins)] = RA;
    DISPATCH();

op_GETDYN:
    SYNC_PC();
    if (!get_dyn(vm, RB, DSD_C(ins), &RA)) goto failed;
    DISPATCH();

op_SETDYN:
    SYNC_PC();
    if (!set_dyn(vm, RB, DSD_C(ins), RA)) goto failed;
    DISPATCH();

op_GETBI:
    SYNC_PC();
    if (!dsd_bivar_get(vm->self, DSD_BX(ins), 0, &RA)) goto failed;
    DISPATCH();

op_SETBI:
    SYNC_PC();
    if (!dsd_bivar_set(vm->self, DSD_BX(ins), 0, RA)) goto failed;
    DISPATCH();

op_GETBIX: {
    int32_t i;
    SYNC_PC();
    if (!element(vm, RC, &i) || !dsd_bivar_get(vm->self, DSD_B(ins), i, &RA)) goto failed;
    DISPATCH();
}

op_SETBIX: {
    int32_t i;
    SYNC_PC();
    if (!element(vm, RC, &i) || !dsd_bivar_set(vm->self, DSD_B(ins), i, RA)) goto failed;
    DISPATCH();
}

op_GETBIO: {
    SYNC_PC();
    uint32_t idx = dsd_engine_target_one(RB, BIVAR_NAMES[DSD_C(ins)]);
    if (idx == DSD_NO_INST || !dsd_bivar_get(idx, DSD_C(ins), 0, &RA)) goto failed;
    DISPATCH();
}

op_SETBIO:
    SYNC_PC();
    if (!set_bio(RB, DSD_C(ins), RA)) goto failed;
    DISPATCH();

// `with` (WS4's ADR-0005 shape): rA holds the target, then the loop's state until WITHEND.
op_WITHBEGIN: {
    bool empty;
    SYNC_PC();
    if (!dsd_with_begin(RA, &RA, &empty)) goto failed;
    self_slots = SELF_SLOTS(vm); // the loop's first instance (or the outer self when the loop is empty)
    if (empty) JUMP_BY(DSD_SBX(ins));
    DISPATCH();
}

op_WITHNEXT:
    if (dsd_with_next(RA)) JUMP_BY(DSD_SBX(ins));
    self_slots = SELF_SLOTS(vm); // the next instance, or the outer self again after the last one
    DISPATCH();

op_WITHEND:
    dsd_with_end(RA);
    self_slots = SELF_SLOTS(vm);
    DISPATCH();

watchdog_fired:
    budget = 0;                         // the frame's budget is spent
    vm->pc = (uint32_t)(ip - 1 - code); // the transfer that settled past the budget
    watchdog(vm);
    goto failed;

halted_inside:
    vm->budget = (uint32_t)budget;
    vm->depth = entry_depth;
    return DSD_R_NONE;

failed:
    budget -= (int32_t)(ip - seg); // the steps of the failing run still count (never below 0: ops stays sane)
    vm->budget = budget < 0 ? 0u : (uint32_t)budget;
    vm->depth = entry_depth;
    return vm->err_code;

#undef DISPATCH
#undef SELF_SLOTS
#undef SETTLE
#undef TRANSFER
#undef JUMP_BY
#undef CMPJ_END
#undef SYNC_PC
#undef RA
#undef RB
#undef RC
}

int32_t dsd_vm_call(DsdVm *vm, uint32_t func, const DsdValue *args, uint32_t argc, DsdValue *result) {
    uint32_t saved_top = vm->top;
    uint32_t base = vm->top;
    vm->err_code = DSD_R_NONE;
    vm->pc = vm->prog->funcs[func].code_start;
    if (base + argc > DSD_RT_REG_STACK_CELLS) {
        too_deep(vm);
        return vm->err_code;
    }
    for (uint32_t i = 0; i < argc; i++) vm->regs[base + i] = args[i];
    if (!enter_frame(vm, func, base)) return vm->err_code;
    int32_t rc = run(vm, func, base);
    *result = rc == DSD_R_NONE && !vm->halted ? vm->regs[base] : dsd_undef();
    vm->top = saved_top;
    return rc;
}
