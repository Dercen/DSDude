/**
 * RGB555 colour maths shared by the sprite, background and icon conversions (C3 section 3, steps 3 and 6).
 * Pure TypeScript: no Node imports, so the preview API can run in the IDE renderer.
 *
 * Two encodings of the same 15-bit colour are used:
 * - the **DS value** `b << 10 | g << 5 | r` (what the palette RAM holds, and the palette sort key), and
 * - the **expanded** value `0xRRGGBB`, each 5-bit channel widened back to 8 bits, used for PNG palettes and the
 *   preview API.
 */

/** Largest value of one 5-bit DS colour channel. */
export const CHANNEL5_MAX = 31;
/** Largest value of one 8-bit PNG colour channel. */
export const CHANNEL8_MAX = 255;
/** Bits per channel in a DS colour; also the shift between the r, g and b fields of a DS value. */
export const CHANNEL5_BITS = 5;
/** Mask selecting one channel of a DS value after shifting it down. */
const CHANNEL5_MASK = 0x1f;
/** Number of distinct RGB555 colours: the size of the 32x32x32 histogram. */
export const RGB555_COLORS = 1 << (3 * CHANNEL5_BITS);

/** Alpha below this is transparent (C3 section 3 step 2): alpha < 128 of 255. */
export const ALPHA_OPAQUE_MIN = 128;

/** Magenta as a DS value (31, 0, 31): palette index 0, the colour grit's -gTFF00FF makes transparent. */
export const MAGENTA_DS = (CHANNEL5_MAX << (2 * CHANNEL5_BITS)) | CHANNEL5_MAX;
/**
 * Where an opaque pixel that lands exactly on magenta is moved (31, 0, 30): otherwise grit would take it for the
 * transparent colour. Blue loses one step, the smallest visible change.
 */
export const MAGENTA_NUDGED_DS = ((CHANNEL5_MAX - 1) << (2 * CHANNEL5_BITS)) | CHANNEL5_MAX;
/** Magenta as an expanded 0xRRGGBB value, written into PNG palettes at index 0. */
export const MAGENTA_RGB = 0xff00ff;

/**
 * Converts one 8-bit channel to 5 bits with rounding to nearest: `floor((c8 * 31 + 127) / 255)` (C3 step 3).
 * Rounding (rather than `c8 >> 3`) keeps light colours from darkening.
 */
export function to5(c8: number): number {
  return Math.floor((c8 * CHANNEL5_MAX + (CHANNEL8_MAX >> 1)) / CHANNEL8_MAX);
}

/**
 * Widens one 5-bit channel to 8 bits by bit replication (`c5 << 3 | c5 >> 2`). grit reduces a PNG palette entry
 * with `>> 3`, which gives `c5` back exactly, so palettes survive the round trip through the indexed PNG.
 */
export function to8(c5: number): number {
  return (c5 << 3) | (c5 >> 2);
}

/** Packs 5-bit channels into a DS value `b << 10 | g << 5 | r`. */
export function packDs(r5: number, g5: number, b5: number): number {
  return (b5 << (2 * CHANNEL5_BITS)) | (g5 << CHANNEL5_BITS) | r5;
}

/** Red channel (0..31) of a DS value. */
export function dsR(ds: number): number {
  return ds & CHANNEL5_MASK;
}

/** Green channel (0..31) of a DS value. */
export function dsG(ds: number): number {
  return (ds >> CHANNEL5_BITS) & CHANNEL5_MASK;
}

/** Blue channel (0..31) of a DS value. */
export function dsB(ds: number): number {
  return (ds >> (2 * CHANNEL5_BITS)) & CHANNEL5_MASK;
}

/** Converts 8-bit r, g, b to a DS value (C3 step 3). */
export function rgb8ToDs(r8: number, g8: number, b8: number): number {
  return packDs(to5(r8), to5(g8), to5(b8));
}

/** Expands a DS value to 0xRRGGBB (each channel widened with `to8`). */
export function dsToRgb(ds: number): number {
  return (to8(dsR(ds)) << 16) | (to8(dsG(ds)) << 8) | to8(dsB(ds));
}

/** Squared distance between two DS values in 5-bit channel units: the nearest-colour metric of C3 step 5. */
export function dsDistance2(a: number, b: number): number {
  const dr = dsR(a) - dsR(b);
  const dg = dsG(a) - dsG(b);
  const db = dsB(a) - dsB(b);
  return dr * dr + dg * dg + db * db;
}

/**
 * Parses a `"#rrggbb"` transparent colour (C1 `transparent`) into a DS value, or returns null for anything else
 * (including `"alpha"`).
 */
export function parseHexColorToDs(value: string): number | null {
  const match = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(value);
  if (match === null) return null;
  const HEX_RADIX = 16;
  return rgb8ToDs(
    Number.parseInt(match[1] as string, HEX_RADIX),
    Number.parseInt(match[2] as string, HEX_RADIX),
    Number.parseInt(match[3] as string, HEX_RADIX),
  );
}
