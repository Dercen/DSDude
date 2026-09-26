// loader.c: checks and maps a DSDB image (contracts/dsdb.md) and verifies every function's code, so the VM can run
// it without bounds checks. Every failure is an R58x code with a short detail (errors.h, catalog.json).
#include "dsdb.h"

#include <string.h>

#include "builtins.h"
#include "dsd_limits.h"
#include "errors.h"
#include "opcodes.h"
#include "textbuf.h"

// ---- Layout constants (contracts/dsdb.md sections 2 and 4) ------------------------------------------------------
#define OFF_MAGIC 0u
#define OFF_MAJOR 4u
#define OFF_ABI 8u
#define OFF_SEED 12u
#define OFF_SIZE 16u
#define OFF_SECTIONS 20u
#define OFF_FIRST_ROOM 24u
#define OFF_EXTENSIONS 28u // extension table offset (ADR-0006), 0 = none
#define EXT_ENTRY_BYTES 12u
#define SPRG_TAG "SPRG"
#define TABLE_BYTES (DSDB_SECTION_COUNT * DSDB_SECTION_ENTRY_BYTES)
#define DATA_START (DSDB_HEADER_BYTES + TABLE_BYTES) // first byte a section may use
#define COUNT_BYTES 4u                               // every section starts with a u32 count
#define ALIGN_MASK 3u                                // sections start on 4-byte boundaries
#define WORD_BYTES 4u
#define CELL_BYTES 8u
#define STR_LEN_BYTES 2u                             // u16 byteLength before each string's bytes
#define TAG_BYTES 4u

// The fixed section order and tags.
static const char SECTION_TAGS[DSDB_SECTION_COUNT][TAG_BYTES + 1] = {
    "STRS", "SYMS", "KONS", "CODE", "FUNC", "GLOB", "OBJS", "ROOM", "ASET", "DBG ",
};

// Little-endian u32/u16 at p (memcpy: any alignment).
static uint32_t rd32(const uint8_t *p) {
    uint32_t v;
    memcpy(&v, p, sizeof v);
    return v;
}
static uint16_t rd16(const uint8_t *p) {
    uint16_t v;
    memcpy(&v, p, sizeof v);
    return v;
}

// Records a failure: code plus "<what>" or "<what> <number>". Returns the code for `return fail(...)`.
static int32_t fail(DsdLoadError *err, int32_t code, const char *what, int64_t number) {
    DsdText t;
    dsd_text_init(&t, err->detail, sizeof err->detail);
    dsd_text_str(&t, what);
    if (number >= 0) {
        dsd_text_char(&t, ' ');
        dsd_text_uint(&t, (uint32_t)number);
    }
    err->code = code;
    return code;
}

// True when a section holds `count` records of `rec_bytes` after its count word (overflow-safe).
static bool fits(const DsdSection *s, uint32_t count, uint32_t rec_bytes) {
    return (uint64_t)count * rec_bytes <= (uint64_t)s->size - COUNT_BYTES;
}

// ---- Header and sections ----------------------------------------------------------------------------------------

static int32_t load_header(DsdProgram *p, const uint8_t *f, uint32_t size, DsdLoadError *err) {
    if (size < DATA_START || memcmp(f + OFF_MAGIC, DSDB_MAGIC, TAG_BYTES) != 0) {
        return fail(err, DSD_R_BAD_FILE, "not a DSDude game file", -1);
    }
    if (rd16(f + OFF_MAJOR) != DSDB_MAJOR || rd32(f + OFF_ABI) != DSD_ABI_HASH) {
        return fail(err, DSD_R_ABI_MISMATCH, "different runtime", -1);
    }
    if (rd32(f + OFF_SIZE) != size) return fail(err, DSD_R_BAD_FILE, "file size", rd32(f + OFF_SIZE));
    if (rd16(f + OFF_SECTIONS) != DSDB_SECTION_COUNT) return fail(err, DSD_R_BAD_FILE, "section count", -1);
    p->file = f;
    p->file_size = size;
    p->seed = rd32(f + OFF_SEED);
    p->first_room = rd32(f + OFF_FIRST_ROOM);
    for (uint32_t i = 0; i < DSDB_SECTION_COUNT; i++) {
        const uint8_t *e = f + DSDB_HEADER_BYTES + i * DSDB_SECTION_ENTRY_BYTES;
        uint32_t off = rd32(e + TAG_BYTES);
        uint32_t len = rd32(e + TAG_BYTES + WORD_BYTES);
        if (memcmp(e, SECTION_TAGS[i], TAG_BYTES) != 0) return fail(err, DSD_R_BAD_FILE, "section order", i);
        if (off < DATA_START || (off & ALIGN_MASK) != 0 || len < COUNT_BYTES || (uint64_t)off + len > size) {
            return fail(err, DSD_R_BAD_FILE, SECTION_TAGS[i], -1);
        }
        p->sec[i].base = f + off;
        p->sec[i].size = len;
    }
    return DSD_R_NONE;
}

// STRS: offsets in range; each record's bytes and NUL inside the section.
static int32_t load_strs(DsdProgram *p, DsdLoadError *err) {
    const DsdSection *s = &p->sec[DSDB_SEC_STRS];
    p->str_count = rd32(s->base);
    if (!fits(s, p->str_count, WORD_BYTES)) return fail(err, DSD_R_BAD_FILE, "STRS", -1);
    p->str_offsets = (const uint32_t *)(s->base + COUNT_BYTES);
    for (uint32_t i = 0; i < p->str_count; i++) {
        uint32_t off = p->str_offsets[i];
        if ((uint64_t)off + STR_LEN_BYTES > s->size) return fail(err, DSD_R_BAD_FILE, "string", i);
        uint32_t n = rd16(s->base + off);
        if ((uint64_t)off + STR_LEN_BYTES + n + 1 > s->size || s->base[off + STR_LEN_BYTES + n] != '\0') {
            return fail(err, DSD_R_BAD_FILE, "string", i);
        }
    }
    return DSD_R_NONE;
}

// A section that is a u32 count plus `count` STRS indices (SYMS, GLOB).
static int32_t load_name_list(const DsdProgram *p, uint32_t sec, uint32_t *count, const uint32_t **names,
                              DsdLoadError *err) {
    const DsdSection *s = &p->sec[sec];
    *count = rd32(s->base);
    if (!fits(s, *count, WORD_BYTES)) return fail(err, DSD_R_BAD_FILE, SECTION_TAGS[sec], -1);
    *names = (const uint32_t *)(s->base + COUNT_BYTES);
    for (uint32_t i = 0; i < *count; i++) {
        if ((*names)[i] >= p->str_count) return fail(err, DSD_R_BAD_FILE, SECTION_TAGS[sec], i);
    }
    return DSD_R_NONE;
}

// KONS: cells of tag INT, REAL, STR (a valid STRS index) or ASSET.
static int32_t load_kons(DsdProgram *p, DsdLoadError *err) {
    const DsdSection *s = &p->sec[DSDB_SEC_KONS];
    p->kons_count = rd32(s->base);
    if (!fits(s, p->kons_count, CELL_BYTES)) return fail(err, DSD_R_BAD_FILE, "KONS", -1);
    p->kons = (const DsdValue *)(s->base + COUNT_BYTES);
    for (uint32_t i = 0; i < p->kons_count; i++) {
        DsdValue k = p->kons[i];
        bool ok = k.tag == DSD_TAG_INT || k.tag == DSD_TAG_REAL || k.tag == DSD_TAG_ASSET ||
                  (k.tag == DSD_TAG_STR && (uint32_t)k.payload < p->str_count);
        if (!ok) return fail(err, DSD_R_BAD_FILE, "constant", i);
    }
    return DSD_R_NONE;
}

// CODE and FUNC: every function's range inside CODE, register counts within the frame limit.
static int32_t load_code_funcs(DsdProgram *p, DsdLoadError *err) {
    const DsdSection *c = &p->sec[DSDB_SEC_CODE];
    p->code_count = rd32(c->base);
    if (!fits(c, p->code_count, WORD_BYTES)) return fail(err, DSD_R_BAD_FILE, "CODE", -1);
    p->code = (const uint32_t *)(c->base + COUNT_BYTES);
    const DsdSection *f = &p->sec[DSDB_SEC_FUNC];
    p->func_count = rd32(f->base);
    if (!fits(f, p->func_count, sizeof(DsdFuncRec))) return fail(err, DSD_R_BAD_FILE, "FUNC", -1);
    p->funcs = (const DsdFuncRec *)(f->base + COUNT_BYTES);
    for (uint32_t i = 0; i < p->func_count; i++) {
        const DsdFuncRec *r = &p->funcs[i];
        bool ok = r->name_str < p->str_count && r->code_length > 0 &&
                  (uint64_t)r->code_start + r->code_length <= p->code_count && r->regs <= DSDB_MAX_REGS &&
                  r->params <= r->regs;
        if (!ok) return fail(err, DSD_R_BAD_FILE, "function", i);
    }
    return DSD_R_NONE;
}

// DBG: records sorted by code index, pointing at valid code and file names.
static int32_t load_dbg(DsdProgram *p, DsdLoadError *err) {
    const DsdSection *s = &p->sec[DSDB_SEC_DBG];
    p->dbg_count = rd32(s->base);
    if (!fits(s, p->dbg_count, sizeof(DsdDbgRec))) return fail(err, DSD_R_BAD_FILE, "DBG", -1);
    p->dbg = (const DsdDbgRec *)(s->base + COUNT_BYTES);
    for (uint32_t i = 0; i < p->dbg_count; i++) {
        const DsdDbgRec *r = &p->dbg[i];
        bool ok = r->code_index < p->code_count && r->file_str < p->str_count &&
                  (i == 0 || p->dbg[i - 1].code_index <= r->code_index);
        if (!ok) return fail(err, DSD_R_BAD_FILE, "line table", i);
    }
    return DSD_R_NONE;
}

// The extension table (ADR-0006): entries sorted by tag, bodies 4-aligned inside the file; unknown tags are skipped.
static int32_t load_extensions(DsdProgram *p, DsdLoadError *err) {
    uint32_t off = rd32(p->file + OFF_EXTENSIONS);
    if (off == 0) return DSD_R_NONE;
    if ((off & ALIGN_MASK) != 0 || off < DATA_START || (uint64_t)off + COUNT_BYTES > p->file_size) {
        return fail(err, DSD_R_BAD_FILE, "extensions", -1);
    }
    uint32_t n = rd32(p->file + off);
    if ((uint64_t)off + COUNT_BYTES + (uint64_t)n * EXT_ENTRY_BYTES > p->file_size) {
        return fail(err, DSD_R_BAD_FILE, "extensions", -1);
    }
    for (uint32_t i = 0; i < n; i++) {
        const uint8_t *e = p->file + off + COUNT_BYTES + i * EXT_ENTRY_BYTES;
        uint32_t body = rd32(e + TAG_BYTES);
        uint32_t size = rd32(e + TAG_BYTES + WORD_BYTES);
        bool ok = (body & ALIGN_MASK) == 0 && size >= COUNT_BYTES && (uint64_t)body + size <= p->file_size &&
                  (i == 0 || memcmp(e - EXT_ENTRY_BYTES, e, TAG_BYTES) < 0);
        if (!ok) return fail(err, DSD_R_BAD_FILE, "extension", i);
        if (memcmp(e, SPRG_TAG, TAG_BYTES) != 0) continue;
        p->sprg_count = rd32(p->file + body);
        if ((uint64_t)p->sprg_count * sizeof(DsdSprgRec) > size - COUNT_BYTES) return fail(err, DSD_R_BAD_FILE, "SPRG", -1);
        p->sprg = (const DsdSprgRec *)(p->file + body + COUNT_BYTES);
        for (uint32_t k = 1; k < p->sprg_count; k++) {
            if (p->sprg[k - 1].asset >= p->sprg[k].asset) return fail(err, DSD_R_BAD_FILE, "SPRG order", k);
        }
    }
    return DSD_R_NONE;
}

// ---- Code verification ------------------------------------------------------------------------------------------

// What an operand field must be checked against.
#define V_NONE 0  // unchecked (immediates, bools, u8 counts)
#define V_REG 1   // a register of the current frame
#define V_K 2     // a KONS index (Bx)
#define V_LABEL 3 // a jump target inside the current function (sBx)
#define V_GLOB 4  // a GLOB index (Bx)
#define V_FUNC 5  // a FUNC index (Bx)
#define V_SYM 6   // a SYMS index (C, 8 bits; WS4's ADR-0005 operand kind `sym`)
#define V_BIVAR 7 // a built-in variable that is not an array (8 bits; ADR-0005 kind `bivar`)
#define V_BIVARX 8 // a built-in array variable (alarm, view_x, view_y; 8 bits)
#define V_BIVARW 9 // a built-in variable that is not an array, in Bx (GETBI/SETBI)
#define V_SLOT 10 // a user slot index (< C13 userSlotsPerObject)
#define DSD_CMPJ_REL_MAX 5u // CMPJ relations: 0 ==, 1 !=, 2 <, 3 <=, 4 >, 5 >= (WS2's proposal, provisional)

// Operand checks per implemented opcode: A, then B (or Bx/sBx), then C. `impl` = 0 for opcodes this runtime does
// not implement yet (R582). Wide-field opcodes put their Bx/sBx check in b and leave c at V_NONE.
typedef struct OpCheck {
    uint8_t impl;
    uint8_t a;
    uint8_t b;
    uint8_t c;
} OpCheck;

static const OpCheck OP_CHECKS[DSD_OPCODE_COUNT] = {
    [DSD_OP_HALT] = {1, V_NONE, V_NONE, V_NONE},
    [DSD_OP_MOV] = {1, V_REG, V_REG, V_NONE},
    [DSD_OP_LOADK] = {1, V_REG, V_K, V_NONE},
    [DSD_OP_LOADI] = {1, V_REG, V_NONE, V_NONE},
    [DSD_OP_LOADB] = {1, V_REG, V_NONE, V_NONE},
    [DSD_OP_LOADUNDEF] = {1, V_REG, V_NONE, V_NONE},
    [DSD_OP_ADD] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_SUB] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_MUL] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_DIV] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_IDIV] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_MOD] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_NEG] = {1, V_REG, V_REG, V_NONE},
    [DSD_OP_EQ] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_NE] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_LT] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_LE] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_GT] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_GE] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_NOT] = {1, V_REG, V_REG, V_NONE},
    [DSD_OP_JMP] = {1, V_NONE, V_LABEL, V_NONE},
    [DSD_OP_JMPT] = {1, V_REG, V_LABEL, V_NONE},
    [DSD_OP_JMPF] = {1, V_REG, V_LABEL, V_NONE},
    [DSD_OP_CALLN] = {1, V_REG, V_NONE, V_NONE}, // argument window and builtin checked in verify_callN
    [DSD_OP_RET] = {1, V_REG, V_NONE, V_NONE},
    [DSD_OP_CONCAT] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_TOSTR] = {1, V_REG, V_REG, V_NONE},
    [DSD_OP_GETGLOB] = {1, V_REG, V_GLOB, V_NONE},
    [DSD_OP_SETGLOB] = {1, V_REG, V_GLOB, V_NONE},
    [DSD_OP_CALL] = {1, V_REG, V_FUNC, V_NONE}, // parameter window checked in verify_call
    [DSD_OP_ADDI] = {1, V_REG, V_REG, V_NONE},
    [DSD_OP_SUBI] = {1, V_REG, V_REG, V_NONE},
    [DSD_OP_MULI] = {1, V_REG, V_REG, V_NONE},
    [DSD_OP_NEWARR] = {1, V_REG, V_NONE, V_NONE}, // element window checked below
    [DSD_OP_GETIDX] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_SETIDX] = {1, V_REG, V_REG, V_REG},
    [DSD_OP_LEN] = {1, V_REG, V_REG, V_NONE},
    [DSD_OP_TOINT] = {1, V_REG, V_REG, V_NONE},
    [DSD_OP_TOFIXED] = {1, V_REG, V_REG, V_NONE},
    [DSD_OP_GETSLOT] = {1, V_REG, V_SLOT, V_NONE},
    [DSD_OP_SETSLOT] = {1, V_REG, V_SLOT, V_NONE},
    [DSD_OP_GETSLOTO] = {1, V_REG, V_SLOT, V_NONE},
    [DSD_OP_SETSLOTO] = {1, V_REG, V_SLOT, V_NONE},
    [DSD_OP_GETDYN] = {1, V_REG, V_REG, V_SYM},
    [DSD_OP_SETDYN] = {1, V_REG, V_REG, V_SYM},
    [DSD_OP_GETBI] = {1, V_REG, V_BIVARW, V_NONE},
    [DSD_OP_SETBI] = {1, V_REG, V_BIVARW, V_NONE},
    [DSD_OP_GETBIX] = {1, V_REG, V_BIVARX, V_REG},
    [DSD_OP_SETBIX] = {1, V_REG, V_BIVARX, V_REG},
    [DSD_OP_GETBIO] = {1, V_REG, V_REG, V_BIVAR},
    [DSD_OP_SETBIO] = {1, V_REG, V_REG, V_BIVAR},
    [DSD_OP_WITHBEGIN] = {1, V_REG, V_LABEL, V_NONE},
    [DSD_OP_WITHNEXT] = {1, V_REG, V_LABEL, V_NONE},
    [DSD_OP_WITHEND] = {1, V_REG, V_NONE, V_NONE},
    [DSD_OP_CMPJ] = {1, V_REG, V_REG, V_NONE}, // relation and the JMP after it checked below
};

// Array length of each built-in variable (0 = not an array), from the generated table.
#define DSD_BV_LEN_(index, name, global, readonly, array_len) [index] = array_len,
static const uint8_t BIVAR_ARRAY_LEN[DSD_BUILTIN_VAR_COUNT] = {DSD_BUILTIN_VARS(DSD_BV_LEN_)};
#undef DSD_BV_LEN_

// Checks one operand field value against its kind. next_pc is the index after the instruction (jump base).
static bool operand_ok(const DsdProgram *p, const DsdFuncRec *fn, uint8_t kind, uint32_t value, int32_t svalue,
                       uint32_t next_pc) {
    switch (kind) {
    case V_REG:
        return value < fn->regs;
    case V_K:
        return value < p->kons_count;
    case V_GLOB:
        return value < p->glob_count;
    case V_FUNC:
        return value < p->func_count;
    case V_SYM:
        return value < p->sym_count;
    case V_BIVAR:
    case V_BIVARW:
        return value < DSD_BUILTIN_VAR_COUNT && BIVAR_ARRAY_LEN[value] == 0;
    case V_BIVARX:
        return value < DSD_BUILTIN_VAR_COUNT && BIVAR_ARRAY_LEN[value] != 0;
    case V_SLOT:
        return value < DSD_C13_USER_SLOTS_PER_OBJECT;
    case V_LABEL: {
        int64_t target = (int64_t)next_pc + svalue;
        return target >= fn->code_start && target < (int64_t)fn->code_start + fn->code_length;
    }
    default:
        return true;
    }
}

// Verifies the code of function `index`. On failure fills err (R580 bad operand, R582 unknown opcode).
static int32_t verify_function(const DsdProgram *p, uint32_t index, DsdLoadError *err) {
    const DsdFuncRec *fn = &p->funcs[index];
    uint32_t end = fn->code_start + fn->code_length;
    for (uint32_t pc = fn->code_start; pc < end; pc++) {
        uint32_t ins = p->code[pc];
        uint32_t op = DSD_OP(ins);
        if (op >= DSD_OPCODE_COUNT || !OP_CHECKS[op].impl) return fail(err, DSD_R_UNSUPPORTED, "bytecode", op);
        const OpCheck *ck = &OP_CHECKS[op];
        bool wide = ck->b == V_K || ck->b == V_LABEL || ck->b == V_GLOB || ck->b == V_FUNC || ck->b == V_BIVARW;
        uint32_t b = wide ? DSD_BX(ins) : DSD_B(ins);
        bool ok = operand_ok(p, fn, ck->a, DSD_A(ins), 0, pc + 1) &&
                  operand_ok(p, fn, ck->b, b, DSD_SBX(ins), pc + 1) &&
                  operand_ok(p, fn, ck->c, DSD_C(ins), 0, pc + 1);
        if (ok && op == DSD_OP_CALLN) {
            // Builtin in range, argument count within its limits, the window rA..rA+B-1 inside the frame.
            uint32_t bi = DSD_C(ins);
            uint32_t argc = DSD_B(ins);
            ok = bi < DSD_BUILTIN_FUNC_COUNT && argc >= dsd_builtin_info[bi].min_args &&
                 argc <= dsd_builtin_info[bi].max_args && DSD_A(ins) + argc <= fn->regs;
        }
        if (ok && op == DSD_OP_CALL) {
            // The callee's parameters are the caller's rA..rA+params-1 (its frame starts at rA).
            ok = DSD_A(ins) + p->funcs[DSD_BX(ins)].params <= fn->regs;
        }
        if (ok && op == DSD_OP_CMPJ) {
            // Relation 0-5 (== != < <= > >=), and the next word, inside the function, is the JMP it guards.
            ok = DSD_C(ins) <= DSD_CMPJ_REL_MAX && pc + 1 < end && DSD_OP(p->code[pc + 1]) == DSD_OP_JMP;
        }
        if (ok && op == DSD_OP_NEWARR) ok = DSD_A(ins) + DSD_B(ins) <= fn->regs; // elements rA..rA+B-1
        if (ok && (op == DSD_OP_RET || op == DSD_OP_LOADB)) ok = DSD_B(ins) <= 1;
        if (!ok) return fail(err, DSD_R_BAD_FILE, "code at", pc);
    }
    // Control never runs off the end: the last instruction returns, halts or jumps.
    uint32_t last = DSD_OP(p->code[end - 1]);
    if (last != DSD_OP_RET && last != DSD_OP_HALT && last != DSD_OP_JMP) {
        return fail(err, DSD_R_BAD_FILE, "function end", index);
    }
    return DSD_R_NONE;
}

// ---- Entry points -----------------------------------------------------------------------------------------------

int32_t dsd_load(DsdProgram *prog, const uint8_t *file, uint32_t size, DsdLoadError *err) {
    memset(prog, 0, sizeof *prog);
    err->code = DSD_R_NONE;
    err->detail[0] = '\0';
    int32_t rc;
    if ((rc = load_header(prog, file, size, err)) != DSD_R_NONE) return rc;
    if ((rc = load_strs(prog, err)) != DSD_R_NONE) return rc;
    if ((rc = load_name_list(prog, DSDB_SEC_SYMS, &prog->sym_count, &prog->sym_names, err)) != DSD_R_NONE) return rc;
    if ((rc = load_kons(prog, err)) != DSD_R_NONE) return rc;
    if ((rc = load_code_funcs(prog, err)) != DSD_R_NONE) return rc;
    if ((rc = load_name_list(prog, DSDB_SEC_GLOB, &prog->glob_count, &prog->glob_names, err)) != DSD_R_NONE) {
        return rc;
    }
    if ((rc = load_dbg(prog, err)) != DSD_R_NONE) return rc;
    if ((rc = load_extensions(prog, err)) != DSD_R_NONE) return rc;
    prog->obj_count = rd32(prog->sec[DSDB_SEC_OBJS].base);
    prog->room_count = rd32(prog->sec[DSDB_SEC_ROOM].base);
    prog->asset_count = rd32(prog->sec[DSDB_SEC_ASET].base);
    // Program form: no objects or rooms, FUNC 0 is a parameterless __main. Otherwise the first room must exist.
    if (prog->first_room == DSDB_NONE) {
        uint32_t len;
        bool ok = prog->func_count > 0 && prog->obj_count == 0 && prog->room_count == 0 && prog->funcs[0].params == 0 &&
                  strcmp(dsd_prog_str(prog, prog->funcs[0].name_str, &len), DSDB_MAIN_NAME) == 0;
        if (!ok) return fail(err, DSD_R_BAD_FILE, "program form", -1);
    } else if (prog->first_room >= prog->room_count) {
        return fail(err, DSD_R_BAD_FILE, "first room", prog->first_room);
    }
    for (uint32_t i = 0; i < prog->func_count; i++) {
        if ((rc = verify_function(prog, i, err)) != DSD_R_NONE) return rc;
    }
    return DSD_R_NONE;
}

const char *dsd_prog_str(const DsdProgram *prog, uint32_t index, uint32_t *len) {
    const uint8_t *rec = prog->sec[DSDB_SEC_STRS].base + prog->str_offsets[index];
    *len = rd16(rec);
    return (const char *)(rec + STR_LEN_BYTES);
}

bool dsd_prog_line(const DsdProgram *prog, uint32_t pc, uint32_t *file_str, uint32_t *line) {
    // Last record with code_index <= pc (binary search over the sorted table).
    uint32_t lo = 0;
    uint32_t hi = prog->dbg_count;
    while (lo < hi) {
        uint32_t mid = lo + (hi - lo) / 2;
        if (prog->dbg[mid].code_index <= pc) lo = mid + 1;
        else hi = mid;
    }
    if (lo == 0) return false;
    *file_str = prog->dbg[lo - 1].file_str;
    *line = prog->dbg[lo - 1].line;
    return true;
}

uint32_t dsd_prog_func_at(const DsdProgram *prog, uint32_t pc) {
    for (uint32_t i = 0; i < prog->func_count; i++) {
        const DsdFuncRec *f = &prog->funcs[i];
        if (pc >= f->code_start && pc < f->code_start + f->code_length) return i;
    }
    return DSDB_NONE;
}
