// SPDX-License-Identifier: CC0-1.0
//
// The C8 log writer (contracts/log-protocol.md): one protocol, chosen once at boot from the emulator ID.

#ifndef DSD_LOG_H__
#define DSD_LOG_H__

#include <stdbool.h>

typedef enum {
    DSD_LOG_RAW = 1,    // melonDS / no$gba: the line plus '\n' is written to 0x04FFFA10
    DSD_LOG_LEGACY = 2, // DeSmuME / hardware: the line plus '\n' goes through the legacy-signature RAM stub
} dsd_log_protocol;

// Reads the emulator ID at 0x04FFFA00 and picks the protocol. Call once, before any other dsd_log_* call.
dsd_log_protocol dsd_log_init(void);

// Prints one line. `line` has no '\n'; it is cut to 1022 characters so the line with its '\n' fits 1023.
void dsd_log_line(const char *line);

// Prints `prefix` followed by `text`, splitting on '\n' (each part is a new line with the same prefix) and on the
// 1023-character limit, and dropping '\r' (C8 LOG text rules).
void dsd_log_text(const char *prefix, const char *text);

// The flush pad: six DSD|PAD| lines of 1023 characters (6138 bytes >= 5 KB), so buffered stdout reaches the pipe.
void dsd_log_pad(void);

// The emulator ID read at boot (up to 16 characters, NUL-terminated; empty on hardware).
const char *dsd_log_emulator_id(void);

#endif // DSD_LOG_H__
