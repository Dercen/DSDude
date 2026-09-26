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

// Longest runtime error message (the ERR line's last field).
#define DSD_ERR_MSG_MAX 256

// One active call: what to restore when the callee returns.
typedef struct DsdCallFrame {
    uint32_t func;   // FUNC index of the caller
    uint32_t ret_pc; // code index to resume the caller at
    uint32_t base;   // the caller's frame base in the register stack
} DsdCallFrame;

typedef struct DsdVm {
    const DsdProgram *prog;
    DsdValue *regs;           // the register stack: DSD_RT_REG_STACK_CELLS cells (DTCM on the DS)
    uint32_t top;             // first register above the running frame; nested entries start here

    DsdCallFrame frames[DSD_RT_CALL_DEPTH_MAX];
    uint32_t depth;           // active call records

    DsdValue globals[DSD_RT_GLOBALS_MAX];
    uint8_t global_set[DSD_RT_GLOBALS_MAX / 8]; // bit per global: assigned at least once (R501 otherwise)

    uint32_t budget;          // VM steps left in this frame (watchdog, R510)
    int32_t self;             // running instance id, DSD_INST_NOONE in program form
    int32_t other;
    bool debug;               // debug build: int32 / Q20.12 overflow raises R52x instead of wrapping
    bool halted;              // HALT ran: the game stops

    // The error being raised (dsd_vm_error_*): code, the code index it happened at, and the message.
    int32_t err_code;
    uint32_t err_pc;
    char err_msg[DSD_ERR_MSG_MAX];
    uint32_t pc;              // code index of the running instruction, kept current around builtin calls

    DsdHeap heap;             // dynamic strings and arrays (heap.h)
} DsdVm;

// Resets the VM for a loaded program: empty stack, all globals unset, the heap emptied.
void dsd_vm_init(DsdVm *vm, const DsdProgram *prog, DsdValue *reg_stack);
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
