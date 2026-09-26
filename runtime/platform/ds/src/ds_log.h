// SPDX-License-Identifier: Zlib
//
// ds_log.h: the C8 log writer on the DS (contracts/log-protocol.md "Printing" and "Flush pad"). One protocol,
// chosen once at boot from the emulator ID at 0x04FFFA00. Adapted from WS1's samples/hello writer (CC0).

#ifndef DSD_DS_LOG_H
#define DSD_DS_LOG_H

#include <stdbool.h>
#include <stddef.h>

// Characters per line, the '\n' included (C8).
#define DSD_LOG_LINE_MAX 1023

typedef enum {
    DSD_LOG_RAW = 1,    // melonDS / no$gba: the line plus '\n' is written to 0x04FFFA10
    DSD_LOG_LEGACY = 2, // DeSmuME / hardware: the line plus '\n' goes through the legacy-signature RAM stub
} ds_log_protocol;

// Reads the emulator ID and picks the protocol. Call once, before any other ds_log_* call.
ds_log_protocol ds_log_init(void);

// The emulator ID read at boot (up to 16 printable characters; empty on hardware).
const char *ds_log_emulator_id(void);

// Prints one whole DSD| line (no '\n'; cut to 1022 characters). A DSD|READY, DSD|ERR or DSD|STAT line is followed
// by the flush pad, so callers never pad by hand.
void ds_log_line(const char *line);

// Prints `prefix` + `text` as C8 LOG text: '\n' in `text` starts a new line with the same prefix, '\r' is
// dropped, and text beyond one line continues on further lines.
void ds_log_text(const char *prefix, const char *text);

// Formats one line printf-style into the static line buffer and prints it with ds_log_line().
void ds_log_linef(const char *fmt, ...) __attribute__((format(printf, 1, 2)));

// The flush pad: six DSD|PAD| lines of 1023 characters (6138 bytes >= 5 KB).
void ds_log_pad(void);

#endif // DSD_DS_LOG_H
