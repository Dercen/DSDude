// numfmt.h: number-to-text formatting for string(), show_debug_message and draw_text (contracts/language.md
// section 4 "Printing"; PLAN.md 2.8). The core never uses printf's %d/%f for script-visible text: these functions
// are the one formatter, identical on the host and the DS.
#ifndef DSD_NUMFMT_H
#define DSD_NUMFMT_H

#include <stdint.h>

#include "value.h"

// Buffer size that holds any formatted number plus its NUL: "-2147483648" is 11 chars, the longest fixed value
// "-524288" + ".xx" is 10.
#define DSD_NUMFMT_BUF 16

// Each writes a NUL-terminated string into buf (at least DSD_NUMFMT_BUF bytes) and returns its length.
// An int in plain decimal: "42", "-7", "-2147483648".
int32_t dsd_fmt_int(int32_t v, char *buf);
// A Q20.12 value: its exact value rounded half away from zero to 2 decimals, trailing zeros and a trailing point
// dropped, never "-0": 2.5 -> "2.5", 410/4096 -> "0.1", 0.125 -> "0.13", 3.0 -> "3", -0.001 -> "0".
int32_t dsd_fmt_fixed(int32_t q12, char *buf);
// A number cell (INT or REAL) by the rules above. Any other tag writes "" and returns 0: strings, bools, arrays
// and undefined are formatted by the string layer.
int32_t dsd_fmt_number(DsdValue v, char *buf);

#endif // DSD_NUMFMT_H
