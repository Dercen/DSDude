/**
 * Background conversion (C3 section 4): 8bpp, padded to the text-BG size, with the unique-tile count grit's -mRtf
 * reduction will produce. Pure TypeScript.
 */
import { LIMITS } from "../limits.ts";
import type { Problem } from "../problems.ts";
import { TILE_BYTES_8BPP, TILE_SIDE } from "./objsize.ts";
import type { RgbaImage } from "./png.ts";
import { quantizeImage, reductionProblems } from "./quantize.ts";
import { type Converted, stitchFrames } from "./sprite.ts";

/** The two text-BG side lengths: every padded background side is one of them. */
export const BG_SIDE_SMALL = 256;
export const BG_SIDE_LARGE = 512;
/** Bytes per screen-block map entry (-mLs: 16-bit entries). */
export const MAP_ENTRY_BYTES = 2;

/** A converted background. `image` is what goes into the indexed PNG for grit. */
export interface ConvertedBackground {
  /** Full 256-entry palette as DS values, index 0 magenta (transparent / backdrop). */
  palette: number[];
  colors: number;
  sourceColors: number;
  reduced: boolean;
  width: number;
  height: number;
  paddedWidth: number;
  paddedHeight: number;
  /** Palette indices, paddedWidth x paddedHeight. */
  image: Uint8Array;
  /** Unique 8x8 tiles, merging tiles that are equal up to horizontal and vertical flips. */
  tiles: number;
  /** tiles * 64 + the map bytes. */
  vramBytes: number;
}

/** The text-BG side for an image side: 256 when it fits, else 512. */
export function bgSide(side: number): number {
  return side <= BG_SIDE_SMALL ? BG_SIDE_SMALL : BG_SIDE_LARGE;
}

/**
 * Counts unique 8x8 tiles in an indexed image whose sides are multiples of 8, treating a tile and its horizontal,
 * vertical and double flips as one (grit -mRtf). Each tile's key is the smallest of its four flip variants.
 */
export function countUniqueTiles(indices: Uint8Array, width: number, height: number): number {
  const seen = new Set<string>();
  const variant = new Array<number>(TILE_SIDE * TILE_SIDE);
  const LAST = TILE_SIDE - 1;
  /** The flips as (flipX, flipY) pairs: none, horizontal, vertical, both. */
  const FLIPS: readonly (readonly [boolean, boolean])[] = [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ];
  for (let ty = 0; ty < height; ty += TILE_SIDE) {
    for (let tx = 0; tx < width; tx += TILE_SIDE) {
      let key: string | null = null;
      for (const [fx, fy] of FLIPS) {
        for (let y = 0; y < TILE_SIDE; y++) {
          for (let x = 0; x < TILE_SIDE; x++) {
            const sx = tx + (fx ? LAST - x : x);
            const sy = ty + (fy ? LAST - y : y);
            variant[y * TILE_SIDE + x] = indices[sy * width + sx] as number;
          }
        }
        const k = String.fromCharCode(...variant);
        if (key === null || k < key) key = k;
      }
      seen.add(key as string);
    }
  }
  return seen.size;
}

/** Converts a background image (C3 section 4 steps 1-4). */
export function convertBackground(image: RgbaImage): Converted<ConvertedBackground> {
  const problems: Problem[] = [];
  const max = LIMITS.bgMaxSize;
  if (image.width > max || image.height > max) {
    problems.push({ code: "E405", args: { width: image.width, height: image.height, max } });
    return { value: null, problems };
  }
  const q = quantizeImage(image, "256", "alpha");
  problems.push(...reductionProblems(q));
  const paddedWidth = bgSide(image.width);
  const paddedHeight = bgSide(image.height);
  // One "frame" the size of the image, placed at the top-left of a text-BG-sized cell.
  const padded = stitchFrames(q.indices, 1, image.width, image.height, paddedWidth, paddedHeight);
  const tiles = countUniqueTiles(padded, paddedWidth, paddedHeight);
  if (tiles > LIMITS.bgTilesMax) {
    problems.push({ code: "E406", args: { tiles, max: LIMITS.bgTilesMax } });
    return { value: null, problems };
  }
  const mapBytes = (paddedWidth / TILE_SIDE) * (paddedHeight / TILE_SIDE) * MAP_ENTRY_BYTES;
  return {
    value: {
      palette: q.palette,
      colors: q.colors,
      sourceColors: q.sourceColors,
      reduced: q.reduced,
      width: image.width,
      height: image.height,
      paddedWidth,
      paddedHeight,
      image: padded,
      tiles,
      vramBytes: tiles * TILE_BYTES_8BPP + mapBytes,
    },
    problems,
  };
}
