// builtins.h: builtin function dispatch. The dense indices, names and argument counts come from the generated
// runtime/gen/builtins_table.h (tools/gen-builtins.ts, contract C2 builtins.json); implementations live in
// runtime/core/src/builtins/*.c and are wired into one table in builtins/table.c.
#ifndef DSD_BUILTINS_H
#define DSD_BUILTINS_H

#include <stdbool.h>
#include <stdint.h>

#include "builtins_table.h"
#include "value.h"

typedef struct DsdVm DsdVm;

// A builtin reads its argc arguments from args[0..argc-1] and writes its result to args[0] (undefined for void
// builtins). It returns false when the script must stop: after raising a runtime error with dsd_vm_error*, or when
// script code it ran (an event: instance_create, instance_destroy, event_inherited, event_user) executed HALT
// (vm->halted). True otherwise. CALLN tells the two apart only on the false path, so a builtin that runs no script
// code never makes the VM check vm->halted.
typedef bool (*DsdBuiltinFn)(DsdVm *vm, DsdValue *args, uint32_t argc);

// Dense runtime indices by name: DSD_BI_floor, DSD_BI_show_debug_message, ...
#define DSD_BI_ENUM_(index, name, min_args, max_args, pure) DSD_BI_##name = index,
enum { DSD_BUILTIN_FUNCS(DSD_BI_ENUM_) };
#undef DSD_BI_ENUM_

// Static facts about each builtin, indexed by dense index.
typedef struct DsdBuiltinInfo {
    const char *name;
    uint8_t min_args;
    uint8_t max_args;
} DsdBuiltinInfo;

extern const DsdBuiltinInfo dsd_builtin_info[DSD_BUILTIN_FUNC_COUNT];
// Implementations by dense index; NULL for a builtin this runtime build does not implement yet (a call raises R582).
extern const DsdBuiltinFn dsd_builtin_fn[DSD_BUILTIN_FUNC_COUNT];
// True for the builtins that run script code (the four named above). Pre-decoding gives every other CALLN a quicker
// handler that keeps the watchdog budget out of vm->budget, so a new builtin that runs script code MUST be added here
// (host builds poison vm->budget around the quick call, so a missing entry fails the tests with R510).
bool dsd_builtin_runs_script(uint32_t bi);

#endif // DSD_BUILTINS_H
