// vm.h: the register VM (PLAN.md 2.3, 3.3; contracts/dsdb.md sections 5-6) and the value operations shared by the
// VM and the builtins (truthiness, equality, ordering, printing).
#ifndef DSD_VM_H
#define DSD_VM_H

#include <stdbool.h>
#include <stdint.h>

#include "dsd_limits.h"
#include "dsdb.h"
#include "heap.h"
#include "textbuf.h"
#include "value.h"

// Instance ids of the special targets (language.md section 5); also the payload of "no instance".
#define DSD_INST_SELF (-1)
#define DSD_INST_OTHER (-2)
#define DSD_INST_ALL (-3)
#define DSD_INST_NOONE (-4)

#define DSD_VM_NO_INST 0xFFFFFFFFu   // self/other when there is no instance
#define DSD_VM_NO_EVENT 0xFFFFFFFFu  // ev_id outside events
#define DSD_VM_NO_PC 0xFFFFFFFFu     // err_pc of an error not raised by script code (asset loading)

// Longest runtime error message (the ERR line's last field).
#define DSD_ERR_MSG_MAX 256

// One active call: what to restore when the callee returns.
typedef struct DsdCallFrame {
    uint32_t func;   // FUNC index of the caller
    uint32_t ret_pc; // code index to resume the caller at
    uint32_t base;   // the caller's frame base in the register stack
} DsdCallFrame;

// Pre-decoded code (M1 lever 1, direct threading): one cell per CODE word, holding the address of the handler that
// runs it next to the word itself, so dispatch jumps straight to the handler instead of looking its opcode up in a
// table. On the DS a cell is 8 bytes (a 4-byte pointer and the word); C13 predecodeBytes budgets the heap they use.
typedef struct DsdCell {
    const void *handler; // the running interpreter's label for this word's opcode
    uint32_t ins;        // the instruction word, as in CODE
} DsdCell;

// The contract's cell size (C13 predecodeBytes counts 8-byte cells: the DS size, whatever the host's pointer width).
#define DSD_PREDECODE_CELL_BYTES 8u
// Cells the budget holds: 32,768 at 256 KB, one per instruction.
#define DSD_PREDECODE_CELLS_MAX (DSD_C13_PREDECODE_BYTES / DSD_PREDECODE_CELL_BYTES)

typedef struct DsdVm DsdVm;
struct DsdVm {
    const DsdProgram *prog;
    const DsdCell *cells;     // the pre-decoded code (DsdCell), or NULL: the plain word-by-word dispatch runs
    DsdValue *regs;           // the register stack: DSD_RT_REG_STACK_CELLS cells (DTCM on the DS)
    uint32_t top;             // first register above the running frame; nested entries start here

    DsdCallFrame frames[DSD_RT_CALL_DEPTH_MAX];
    uint32_t depth;           // active call records

    DsdValue globals[DSD_RT_GLOBALS_MAX];
    uint8_t global_set[DSD_RT_GLOBALS_MAX / 8]; // bit per global: assigned at least once (R501 otherwise)

    uint32_t budget;          // VM steps left in this frame (watchdog, R510)
    uint32_t self;            // running instance: pool index (instances.h), DSD_VM_NO_INST in program form
    uint32_t other;           // `other`: pool index or DSD_VM_NO_INST
    // What is running, for event_inherited and for the object/event fields of DSD|ERR (engine.c sets them).
    const struct DsdWorld *world; // NULL in program form
    uint32_t ev_id;           // event id running (world.h), or DSD_VM_NO_EVENT
    uint32_t ev_owner;        // object whose handler runs (the event may be inherited)
    bool debug;               // debug build: int32 / Q20.12 overflow raises R52x instead of wrapping
    bool halted;              // HALT ran: the game stops

    // The error being raised (dsd_vm_error_*): code, the code index it happened at, and the message.
    int32_t err_code;
    uint32_t err_pc;
    char err_msg[DSD_ERR_MSG_MAX];
    // Where the running instruction is, kept current around builtin calls and slow paths: the interpreter's ip, one
    // past it, in whichever array it walks (vm->cells or prog->code), or NULL for "no instruction" (DSD_VM_NO_PC).
    // Storing the raw pointer is one store per sync; dsd_vm_pc turns it into a code index only when read (errors).
    const void *pc_at;

    DsdHeap heap;             // dynamic strings and arrays (heap.h)
    void (*mark_extra)(DsdVm *vm); // the engine's extra collector roots (instance variables); NULL in program form
};

// Resets the VM for a loaded program: empty stack, all globals unset, the heap emptied. It also pre-decodes the
// program's CODE onto the heap when it fits the C13 predecodeBytes budget (dsd_vm_predecode_limit) and the
// allocation succeeds; otherwise the whole module runs on the plain dispatch. Both paths behave identically.
// Only one VM runs at a time: the cells are shared, so a later dsd_vm_init replaces an earlier VM's.
void dsd_vm_init(DsdVm *vm, const DsdProgram *prog, DsdValue *reg_stack);
// Caps the cells dsd_vm_init may pre-decode into (from the next init on): DSD_PREDECODE_CELLS_MAX by default, 0
// forces the plain dispatch (dsdude-host's DSD_PLAIN_DISPATCH=1; the tests run every golden on both paths).
void dsd_vm_predecode_limit(uint32_t cells);
// The code index of the running instruction (dsd_vm_error_begin's err_pc), or DSD_VM_NO_PC.
uint32_t dsd_vm_pc(const DsdVm *vm);
// Sets the running instruction to code index `pc`, or to none with DSD_VM_NO_PC (errors outside script code).
void dsd_vm_set_pc(DsdVm *vm, uint32_t pc);
// The pre-decoded code's size in contract bytes (cells x DSD_PREDECODE_CELL_BYTES), 0 on the plain path: the
// DSD|MEM `predecode` key reports it in KB.
uint32_t dsd_vm_predecode_bytes(const DsdVm *vm);
// Refills the per-frame watchdog budget (the engine calls it once per frame; program form once at start).
void dsd_vm_frame_reset(DsdVm *vm);
// Runs FUNC `func` to completion (its parameters are args[0..params-1], copied in; argc must equal its param
// count) with the given self/other. Returns DSD_R_NONE and the result, or an R5xx code with vm->err_* filled.
int32_t dsd_vm_call(DsdVm *vm, uint32_t func, const DsdValue *args, uint32_t argc, DsdValue *result);

// ---- Raising errors (from the VM and builtins) ------------------------------------------------------------------
// Starts an error with `code` at the running instruction and returns the message builder; append the message.
DsdText dsd_vm_error_begin(DsdVm *vm, int32_t code);
// Raises `code` with a fixed message.
void dsd_vm_error(DsdVm *vm, int32_t code, const char *message);

// ---- Value operations -------------------------------------------------------------------------------------------
// false, 0 (int or fixed) and undefined are false; everything else is true.
static inline bool dsd_truthy(DsdValue v) {
    return (v.tag == DSD_TAG_BOOL || dsd_is_number(v)) ? v.payload != 0 : v.tag != DSD_TAG_UNDEF;
}
// `==` (language.md section 4 "Equality").
bool dsd_values_equal(const DsdVm *vm, DsdValue a, DsdValue b);
// Maps a number-layer status (fixed.h DSD_NUM_*) to a runtime error: overflow raises R520/R521 in debug builds
// (release keeps the wrapped result), division by zero R530. Returns true when execution continues. For
// DSD_NUM_NOT_NUMBER it returns false WITHOUT raising: the caller raises its own R540/R542 message.
bool dsd_vm_number_status(DsdVm *vm, int32_t status, DsdValue result);
// Prints v into a new string (string(), TOSTR); strings pass through. Raises R560 when the text arena is full.
bool dsd_value_to_string(DsdVm *vm, DsdValue v, DsdValue *out);
// A value's kind for messages: "a number", "text", "true or false", "undefined", "a list", "an instance", "an asset".
const char *dsd_value_kind(DsdValue v);
// Appends v by the printing rules (language.md section 4 "Printing"): the text of string(), show_debug_message.
void dsd_value_format(const DsdVm *vm, DsdValue v, DsdText *t);

#endif // DSD_VM_H
