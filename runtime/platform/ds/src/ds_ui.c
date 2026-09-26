// SPDX-License-Identifier: Zlib
//
// The BG0 UI layer (PLAN.md 3.3). Tile 0 is blank. Tile 1 + p*96 + g is glyph g (ASCII 0x20 + g) of panel set p:
// set 0 has a transparent background, set 1 a maroon one (the error box), set 2 a navy one (the console). The last
// tile is solid. Glyphs and the solid tile draw with colour index 1; UI colour c is standard BG palette c, whose
// index 1 is that colour, index 2 maroon and index 3 navy (index 0 stays transparent). A map entry is
// tile | (colour << 12).

#include <string.h>

#include <nds.h>

#include "ds_ui.h"
#include "ds_video.h"
#include "font8x8_bin.h"

#define DS_UI_FIRST_CHAR 0x20
#define DS_UI_GLYPHS 96
#define DS_UI_PANELS 3
#define DS_UI_SOLID_TILE (1 + DS_UI_PANELS * DS_UI_GLYPHS)
#define DS_UI_MAP_WORDS (32 * 32)

// PLAN.md 5.2: c_white c_black c_red c_green c_blue c_yellow c_orange c_purple c_gray c_ltgray c_dkgray c_aqua
// c_fuchsia c_lime c_maroon c_navy, with GameMaker's RGB values.
static const uint16_t ds_ui_rgb[DS_UI_COLOURS] = {
    RGB15(31, 31, 31), RGB15(0, 0, 0),    RGB15(31, 0, 0),   RGB15(0, 16, 0),   RGB15(0, 0, 31), RGB15(31, 31, 0),
    RGB15(31, 20, 8),  RGB15(16, 0, 16),  RGB15(16, 16, 16), RGB15(24, 24, 24), RGB15(8, 8, 8),  RGB15(0, 31, 31),
    RGB15(31, 0, 31),  RGB15(0, 31, 0),   RGB15(16, 0, 0),   RGB15(0, 0, 16),
};

// Shadow maps in main RAM, committed at VBlank.
static uint16_t ds_ui_map[DS_SCREENS][DS_UI_MAP_WORDS] __attribute__((aligned(4)));

#define DS_CONSOLE_LINES 20
static char ds_console[DS_CONSOLE_LINES][DS_UI_COLS + 1];
static int ds_console_next;
static int ds_console_count;

// One 4bpp tile row from one font byte (bit 0 = leftmost pixel): set bits become index 1, clear ones `bg`.
static uint32_t ds_ui_row(uint8_t bits, uint32_t bg)
{
    uint32_t row = 0;
    for (int x = 0; x < 8; x++)
        row |= ((bits & (1u << x)) ? 1u : bg) << (4 * x);
    return row;
}

void ds_ui_init(void)
{
    static uint32_t tiles[(DS_UI_SOLID_TILE + 1) * 8];
    static const uint32_t panel_bg[DS_UI_PANELS] = {0, 2, 3};
    memset(tiles, 0, sizeof(tiles));
    for (int p = 0; p < DS_UI_PANELS; p++)
        for (int g = 0; g < DS_UI_GLYPHS && (size_t)(g * 8 + 8) <= font8x8_bin_size; g++)
            for (int y = 0; y < 8; y++)
                tiles[(1 + p * DS_UI_GLYPHS + g) * 8 + y] = ds_ui_row(font8x8_bin[g * 8 + y], panel_bg[p]);
    for (int y = 0; y < 8; y++)
        tiles[DS_UI_SOLID_TILE * 8 + y] = 0x11111111u;

    DC_FlushRange(tiles, sizeof(tiles));
    for (int s = 0; s < DS_SCREENS; s++)
    {
        dmaCopy(tiles, bgGetGfxPtr(ds_bg0[s]), sizeof(tiles));
        volatile uint16_t *pal = s == DS_TOP ? BG_PALETTE : BG_PALETTE_SUB;
        for (int c = 0; c < DS_UI_COLOURS; c++)
        {
            pal[c * 16 + 1] = ds_ui_rgb[c];
            pal[c * 16 + 2] = ds_ui_rgb[DS_C_MAROON];
            pal[c * 16 + 3] = ds_ui_rgb[DS_C_NAVY];
        }
        ds_ui_clear(s);
    }
    ds_ui_commit();
}

static uint16_t ds_ui_entry(int tile, int colour)
{
    return (uint16_t)(tile | ((colour & 15) << 12));
}

void ds_ui_text_panel(int screen, int cx, int cy, const char *str, int colour, int panel)
{
    if (cy < 0 || cy >= DS_UI_ROWS || panel < 0 || panel >= DS_UI_PANELS)
        return;
    for (; *str != '\0' && cx < DS_UI_COLS; str++, cx++)
    {
        if (cx < 0)
            continue;
        unsigned char c = (unsigned char)*str;
        if (c < DS_UI_FIRST_CHAR || c > 0x7E)
            c = '?';
        ds_ui_map[screen][cy * 32 + cx] = ds_ui_entry(1 + panel * DS_UI_GLYPHS + (c - DS_UI_FIRST_CHAR), colour);
    }
}

void ds_ui_text(int screen, int cx, int cy, const char *str, int colour)
{
    ds_ui_text_panel(screen, cx, cy, str, colour, DS_UI_PANEL_NONE);
}

void ds_ui_fill(int screen, int cx, int cy, int cw, int ch, int colour)
{
    for (int y = cy; y < cy + ch; y++)
        for (int x = cx; x < cx + cw; x++)
            if (x >= 0 && x < DS_UI_COLS && y >= 0 && y < DS_UI_ROWS)
                ds_ui_map[screen][y * 32 + x] = ds_ui_entry(DS_UI_SOLID_TILE, colour);
}

void ds_ui_clear(int screen)
{
    memset(ds_ui_map[screen], 0, sizeof(ds_ui_map[screen]));
}

void ds_ui_commit(void)
{
    DC_FlushRange(ds_ui_map, sizeof(ds_ui_map));
    for (int s = 0; s < DS_SCREENS; s++)
        dmaCopy(ds_ui_map[s], bgGetMapPtr(ds_bg0[s]), sizeof(ds_ui_map[s]));
}

// Writes `text` into rows [row, row_end) at `col`, wrapping at `width` (at a space when there is one); returns
// the next free row.
static int ds_ui_wrap(int screen, int col, int width, int row, int row_end, const char *text, int colour, int panel)
{
    char line[DS_UI_COLS + 1];
    while (*text != '\0' && row < row_end)
    {
        int n = (int)strnlen(text, (size_t)width);
        if (text[n] != '\0')
        {
            int cut = n;
            while (cut > 0 && text[cut] != ' ')
                cut--;
            if (cut > 0)
                n = cut;
        }
        memcpy(line, text, (size_t)n);
        line[n] = '\0';
        ds_ui_text_panel(screen, col, row++, line, colour, panel);
        text += n;
        while (*text == ' ')
            text++;
    }
    return row;
}

void ds_ui_error_box(const char *code, const char *where, const char *message)
{
    const int s = DS_BOTTOM;
    const int p = DS_UI_PANEL_MAROON;
    ds_ui_clear(s);
    ds_ui_fill(s, 1, 2, 30, 20, DS_C_MAROON);
    ds_ui_text_panel(s, 2, 3, "Your game stopped", DS_C_YELLOW, p);
    int row = ds_ui_wrap(s, 2, 28, 5, 17, message, DS_C_WHITE, p);
    if (where != NULL && where[0] != '\0')
        ds_ui_wrap(s, 2, 28, row + 1, 18, where, DS_C_LTGRAY, p);
    ds_ui_text_panel(s, 2, 19, code, DS_C_YELLOW, p);
    ds_ui_text_panel(s, 2, 20, "START: restart", DS_C_YELLOW, p);
}

void ds_ui_console_add(const char *line)
{
    strncpy(ds_console[ds_console_next], line, DS_UI_COLS);
    ds_console[ds_console_next][DS_UI_COLS] = '\0';
    ds_console_next = (ds_console_next + 1) % DS_CONSOLE_LINES;
    if (ds_console_count < DS_CONSOLE_LINES)
        ds_console_count++;
}

void ds_ui_console_draw(int screen)
{
    const int p = DS_UI_PANEL_NAVY;
    ds_ui_fill(screen, 0, 2, DS_UI_COLS, DS_CONSOLE_LINES + 1, DS_C_NAVY);
    ds_ui_text_panel(screen, 0, 2, "console (SELECT closes)", DS_C_YELLOW, p);
    int first = (ds_console_next - ds_console_count + DS_CONSOLE_LINES) % DS_CONSOLE_LINES;
    for (int i = 0; i < ds_console_count; i++)
        ds_ui_text_panel(screen, 0, 3 + i, ds_console[(first + i) % DS_CONSOLE_LINES], DS_C_WHITE, p);
}
