// dsdb.h: the loaded view of a DSDB file (contract C2, contracts/dsdb.md) and the loader that builds it.
//
// The loader never copies sections: DsdProgram points into the file buffer, which must stay alive and 4-byte
// aligned while the program runs. Both targets are little-endian, so the file's records are read in place through
// the packed-free structs below (their layouts are static_asserted).
#ifndef DSD_DSDB_H
#define DSD_DSDB_H

#include <stdbool.h>
#include <stdint.h>

#include "value.h"

_Static_assert(__BYTE_ORDER__ == __ORDER_LITTLE_ENDIAN__, "DSDB records are read in place: little-endian only");

// ---- File constants (contracts/dsdb.md section 2) ---------------------------------------------------------------
#define DSDB_MAGIC "DSDB"
#define DSDB_MAJOR 0u              // the loader refuses any other major
#define DSDB_HEADER_BYTES 32u
#define DSDB_SECTION_COUNT 10u     // STRS SYMS KONS CODE FUNC GLOB OBJS ROOM ASET DBG, in that order
#define DSDB_SECTION_ENTRY_BYTES 12u
#define DSDB_NONE 0xFFFFFFFFu      // "none" in index fields (e.g. the first room of a program-form DSDB)
#define DSDB_MAX_REGS 64u          // registers per function frame (C13 registersPerFrame)
#define DSDB_MAIN_NAME "__main"    // FUNC 0 of a program-form DSDB
// Header flags (offset 22). ADR-pending ADR-0008: bit 0 = release build (overflow wraps instead of raising R52x);
// the other bits are reserved and must be 0 (the loader refuses a file that sets one, as made by a newer DSDude).
#define DSDB_FLAG_RELEASE 0x0001u
#define DSDB_FLAGS_KNOWN DSDB_FLAG_RELEASE

// Section indices in the fixed section order.
#define DSDB_SEC_STRS 0
#define DSDB_SEC_SYMS 1
#define DSDB_SEC_KONS 2
#define DSDB_SEC_CODE 3
#define DSDB_SEC_FUNC 4
#define DSDB_SEC_GLOB 5
#define DSDB_SEC_OBJS 6
#define DSDB_SEC_ROOM 7
#define DSDB_SEC_ASET 8
#define DSDB_SEC_DBG 9

// ---- In-file records --------------------------------------------------------------------------------------------

// FUNC record (16 bytes).
typedef struct DsdFuncRec {
    uint32_t name_str;    // STRS index
    uint32_t code_start;  // index into CODE
    uint32_t code_length; // instructions
    uint8_t params;
    uint8_t regs;         // frame width, <= 64
    uint16_t flags;       // 0 (reserved)
} DsdFuncRec;
_Static_assert(sizeof(DsdFuncRec) == 16, "FUNC record is 16 bytes (C2)");

// DBG record (12 bytes): code from code_index up to the next record comes from file:line.
typedef struct DsdDbgRec {
    uint32_t code_index;
    uint32_t file_str;
    uint32_t line;
} DsdDbgRec;
_Static_assert(sizeof(DsdDbgRec) == 12, "DBG record is 12 bytes (C2)");

// SPRG record (20 bytes, ADR-0006): one per ASET sprite, sorted by asset index; bbox inclusive, frame pixels.
typedef struct DsdSprgRec {
    uint32_t asset;
    uint16_t width;
    uint16_t height;
    int16_t xorig;
    int16_t yorig;
    int16_t bbox_left;
    int16_t bbox_top;
    int16_t bbox_right;
    int16_t bbox_bottom;
} DsdSprgRec;
_Static_assert(sizeof(DsdSprgRec) == 20, "SPRG record is 20 bytes (C2 0.3.0, ADR-0006)");

// A section's bytes inside the file.
typedef struct DsdSection {
    const uint8_t *base;
    uint32_t size;
} DsdSection;

// ---- The loaded program -----------------------------------------------------------------------------------------
typedef struct DsdProgram {
    const uint8_t *file;
    uint32_t file_size;
    uint32_t seed;        // header RNG seed; 0 = ask the platform
    uint32_t first_room;  // DSDB_NONE for program form
    uint16_t flags;       // header flags (DSDB_FLAG_*)
    DsdSection sec[DSDB_SECTION_COUNT];

    uint32_t str_count;
    const uint32_t *str_offsets;   // per string, offset of its record from the STRS base
    uint32_t sym_count;
    const uint32_t *sym_names;     // STRS indices
    uint32_t kons_count;
    const DsdValue *kons;          // ready-made cells (STR payloads are STRS indices)
    uint32_t code_count;
    const uint32_t *code;
    uint32_t func_count;
    const DsdFuncRec *funcs;
    uint32_t glob_count;
    const uint32_t *glob_names;    // STRS indices
    uint32_t obj_count;            // OBJS, ROOM and ASET are parsed by the engine (instances.c, rooms.c)
    uint32_t room_count;
    uint32_t asset_count;
    uint32_t dbg_count;
    const DsdDbgRec *dbg;
    // Extensions (header word 28, ADR-0006): SPRG sprite geometry, or 0 records when the file has none.
    uint32_t sprg_count;
    const DsdSprgRec *sprg;
} DsdProgram;

// Why a load failed: an R58x code (errors.h) and a short detail for the message's {detail} placeholder.
#define DSD_LOAD_DETAIL_MAX 96
typedef struct DsdLoadError {
    int32_t code;
    char detail[DSD_LOAD_DETAIL_MAX];
} DsdLoadError;

// Checks and maps a DSDB image: magic, major version, ABI hash (R581), sizes and section table (R580), every
// section's records, and every function's code (registers, constants, jumps, builtins, globals and callees in
// range; R582 for an opcode this runtime does not implement). After a successful load the VM runs the code
// without bounds checks. Returns DSD_R_NONE or the R58x code also stored in err.
int32_t dsd_load(DsdProgram *prog, const uint8_t *file, uint32_t size, DsdLoadError *err);

// String `index` of STRS: its bytes (NUL-terminated in the file) and length. index must be < str_count.
const char *dsd_prog_str(const DsdProgram *prog, uint32_t index, uint32_t *len);

// DBG lookup: the source file (STRS index) and line of the instruction at code index `pc`. Returns false when no
// entry covers it.
bool dsd_prog_line(const DsdProgram *prog, uint32_t pc, uint32_t *file_str, uint32_t *line);

// The function whose code contains code index `pc`, or DSDB_NONE.
uint32_t dsd_prog_func_at(const DsdProgram *prog, uint32_t pc);

#endif // DSD_DSDB_H
