/**
 * The C13 limits (`contracts/runtime-limits.json`, owner WS2) that the asset pipeline checks. The values are
 * repeated here because this module must stay pure (the preview API runs in the IDE renderer, and the packaged IDE
 * has no `contracts/` folder); `limits.test.ts` fails whenever they drift from the contract file, which stays the
 * single source.
 */

export interface AssetLimits {
  /** OBJ (sprite) memory per screen, bytes. */
  objVramBytesPerScreen: number;
  /** Every sprite frame starts on a multiple of this many bytes (SpriteMapping_1D_128). */
  objVramAlignBytes: number;
  /** 16-colour sprite colour sets per screen. */
  obj16PalettesPerScreen: number;
  /** 256-colour sprite colour sets (extended OBJ palettes) per screen. */
  obj256PalettesPerScreen: number;
  /** 256-colour background colour sets (extended BG palettes) per screen. */
  bg256PaletteSlotsPerScreen: number;
  /** Unique 8x8 tiles one background may have (10-bit tile numbers). */
  bgTilesMax: number;
  /** Largest background side, pixels. */
  bgMaxSize: number;
  /** Sound memory for one room's effects and music, bytes. */
  soundRamBytes: number;
  /** Largest soundbank.bin, bytes. */
  soundbankMaxBytes: number;
}

/** C13 0.1.0 values. Keep in step with contracts/runtime-limits.json (the test enforces it). */
export const LIMITS: Readonly<AssetLimits> = Object.freeze({
  objVramBytesPerScreen: 131072,
  objVramAlignBytes: 128,
  obj16PalettesPerScreen: 16,
  obj256PalettesPerScreen: 16,
  bg256PaletteSlotsPerScreen: 4,
  bgTilesMax: 1024,
  bgMaxSize: 512,
  soundRamBytes: 786432,
  soundbankMaxBytes: 1048576,
});
