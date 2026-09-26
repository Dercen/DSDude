/**
 * Sprite conversion (C3 section 3): a horizontal strip of frames -> one shared palette -> frames padded to the
 * smallest containing OBJ size -> a vertical sheet one padded frame wide, ready for grit. Also the import-dialog
 * defaults of C1 (frame detection, origin, bbox). Pure TypeScript; problems are returned, never thrown, so the
 * pack turns them into E4xx diagnostics and the preview can still show what it can.
 */
import type { SpriteDefaults as C12SpriteDefaults } from "../preview.ts";
import type { Problem } from "../problems.ts";
import { isObjSize, OBJ_MAX_SIDE, type ObjSize, objSizeFor } from "./objsize.ts";
import type { RgbaImage } from "./png.ts";
import {
  type Dither,
  quantizeImage,
  reductionProblems,
  TRANSPARENT,
  TRANSPARENT_INDEX,
  type TransparentSetting,
  toDsPixels,
} from "./quantize.ts";

/** The `sprite.json` settings a conversion reads (C1). */
export interface SpriteSettings {
  frames: number;
  frameWidth: number;
  frameHeight: number;
  colorMode: "auto" | "16" | "256";
  transparent: TransparentSetting;
  /** Preview only; packs always use "none" in 0.1 (C3 step 5). */
  dither?: Dither;
}

/** A converted sprite. `sheet` is what goes into the indexed PNG for grit. */
export interface ConvertedSprite {
  colorMode: "16" | "256";
  /** Full palette as DS values: 16 or 256 entries, index 0 magenta (transparent). */
  palette: number[];
  /** Palette entries used, including the transparent index 0. */
  colors: number;
  /** Distinct opaque colours in the source. */
  sourceColors: number;
  /** True when colours were merged (E407). */
  reduced: boolean;
  paddedWidth: number;
  paddedHeight: number;
  /** The source strip as palette indices (frames * frameWidth x frameHeight, row-major). */
  strip: Uint8Array;
  /** The stitched sheet as palette indices (paddedWidth x frames * paddedHeight, row-major). */
  sheet: Uint8Array;
}

/** A conversion either succeeds or reports the problems that stopped it (plus any warnings). */
export type Converted<T> = { value: T; problems: Problem[] } | { value: null; problems: Problem[] };

/** Checks the strip against the settings: E402 for a size mismatch, E401 for frames above 64x64. */
export function checkSpriteGeometry(image: RgbaImage, s: SpriteSettings): Problem[] {
  if (image.width !== s.frames * s.frameWidth || image.height !== s.frameHeight) {
    return [
      {
        code: "E402",
        args: {
          width: image.width,
          height: image.height,
          frames: s.frames,
          frameWidth: s.frameWidth,
          frameHeight: s.frameHeight,
          wantWidth: s.frames * s.frameWidth,
        },
      },
    ];
  }
  if (objSizeFor(s.frameWidth, s.frameHeight) === null) {
    return [{ code: "E401", args: { width: s.frameWidth, height: s.frameHeight, max: OBJ_MAX_SIDE } }];
  }
  return [];
}

/**
 * Copies `frames` frames of `srcW` x `srcH` pixels, laid out left to right in `strip`, into a vertical sheet of
 * `dstW` x `frames * dstH`, each frame at the top-left of its cell and the rest filled with index 0.
 */
export function stitchFrames(
  strip: Uint8Array,
  frames: number,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8Array {
  const sheet = new Uint8Array(dstW * dstH * frames).fill(TRANSPARENT_INDEX);
  const stripWidth = frames * srcW;
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < srcH; y++) {
      const from = y * stripWidth + f * srcW;
      sheet.set(strip.subarray(from, from + srcW), (f * dstH + y) * dstW);
    }
  }
  return sheet;
}

/** Converts a sprite strip (C3 section 3 steps 1-8). */
export function convertSprite(image: RgbaImage, s: SpriteSettings): Converted<ConvertedSprite> {
  const problems = checkSpriteGeometry(image, s);
  if (problems.length > 0) return { value: null, problems };
  const q = quantizeImage(image, s.colorMode, s.transparent, s.dither ?? "none");
  const size = objSizeFor(s.frameWidth, s.frameHeight) as ObjSize;
  return {
    value: {
      colorMode: q.colorMode,
      palette: q.palette,
      colors: q.colors,
      sourceColors: q.sourceColors,
      reduced: q.reduced,
      paddedWidth: size.width,
      paddedHeight: size.height,
      strip: q.indices,
      sheet: stitchFrames(q.indices, s.frames, s.frameWidth, s.frameHeight, size.width, size.height),
    },
    problems: reductionProblems(q),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Import defaults (C1 sprite.json defaults)

/** The C1 fields a new import starts with (C12 `SpriteDefaults`). */
export type SpriteDefaults = C12SpriteDefaults;

/**
 * Guesses the frame layout of an imported strip: an image that is exactly one OBJ size is one frame (C1); a strip
 * whose width is a multiple of its height (<= 64) is square frames; anything else is one frame. The user can change
 * the count in the import dialog.
 */
export function detectFrames(width: number, height: number): { frames: number; frameWidth: number } {
  if (isObjSize(width, height)) return { frames: 1, frameWidth: width };
  if (height <= OBJ_MAX_SIDE && width > height && width % height === 0) {
    return { frames: width / height, frameWidth: height };
  }
  return { frames: 1, frameWidth: width };
}

/**
 * The opaque bounds over all frames, relative to one frame (inclusive), or the whole frame when nothing is opaque.
 */
export function opaqueBounds(
  pixels: Int32Array,
  frames: number,
  frameWidth: number,
  frameHeight: number,
): SpriteDefaults["bbox"] {
  const stripWidth = frames * frameWidth;
  let left = frameWidth;
  let top = frameHeight;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < frameHeight; y++) {
    for (let x = 0; x < stripWidth; x++) {
      if (pixels[y * stripWidth + x] === TRANSPARENT) continue;
      const fx = x % frameWidth;
      if (fx < left) left = fx;
      if (fx > right) right = fx;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return { left: 0, top: 0, right: frameWidth - 1, bottom: frameHeight - 1 };
  return { left, top, right, bottom };
}

/** C1 import defaults for a strip: detected frames, the frame centre as origin, the opaque bounds as bbox. */
export function spriteDefaults(image: RgbaImage, transparent: TransparentSetting = "alpha"): SpriteDefaults {
  const { frames, frameWidth } = detectFrames(image.width, image.height);
  const frameHeight = image.height;
  const HALF = 2;
  return {
    frames,
    frameWidth,
    frameHeight,
    origin: { x: Math.floor(frameWidth / HALF), y: Math.floor(frameHeight / HALF) },
    bbox: opaqueBounds(toDsPixels(image, transparent), frames, frameWidth, frameHeight),
  };
}
