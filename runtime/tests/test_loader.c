// test_loader.c: dsd_load accepts the committed fixtures and refuses damaged ones with the right R58x code:
// each case patches one field of hello.dsdb (magic, version, ABI hash, size, an instruction) and reloads it.
#include <string.h>

#include "builtins.h"
#include "dsdb.h"
#include "errors.h"
#include "opcodes.h"
#include "test.h"

#define IMAGE_MAX 4096
#define HELLO "fixtures/bytecode/hello.dsdb"
#define OFF_MAGIC 0
#define OFF_MAJOR 4
#define OFF_ABI 8
#define OFF_SIZE 16
#define SEC_TABLE 32
#define SEC_ENTRY 12
#define SEC_OFFSET_FIELD 4
#define COUNT_BYTES 4
#define OP_BYTE 0   // byte offsets inside an instruction word (little-endian)
#define A_BYTE 1
#define B_BYTE 2
#define C_BYTE 3

static _Alignas(4) uint8_t g_base[IMAGE_MAX];
static _Alignas(4) uint8_t g_img[IMAGE_MAX];
static uint32_t g_size;

// Byte offset of instruction `index` in the image (CODE section: count word, then the words).
static uint32_t code_offset(uint32_t index) {
    uint32_t sec;
    memcpy(&sec, g_base + SEC_TABLE + DSDB_SEC_CODE * SEC_ENTRY + SEC_OFFSET_FIELD, sizeof sec);
    return sec + COUNT_BYTES + index * 4;
}

// Loads g_img (a patched copy) and checks the result code.
static void expect_code(int32_t want, int line) {
    DsdProgram prog;
    DsdLoadError err;
    dsd_test_check_i64(dsd_load(&prog, g_img, g_size, &err), want, __FILE__, line, "dsd_load code");
}
#define EXPECT_CODE(want) expect_code((want), __LINE__)

// Starts a case from the pristine image.
static void reset(void) { memcpy(g_img, g_base, g_size); }

void suite_loader(void) {
    int32_t n = dsd_test_read_file(HELLO, (char *)g_base, IMAGE_MAX);
    if (!CHECK(n > 0)) return;
    g_size = (uint32_t)n;

    // The pristine file loads, and its program-form facts are what hello.dsda says.
    reset();
    DsdProgram prog;
    DsdLoadError err;
    CHECK_EQ(dsd_load(&prog, g_img, g_size, &err), DSD_R_NONE);
    CHECK_EQ(prog.first_room, DSDB_NONE);
    CHECK_EQ(prog.func_count, 1);
    CHECK_EQ(prog.funcs[0].regs, 1);
    uint32_t len;
    CHECK_STR(dsd_prog_str(&prog, prog.funcs[0].name_str, &len), "__main");

    reset();
    g_img[OFF_MAGIC] = 'X';
    EXPECT_CODE(DSD_R_BAD_FILE);

    reset();
    g_img[OFF_MAJOR] = 1;
    EXPECT_CODE(DSD_R_ABI_MISMATCH);

    reset();
    g_img[OFF_ABI] ^= 1;
    EXPECT_CODE(DSD_R_ABI_MISMATCH);

    reset();
    g_img[OFF_SIZE] ^= 4; // header size no longer matches the file
    EXPECT_CODE(DSD_R_BAD_FILE);

    reset();
    expect_code(DSD_R_NONE, __LINE__);
    DsdProgram p2;
    CHECK_EQ(dsd_load(&p2, g_img, g_size - 4, &err), DSD_R_BAD_FILE); // truncated

    // hello's code: LOADK r0, "hello" / CALLN r0, 1, show_debug_message / RET r0, 0.
    reset();
    g_img[code_offset(0) + OP_BYTE] = DSD_OP_ADDII; // reserved (the int-specialised M1 fallback)
    EXPECT_CODE(DSD_R_UNSUPPORTED);

    reset();
    g_img[code_offset(0) + OP_BYTE] = DSD_OPCODE_COUNT; // beyond the table
    EXPECT_CODE(DSD_R_UNSUPPORTED);

    reset();
    g_img[code_offset(0) + A_BYTE] = 1; // r1 in a 1-register frame
    EXPECT_CODE(DSD_R_BAD_FILE);

    reset();
    g_img[code_offset(0) + B_BYTE] = 9; // LOADK Bx = 9: beyond KONS
    EXPECT_CODE(DSD_R_BAD_FILE);

    reset();
    g_img[code_offset(1) + B_BYTE] = 2; // show_debug_message takes exactly one argument
    EXPECT_CODE(DSD_R_BAD_FILE);

    reset();
    g_img[code_offset(1) + C_BYTE] = DSD_BUILTIN_FUNC_COUNT; // no such builtin
    EXPECT_CODE(DSD_R_BAD_FILE);

    reset();
    g_img[code_offset(2) + OP_BYTE] = DSD_OP_MOV; // the function would run off its end
    EXPECT_CODE(DSD_R_BAD_FILE);
}
