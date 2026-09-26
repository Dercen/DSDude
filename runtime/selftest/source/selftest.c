// SPDX-License-Identifier: Zlib
//
// The DS selftest ROM (docs/kickoff/ws3.md task 3; PLAN.md 6 WS3; spikes 10 and 11). It runs the platform layer
// without the core: VRAM banks and extended palettes, 128 sprites per screen in 128-byte-aligned OBJ VRAM slots
// (one of them an 8x8 4bpp sprite), a GRF room background on BG1 of each screen, the BG0 UI layer, touch and D-pad
// input, a maxmod effect and module, NitroFS, the C8 log writer, the error box and the console overlay, a timed
// 1 MB NitroFS read, the C-stack high-water mark in DSD|MEM, and a scanline page for the hardware OBJ line budget.
//
// Pages (L/R): 1 sprites + backgrounds, 2 scanline (A: normal / affine / affine double-size; UP/DOWN n +-1,
// LEFT/RIGHT n +-8), 3 the error box (START: back to page 1), 4 results: the boot figures on screen for hardware,
// which has no stdout (the emulator ID bytes, log protocol, 1 MB read time, maxmod codes, stack and heap). SELECT toggles the console. On page 1, A plays the
// blip effect, B starts/stops the BG scrolling and sprite animation, and touch or the D-pad moves the 8x8 sprite.
// The screen at boot is still (no animation, no timings on screen) so that its screenshot can match a golden PNG:
// py-desmume is not cycle-exact between runs, so anything that moves could be one frame off.

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <maxmod9.h>
#include <nds.h>

#include "builtins_table.h"
#include "dsd_platform.h"
#include "ds_gfx.h"
#include "ds_log.h"
#include "ds_mem.h"
#include "ds_platform.h"
#include "ds_sys.h"
#include "ds_snd.h"
#include "ds_ui.h"
#include "ds_video.h"
#include "soundbank.h"

// fixtures/runtime/selftest/commands.txt: the byte sum of nitro:/big.bin.
#define BIG_BYTES (1024u * 1024u)
#define BIG_SUM 133693440u
#define READ_CHUNK (32u * 1024u)

enum { PAGE_SPRITES, PAGE_SCANLINE, PAGE_ERROR, PAGE_RESULTS, PAGES };
enum { SCAN_NORMAL, SCAN_AFFINE, SCAN_DOUBLE, SCAN_MODES };
static const char *const scan_mode_names[SCAN_MODES] = {"normal", "affine", "affine2x"};

static ds_sprite spr16[DS_SCREENS];
static ds_sprite spr8;
static ds_sprite spr64;
static bool spr16_ok[DS_SCREENS], spr8_ok, spr64_ok;

static volatile uint32_t vblanks;
static char line[DSD_LOG_LINE_MAX + 1];
static char text[96];

static int page = PAGE_SPRITES;
static bool console_on;
static bool animate;
static uint32_t anim_frame;
static int scan_n = 8;
static int scan_mode = SCAN_NORMAL;
static int cursor_x = 212, cursor_y = 44;
static int touch_x = -1, touch_y = -1;
static uint32_t sfx_drop;
static char read_result[40] = "1MB read: -";
static char sound_result[40] = "sound: off";
// Boot figures for the results page (hardware reads them off the screen).
static uint32_t read_us, read_kbps;
static bool read_ok;
static unsigned mm_load = 99, mm_blip = 99, mm_loop = 99, mm_bad = 99, mm_handle;

static void on_vblank(void)
{
    vblanks++;
}

// A DSD|LOG line that also goes to the console overlay.
static void slog(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
static void slog(const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    int n = snprintf(line, sizeof(line), "DSD|LOG|");
    vsnprintf(line + n, sizeof(line) - (size_t)n, fmt, ap);
    va_end(ap);
    ds_ui_console_add(line + 8);
    ds_log_line(line);
}

static void keys_str(uint32_t keys, char *out, size_t cap)
{
    static const struct { uint32_t bit; const char *name; } names[] = {
        {KEY_A, "A"},         {KEY_B, "B"},           {KEY_X, "X"},         {KEY_Y, "Y"},
        {KEY_L, "L"},         {KEY_R, "R"},           {KEY_START, "START"}, {KEY_SELECT, "SELECT"},
        {KEY_UP, "UP"},       {KEY_DOWN, "DOWN"},     {KEY_LEFT, "LEFT"},   {KEY_RIGHT, "RIGHT"},
        {KEY_TOUCH, "TOUCH"},
    };
    out[0] = '\0';
    for (size_t i = 0; i < sizeof(names) / sizeof(names[0]); i++)
        if (keys & names[i].bit)
        {
            if (out[0] != '\0')
                strncat(out, ",", cap - strlen(out) - 1);
            strncat(out, names[i].name, cap - strlen(out) - 1);
        }
    if (out[0] == '\0')
        strncpy(out, "-", cap);
}

// ---- Boot: graphics -----------------------------------------------------------------------------------------

// Palette variant k of a 256-colour palette: k = 0 as is, 1-3 rotate the RGB channels or invert them.
static void palette_variant(const uint16_t *src, uint16_t *dst, int count, int k)
{
    for (int i = 0; i < count; i++)
    {
        uint16_t c = src[i];
        int r = c & 31, g = (c >> 5) & 31, b = (c >> 10) & 31;
        switch (k)
        {
            case 1: dst[i] = (uint16_t)RGB15(g, b, r); break;
            case 2: dst[i] = (uint16_t)RGB15(b, r, g); break;
            case 3: dst[i] = (uint16_t)RGB15(31 - r, 31 - g, 31 - b); break;
            default: dst[i] = c; break;
        }
    }
}

static bool load_sprite(int screen, const char *path, int w, int h, int first_pal, int pals, ds_sprite *out)
{
    ds_grf g;
    int err = ds_grf_load(path, &g);
    if (err != GRF_NO_ERROR)
    {
        slog("grf: %s screen=%d err=%d", path, screen, err);
        return false;
    }
    bool ok = ds_obj_upload(screen, &g, w, h, 0, out);
    if (ok && g.pal != NULL)
    {
        static uint16_t pal[256];
        int count = (int)(g.pal_size / 2);
        for (int k = 0; k < pals; k++)
        {
            palette_variant(g.pal, pal, count, k);
            ds_obj_palette(screen, out->bpp, first_pal + k, pal, count);
        }
    }
    slog("grf: %s screen=%d err=0 bpp=%d frames=%d offset=%lu stride=%lu upload=%s", path, screen, g.hdr.gfxAttr,
         ok ? out->frames : 0, ok ? (unsigned long)out->offset : 0ul, ok ? (unsigned long)out->stride : 0ul,
         ok ? "ok" : "FAILED");
    ds_grf_free(&g);
    return ok;
}

static void load_graphics(void)
{
    for (int s = 0; s < DS_SCREENS; s++)
    {
        int err = ds_bg_load(s, "nitro:/bg/bg.grf");
        slog("bg: nitro:/bg/bg.grf screen=%d err=%d", s, err);
        spr16_ok[s] = load_sprite(s, "nitro:/gfx/spr16.grf", 16, 16, 0, 4, &spr16[s]);
    }
    spr8_ok = load_sprite(DS_BOTTOM, "nitro:/gfx/spr8x8.grf", 8, 8, 0, 1, &spr8);
    spr64_ok = load_sprite(DS_TOP, "nitro:/gfx/spr64.grf", 64, 64, 4, 1, &spr64);
}

// ---- Boot: sound (spike 11: every maxmod return code) ---------------------------------------------------------

static void start_sound(void)
{
    if (!ds_sound_ready)
    {
        slog("mm: no soundbank");
        return;
    }
    slog("mm: mmInitDefault(nitro:/soundbank.bin)=ok");
    mm_load = (unsigned)mmLoad(MOD_SELFTEST);
    slog("mm: mmLoad(MOD_SELFTEST)=%u", mm_load);
    mm_blip = (unsigned)mmLoadEffect(SFX_BLIP);
    slog("mm: mmLoadEffect(SFX_BLIP)=%u", mm_blip);
    mm_loop = (unsigned)mmLoadEffect(SFX_LOOP);
    slog("mm: mmLoadEffect(SFX_LOOP)=%u", mm_loop);
    mm_bad = (unsigned)mmLoadEffect(MSL_NSAMPS + 5);
    slog("mm: mmLoadEffect(%d)=%u (bad id)", MSL_NSAMPS + 5, mm_bad);
    mmStart(MOD_SELFTEST, MM_PLAY_LOOP);
    slog("mm: mmStart(MOD_SELFTEST, MM_PLAY_LOOP) active=%d", (int)mmActive());
    mm_sfxhand h = mmEffect(SFX_BLIP);
    mm_handle = (unsigned)h;
    slog("mm: mmEffect(SFX_BLIP)=%lu", (unsigned long)h);
    if (h == 0)
        sfx_drop++;
    else
        mmEffectRelease(h);
    snprintf(sound_result, sizeof(sound_result), "sound: module started");
}

// ---- Boot: the timed 1 MB NitroFS read (sets the room-load budget) -------------------------------------------

static void timed_read(void)
{
    uint8_t *buf = malloc(READ_CHUNK);
    FILE *f = fopen("nitro:/big.bin", "rb");
    if (buf == NULL || f == NULL)
    {
        slog("nitrofs: big.bin %s", f == NULL ? "missing" : "no memory");
        if (f != NULL)
            fclose(f);
        free(buf);
        return;
    }
    uint32_t total = 0, sum = 0;
    cpuStartTiming(0);
    for (;;)
    {
        size_t n = fread(buf, 1, READ_CHUNK, f);
        for (size_t i = 0; i < n; i++)
            sum += buf[i];
        total += (uint32_t)n;
        if (n < READ_CHUNK)
            break;
    }
    uint32_t ticks = cpuEndTiming();
    fclose(f);
    free(buf);
    uint32_t us = timerTicks2usec(ticks);
    uint32_t kbps = us ? (uint32_t)((uint64_t)total * 1000000u / 1024u / us) : 0;
    bool ok = total == BIG_BYTES && sum == BIG_SUM;
    read_us = us;
    read_kbps = kbps;
    read_ok = ok;
    // Timings last: the console overlay shows the first 32 characters, which must not change between runs.
    slog("nitrofs: read %lu B sum=%lu %s in %lu us (%lu ticks, %lu ARM9 cycles, %lu KB/s)", (unsigned long)total,
         (unsigned long)sum, ok ? "ok" : "BAD", (unsigned long)us, (unsigned long)ticks, (unsigned long)(ticks * 2u),
         (unsigned long)kbps);
    snprintf(read_result, sizeof(read_result), "1MB read: %s", ok ? "ok" : "BAD");
}

// ---- Log-path checks (C8 text rules) --------------------------------------------------------------------------

static void log_checks(void)
{
    static char longtext[301];
    for (int i = 0; i < 300; i++)
        longtext[i] = (char)('0' + i % 10);
    longtext[300] = '\0';
    memcpy(longtext, "long300:", 8);
    ds_log_text("DSD|LOG|", longtext);
    ds_log_text("DSD|LOG|", "percent: 100% done %d %s %%");
    ds_log_text("DSD|LOG|", "split: first\r\nsplit: second");
}

static void log_mem(void)
{
    // The selftest loaded SFX_BLIP, SFX_LOOP and MOD_SELFTEST (start_sound).
    static const uint16_t effects[] = {SFX_BLIP, SFX_LOOP};
    static const uint16_t modules[] = {MOD_SELFTEST};
    uint32_t snd = ds_sound_ready ? ds_snd_resident(effects, 2, modules, 1) : 0;
    ds_log_linef("DSD|MEM|heapfree=%lu,snd=%lu/768,objvram_top=%lu/128,objvram_bot=%lu/128,cstack=%lu/%lu",
                 (unsigned long)(ds_heap_free() / 1024u), (unsigned long)((snd + 1023u) / 1024u),
                 (unsigned long)((ds_obj_used(DS_TOP) + 1023u) / 1024u),
                 (unsigned long)((ds_obj_used(DS_BOTTOM) + 1023u) / 1024u),
                 (unsigned long)((ds_cstack_used() + 1023u) / 1024u), (unsigned long)(ds_cstack_total() / 1024u));
}

// ---- Per frame ----------------------------------------------------------------------------------------------

static void handle_input(uint32_t frame)
{
    scanKeys();
    uint32_t down = keysDown(), up = keysUp(), held = keysHeld();
    if ((down | up) & ~(uint32_t)KEY_TOUCH)
    {
        char d[64], u[64], h[64];
        keys_str(down & ~(uint32_t)KEY_TOUCH, d, sizeof(d));
        keys_str(up & ~(uint32_t)KEY_TOUCH, u, sizeof(u));
        keys_str(held & ~(uint32_t)KEY_TOUCH, h, sizeof(h));
        slog("input: down=%s up=%s held=%s", d, u, h);
    }

    static uint32_t last_touch_log;
    if (held & KEY_TOUCH)
    {
        touchPosition t;
        touchRead(&t);
        bool moved = abs(t.px - touch_x) >= 4 || abs(t.py - touch_y) >= 4;
        if (down & KEY_TOUCH)
            slog("touch: press %d,%d", t.px, t.py);
        else if (moved && frame - last_touch_log >= 8)
        {
            slog("touch: drag %d,%d", t.px, t.py);
            last_touch_log = frame;
        }
        touch_x = t.px;
        touch_y = t.py;
        cursor_x = t.px - 4;
        cursor_y = t.py - 4;
    }
    else if (up & KEY_TOUCH)
        slog("touch: release %d,%d", touch_x, touch_y);

    if (down & KEY_SELECT)
        console_on = !console_on;
    if (down & KEY_R)
        page = (page + 1) % PAGES;
    if (down & KEY_L)
        page = (page + PAGES - 1) % PAGES;

    if (page == PAGE_SPRITES)
    {
        if (held & KEY_LEFT) cursor_x--;
        if (held & KEY_RIGHT) cursor_x++;
        if (held & KEY_UP) cursor_y--;
        if (held & KEY_DOWN) cursor_y++;
        if (down & KEY_B)
        {
            animate = !animate;
            slog("anim: %s", animate ? "on" : "off");
        }
        if (down & KEY_A && ds_sound_ready)
        {
            mm_sfxhand h = mmEffect(SFX_BLIP);
            slog("mm: mmEffect(SFX_BLIP)=%lu", (unsigned long)h);
            if (h == 0)
                sfx_drop++;
            else
                mmEffectRelease(h);
        }
    }
    else if (page == PAGE_SCANLINE)
    {
        int n = scan_n, mode = scan_mode;
        if (down & KEY_UP) n++;
        if (down & KEY_DOWN) n--;
        if (down & KEY_RIGHT) n += 8;
        if (down & KEY_LEFT) n -= 8;
        if (down & KEY_A) mode = (mode + 1) % SCAN_MODES;
        n = n < 0 ? 0 : n > 128 ? 128 : n;
        if (n != scan_n || mode != scan_mode)
        {
            scan_n = n;
            scan_mode = mode;
            slog("scanline: n=%d mode=%s", scan_n, scan_mode_names[scan_mode]);
        }
    }
    else if (page == PAGE_ERROR && (down & KEY_START))
        page = PAGE_SPRITES;

    cursor_x = cursor_x < 0 ? 0 : cursor_x > 248 ? 248 : cursor_x;
    cursor_y = cursor_y < 0 ? 0 : cursor_y > 184 ? 184 : cursor_y;
}

// OBJ line cycles per PLAN.md 5.2 C13: 2 per OBJ plus width (normal) or 10 + 2 x width (affine; double size
// counts the doubled width).
static int scan_cycles(void)
{
    int per = scan_mode == SCAN_NORMAL ? 2 + 64 : scan_mode == SCAN_AFFINE ? 10 + 2 * 64 : 10 + 2 * 128;
    return scan_n * per;
}

static int build_oam(uint32_t anim)
{
    int used[DS_SCREENS] = {0, 0};
    for (int s = 0; s < DS_SCREENS; s++)
        oamClear(ds_oam(s), 0, 128);

    if (page == PAGE_SPRITES)
    {
        // Top: 128 16x16 8bpp sprites, 4 extended palettes, animated through the 3 frames.
        for (int i = 0; i < 128 && spr16_ok[DS_TOP]; i++)
            oamSet(&oamMain, i, (i % 16) * 16, 40 + (i / 16) * 16, DS_PRIO_SPRITES, (i / 32) & 3, spr16[DS_TOP].size,
                   spr16[DS_TOP].format, ds_obj_frame_ptr(DS_TOP, &spr16[DS_TOP], (int)((i + anim / 8) % 3)), -1,
                   false, false, false, false, false);
        used[DS_TOP] = spr16_ok[DS_TOP] ? 128 : 0;

        // Bottom: 127 16x16 sprites + the 8x8 4bpp cursor = 128.
        for (int i = 0; i < 127 && spr16_ok[DS_BOTTOM]; i++)
            oamSet(&oamSub, i, (i % 16) * 16, 64 + (i / 16) * 16, DS_PRIO_SPRITES, 3 - ((i / 32) & 3),
                   spr16[DS_BOTTOM].size, spr16[DS_BOTTOM].format,
                   ds_obj_frame_ptr(DS_BOTTOM, &spr16[DS_BOTTOM], (int)((i + anim / 8) % 3)), -1, false, false,
                   false, false, false);
        if (spr8_ok)
            oamSet(&oamSub, 127, cursor_x, cursor_y, DS_PRIO_SPRITES, 0, spr8.size, spr8.format,
                   ds_obj_frame_ptr(DS_BOTTOM, &spr8, 0), -1, false, false, false, false, false);
        used[DS_BOTTOM] = (spr16_ok[DS_BOTTOM] ? 127 : 0) + (spr8_ok ? 1 : 0);
    }
    else if (page == PAGE_SCANLINE && spr64_ok)
    {
        // N 64x64 sprites on one line (y 64..127), spread over the screen width.
        oamRotateScale(&oamMain, 0, 0, 1 << 8, 1 << 8);
        for (int i = 0; i < scan_n; i++)
        {
            int x = scan_n > 1 ? (i * 192) / (scan_n - 1) : 96;
            bool affine = scan_mode != SCAN_NORMAL, dbl = scan_mode == SCAN_DOUBLE;
            oamSet(&oamMain, i, dbl ? x - 32 : x, dbl ? 32 : 64, DS_PRIO_SPRITES, 4, spr64.size, spr64.format,
                   ds_obj_frame_ptr(DS_TOP, &spr64, 0), affine ? 0 : -1, dbl, false, false, false, false);
        }
        used[DS_TOP] = scan_n;
    }
    return used[DS_TOP] + used[DS_BOTTOM] * 1000;
}

// Info text on the navy panel, readable over the room background.
static void info(int screen, int cx, int cy, const char *str, int colour)
{
    ds_ui_text_panel(screen, cx, cy, str, colour, DS_UI_PANEL_NAVY);
}

static void draw_ui(void)
{
    char keys[64];
    ds_ui_clear(DS_TOP);
    ds_ui_clear(DS_BOTTOM);
    snprintf(text, sizeof(text), "DSDude selftest %s", DSD_RUNTIME_VERSION);
    info(DS_TOP, 0, 0, text, DS_C_WHITE);
    snprintf(text, sizeof(text), "page %d/%d  L/R: page", page + 1, PAGES);
    info(DS_TOP, 0, 1, text, DS_C_YELLOW);
    snprintf(text, sizeof(text), "emu: %s", ds_log_emulator_id()[0] ? ds_log_emulator_id() : "(none)");
    info(DS_TOP, 0, 2, text, DS_C_LTGRAY);

    if (page == PAGE_SPRITES)
    {
        info(DS_TOP, 0, 3, "128 sprites, 4 ext palettes", DS_C_AQUA);
        keys_str(keysHeld() & ~(uint32_t)KEY_TOUCH, keys, sizeof(keys));
        snprintf(text, sizeof(text), "keys: %s", keys);
        info(DS_BOTTOM, 0, 0, text, DS_C_WHITE);
        if (touch_x >= 0)
            snprintf(text, sizeof(text), "touch: %d,%d", touch_x, touch_y);
        else
            snprintf(text, sizeof(text), "touch: -");
        info(DS_BOTTOM, 0, 1, text, DS_C_WHITE);
        info(DS_BOTTOM, 0, 2, sound_result, DS_C_LIME);
        info(DS_BOTTOM, 0, 3, read_result, DS_C_LIME);
        info(DS_BOTTOM, 0, 4, animate ? "B: anim on " : "B: anim off", DS_C_LTGRAY);
        info(DS_BOTTOM, 0, 5, "A: blip  SELECT: console", DS_C_LTGRAY);
        // A filled rectangle and the 16 UI colours.
        ds_ui_fill(DS_BOTTOM, 24, 0, 8, 4, DS_C_ORANGE);
        for (int c = 0; c < DS_UI_COLOURS; c++)
            ds_ui_fill(DS_BOTTOM, 16 + (c % 8), 6 + c / 8, 1, 1, c);
    }
    else if (page == PAGE_SCANLINE)
    {
        snprintf(text, sizeof(text), "scanline: n=%d %s", scan_n, scan_mode_names[scan_mode]);
        info(DS_TOP, 0, 3, text, DS_C_AQUA);
        snprintf(text, sizeof(text), "OBJ line cycles: %d", scan_cycles());
        info(DS_BOTTOM, 0, 0, text, scan_cycles() > 2178 ? DS_C_RED : scan_cycles() > 2048 ? DS_C_ORANGE : DS_C_WHITE);
        info(DS_BOTTOM, 0, 1, "3DS: 2178 ok, 2208 drops", DS_C_LTGRAY);
        info(DS_BOTTOM, 0, 2, "warning at 2048 (C13 0.2.0)", DS_C_LTGRAY);
        info(DS_BOTTOM, 0, 4, "UP/DOWN n+-1  LEFT/RIGHT n+-8", DS_C_GRAY);
        info(DS_BOTTOM, 0, 5, "A: normal/affine/affine2x", DS_C_GRAY);
    }
    else if (page == PAGE_RESULTS)
    {
        info(DS_TOP, 0, 3, "results (read out or photograph)", DS_C_AQUA);
        // The raw 16 bytes at 0x04FFFA00 (the no$gba/melonDS emulator ID; open bus on hardware).
        char hex[40];
        for (int i = 0; i < 8; i++)
            snprintf(hex + 3 * i, sizeof(hex) - (size_t)(3 * i), "%02X ", REG_NOCASH_EMULATOR_ID[i]);
        info(DS_BOTTOM, 0, 0, "0x04FFFA00 bytes 0-7:", DS_C_LTGRAY);
        info(DS_BOTTOM, 0, 1, hex, DS_C_WHITE);
        for (int i = 0; i < 8; i++)
            snprintf(hex + 3 * i, sizeof(hex) - (size_t)(3 * i), "%02X ", REG_NOCASH_EMULATOR_ID[8 + i]);
        info(DS_BOTTOM, 0, 2, hex, DS_C_WHITE);
        snprintf(text, sizeof(text), "log protocol: %s", ds_log_protocol_name());
        info(DS_BOTTOM, 0, 3, text, DS_C_WHITE);
        info(DS_BOTTOM, 0, 4, ds_sys_describe(), ds_sys_dsi_mode() ? DS_C_ORANGE : DS_C_WHITE);
        snprintf(text, sizeof(text), "1MB read: %lu ms %lu KB/s %s", (unsigned long)(read_us / 1000u),
                 (unsigned long)read_kbps, read_ok ? "ok" : "BAD");
        info(DS_BOTTOM, 0, 5, text, read_ok ? DS_C_LIME : DS_C_RED);
        snprintf(text, sizeof(text), "mm load=%u blip=%u loop=%u", mm_load, mm_blip, mm_loop);
        info(DS_BOTTOM, 0, 6, text, DS_C_WHITE);
        snprintf(text, sizeof(text), "mm bad id=%u handle=%u active=%d", mm_bad, mm_handle, ds_sound_ready && mmActive());
        info(DS_BOTTOM, 0, 7, text, DS_C_WHITE);
        snprintf(text, sizeof(text), "cstack %lu/%lu B", (unsigned long)ds_cstack_used(), (unsigned long)ds_cstack_total());
        info(DS_BOTTOM, 0, 9, text, DS_C_WHITE);
        snprintf(text, sizeof(text), "heap free %lu KB", (unsigned long)(ds_heap_free() / 1024u));
        info(DS_BOTTOM, 0, 10, text, DS_C_WHITE);
        info(DS_BOTTOM, 0, 12, "expected: load=0 blip=0 loop=0", DS_C_GRAY);
        info(DS_BOTTOM, 0, 13, "bad id=1 handle>0 active=1", DS_C_GRAY);
    }
    else
    {
        info(DS_TOP, 0, 3, "the error box (bottom screen)", DS_C_AQUA);
        ds_ui_error_box("R999", "selftest page 3",
                        "This is the error box. On a real error START restarts the game; here START goes back "
                        "to page 1.");
    }
    if (console_on)
        ds_ui_console_draw(DS_BOTTOM);
}

int main(int argc, char **argv)
{
    (void)argc;
    (void)argv;

    ds_cstack_paint();
    ds_log_init();
    ds_video_init();
    ds_ui_init();
    if (ds_platform_init() != DSD_PLAT_OK)
    {
        ds_log_linef("DSD|ERR|R584||||0|selftest: NitroFS or the soundbank did not start");
        ds_log_pad();
        ds_error_screen("R584", ds_boot_diag[0] ? ds_boot_diag : "selftest", "NitroFS or the soundbank did not start.");
    }
    irqSet(IRQ_VBLANK, on_vblank);
    irqEnable(IRQ_VBLANK);

    ds_log_linef("DSD|READY|%s|%08lx", DSD_RUNTIME_VERSION, (unsigned long)DSD_ABI_HASH);
    slog("selftest: emulator=%s log=%s", ds_log_emulator_id()[0] ? ds_log_emulator_id() : "(none)",
         ds_log_protocol_name());

    load_graphics();
    start_sound();
    timed_read();
    log_checks();
    log_mem();

    // Start the fps window on a VBlank: sampled mid-frame, a VBlank during the first iteration would make its
    // swiWaitForVBlank wait for the next one, and the first second would read 59.
    swiWaitForVBlank();
    uint32_t frame = 0, second_start = vblanks, frames_this_second = 0, mm_checked = 0;
    for (;;)
    {
        handle_input(frame);
        if (animate && page == PAGE_SPRITES)
            anim_frame++;
        int used = build_oam(anim_frame);
        draw_ui();
        bgSetScroll(ds_bg1[DS_TOP], (int)anim_frame, 0);
        bgSetScroll(ds_bg1[DS_BOTTOM], -(int)anim_frame, 0);

        swiWaitForVBlank();
        bgUpdate();
        oamUpdate(&oamMain);
        oamUpdate(&oamSub);
        ds_ui_commit();
        frame++;
        frames_this_second++;

        if (!mm_checked && frame == 60 && ds_sound_ready)
        {
            mm_checked = 1;
            slog("mm: after 60 frames active=%d position=%lu row=%lu", (int)mmActive(),
                 (unsigned long)mmGetPosition(), (unsigned long)mmGetPositionRow());
        }
        if (vblanks - second_start >= 60)
        {
            uint32_t fps = frames_this_second * 60u / (vblanks - second_start);
            ds_log_linef("DSD|STAT|fps=%lu,inst=0,spr_top=%d,spr_bot=%d,oam_drop=0,aff_drop=0,sfx_drop=%lu,ops=0",
                         (unsigned long)fps, used % 1000, used / 1000, (unsigned long)sfx_drop);
            second_start = vblanks;
            frames_this_second = 0;
        }
    }
}
