// dsd_limits.h: the C13 runtime limits the core compiles in, and the runtime's own internal table sizes.
//
// contracts/runtime-limits.json is the single source for the C13 values: the host test suite `limits` re-reads that
// file and fails when a DSD_C13_* value here drifts from it. The DSD_RT_* sizes are internal (not contract values);
// exceeding one is R583 with a detail naming it.
#ifndef DSD_LIMITS_H
#define DSD_LIMITS_H

// ---- C13 (contracts/runtime-limits.json) ------------------------------------------------------------------------
#define DSD_C13_INSTANCES_MAX 512           // instancesMax
#define DSD_C13_INSTANCE_BLOCK_BYTES 384    // instanceBlockBytes
#define DSD_C13_USER_SLOTS_PER_OBJECT 24    // userSlotsPerObject
#define DSD_C13_ROOM_ARENA_BYTES 524288     // roomArenaBytes
#define DSD_C13_STRING_ARENA_BYTES 196608   // stringArenaBytes (text and lists share it)
#define DSD_C13_DSDB_MAX_BYTES 307200       // dsdbMaxBytes
#define DSD_C13_ALARMS 8                    // alarms
#define DSD_C13_REGISTERS_PER_FRAME 64      // registersPerFrame
#define DSD_C13_SPRITES_PER_SCREEN 128      // spritesPerScreen
#define DSD_C13_AFFINE_PER_SCREEN 32        // affinePerScreen
#define DSD_C13_PREDECODE_BYTES 262144      // predecodeBytes: heap for the pre-decoded code (vm.h), 8-byte cells

// ---- Runtime-internal sizes -------------------------------------------------------------------------------------
#define DSD_RT_REG_STACK_CELLS 512          // 4 KB register stack (PLAN.md 3.3): 8-byte cells
#define DSD_RT_CALL_DEPTH_MAX 256           // nested calls (each frame record lives in main RAM)
#define DSD_RT_GLOBALS_MAX 1024             // global.* variables
#define DSD_RT_HEAP_SLOTS 4096              // live dynamic strings and arrays at once (heap.h handles)
#define DSD_RT_ARRAY_MAX_LEN 16384          // elements in one array (128 KB of cells; the arena bounds it anyway)
#define DSD_RT_PRINT_DEPTH 8                // nested arrays printed before "[...]" (arrays may contain themselves)
#define DSD_RT_WATCHDOG_STEPS 200000        // VM steps per frame before R510 (PLAN.md 2.8)
#define DSD_RT_TEXT_MAX 4096                // longest formatted value (show_debug_message, string())

#endif // DSD_LIMITS_H
