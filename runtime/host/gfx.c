// gfx.c: the host platform's graphics (dsd_platform.h C11 sprites, backgrounds, shadow OAM and UI layer) and the
// screen compositor behind --png-dir (contracts/log-protocol.md "Screens").
//
// The host keeps what the DS would hold in VRAM, decoded to 8-bit colour indices:
//   - sprites: every frame of a GRF sheet (C3 section 3: 8x8 tiles row-major over the padded sheet, frames stacked
//     vertically), with the sprite's own palette (a 256-colour extended set or a 16-colour set);
//   - backgrounds: the 8bpp tiles, the 16-bit screen-block map (grit -mLs) and the 256-colour palette (C3 section 4);
//   - the UI layer: a 32x32-cell map of glyphs and solid cells in 16 UI colours (PLAN.md 3.3), cleared by
//     dsd_plat_frame_begin like the DS's back map.
// Composition follows the DS priorities of 0.1: backdrop, BG1 (priority 2), sprites (priority 1; OAM entry 0 in
// front), BG0 UI (priority 0). Loading never fails for a missing GRF: the core takes no game logic from GRFs, so a
// run without them (a .dsdb root) behaves like one with them and only the pixels differ.
#include <stdlib.h>
#include <string.h>

#include "dsd_platform.h"
#include "font8x8.h"
#include "host.h"
#include "world.h"

// ---- Constants ----------------------------------------------------------------------------------------------------

#define TILE_PX 8                    // tiles are 8x8 pixels
#define TILE_BYTES_8BPP 64           // one 8bpp tile
#define TILE_BYTES_4BPP 32           // one 4bpp tile
#define NIBBLE_BITS 4
#define NIBBLE_MASK 0x0Fu
#define PALETTE_MAX 256              // colours in an 8bpp set
#define PALETTE_4BPP 16              // colours in a 4bpp set
#define TRANSPARENT_INDEX 0          // colour index 0 is transparent in sprites and backgrounds
#define BACKDROP_RGB 0x0000u         // BG palette 0, which DSDude's DS build leaves black
#define HANDLES_MAX (DSD_SCREEN_COUNT * DSD_RT_ASSETS_MAX) // sprite handles live until dsd_plat_assets_free

// Text-BG maps (grit -mLs): 32x32-entry screen blocks, tile number in bits 0-9, flips in bits 10 and 11.
#define SCREEN_BLOCK_TILES 32
#define SCREEN_BLOCK_ENTRIES (SCREEN_BLOCK_TILES * SCREEN_BLOCK_TILES)
#define MAP_TILE_MASK 0x03FFu
#define MAP_HFLIP 0x0400u
#define MAP_VFLIP 0x0800u
#define BG_SIZE_SMALL 256            // text-BG sides are 256 or 512 pixels (C3 section 4)
#define BG_SIZE_LARGE 512

// Affine parameters are 8.8 fixed point.
#define AFFINE_SHIFT 8

// The UI layer: cell entries are 0 (empty), a glyph (ASCII code 0x20-0x7E) or UI_SOLID, plus a colour 0-15.
#define UI_MAP_SIDE 32               // the map is 32x32 cells; DSD_UI_COLS x DSD_UI_ROWS are visible
#define UI_FIRST_CHAR 0x20
#define UI_LAST_CHAR 0x7E
#define UI_BAD_CHAR '?'              // non-printable bytes draw as '?' (C11)
#define UI_SOLID 0xFFu
#define UI_SOLID_ROW 0xFFu          // every pixel of a solid cell's row is set
#define UI_COLOURS 16
#define UI_COLOUR_MASK 0x0Fu         // colours outside 0-15 wrap (C11)

// Placeholder outline for sprites without a GRF (host_render_screen).
#define HOST_PLACEHOLDER_RGB 0x7C1Fu // RGB555 magenta (31, 0, 31)

// RGB555 packing.
#define RGB555_MASK 0x7FFFu        // bit 15 of a palette entry is unused
#define RGB555(r, g, b) ((uint16_t)((r) | ((g) << 5) | ((b) << 10)))

// The 16 UI colours as C11 numbers them (dsd_platform.h, PLAN.md 5.2 order; runtime/platform/ds/src/ds_ui.c agrees):
// white black red green blue yellow orange purple gray ltgray dkgray aqua fuchsia lime maroon navy.
static const uint16_t UI_RGB[UI_COLOURS] = {
    RGB555(31, 31, 31), RGB555(0, 0, 0),    RGB555(31, 0, 0),   RGB555(0, 16, 0),
    RGB555(0, 0, 31),   RGB555(31, 31, 0),  RGB555(31, 20, 8),  RGB555(16, 0, 16),
    RGB555(16, 16, 16), RGB555(24, 24, 24), RGB555(8, 8, 8),    RGB555(0, 31, 31),
    RGB555(31, 0, 31),  RGB555(0, 31, 0),   RGB555(16, 0, 0),   RGB555(0, 0, 16),
};

// ---- State --------------------------------------------------------------------------------------------------------

// One loaded sprite (handle = index in g_sprites).
typedef struct HostSprite {
    bool used;
    uint16_t box_w;              // the frame's OBJ box (C11 dsd_sprite_info, from the core)
    uint16_t box_h;
    uint16_t frames;
    uint8_t *pixels;             // frames * box_w * box_h colour indices, frame after frame; NULL without a GRF
    uint16_t palette[PALETTE_MAX];
} HostSprite;

// One screen's room background (BG1).
typedef struct HostBg {
    bool shown;
    uint32_t width;              // map size in pixels: 256 or 512 each way
    uint32_t height;
    uint8_t *tiles;              // 8bpp tiles, TILE_BYTES_8BPP each
    uint32_t tile_count;
    uint16_t *map;               // screen-block map, (width / 8) * (height / 8) entries
    uint16_t palette[PALETTE_MAX];
    int32_t scroll_x;            // the view position (dsd_plat_bg_scroll)
    int32_t scroll_y;
} HostBg;

static HostSprite g_sprites[HANDLES_MAX];
static uint32_t g_sprite_count;                               // handles handed out since the last assets_free
static HostBg g_bg[DSD_SCREEN_COUNT];
static HostScreenOam g_oam[DSD_SCREEN_COUNT];                 // last submitted shadow OAM per screen
static uint8_t g_ui_cell[DSD_SCREEN_COUNT][UI_MAP_SIDE][UI_MAP_SIDE];   // 0, a glyph code, or UI_SOLID
static uint8_t g_ui_colour[DSD_SCREEN_COUNT][UI_MAP_SIDE][UI_MAP_SIDE]; // 0-15

// Frees every sprite's and background's pixels and forgets the OAM lists.
static void free_assets(void) {
    for (uint32_t h = 0; h < g_sprite_count; h++) free(g_sprites[h].pixels);
    memset(g_sprites, 0, sizeof g_sprites);
    g_sprite_count = 0;
    for (uint32_t s = 0; s < DSD_SCREEN_COUNT; s++) {
        free(g_bg[s].tiles);
        free(g_bg[s].map);
    }
    memset(g_bg, 0, sizeof g_bg);
    memset(g_oam, 0, sizeof g_oam);
}

void host_gfx_reset(void) {
    free_assets();
    memset(g_ui_cell, 0, sizeof g_ui_cell);
    memset(g_ui_colour, 0, sizeof g_ui_colour);
}

// ---- GRF files (grit's RIFF container) ----------------------------------------------------------------------------

#define RIFF_HEADER_BYTES 12         // "RIFF", size, "GRF "
#define CHUNK_HEADER_BYTES 8         // id, size
#define DATA_HEADER_BYTES 4          // GBA-style header in front of GFX/MAP/PAL data: (size << 8) | type
#define DATA_TYPE_MASK 0xFFu
#define DATA_TYPE_RAW 0x00u          // uncompressed (C3's grit lines never compress)
#define DATA_SIZE_SHIFT 8
// HDRX (the header grit 1.24.0 writes): gfxAttr (bits per pixel) at 2, the sheet size at 16 and 20.
#define HDRX_BYTES 24
#define HDRX_GFX_ATTR 2
#define HDRX_GFX_WIDTH 16
#define HDRX_GFX_HEIGHT 20

typedef struct Grf {
    uint32_t bpp;
    uint32_t width;              // the whole sheet or background, pixels
    uint32_t height;
    const uint8_t *gfx;
    uint32_t gfx_size;
    const uint8_t *map;
    uint32_t map_size;
    const uint8_t *pal;
    uint32_t pal_size;
} Grf;

static uint16_t rd16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }
static uint32_t rd32(const uint8_t *p) { return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24); }

// Reads a whole file into malloc'd memory. NULL when it does not exist (or cannot be read).
static uint8_t *read_all(const char *path, uint32_t *size) {
    char full[HOST_PATH_MAX];
    if (!host_nitro_path(path, full, sizeof full)) return NULL;
    FILE *f = fopen(full, "rb");
    if (f == NULL) return NULL;
    uint8_t *buf = NULL;
    long n = fseek(f, 0, SEEK_END) == 0 ? ftell(f) : -1;
    if (n > 0 && fseek(f, 0, SEEK_SET) == 0 && (buf = malloc((size_t)n)) != NULL) {
        if (fread(buf, 1, (size_t)n, f) != (size_t)n) {
            free(buf);
            buf = NULL;
        }
    }
    fclose(f);
    *size = buf != NULL ? (uint32_t)n : 0;
    return buf;
}

// Points *data at an uncompressed data chunk's payload. False when compressed or truncated.
static bool raw_chunk(const uint8_t *body, uint32_t size, const uint8_t **data, uint32_t *data_size) {
    if (size < DATA_HEADER_BYTES) return false;
    uint32_t head = rd32(body);
    uint32_t n = head >> DATA_SIZE_SHIFT;
    if ((head & DATA_TYPE_MASK) != DATA_TYPE_RAW || n > size - DATA_HEADER_BYTES) return false;
    *data = body + DATA_HEADER_BYTES;
    *data_size = n;
    return true;
}

// Parses a GRF held in `file`. False when it is not a GRF grit could have written for C3.
static bool grf_parse(const uint8_t *file, uint32_t size, Grf *g) {
    memset(g, 0, sizeof *g);
    if (size < RIFF_HEADER_BYTES || memcmp(file, "RIFF", 4) != 0 || memcmp(file + 8, "GRF ", 4) != 0) return false;
    bool have_header = false;
    uint32_t at = RIFF_HEADER_BYTES;
    while (at + CHUNK_HEADER_BYTES <= size) {
        const uint8_t *id = file + at;
        uint32_t n = rd32(file + at + 4);
        const uint8_t *body = file + at + CHUNK_HEADER_BYTES;
        if (n > size - at - CHUNK_HEADER_BYTES) return false;
        bool ok = true;
        if (memcmp(id, "HDRX", 4) == 0 && n >= HDRX_BYTES) {
            g->bpp = body[HDRX_GFX_ATTR];
            g->width = rd32(body + HDRX_GFX_WIDTH);
            g->height = rd32(body + HDRX_GFX_HEIGHT);
            have_header = true;
        } else if (memcmp(id, "GFX ", 4) == 0) {
            ok = raw_chunk(body, n, &g->gfx, &g->gfx_size);
        } else if (memcmp(id, "MAP ", 4) == 0) {
            ok = raw_chunk(body, n, &g->map, &g->map_size);
        } else if (memcmp(id, "PAL ", 4) == 0) {
            ok = raw_chunk(body, n, &g->pal, &g->pal_size);
        }
        if (!ok) return false;
        at += CHUNK_HEADER_BYTES + n + (n & 1u); // RIFF chunks are padded to even sizes
    }
    return have_header && (g->bpp == 4 || g->bpp == 8) && g->gfx != NULL && g->pal != NULL;
}

// Copies up to `max` palette colours (RGB555, little-endian) into out; the rest stay black.
static void read_palette(const Grf *g, uint16_t *out, uint32_t max) {
    memset(out, 0, PALETTE_MAX * sizeof *out);
    for (uint32_t i = 0; i < max && 2 * i + 1 < g->pal_size; i++) out[i] = rd16(g->pal + 2 * i) & RGB555_MASK;
}

// Colour index of pixel (x, y) of a tiled image `width` pixels wide (tiles row-major).
static uint8_t tiled_pixel(const Grf *g, uint32_t x, uint32_t y) {
    uint32_t tile = (y / TILE_PX) * (g->width / TILE_PX) + x / TILE_PX;
    uint32_t in_tile = (y % TILE_PX) * TILE_PX + x % TILE_PX;
    if (g->bpp == 8) return g->gfx[tile * TILE_BYTES_8BPP + in_tile];
    uint8_t b = g->gfx[tile * TILE_BYTES_4BPP + in_tile / 2];
    return (uint8_t)((in_tile & 1u) ? b >> NIBBLE_BITS : b & NIBBLE_MASK); // the left pixel is the low nibble
}

// ---- C11: sprites, backgrounds, OAM -------------------------------------------------------------------------------

int32_t dsd_plat_sprite_load(uint32_t screen, const char *grf_path, dsd_sprite_info *info) {
    (void)screen; // handles are unique across both screens on the host
    if (g_sprite_count == HANDLES_MAX) return DSD_PLAT_ENOMEM;
    HostSprite *sp = &g_sprites[g_sprite_count];
    memset(sp, 0, sizeof *sp);
    sp->box_w = info->width;
    sp->box_h = info->height;
    sp->frames = info->frames;
    info->bpp = 8;
    uint32_t size;
    uint8_t *file = read_all(grf_path, &size);
    if (file != NULL) {
        // A GRF that is there must match what the core expects, as ds_obj_upload requires on the DS.
        Grf g;
        uint32_t frame_px = (uint32_t)sp->box_w * sp->box_h;
        bool ok = grf_parse(file, size, &g) && g.width == sp->box_w && g.height >= (uint32_t)sp->frames * sp->box_h &&
                  (uint64_t)g.gfx_size * 8 >= (uint64_t)frame_px * sp->frames * g.bpp;
        if (ok) sp->pixels = malloc((size_t)frame_px * sp->frames + 1);
        if (sp->pixels == NULL) {
            free(file);
            return ok ? DSD_PLAT_ENOMEM : DSD_PLAT_ELOAD; // C11: a GRF that does not match `info` is ELOAD
        }
        for (uint32_t y = 0; y < (uint32_t)sp->frames * sp->box_h; y++) {
            for (uint32_t x = 0; x < sp->box_w; x++) sp->pixels[y * sp->box_w + x] = tiled_pixel(&g, x, y);
        }
        read_palette(&g, sp->palette, g.bpp == 8 ? PALETTE_MAX : PALETTE_4BPP);
        info->bpp = (uint16_t)g.bpp;
        free(file);
    }
    sp->used = true;
    return (int32_t)g_sprite_count++;
}

int32_t dsd_plat_bg_load(uint32_t screen, const char *grf_path) {
    HostBg *bg = &g_bg[screen];
    free(bg->tiles);
    free(bg->map);
    memset(bg, 0, sizeof *bg);
    if (grf_path == NULL) return DSD_PLAT_OK; // BG1 hidden
    uint32_t size;
    uint8_t *file = read_all(grf_path, &size);
    if (file == NULL) return DSD_PLAT_OK;     // no NitroFS files: nothing to show
    Grf g;
    bool sides_ok = false;
    uint32_t entries = 0;
    if (grf_parse(file, size, &g) && g.bpp == 8 && g.map != NULL) {
        sides_ok = (g.width == BG_SIZE_SMALL || g.width == BG_SIZE_LARGE) &&
                   (g.height == BG_SIZE_SMALL || g.height == BG_SIZE_LARGE);
        entries = (g.width / TILE_PX) * (g.height / TILE_PX);
    }
    if (!sides_ok || g.map_size < entries * 2) {
        free(file);
        return DSD_PLAT_ELOAD; // not an 8bpp text BG (the DS build refuses it too)
    }
    bg->width = g.width;
    bg->height = g.height;
    bg->tile_count = g.gfx_size / TILE_BYTES_8BPP;
    bg->tiles = malloc(g.gfx_size + 1);
    bg->map = malloc(entries * sizeof *bg->map);
    if (bg->tiles == NULL || bg->map == NULL) {
        free(file);
        return DSD_PLAT_ENOMEM;
    }
    memcpy(bg->tiles, g.gfx, g.gfx_size);
    for (uint32_t i = 0; i < entries; i++) bg->map[i] = rd16(g.map + 2 * i);
    read_palette(&g, bg->palette, PALETTE_MAX);
    bg->shown = true;
    free(file);
    return DSD_PLAT_OK;
}

void dsd_plat_bg_scroll(uint32_t screen, int32_t x, int32_t y) {
    g_bg[screen].scroll_x = x;
    g_bg[screen].scroll_y = y;
}

void dsd_plat_oam_submit(uint32_t screen, const dsd_oam_entry *list, uint32_t n, const dsd_affine *affine,
                         uint32_t naffine) {
    // The core caps n and naffine (drawlist.c); copy them as submitted.
    HostScreenOam *o = &g_oam[screen];
    memcpy(o->list, list, n * sizeof *list);
    o->n = n;
    memcpy(o->affine, affine, naffine * sizeof *affine);
    o->naffine = naffine;
}

const HostScreenOam *host_oam(uint32_t screen) { return &g_oam[screen]; }

void dsd_plat_screens_blank(bool blank) { (void)blank; } // the host renders only between frames, never mid-load

void dsd_plat_assets_free(void) { free_assets(); }

// ---- C11: the UI layer --------------------------------------------------------------------------------------------

// True when cell (cx, cy) is on the 32x32 map.
static bool on_map(int32_t cx, int32_t cy) { return cx >= 0 && cx < UI_MAP_SIDE && cy >= 0 && cy < UI_MAP_SIDE; }

void dsd_plat_ui_text(uint32_t screen, int32_t cx, int32_t cy, const char *str, uint32_t len, uint32_t colour) {
    for (uint32_t i = 0; i < len; i++, cx++) {
        if (!on_map(cx, cy)) continue;
        uint8_t c = (uint8_t)str[i];
        g_ui_cell[screen][cy][cx] = c < UI_FIRST_CHAR || c > UI_LAST_CHAR ? UI_BAD_CHAR : c;
        g_ui_colour[screen][cy][cx] = (uint8_t)(colour & UI_COLOUR_MASK);
    }
}

void dsd_plat_ui_fill(uint32_t screen, int32_t cx, int32_t cy, int32_t cw, int32_t ch, uint32_t colour) {
    for (int32_t y = cy; y < cy + ch; y++) {
        for (int32_t x = cx; x < cx + cw; x++) {
            if (!on_map(x, y)) continue;
            g_ui_cell[screen][y][x] = UI_SOLID;
            g_ui_colour[screen][y][x] = (uint8_t)(colour & UI_COLOUR_MASK);
        }
    }
}

void dsd_plat_ui_clear(uint32_t screen) {
    memset(g_ui_cell[screen], 0, sizeof g_ui_cell[screen]);
    memset(g_ui_colour[screen], 0, sizeof g_ui_colour[screen]);
}

void dsd_plat_frame_begin(void) {
    // C11: the start of a frame clears the UI layer's back map. The host renders after dsd_plat_frame_end, when the
    // back map has become the shown one, so one map serves both.
    for (uint32_t s = 0; s < DSD_SCREEN_COUNT; s++) dsd_plat_ui_clear(s);
}

// ---- Composition --------------------------------------------------------------------------------------------------

// Room background pixel at screen (x, y), or false when transparent (index 0, a missing tile, or no background).
static bool bg_pixel(const HostBg *bg, int32_t x, int32_t y, uint16_t *rgb) {
    // The map wraps: sides are powers of two, so the offset is taken modulo the side with a mask.
    uint32_t mx = (uint32_t)(x + bg->scroll_x) & (bg->width - 1);
    uint32_t my = (uint32_t)(y + bg->scroll_y) & (bg->height - 1);
    uint32_t tx = mx / TILE_PX;
    uint32_t ty = my / TILE_PX;
    // Screen blocks of 32x32 entries, left to right, then top to bottom (grit -mLs).
    uint32_t blocks_across = bg->width / (SCREEN_BLOCK_TILES * TILE_PX);
    uint32_t block = (ty / SCREEN_BLOCK_TILES) * blocks_across + tx / SCREEN_BLOCK_TILES;
    uint16_t e = bg->map[block * SCREEN_BLOCK_ENTRIES + (ty % SCREEN_BLOCK_TILES) * SCREEN_BLOCK_TILES +
                         tx % SCREEN_BLOCK_TILES];
    uint32_t tile = e & MAP_TILE_MASK;
    if (tile >= bg->tile_count) return false;
    uint32_t px = mx % TILE_PX;
    uint32_t py = my % TILE_PX;
    if (e & MAP_HFLIP) px = TILE_PX - 1 - px;
    if (e & MAP_VFLIP) py = TILE_PX - 1 - py;
    uint8_t index = bg->tiles[tile * TILE_BYTES_8BPP + py * TILE_PX + px];
    if (index == TRANSPARENT_INDEX) return false;
    *rgb = bg->palette[index];
    return true;
}

// Writes pixel (x, y) when it is on the screen.
static void put(HostScreen out, int32_t x, int32_t y, uint16_t rgb) {
    if (x >= 0 && x < DSD_SCREEN_W && y >= 0 && y < DSD_SCREEN_H) out[y][x] = rgb;
}

// Texel (u, v) of frame `frame` of a sprite: true with its colour when opaque.
static bool texel(const HostSprite *sp, uint32_t frame, int32_t u, int32_t v, uint16_t *rgb) {
    if (u < 0 || v < 0 || u >= sp->box_w || v >= sp->box_h) return false;
    uint8_t index = sp->pixels[((size_t)frame * sp->box_h + (uint32_t)v) * sp->box_w + (uint32_t)u];
    if (index == TRANSPARENT_INDEX) return false;
    *rgb = sp->palette[index];
    return true;
}

// Draws one OAM entry. Affine entries sample like the DS: from the centre of the double-size area, the texel is
// ((pa * dx + pb * dy) >> 8 + w / 2, (pc * dx + pd * dy) >> 8 + h / 2) for the pixel offset (dx, dy).
static void draw_entry(HostScreen out, const HostScreenOam *oam, const dsd_oam_entry *o) {
    if (o->sprite >= g_sprite_count || !g_sprites[o->sprite].used) return; // a handle from a freed room
    const HostSprite *sp = &g_sprites[o->sprite];
    int32_t w = sp->box_w;
    int32_t h = sp->box_h;
    bool affine = (o->flags & DSD_OAM_AFFINE) != 0;
    int32_t area_w = affine && (o->flags & DSD_OAM_DOUBLE) ? 2 * w : w;
    int32_t area_h = affine && (o->flags & DSD_OAM_DOUBLE) ? 2 * h : h;
    if (sp->pixels == NULL) {
        // No GRF: outline the drawn area so the placement still shows.
        for (int32_t i = 0; i < area_w; i++) {
            put(out, o->x + i, o->y, HOST_PLACEHOLDER_RGB);
            put(out, o->x + i, o->y + area_h - 1, HOST_PLACEHOLDER_RGB);
        }
        for (int32_t j = 0; j < area_h; j++) {
            put(out, o->x, o->y + j, HOST_PLACEHOLDER_RGB);
            put(out, o->x + area_w - 1, o->y + j, HOST_PLACEHOLDER_RGB);
        }
        return;
    }
    uint32_t frame = sp->frames == 0 ? 0 : o->frame % sp->frames;
    const dsd_affine *m = affine && o->affine < oam->naffine ? &oam->affine[o->affine] : NULL;
    for (int32_t j = 0; j < area_h; j++) {
        for (int32_t i = 0; i < area_w; i++) {
            int32_t u;
            int32_t v;
            if (m != NULL) {
                int32_t dx = i - area_w / 2;
                int32_t dy = j - area_h / 2;
                u = ((m->pa * dx + m->pb * dy) >> AFFINE_SHIFT) + w / 2;
                v = ((m->pc * dx + m->pd * dy) >> AFFINE_SHIFT) + h / 2;
            } else {
                u = (o->flags & DSD_OAM_HFLIP) ? w - 1 - i : i;
                v = (o->flags & DSD_OAM_VFLIP) ? h - 1 - j : j;
            }
            uint16_t rgb;
            if (texel(sp, frame, u, v, &rgb)) put(out, o->x + i, o->y + j, rgb);
        }
    }
}

// Draws the visible 32x24 cells of the UI layer.
static void draw_ui(HostScreen out, uint32_t screen) {
    for (int32_t cy = 0; cy < DSD_UI_ROWS; cy++) {
        for (int32_t cx = 0; cx < DSD_UI_COLS; cx++) {
            uint8_t cell = g_ui_cell[screen][cy][cx];
            if (cell == 0) continue;
            uint16_t rgb = UI_RGB[g_ui_colour[screen][cy][cx]];
            for (int32_t y = 0; y < TILE_PX; y++) {
                uint8_t bits = cell == UI_SOLID ? UI_SOLID_ROW : HOST_FONT8X8[(cell - UI_FIRST_CHAR) * TILE_PX + y];
                for (int32_t x = 0; x < TILE_PX; x++) {
                    if (bits & (1u << x)) put(out, cx * TILE_PX + x, cy * TILE_PX + y, rgb); // bit 0 = leftmost
                }
            }
        }
    }
}

void host_render_screen(uint32_t screen, HostScreen out) {
    const HostBg *bg = &g_bg[screen];
    for (int32_t y = 0; y < DSD_SCREEN_H; y++) {
        for (int32_t x = 0; x < DSD_SCREEN_W; x++) {
            uint16_t rgb = BACKDROP_RGB;
            if (bg->shown) bg_pixel(bg, x, y, &rgb);
            out[y][x] = rgb;
        }
    }
    // OAM entry 0 is in front: draw from the back so front entries overwrite.
    const HostScreenOam *oam = &g_oam[screen];
    for (uint32_t i = oam->n; i-- > 0;) draw_entry(out, oam, &oam->list[i]);
    draw_ui(out, screen);
}
