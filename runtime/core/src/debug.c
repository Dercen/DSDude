// debug.c: C8 log lines and runtime error reports (dsd_log.h).
#include <string.h>

#include "builtins_table.h"
#include "dsd_log.h"
#include "errors.h"
#include "game.h"
#include "vm.h"

#define LOG_PREFIX "DSD|LOG|"
#define LOG_PREFIX_LEN 8u
#define CODE_TEXT_MAX 8u            // "R" + up to 6 digits + NUL
#define LOAD_FILE "game.dsdb"       // the file load errors point at
#define UTF8_LEAD2 0xC0u            // lead-byte patterns: 110xxxxx, 1110xxxx, 11110xxx
#define UTF8_LEAD3 0xE0u
#define UTF8_LEAD4 0xF0u
#define UTF8_LEAD5 0xF8u

// The one line buffer (C8: formatted in static main RAM). One spare byte keeps room for the '\n'.
static char g_line[DSD_LOG_LINE_MAX + 1];

// Starts a line in g_line; its capacity leaves one byte for the '\n' emit() adds.
static DsdText line_begin(const char *prefix) {
    DsdText t;
    dsd_text_init(&t, g_line, DSD_LOG_LINE_MAX); // len <= DSD_LOG_LINE_MAX - 1
    dsd_text_str(&t, prefix);
    return t;
}

// Terminates the line with '\n' and hands it to the platform.
static void emit(DsdText *t) {
    t->buf[t->len++] = '\n';
    dsd_plat_log(t->buf, t->len);
}

// Bytes in the UTF-8 character whose lead byte is c (1 for ASCII and for stray bytes).
static uint32_t utf8_len(uint8_t c) {
    if (c >= UTF8_LEAD4 && c < UTF8_LEAD5) return 4;
    if (c >= UTF8_LEAD3) return c < UTF8_LEAD4 ? 3 : 1;
    if (c >= UTF8_LEAD2) return 2;
    return 1;
}

// Appends a field of an ERR line: '|' becomes '/', line breaks become spaces.
static void field(DsdText *t, const char *s) {
    for (; *s != '\0'; s++) {
        char c = *s;
        if (c == '|') c = '/';
        if (c == '\n' || c == '\r') c = ' ';
        dsd_text_char(t, c);
    }
}

void dsd_log_ready(void) {
    DsdText t = line_begin("DSD|READY|");
    dsd_text_str(&t, DSD_RUNTIME_VERSION);
    dsd_text_char(&t, '|');
    dsd_text_hex8(&t, DSD_ABI_HASH);
    emit(&t);
    dsd_plat_log_flush();
}

void dsd_log_text(const char *text, uint32_t len) {
    DsdText t = line_begin(LOG_PREFIX);
    uint32_t i = 0;
    while (i < len) {
        uint8_t c = (uint8_t)text[i];
        if (c == '\r') {
            i++;
            continue;
        }
        if (c == '\n') {
            emit(&t);
            t = line_begin(LOG_PREFIX);
            i++;
            continue;
        }
        uint32_t n = utf8_len(c);
        if (n > len - i) n = len - i;
        if (t.len + n > t.cap - 1) { // the character does not fit: continue on the next LOG line
            emit(&t);
            t = line_begin(LOG_PREFIX);
        }
        dsd_text_bytes(&t, text + i, n);
        i += n;
    }
    emit(&t);
}

void dsd_log_exit(int32_t code) {
    DsdText t = line_begin("DSD|EXIT|");
    dsd_text_int(&t, code);
    emit(&t);
}

void dsd_log_error(const dsd_fatal *err) {
    DsdText t = line_begin("DSD|ERR|");
    field(&t, err->code);
    dsd_text_char(&t, '|');
    field(&t, err->object);
    dsd_text_char(&t, '|');
    field(&t, err->event);
    dsd_text_char(&t, '|');
    field(&t, err->file);
    dsd_text_char(&t, '|');
    dsd_text_int(&t, err->line);
    dsd_text_char(&t, '|');
    // The message is the last field: '|' may stay; its first line goes here, the rest on LOG lines.
    const char *msg = err->message;
    uint32_t n = 0;
    while (msg[n] != '\0' && msg[n] != '\n') n++;
    for (uint32_t i = 0; i < n; i++) {
        if (msg[i] != '\r') dsd_text_char(&t, msg[i]);
    }
    emit(&t);
    if (msg[n] == '\n') dsd_log_text(msg + n + 1, (uint32_t)strlen(msg + n + 1));
    dsd_plat_log_flush();
}

const char *dsd_error_code_text(int32_t code, char *buf) {
    DsdText t;
    dsd_text_init(&t, buf, CODE_TEXT_MAX);
    dsd_text_char(&t, 'R');
    dsd_text_int(&t, code);
    return buf;
}

// Name of the function containing `pc`, or "" when none does.
static const char *function_name(const DsdVm *vm, uint32_t pc) {
    uint32_t f = dsd_prog_func_at(vm->prog, pc);
    uint32_t len;
    return f == DSDB_NONE ? "" : dsd_prog_str(vm->prog, vm->prog->funcs[f].name_str, &len);
}

void dsd_describe_code(const DsdVm *vm, uint32_t pc, DsdText *t) {
    // Program form has no objects: the function name alone. Events add "obj / " once instances exist (task 6).
    dsd_text_str(t, function_name(vm, pc));
}

void dsd_report_vm_error(const DsdVm *vm) {
    char code[CODE_TEXT_MAX];
    uint32_t file_str;
    uint32_t line;
    uint32_t len;
    dsd_fatal f;
    f.code = dsd_error_code_text(vm->err_code, code);
    f.object = "";
    f.event = function_name(vm, vm->err_pc);
    f.file = "";
    f.line = 0;
    if (dsd_prog_line(vm->prog, vm->err_pc, &file_str, &line)) {
        f.file = dsd_prog_str(vm->prog, file_str, &len);
        f.line = (int32_t)line;
    }
    f.message = vm->err_msg;
    dsd_log_error(&f);
    dsd_plat_fatal(&f);
}

void dsd_report_load_error(int32_t code, const char *detail) {
    static char msg[DSD_ERR_MSG_MAX];
    char code_text[CODE_TEXT_MAX];
    DsdText t;
    dsd_text_init(&t, msg, sizeof msg);
    // Messages follow runtime/core/diagnostics/catalog.json.
    switch (code) {
    case DSD_R_ABI_MISMATCH:
        dsd_text_str(&t, "This ROM was built for a different DSDude runtime");
        break;
    case DSD_R_UNSUPPORTED:
        dsd_text_str(&t, "This game uses something this DSDude runtime can't do yet (");
        break;
    case DSD_R_FILE_TOO_BIG:
        dsd_text_str(&t, "The game is too big for the DS (");
        break;
    case DSD_R_NO_FILE:
        dsd_text_str(&t, "The game file could not be read (");
        break;
    default:
        dsd_text_str(&t, "The game file is damaged (");
        break;
    }
    if (code != DSD_R_ABI_MISMATCH) {
        dsd_text_str(&t, detail);
        dsd_text_char(&t, ')');
    }
    dsd_fatal f = {dsd_error_code_text(code, code_text), "", "", LOAD_FILE, 0, msg};
    dsd_log_error(&f);
    dsd_plat_fatal(&f);
}
