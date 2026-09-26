// SPDX-License-Identifier: Zlib
//
// ds_video.h: VRAM banks, the two BG layers and OAM on both screens (PLAN.md 3.3 "VRAM", "Backgrounds").
// Screen 0 is the top screen (main engine), screen 1 the bottom (sub engine).

#ifndef DSD_DS_VIDEO_H
#define DSD_DS_VIDEO_H

#include <stdbool.h>
#include <stdint.h>

#include <nds.h>

#define DS_SCREENS 2
#define DS_TOP 0
#define DS_BOTTOM 1

// BG VRAM layout per screen (128 KB, bank B main / C sub):
//   BG0 UI map    map base 0   0x00000-0x007FF (32x32 entries)
//   BG1 room map  map base 4   0x02000-0x03FFF (up to 64x64 entries, 512x512)
//   BG0 UI tiles  tile base 1  0x04000-        (97 4bpp tiles: blank, 95 glyphs, solid)
//   BG1 tiles     tile base 2  0x08000-0x17FFF (<= 1024 8bpp tiles)
#define DS_BG0_MAP_BASE 0
#define DS_BG1_MAP_BASE 4
#define DS_BG0_TILE_BASE 1
#define DS_BG1_TILE_BASE 2
#define DS_BG1_EXT_SLOT 1

// Layer priorities: UI above sprites above the room background (PLAN.md 3.3 "priority map").
#define DS_PRIO_UI 0
#define DS_PRIO_SPRITES 1
#define DS_PRIO_ROOM 2

// bgInit ids of BG0 and BG1 per screen.
extern int ds_bg0[DS_SCREENS];
extern int ds_bg1[DS_SCREENS];

// The OamState of a screen.
static inline OamState *ds_oam(int screen)
{
    return screen == DS_TOP ? &oamMain : &oamSub;
}

// Maps banks A-I per the section 3.3 table, sets mode 0 with BG and OBJ extended palettes on both engines,
// initialises BG0 (4bpp UI) and BG1 (8bpp room, ext palette slot 1) and OAM with SpriteMapping_1D_128.
void ds_video_init(void);

// Writes `count` colours of an extended palette: BG slot `slot` palette `pal` (bg = true) or OBJ palette `pal`
// (bg = false). The bank is mapped as LCD while it is written, then remapped (PLAN.md 3.3).
void ds_ext_palette_write(int screen, bool bg, int slot, int pal, const uint16_t *colors, int count);

// Re-sizes BG1 of a screen for a room background (width/height 256 or 512).
void ds_bg1_resize(int screen, int width, int height);

// Both screens' brightness: 0 normal, -16 black (room-load blanking).
void ds_set_brightness(int level);

#endif // DSD_DS_VIDEO_H
