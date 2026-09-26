// dsd_log.h: the core's side of the C8 runtime log protocol (contracts/log-protocol.md): every DSD| line is
// formatted here, in one static main-RAM buffer, and handed to dsd_plat_log.
#ifndef DSD_LOG_H
#define DSD_LOG_H

#include <stdint.h>

#include "dsd_platform.h"
#include "dsdb.h"
#include "textbuf.h"

typedef struct DsdVm DsdVm;

// A protocol line's longest length in bytes, its final '\n' included (C8: <= 1023 chars).
#define DSD_LOG_LINE_MAX 1023u

// DSD|READY|<runtime version>|<abi hash as 8 lowercase hex digits>, then the flush.
void dsd_log_ready(void);
// DSD|LOG|<text>: '\r' dropped, each '\n' starts a new LOG line, and text longer than one line continues on further
// LOG lines (split between UTF-8 characters, never inside one).
void dsd_log_text(const char *text, uint32_t len);
// One line `prefix` + `fields` (e.g. "DSD|MEM|" + "inst=3/512,..."), cut at the line limit.
void dsd_log_line(const char *prefix, const char *fields, uint32_t len);
// DSD|EXIT|<code>.
void dsd_log_exit(int32_t code);
// DSD|ERR|<code>|<object>|<event>|<file>|<line>|<message>, then the flush. '|' inside the first five fields becomes
// '/'; a newline in the message continues on LOG lines.
void dsd_log_error(const dsd_fatal *err);

// Reports the VM's pending error (vm->err_*) as an ERR line with its object, event, file and line, then calls
// dsd_plat_fatal.
void dsd_report_vm_error(const DsdVm *vm);
// Reports a failed load (R58x) against game.dsdb, then calls dsd_plat_fatal.
void dsd_report_load_error(int32_t code, const char *detail);
// Appends where code index `pc` runs, for messages: "obj_x / Step" in an event, the function name otherwise.
// Event display names: "Create", "Step", "Alarm 0", "Collision obj_pipe", "Button Pressed a", "User Event 3", ...
void dsd_describe_code(const DsdVm *vm, uint32_t pc, DsdText *t);
// Appends the display name of event id `ev_id` (world.h) to t.
void dsd_event_name(const DsdVm *vm, uint32_t ev_id, DsdText *t);
// Writes "R530" for code 530 into buf (at least 8 bytes) and returns buf.
const char *dsd_error_code_text(int32_t code, char *buf);

#endif // DSD_LOG_H
