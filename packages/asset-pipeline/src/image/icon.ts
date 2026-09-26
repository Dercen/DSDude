/**
 * The game icon (C3 section 6): any PNG scaled to fit 32x32 (aspect kept, centred on transparency) and reduced to
 * 15 colours + transparent, as ndstool -b requires. Pure TypeScript.
 */
import type { RgbaImage } from "./png.ts";
import { quantizeImage, reductionProblems } from "./quantize.ts";
import type { Converted } from "./sprite.ts";

/** The DS icon is 32x32 pixels. */
export const ICON_SIDE = 32;
/** Bytes per RGBA8 pixel. */
const RGBA_BYTES = 4;

/** A converted icon: 32x32 palette indices and a 16-entry DS palette (index 0 transparent). */
export interface ConvertedIcon {
  palette: number[];
  indices: Uint8Array;
  colors: number;
  reduced: boolean;
}

/** The size an image gets when scaled to fit `ICON_SIDE` with its aspect ratio kept (integer rounding). */
export function fitSize(width: number, height: number): { width: number; height: number } {
  if (width >= height) {
    return { width: ICON_SIDE, height: Math.max(1, Math.floor((ICON_SIDE * height + width / 2) / width)) };
  }
  return { width: Math.max(1, Math.floor((ICON_SIDE * width + height / 2) / height)), height: ICON_SIDE };
}

/**
 * Scales an RGBA image to `w` x `h`. Each target pixel averages its source rectangle (integer area averaging with
 * alpha-weighted colour); when growing, the rectangle is one source pixel, which is nearest neighbour.
 */
export function resizeRgba(image: RgbaImage, w: number, h: number): RgbaImage {
  const out = new Uint8Array(w * h * RGBA_BYTES);
  const span = (i: number, from: number, to: number): [number, number] => {
    const start = Math.floor((i * from) / to);
    return [start, Math.max(start + 1, Math.floor(((i + 1) * from) / to))];
  };
  for (let y = 0; y < h; y++) {
    const [y0, y1] = span(y, image.height, h);
    for (let x = 0; x < w; x++) {
      const [x0, x1] = span(x, image.width, w);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const at = (sy * image.width + sx) * RGBA_BYTES;
          const alpha = image.rgba[at + 3] as number;
          r += (image.rgba[at] as number) * alpha;
          g += (image.rgba[at + 1] as number) * alpha;
          b += (image.rgba[at + 2] as number) * alpha;
          a += alpha;
          n++;
        }
      }
      const at = (y * w + x) * RGBA_BYTES;
      if (a > 0) {
        const half = Math.floor(a / 2);
        out[at] = Math.floor((r + half) / a);
        out[at + 1] = Math.floor((g + half) / a);
        out[at + 2] = Math.floor((b + half) / a);
      }
      out[at + 3] = Math.floor((a + Math.floor(n / 2)) / n);
    }
  }
  return { width: w, height: h, rgba: out };
}

/** Scales the image to fit 32x32 and centres it on a transparent 32x32 canvas. */
export function fitIcon(image: RgbaImage): RgbaImage {
  const size = fitSize(image.width, image.height);
  const scaled =
    size.width === image.width && size.height === image.height ? image : resizeRgba(image, size.width, size.height);
  if (scaled.width === ICON_SIDE && scaled.height === ICON_SIDE) return scaled;
  const canvas = new Uint8Array(ICON_SIDE * ICON_SIDE * RGBA_BYTES);
  const offX = Math.floor((ICON_SIDE - scaled.width) / 2);
  const offY = Math.floor((ICON_SIDE - scaled.height) / 2);
  for (let y = 0; y < scaled.height; y++) {
    const from = y * scaled.width * RGBA_BYTES;
    canvas.set(
      scaled.rgba.subarray(from, from + scaled.width * RGBA_BYTES),
      ((offY + y) * ICON_SIDE + offX) * RGBA_BYTES,
    );
  }
  return { width: ICON_SIDE, height: ICON_SIDE, rgba: canvas };
}

/** Converts the project icon (C3 section 6). Colour reduction is the warning E407. */
export function convertIcon(image: RgbaImage): Converted<ConvertedIcon> {
  const q = quantizeImage(fitIcon(image), "16", "alpha");
  return {
    value: { palette: q.palette, indices: q.indices, colors: q.colors, reduced: q.reduced },
    problems: reductionProblems(q),
  };
}
