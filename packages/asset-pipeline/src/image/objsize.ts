/**
 * The 12 DS OBJ (hardware sprite) sizes and frame padding (C3 section 3 step 7). Pure TypeScript.
 */

/** One OBJ size in pixels. */
export interface ObjSize {
  width: number;
  height: number;
}

/** The largest OBJ side: frames above 64 pixels in either dimension are E401. */
export const OBJ_MAX_SIDE = 64;

/**
 * The 12 OBJ sizes (3 shapes x 4 sizes), sorted by area. For any frame that fits, the first size in this list
 * that contains it is the unique smallest containing size (checked by the tests).
 */
export const OBJ_SIZES: readonly ObjSize[] = [
  { width: 8, height: 8 },
  { width: 16, height: 8 },
  { width: 8, height: 16 },
  { width: 16, height: 16 },
  { width: 32, height: 8 },
  { width: 8, height: 32 },
  { width: 32, height: 16 },
  { width: 16, height: 32 },
  { width: 32, height: 32 },
  { width: 64, height: 32 },
  { width: 32, height: 64 },
  { width: 64, height: 64 },
];

/** The smallest OBJ size containing a `width` x `height` frame, or null when the frame is larger than 64x64. */
export function objSizeFor(width: number, height: number): ObjSize | null {
  return OBJ_SIZES.find((s) => s.width >= width && s.height >= height) ?? null;
}

/** True when `width` x `height` is exactly one of the 12 OBJ sizes (import default: one frame). */
export function isObjSize(width: number, height: number): boolean {
  return OBJ_SIZES.some((s) => s.width === width && s.height === height);
}

/** Pixels per tile side. */
export const TILE_SIDE = 8;
/** Bytes per 8x8 tile at 8 bits per pixel. */
export const TILE_BYTES_8BPP = 64;
/** Bytes per 8x8 tile at 4 bits per pixel. */
export const TILE_BYTES_4BPP = 32;

/** Bytes of one padded frame in the GRF: `(w/8) * (h/8) * 64` at 8bpp, `* 32` at 4bpp (C3 section 3). */
export function frameBytes(paddedWidth: number, paddedHeight: number, colorMode: "16" | "256"): number {
  const tileBytes = colorMode === "16" ? TILE_BYTES_4BPP : TILE_BYTES_8BPP;
  return (paddedWidth / TILE_SIDE) * (paddedHeight / TILE_SIDE) * tileBytes;
}

/** Rounds `value` up to a multiple of `align` (the OBJ memory stride, `objVramAlignBytes`). */
export function roundUp(value: number, align: number): number {
  return Math.ceil(value / align) * align;
}
