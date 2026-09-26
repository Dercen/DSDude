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
//
// Two dispatch paths share one handler source (vm_run.h, included twice): direct threading over pre-decoded cells
// (the default: each cell holds its handler's address) and the plain dispatch over CODE words (the fallback for a
// module too big for C13 predecodeBytes). Both must print identical goldens; the host tests run every one on both.
#pragma GCC optimize("no-gcse", "no-crossjumping")

#include <stdlib.h>
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

// The pre-decoded code (see "Pre-decoding" below): built by dsd_vm_init, shared by the one VM that runs.
static const DsdCell *predecode(const DsdProgram *prog);

void dsd_vm_init(DsdVm *vm, const DsdProgram *prog, DsdValue *reg_stack) {
    vm->prog = prog;
    vm->cells = predecode(prog); // NULL: this module runs on the plain dispatch
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
// Dispatch cost on the ARM946E-S (WS3's M1 benchmark). Plain path: the handler table used to be a `static const`
// array, which GCC places in .rodata (main RAM), and its address came from a literal pool at every dispatch, so each
// opcode paid two main-RAM loads before the jump. Now the table lives in DTCM (C11 DSD_DTCM_DATA: one-cycle loads),
// filled once from the .rodata initialiser (label addresses exist only inside the function, so it cannot be
// initialised statically), and its base is held in a register for the whole run (see dispatch_base in vm_run.h).
// Threaded path: no table at all; the cell already holds the handler's address (the opcode mask and the table load
// leave every dispatch).
static const void *g_dispatch[DSD_OPCODE_COUNT] DSD_DTCM_DATA;
// run_threaded's label table, handed out by run_threaded(NULL, 0, 0) for the pre-decoder.
static const void *const *g_thread_labels;

// The slot cells of vm->self, or NULL when there is none (GETSLOT/SETSLOT's cached base).
#define SELF_SLOTS(vm) ((vm)->self != DSD_VM_NO_INST ? dsd_instances.pool[(vm)->self].slots : (DsdValue *)0)

// Keeps `p` in a register (or a DTCM stack slot) across the handlers: the empty asm hides where the value came
// from, so the compiler cannot re-materialise it from a literal pool at each use. No code is emitted.
#define DSD_OPAQUE(p) __asm__("" : "+r"(p))

// The threaded interpreter: ITCM on the DS (the hot path).
#define VM_RUN_THREADED 1
#define VM_RUN_NAME run_threaded
#define VM_RUN_ATTR DSD_ITCM_CODE
#include "vm_run.h"
#undef VM_RUN_THREADED
#undef VM_RUN_NAME
#undef VM_RUN_ATTR

// The plain interpreter: main RAM (the fallback for modules over the predecode budget; ITCM is 32 KB).
#define VM_RUN_THREADED 0
#define VM_RUN_NAME run_plain
#define VM_RUN_ATTR
#include "vm_run.h"
#undef VM_RUN_THREADED
#undef VM_RUN_NAME
#undef VM_RUN_ATTR

#undef SELF_SLOTS

// ---- Pre-decoding -----------------------------------------------------------------------------------------------
// The cells live on the heap, sized to the module (C13 predecodeBytes caps them; WS0's M1 decision, 2026-09-26): a
// deliberate exception to "big buffers are static", so a small game does not hold the whole budget. One array serves
// the one running VM; each dsd_vm_init frees the previous program's cells and builds the new ones.

static DsdCell *g_cells;                                   // the pre-decoded code, or NULL (plain path)
static uint32_t g_cells_count;                             // cells in g_cells: one per instruction
static uint32_t g_predecode_limit = DSD_PREDECODE_CELLS_MAX; // dsd_vm_predecode_limit (0: always plain)

// Builds the cells for prog: word i becomes {run_threaded's label for its opcode, word i}. NULL (plain path) when the
// module needs more cells than the limit allows or the allocation fails. The loader has verified every word, so each
// opcode has a label, and every jump lands on an instruction, so the threaded path never reads past the last cell
// (it does not prefetch; vm_run.h).
static const DsdCell *predecode(const DsdProgram *prog) {
    free(g_cells);
    g_cells = NULL;
    g_cells_count = 0;
    uint32_t need = prog->code_count;
    if (need == 0 || need > g_predecode_limit) return NULL; // malloc(0) need not return a usable block
    DsdCell *cells = malloc((size_t)need * sizeof *cells);
    if (cells == NULL) return NULL;
    if (g_thread_labels == NULL) run_threaded(NULL, 0, 0); // fetch the label table once
    for (uint32_t i = 0; i < prog->code_count; i++) {
        cells[i].handler = g_thread_labels[DSD_OP(prog->code[i])];
        cells[i].ins = prog->code[i];
    }
    g_cells = cells;
    g_cells_count = need;
    return cells;
}

void dsd_vm_predecode_limit(uint32_t cells) {
    g_predecode_limit = cells < DSD_PREDECODE_CELLS_MAX ? cells : DSD_PREDECODE_CELLS_MAX;
}

uint32_t dsd_vm_predecode_bytes(const DsdVm *vm) {
    return vm->cells != NULL ? g_cells_count * DSD_PREDECODE_CELL_BYTES : 0u;
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
    int32_t rc = vm->cells != NULL ? run_threaded(vm, func, base) : run_plain(vm, func, base);
    *result = rc == DSD_R_NONE && !vm->halted ? vm->regs[base] : dsd_undef();
    vm->top = saved_top;
    return rc;
}
