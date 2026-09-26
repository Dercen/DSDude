// vm.arm.c: the register VM (PLAN.md 2.3, 3.3; contracts/dsdb.md sections 5-6).
//
// Computed-goto dispatch: each handler ends with its own indirect jump. On the DS the BlocksDS `*.arm.c` rule
// compiles this file in ARM mode and the hot loop sits in ITCM (DSD_ITCM_CODE); on the host both attributes are
// empty. GCC's GCSE and cross-jumping would merge the handlers' dispatch jumps back into one, hurting branch
// prediction and ITCM layout, so both are off for this file.
//
// The loader has verified every instruction (registers, constants, jumps, builtins, globals, callees), so the
// handlers index without bounds checks. Every step decrements the watchdog budget (R510 past 200,000 per frame).
#pragma GCC optimize("no-gcse", "no-crossjumping")

#include <string.h>

#include "builtins.h"
#include "dsd_arrays.h"
#include "dsd_strings.h"
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
    vm->self = DSD_INST_NOONE;
    vm->other = DSD_INST_NOONE;
    vm->debug = true;
    vm->halted = false;
    vm->err_code = DSD_R_NONE;
    vm->err_pc = 0;
    vm->err_msg[0] = '\0';
    vm->pc = 0;
    dsd_heap_reset(&vm->heap);
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

// CALLN of a builtin this runtime build does not implement yet (R582).
static void missing_builtin(DsdVm *vm, uint32_t index) {
    DsdText t = dsd_vm_error_begin(vm, DSD_R_UNSUPPORTED);
    dsd_text_str(&t, "This game uses something this DSDude runtime can't do yet (");
    dsd_text_str(&t, dsd_builtin_info[index].name);
    dsd_text_char(&t, ')');
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

// SETIDX: (*target)[idx] = v, growing the list; an undefined target first becomes a new empty list (ADR-0003).
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
DSD_ITCM_CODE static int32_t run(DsdVm *vm, uint32_t func, uint32_t base) {
    // One label per opcode number; unimplemented numbers never reach dispatch (the loader refuses them).
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
    };
    const DsdProgram *prog = vm->prog;
    const uint32_t *const code = prog->code;
    const DsdValue *const kons = prog->kons;
    const uint32_t entry_depth = vm->depth;
    const uint32_t *ip = code + prog->funcs[func].code_start;
    DsdValue *R = vm->regs + base; // the running frame's r0
    uint32_t budget = vm->budget;
    uint32_t ins;
    DsdValue a;
    DsdValue b;
    int32_t r;

// Fetch the next instruction and jump to its handler, after charging one watchdog step.
#define DISPATCH()                                                                                                     \
    do {                                                                                                               \
        if (budget-- == 0) goto watchdog_fired;                                                                        \
        ins = *ip++;                                                                                                   \
        goto *labels[DSD_OP(ins)];                                                                                     \
    } while (0)
// Record the running instruction's code index for errors and builtins (ip already points past it).
#define SYNC_PC() (vm->pc = (uint32_t)(ip - 1 - code))
#define RA R[DSD_A(ins)]
#define RB R[DSD_B(ins)]
#define RC R[DSD_C(ins)]

    DISPATCH();

op_HALT:
    vm->halted = true;
    vm->budget = budget;
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
    ip += DSD_SBX(ins);
    DISPATCH();

op_JMPT:
    if (dsd_truthy(RA)) ip += DSD_SBX(ins);
    DISPATCH();

op_JMPF:
    if (!dsd_truthy(RA)) ip += DSD_SBX(ins);
    DISPATCH();

op_CALLN: {
    uint32_t bi = DSD_C(ins);
    DsdBuiltinFn fn = dsd_builtin_fn[bi];
    SYNC_PC();
    if (fn == 0) {
        missing_builtin(vm, bi);
        goto failed;
    }
    vm->budget = budget; // a builtin may run script code (events) that charges the same budget
    if (!fn(vm, &RA, DSD_B(ins))) goto failed;
    budget = vm->budget;
    if (vm->halted) goto halted_inside;
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
    ip = code + prog->funcs[callee].code_start;
    DISPATCH();
}

op_RET:
    // The callee's r0 is the caller's rA, so the result lands in place.
    R[0] = DSD_B(ins) ? RA : dsd_undef();
    if (vm->depth == entry_depth) {
        vm->budget = budget;
        return DSD_R_NONE;
    }
    {
        const DsdCallFrame *f = &vm->frames[--vm->depth];
        func = f->func;
        R = vm->regs + f->base;
        ip = code + f->ret_pc;
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

watchdog_fired:
    budget = 0;                     // the post-decrement wrapped it; the frame's budget is spent
    vm->pc = (uint32_t)(ip - code); // the step that would have run next
    watchdog(vm);
    goto failed;

halted_inside:
    vm->budget = budget;
    vm->depth = entry_depth;
    return DSD_R_NONE;

failed:
    vm->budget = budget;
    vm->depth = entry_depth;
    return vm->err_code;

#undef DISPATCH
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
