// vm_run.h: the interpreter loop, included twice by vm.arm.c (no include guard, on purpose).
//
// The same handlers are compiled once per dispatch mode, so both paths run identical code between dispatches:
//   - threaded (VM_RUN_THREADED 1, run_threaded): ip walks the pre-decoded cells (vm.h DsdCell); dispatch jumps to
//     the handler address stored in the cell. No opcode decode and no table load (M1 lever 1, PLAN.md 8). It lives in
//     ITCM on the DS.
//   - plain (VM_RUN_THREADED 0, run_plain): ip walks the CODE words; dispatch indexes the DTCM handler table by
//     opcode. It runs a module whose code does not fit C13 predecodeBytes, or when the allocation failed or the
//     host forced it (dsd_vm_predecode_limit(0)). It lives in main RAM: it is the rare path, and ITCM is small.
//
// The includer defines, before each inclusion:
//   VM_RUN_THREADED  1 or 0 (above)
//   VM_RUN_NAME      the function's name
//   VM_RUN_ATTR      its placement attribute (DSD_ITCM_CODE, or nothing)
// and everything the handlers call (vm.arm.c's static helpers, g_dispatch, SELF_SLOTS, DSD_OPAQUE). Every macro
// this file defines is #undef'd at its end, so the second inclusion starts clean.
//
// Code indices (vm->pc, frame return points, function starts) are the same in both modes: cell i holds word i, so
// `ip - ip_base` means the same thing whichever array ip walks.

#if VM_RUN_THREADED
// ip points at cells. No prefetch: the handler's load can be scheduled two instructions ahead of the jump inside
// DISPATCH itself, so there is no load-use stall to hide, and keeping a prefetched value live across every handler
// only costs a register (clang for armv5te spilled ip to the stack at each dispatch with it, and not without it).
#define IP_T const DsdCell *
#define DECLARE_NEXT()
#define VM_IP_BASE (vm->cells)
// Nothing to reload after ip moved.
#define LOAD_NEXT() ((void)0)
// The instruction word at ip (CMPJ_END reads the JMP that follows a compare-and-jump).
#define WORD_AT_IP() (ip->ins)
// Jump to the handler stored in the cell at ip, taking its word. No per-step work: the step is charged at the next
// transfer.
#define DISPATCH()                                                                                                     \
    do {                                                                                                               \
        const void *h_ = ip->handler;                                                                                  \
        ins = ip->ins;                                                                                                 \
        ++ip;                                                                                                          \
        goto *h_;                                                                                                      \
    } while (0)
// With vm == NULL the call only hands out the label table (vm.arm.c's pre-decoder builds the cells from it).
#define VM_RUN_PROLOGUE(labels)                                                                                        \
    do {                                                                                                               \
        if (vm == NULL) {                                                                                              \
            g_thread_labels = (labels);                                                                                \
            return DSD_R_NONE;                                                                                         \
        }                                                                                                              \
    } while (0)
#else
// ip points at CODE words; `next` holds the word at ip, fetched one dispatch early (software pipelining: its load
// overlaps the jump to the current handler instead of stalling the next dispatch's opcode decode). Every assignment
// to ip reloads it. At a function's last instruction this reads one word past it, which is still inside the DSDB
// (CODE is never the last section; game.c keeps read-ahead bytes past the file). It is never executed.
#define IP_T const uint32_t *
#define DECLARE_NEXT()                                                                                                 \
    uint32_t next;                                                                                                     \
    LOAD_NEXT()
#define VM_IP_BASE (prog->code)
#define LOAD_NEXT() (next = *ip)
#define WORD_AT_IP() (next) // the prefetched word is the one at ip
// Fetch the next instruction and jump to its handler through the DTCM table. No per-step work (as above).
#define DISPATCH()                                                                                                     \
    do {                                                                                                               \
        ins = next;                                                                                                    \
        next = *++ip;                                                                                                  \
        goto *dispatch_base[DSD_OP(ins)];                                                                              \
    } while (0)
// Fill the DTCM table on the first run, and keep its base in a register for the whole run.
#define VM_RUN_PROLOGUE(labels)                                                                                        \
    if (g_dispatch[DSD_OP_HALT] == NULL) memcpy(g_dispatch, (labels), sizeof(labels));                                 \
    const void *const *dispatch_base = g_dispatch;                                                                     \
    DSD_OPAQUE(dispatch_base)
#endif

VM_RUN_ATTR static int32_t VM_RUN_NAME(DsdVm *vm, uint32_t func, uint32_t base) {
    // One label per opcode number; unimplemented numbers never reach dispatch (the loader refuses them). Plain: the
    // initialiser of g_dispatch, copied on the first run (HALT's slot is never empty once filled). Threaded: what
    // pre-decoding writes into each cell, handed out by a call with vm == NULL (see VM_RUN_PROLOGUE).
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
    VM_RUN_PROLOGUE(labels);
    const DsdProgram *prog = vm->prog;
    IP_T const ip_base = VM_IP_BASE; // code index 0: prog->code (plain) or vm->cells (threaded)
    const DsdValue *const kons = prog->kons;
    const uint32_t entry_depth = vm->depth;
    IP_T ip = ip_base + prog->funcs[func].code_start;
    DECLARE_NEXT(); // plain: the prefetched word (see above); threaded: nothing
    DsdValue *R = vm->regs + base; // the running frame's r0
    // self's slot cells (NULL without a self): GETSLOT/SETSLOT index it directly instead of reloading vm->self and
    // locating the instance block each time. vm->self changes inside run() only through the `with` opcodes (which
    // refresh this); builtins that run events restore it before returning, and error paths leave run().
    DsdValue *self_slots = SELF_SLOTS(vm);
    int32_t budget = (int32_t)vm->budget; // steps left this frame, settled at transfers (never more than 200,000)
    IP_T seg = ip;                         // the first step of the current straight run, not yet charged
    uint32_t ins;
    DsdValue a;
    DsdValue b;
    int32_t r;

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
        LOAD_NEXT();                                                                                                   \
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
            LOAD_NEXT();                                                                                               \
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
            uint32_t jmp_ = WORD_AT_IP();                                                                              \
            ip++;                                                                                                      \
            JUMP_BY(DSD_SBX(jmp_));                                                                                    \
        }                                                                                                              \
    } while (0)
// Record the running instruction's code index for errors and builtins (ip already points past it).
#define SYNC_PC() (vm->pc = (uint32_t)(ip - 1 - ip_base))
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
    f->ret_pc = (uint32_t)(ip - ip_base);
    f->base = (uint32_t)(R - vm->regs);
    if (!enter_frame(vm, callee, callee_base)) goto failed;
    vm->depth++;
    func = callee;
    R = vm->regs + callee_base;
    TRANSFER(ip_base + prog->funcs[callee].code_start);
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
        ip = ip_base + f->ret_pc;
        LOAD_NEXT();
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
    vm->pc = (uint32_t)(ip - 1 - ip_base); // the transfer that settled past the budget
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

#undef SETTLE
#undef TRANSFER
#undef JUMP_BY
#undef CMPJ_END
#undef SYNC_PC
#undef RA
#undef RB
#undef RC
}

#undef IP_T
#undef DECLARE_NEXT
#undef VM_IP_BASE
#undef LOAD_NEXT
#undef WORD_AT_IP
#undef DISPATCH
#undef VM_RUN_PROLOGUE
