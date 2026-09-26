// SPDX-License-Identifier: Zlib
//
// VRAM bank table, BG layers and OAM (PLAN.md 3.3; docs/research/verification.md claim 5).

#include <nds.h>

#include "ds_video.h"

int ds_bg0[DS_SCREENS];
int ds_bg1[DS_SCREENS];

void ds_video_init(void)
{
    // Every enumerator exists in libnds v1.24.0 video.h (claim 5). E, F, H and I are the extended palettes.
    vramSetPrimaryBanks(VRAM_A_MAIN_SPRITE, VRAM_B_MAIN_BG_0x06000000, VRAM_C_SUB_BG, VRAM_D_SUB_SPRITE);
    vramSetBankE(VRAM_E_BG_EXT_PALETTE);
    vramSetBankF(VRAM_F_SPRITE_EXT_PALETTE);
    vramSetBankG(VRAM_G_LCD);
    vramSetBankH(VRAM_H_SUB_BG_EXT_PALETTE);
    vramSetBankI(VRAM_I_SUB_SPRITE_EXT_PALETTE);

    videoSetMode(MODE_0_2D);
    videoSetModeSub(MODE_0_2D);
    bgExtPaletteEnable();
    bgExtPaletteEnableSub();

    // Clear what a previous run left: both BG banks, the standard palettes and every extended palette.
    ds_set_brightness(0);
    dmaFillWords(0, BG_GFX, 128 * 1024);
    dmaFillWords(0, BG_GFX_SUB, 128 * 1024);
    dmaFillWords(0, BG_PALETTE, 512);
    dmaFillWords(0, BG_PALETTE_SUB, 512);
    dmaFillWords(0, SPRITE_PALETTE, 512);
    dmaFillWords(0, SPRITE_PALETTE_SUB, 512);
    static const uint16_t black[256];
    for (int s = 0; s < DS_SCREENS; s++)
    {
        for (int slot = 0; slot < 4; slot++)
            for (int p = 0; p < 16; p++)
                ds_ext_palette_write(s, true, slot, p, black, 256);
        for (int p = 0; p < 16; p++)
            ds_ext_palette_write(s, false, 0, p, black, 256);
    }

    ds_bg0[DS_TOP] = bgInit(0, BgType_Text4bpp, BgSize_T_256x256, DS_BG0_MAP_BASE, DS_BG0_TILE_BASE);
    ds_bg1[DS_TOP] = bgInit(1, BgType_Text8bpp, BgSize_T_256x256, DS_BG1_MAP_BASE, DS_BG1_TILE_BASE);
    ds_bg0[DS_BOTTOM] = bgInitSub(0, BgType_Text4bpp, BgSize_T_256x256, DS_BG0_MAP_BASE, DS_BG0_TILE_BASE);
    ds_bg1[DS_BOTTOM] = bgInitSub(1, BgType_Text8bpp, BgSize_T_256x256, DS_BG1_MAP_BASE, DS_BG1_TILE_BASE);
    for (int s = 0; s < DS_SCREENS; s++)
    {
        bgSetPriority(ds_bg0[s], DS_PRIO_UI);
        bgSetPriority(ds_bg1[s], DS_PRIO_ROOM);
    }

    // 128-byte OBJ VRAM units, extended OBJ palettes on (PLAN.md 3.3 "Sprites").
    oamInit(&oamMain, SpriteMapping_1D_128, true);
    oamInit(&oamSub, SpriteMapping_1D_128, true);
    oamClear(&oamMain, 0, 128);
    oamClear(&oamSub, 0, 128);
    oamUpdate(&oamMain);
    oamUpdate(&oamSub);
}

// VRAM ignores 8-bit writes, so VRAM copies here are 16-bit stores (never memcpy).
static void ds_copy16(volatile uint16_t *dst, const uint16_t *src, int count)
{
    for (int i = 0; i < count; i++)
        dst[i] = src[i];
}

void ds_ext_palette_write(int screen, bool bg, int slot, int pal, const uint16_t *colors, int count)
{
    if (count > 256)
        count = 256;
    if (screen == DS_TOP && bg)
    {
        vramSetBankE(VRAM_E_LCD);
        ds_copy16(&VRAM_E_EXT_PALETTE[slot][pal][0], colors, count);
        vramSetBankE(VRAM_E_BG_EXT_PALETTE);
    }
    else if (screen == DS_TOP)
    {
        vramSetBankF(VRAM_F_LCD);
        ds_copy16(&VRAM_F_EXT_SPR_PALETTE[pal][0], colors, count);
        vramSetBankF(VRAM_F_SPRITE_EXT_PALETTE);
    }
    else if (bg)
    {
        vramSetBankH(VRAM_H_LCD);
        ds_copy16(&VRAM_H_EXT_PALETTE[slot][pal][0], colors, count);
        vramSetBankH(VRAM_H_SUB_BG_EXT_PALETTE);
    }
    else
    {
        vramSetBankI(VRAM_I_LCD);
        ds_copy16(&VRAM_I_EXT_SPR_PALETTE[pal][0], colors, count);
        vramSetBankI(VRAM_I_SUB_SPRITE_EXT_PALETTE);
    }
}

void ds_bg1_resize(int screen, int width, int height)
{
    BgSize size = BgSize_T_256x256;
    if (width > 256 && height > 256)
        size = BgSize_T_512x512;
    else if (width > 256)
        size = BgSize_T_512x256;
    else if (height > 256)
        size = BgSize_T_256x512;
    if (screen == DS_TOP)
        ds_bg1[DS_TOP] = bgInit(1, BgType_Text8bpp, size, DS_BG1_MAP_BASE, DS_BG1_TILE_BASE);
    else
        ds_bg1[DS_BOTTOM] = bgInitSub(1, BgType_Text8bpp, size, DS_BG1_MAP_BASE, DS_BG1_TILE_BASE);
    bgSetPriority(ds_bg1[screen], DS_PRIO_ROOM);
}

void ds_set_brightness(int level)
{
    setBrightness(3, level);
}
