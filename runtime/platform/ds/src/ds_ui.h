// SPDX-License-Identifier: Zlib
//
// ds_ui.h: the BG0 UI layer on both screens (PLAN.md 3.3 "Backgrounds and the UI layer"): the built-in 8x8 font
// (runtime/data/font8x8.bin), one solid tile, 16 UI colours (one standard BG palette each), and a double-buffered
// 32x24-cell map committed at VBlank. The error box and the SELECT console overlay draw on it too.

#ifndef DSD_DS_UI_H
#define DSD_DS_UI_H

#include <stdbool.h>
#include <stdint.h>

#define DS_UI_COLS 32
#define DS_UI_ROWS 24
#define DS_UI_COLOURS 16

// UI colour indices, in the PLAN.md 5.2 order of the GML c_* names.
enum {
    DS_C_WHITE, DS_C_BLACK, DS_C_RED, DS_C_GREEN, DS_C_BLUE, DS_C_YELLOW, DS_C_ORANGE, DS_C_PURPLE,
    DS_C_GRAY, DS_C_LTGRAY, DS_C_DKGRAY, DS_C_AQUA, DS_C_FUCHSIA, DS_C_LIME, DS_C_MAROON, DS_C_NAVY,
};

// Loads the font and solid tile into both screens' BG0 tiles, sets the 16 UI palettes, clears both maps.
void ds_ui_init(void);

// Text in 8-pixel cells from (cx, cy); clipped at the screen edge, no wrapping. Characters outside 0x20-0x7E
// draw as '?'. Colour is 0-15 (others wrap).
void ds_ui_text(int screen, int cx, int cy, const char *str, int colour);

// Backgrounds for ds_ui_text_panel: none (the room shows through), or the error-box and console panel colours.
enum { DS_UI_PANEL_NONE, DS_UI_PANEL_MAROON, DS_UI_PANEL_NAVY };

// ds_ui_text with every cell's background filled with a panel colour.
void ds_ui_text_panel(int screen, int cx, int cy, const char *str, int colour, int panel);

// ds_ui_text for the first `len` bytes of `str` (C11 dsd_plat_ui_text; the text need not be NUL-terminated).
void ds_ui_textn(int screen, int cx, int cy, const char *str, uint32_t len, int colour);

// A filled rectangle of cw x ch cells.
void ds_ui_fill(int screen, int cx, int cy, int cw, int ch, int colour);

// Clears the screen's shadow map.
void ds_ui_clear(int screen);

// Copies both shadow maps to VRAM. Call right after swiWaitForVBlank().
void ds_ui_commit(void);

// The error box: a red panel on the bottom screen with the code, where and message, and "START: restart".
void ds_ui_error_box(const char *code, const char *where, const char *message);

// The console overlay (SELECT): the last lines passed to ds_ui_console_add, drawn over the bottom screen.
void ds_ui_console_add(const char *line);
void ds_ui_console_draw(int screen);

#endif // DSD_DS_UI_H
