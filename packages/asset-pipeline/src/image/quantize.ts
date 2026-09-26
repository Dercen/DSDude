/**
 * The in-house RGB555 quantizer (C3 section 3, steps 2-6; PLAN.md 2.9): transparency to index 0, 8-bit to RGB555,
 * a 32x32x32 histogram reduced by median cut to 15 or 255 colours, nearest-colour mapping with optional
 * Floyd-Steinberg or Bayer dithering, and the palette order. Integer maths only, so results are identical on every
 * platform. Pure TypeScript.
 */
import type { PreviewDither } from "../preview.ts";
import type { Problem } from "../problems.ts";
import type { RgbaImage } from "./png.ts";
import {
  ALPHA_OPAQUE_MIN,
  CHANNEL5_MAX,
  dsB,
  dsDistance2,
  dsG,
  dsR,
  MAGENTA_DS,
  MAGENTA_NUDGED_DS,
  packDs,
  parseHexColorToDs,
  RGB555_COLORS,
  rgb8ToDs,
} from "./rgb555.ts";

/** Marks a transparent pixel in a DS-pixel buffer (no DS value is negative). */
export const TRANSPARENT = -1;
/** Palette index of the transparent colour. */
export const TRANSPARENT_INDEX = 0;
/** Opaque colours a 16-colour (4bpp) image may use: 16 minus the transparent index. */
export const MAX_OPAQUE_16 = 15;
/** Opaque colours a 256-colour (8bpp) image may use: 256 minus the transparent index. */
export const MAX_OPAQUE_256 = 255;
/** Bytes per RGBA8 pixel. */
const RGBA_BYTES = 4;

/** Dithering used when colours are merged. Only the preview offers it in 0.1 (C3 step 5: packs use "none"). */
export type Dither = PreviewDither;

/** How a C1 `transparent` setting picks transparent pixels (C3 section 3 step 2). */
export type TransparentSetting = "alpha" | `#${string}`;

/**
 * Converts an RGBA image to DS values per pixel, with TRANSPARENT where the pixel is transparent:
 * - alpha < 128 is always transparent;
 * - `"#rrggbb"`: pixels whose RGB555 colour equals it are transparent too;
 * - `"alpha"` on an image with no alpha < 128 anywhere: magenta pixels are transparent instead.
 * An opaque pixel that lands exactly on magenta is nudged to (31, 0, 30), because index 0 is magenta.
 */
export function toDsPixels(image: RgbaImage, transparent: TransparentSetting): Int32Array {
  const { rgba } = image;
  const count = image.width * image.height;
  const pixels = new Int32Array(count);
  let keyDs = parseHexColorToDs(transparent);
  if (keyDs === null) {
    let anyAlpha = false;
    for (let i = 0; i < count && !anyAlpha; i++) anyAlpha = (rgba[i * RGBA_BYTES + 3] as number) < ALPHA_OPAQUE_MIN;
    keyDs = anyAlpha ? null : MAGENTA_DS;
  }
  for (let i = 0; i < count; i++) {
    const at = i * RGBA_BYTES;
    if ((rgba[at + 3] as number) < ALPHA_OPAQUE_MIN) {
      pixels[i] = TRANSPARENT;
      continue;
    }
    const ds = rgb8ToDs(rgba[at] as number, rgba[at + 1] as number, rgba[at + 2] as number);
    if (ds === keyDs) pixels[i] = TRANSPARENT;
    else pixels[i] = ds === MAGENTA_DS ? MAGENTA_NUDGED_DS : ds;
  }
  return pixels;
}

/** Pixel counts per opaque DS value (the 32x32x32 histogram), skipping TRANSPARENT. */
export function histogram(pixels: Int32Array): Uint32Array {
  const hist = new Uint32Array(RGB555_COLORS);
  for (const p of pixels) if (p !== TRANSPARENT) hist[p] = (hist[p] as number) + 1;
  return hist;
}

/** Number of distinct opaque colours in a histogram. */
export function distinctColors(hist: Uint32Array): number {
  let n = 0;
  for (const c of hist) if (c > 0) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------------------
// Median cut

/** One median-cut box: a list of distinct colours with their pixel counts. */
interface Box {
  colors: number[];
  counts: number[];
  /** Total pixels in the box. */
  population: number;
}

/** Channel readers, in the tie-break order for the split axis: green, red, blue (green matters most to the eye). */
const AXES: readonly ((ds: number) => number)[] = [dsG, dsR, dsB];

/** The widest channel range of a box and the axis it lies on (ties follow AXES order). */
function widestAxis(box: Box): { axis: number; range: number } {
  let best = { axis: 0, range: -1 };
  AXES.forEach((read, axis) => {
    let lo = CHANNEL5_MAX;
    let hi = 0;
    for (const c of box.colors) {
      const v = read(c);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (hi - lo > best.range) best = { axis, range: hi - lo };
  });
  return best;
}

/**
 * Splits a box at the population-weighted median of its widest axis. Colours are ordered by that channel, then by
 * DS value, so the split never depends on input order. Both halves keep at least one colour.
 */
function splitBox(box: Box, axis: number): [Box, Box] {
  const read = AXES[axis] as (ds: number) => number;
  const order = box.colors
    .map((_, i) => i)
    .sort((a, b) => {
      const ca = box.colors[a] as number;
      const cb = box.colors[b] as number;
      return read(ca) - read(cb) || ca - cb;
    });
  const half = box.population / 2;
  let running = 0;
  let cut = 1;
  for (let k = 0; k < order.length - 1; k++) {
    running += box.counts[order[k] as number] as number;
    cut = k + 1;
    if (running >= half) break;
  }
  const make = (idx: number[]): Box => {
    const colors = idx.map((i) => box.colors[i] as number);
    const counts = idx.map((i) => box.counts[i] as number);
    return { colors, counts, population: counts.reduce((s, c) => s + c, 0) };
  };
  return [make(order.slice(0, cut)), make(order.slice(cut))];
}

/** The population-weighted mean colour of a box, each channel rounded to nearest. */
function boxMean(box: Box): number {
  let r = 0;
  let g = 0;
  let b = 0;
  box.colors.forEach((c, i) => {
    const n = box.counts[i] as number;
    r += dsR(c) * n;
    g += dsG(c) * n;
    b += dsB(c) * n;
  });
  const p = box.population;
  const half = Math.floor(p / 2);
  return packDs(Math.floor((r + half) / p), Math.floor((g + half) / p), Math.floor((b + half) / p));
}

/**
 * Median cut over the histogram to at most `maxColors` colours. The box to split next is the one with the
 * largest population x widest range (ties: the earliest box), so big, spread-out groups of pixels get colours first.
 */
function medianCut(hist: Uint32Array, maxColors: number): number[] {
  const first: Box = { colors: [], counts: [], population: 0 };
  hist.forEach((n, ds) => {
    if (n > 0) {
      first.colors.push(ds);
      first.counts.push(n);
      first.population += n;
    }
  });
  const boxes: Box[] = [first];
  while (boxes.length < maxColors) {
    let pick = -1;
    let pickScore = 0;
    let pickAxis = 0;
    boxes.forEach((box, i) => {
      if (box.colors.length < 2) return;
      const { axis, range } = widestAxis(box);
      const score = box.population * range;
      if (score > pickScore) {
        pick = i;
        pickScore = score;
        pickAxis = axis;
      }
    });
    if (pick < 0) break;
    const [a, b] = splitBox(boxes[pick] as Box, pickAxis);
    boxes.splice(pick, 1, a, b);
  }
  return boxes.map(boxMean);
}

// ---------------------------------------------------------------------------------------------------------
// Palettes

/** The opaque part of a palette (indices 1..), plus what the reduction did. */
export interface OpaquePalette {
  /** Opaque DS values in palette order (index 1 first): ascending DS value. */
  colors: number[];
  /** Distinct opaque colours in the source. */
  sourceColors: number;
  /** True when colours were merged to fit (E407). */
  reduced: boolean;
}

/**
 * Builds the opaque palette for a histogram: the distinct colours when they fit in `maxOpaque`, else the median-cut
 * representatives. Duplicates are merged, magenta is nudged, and the result is sorted by DS value (C3 step 6).
 */
export function buildPalette(hist: Uint32Array, maxOpaque: number): OpaquePalette {
  const sourceColors = distinctColors(hist);
  const reduced = sourceColors > maxOpaque;
  let colors: number[];
  if (reduced) {
    colors = medianCut(hist, maxOpaque).map((c) => (c === MAGENTA_DS ? MAGENTA_NUDGED_DS : c));
  } else {
    colors = [];
    hist.forEach((n, ds) => {
      if (n > 0) colors.push(ds);
    });
  }
  colors = [...new Set(colors)].sort((a, b) => a - b);
  return { colors, sourceColors, reduced };
}

// ---------------------------------------------------------------------------------------------------------
// Mapping pixels to indices

/** Returns a nearest-colour lookup over an opaque palette, memoised per DS value. Indices start at 1. */
function nearestLookup(colors: readonly number[]): (ds: number) => number {
  const exact = new Map<number, number>();
  colors.forEach((c, i) => {
    exact.set(c, i + 1);
  });
  const memo = new Int16Array(RGB555_COLORS).fill(-1);
  return (ds: number): number => {
    const cached = memo[ds] as number;
    if (cached >= 0) return cached;
    let best = exact.get(ds) ?? -1;
    if (best < 0) {
      let bestD = Number.POSITIVE_INFINITY;
      colors.forEach((c, i) => {
        const d = dsDistance2(ds, c);
        if (d < bestD) {
          bestD = d;
          best = i + 1;
        }
      });
    }
    memo[ds] = best;
    return best;
  };
}

/** 4x4 Bayer threshold matrix (values 0..15). */
const BAYER_4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Side of the Bayer matrix. */
const BAYER_SIDE = 4;
/** Number of Bayer thresholds; also the Bayer scale denominator. */
const BAYER_LEVELS = 16;
/** Floyd-Steinberg error weights, in sixteenths: right, down-left, down, down-right. */
const FS_RIGHT = 7;
const FS_DOWN_LEFT = 3;
const FS_DOWN = 5;
const FS_DOWN_RIGHT = 1;
/** Floyd-Steinberg weight denominator. */
const FS_DENOMINATOR = 16;

/**
 * The Bayer offset range, in 5-bit steps, for a palette of `n` colours: the typical distance between neighbouring
 * palette colours if they filled the cube evenly, 32 / ceil(cbrt(n)) (integer cube root, no floating point).
 */
function bayerSpread(n: number): number {
  const LEVELS_PER_CHANNEL = CHANNEL5_MAX + 1;
  let root = 1;
  while (root * root * root < n) root++;
  return Math.floor(LEVELS_PER_CHANNEL / root);
}

/** Clamps a channel to 0..31. */
function clamp5(v: number): number {
  return v < 0 ? 0 : v > CHANNEL5_MAX ? CHANNEL5_MAX : v;
}

/**
 * Maps DS pixels to palette indices (TRANSPARENT -> 0, opaque -> 1..). With dithering, the error is spread in
 * integer sixteenths of a 5-bit step (Floyd-Steinberg) or a 4x4 Bayer offset of up to half a step is added before
 * the lookup; transparent pixels neither take nor spread error. Without dithering, an exact palette colour always
 * maps to itself.
 */
export function mapToIndices(
  pixels: Int32Array,
  width: number,
  height: number,
  colors: readonly number[],
  dither: Dither = "none",
): Uint8Array {
  const out = new Uint8Array(pixels.length);
  const nearest = nearestLookup(colors);
  if (dither === "none" || colors.length === 0) {
    pixels.forEach((p, i) => {
      out[i] = p === TRANSPARENT ? TRANSPARENT_INDEX : nearest(p);
    });
    return out;
  }
  if (dither === "bayer") {
    const spread = bayerSpread(colors.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const p = pixels[i] as number;
        if (p === TRANSPARENT) continue;
        // Threshold centred on zero, in 32nds: t is odd, -15..15, so the offset spans about +-spread/2.
        const t = 2 * (BAYER_4[(y % BAYER_SIDE) * BAYER_SIDE + (x % BAYER_SIDE)] as number) - (BAYER_LEVELS - 1);
        const offset = Math.trunc((t * spread) / (2 * BAYER_LEVELS));
        const shift = (c: number): number => clamp5(c + offset);
        out[i] = nearest(packDs(shift(dsR(p)), shift(dsG(p)), shift(dsB(p))));
      }
    }
    return out;
  }
  // Floyd-Steinberg: errors carried in sixteenths, per channel, for the current and the next row.
  const CHANNELS = 3;
  let cur = new Int32Array((width + 2) * CHANNELS);
  let next = new Int32Array((width + 2) * CHANNELS);
  const readers = [dsR, dsG, dsB];
  for (let y = 0; y < height; y++) {
    next.fill(0);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = pixels[i] as number;
      if (p === TRANSPARENT) continue;
      const base = (x + 1) * CHANNELS;
      const want = readers.map((read, c) => {
        const carried = cur[base + c] as number;
        return clamp5(read(p) + Math.round(carried / FS_DENOMINATOR));
      });
      const index = nearest(packDs(want[0] as number, want[1] as number, want[2] as number));
      out[i] = index;
      const got = colors[index - 1] as number;
      readers.forEach((read, c) => {
        const err = ((want[c] as number) - read(got)) * FS_DENOMINATOR;
        const spread = (arr: Int32Array, at: number, weight: number): void => {
          arr[at + c] = (arr[at + c] as number) + (err * weight) / FS_DENOMINATOR;
        };
        spread(cur, base + CHANNELS, FS_RIGHT);
        spread(next, base - CHANNELS, FS_DOWN_LEFT);
        spread(next, base, FS_DOWN);
        spread(next, base + CHANNELS, FS_DOWN_RIGHT);
      });
    }
    [cur, next] = [next, cur];
  }
  return out;
}

/** Full DS palette for an image: magenta at index 0, then the opaque colours, padded with black to `size`. */
export function fullPalette(colors: readonly number[], size: number): number[] {
  const BLACK_DS = 0;
  const palette = [MAGENTA_DS, ...colors];
  while (palette.length < size) palette.push(BLACK_DS);
  return palette;
}

// ---------------------------------------------------------------------------------------------------------
// The whole step, shared by sprites, backgrounds, the icon and the preview

/** Palette sizes written for each colour mode (C3 step 6). */
export const PALETTE_SIZE_16 = 16;
export const PALETTE_SIZE_256 = 256;

/** An image reduced to a DS palette (C3 section 3 steps 2-6). */
export interface QuantizedImage {
  /** The mode built: "16" (4bpp, <= 15 opaque colours) or "256" (8bpp, <= 255). */
  colorMode: "16" | "256";
  /** Full palette as DS values: 16 or 256 entries, index 0 magenta (transparent), unused entries black. */
  palette: number[];
  /** Palette entries used, including the transparent index 0. */
  colors: number;
  /** Distinct opaque colours in the source. */
  sourceColors: number;
  /** True when colours were merged to fit (the warning E407). */
  reduced: boolean;
  /** One palette index per pixel, row-major, same size as the source. */
  indices: Uint8Array;
  /** The source as DS values per pixel (TRANSPARENT where transparent), for bounds and previews. */
  pixels: Int32Array;
}

/**
 * Quantizes an image: transparency, RGB555, colour mode ("auto" picks 16 when the opaque colours fit in 15),
 * median-cut reduction and index mapping. Reduction is reported by `reduced`; callers add E407.
 */
export function quantizeImage(
  image: RgbaImage,
  mode: "auto" | "16" | "256",
  transparent: TransparentSetting,
  dither: Dither = "none",
): QuantizedImage {
  const pixels = toDsPixels(image, transparent);
  const hist = histogram(pixels);
  const colorMode = mode === "auto" ? (distinctColors(hist) <= MAX_OPAQUE_16 ? "16" : "256") : mode;
  const opaque = buildPalette(hist, colorMode === "16" ? MAX_OPAQUE_16 : MAX_OPAQUE_256);
  return {
    colorMode,
    palette: fullPalette(opaque.colors, colorMode === "16" ? PALETTE_SIZE_16 : PALETTE_SIZE_256),
    colors: opaque.colors.length + 1,
    sourceColors: opaque.sourceColors,
    reduced: opaque.reduced,
    indices: mapToIndices(pixels, image.width, image.height, opaque.colors, dither),
    pixels,
  };
}

/** The E407 problem for a reduced image (colour counts exclude the transparent index). */
export function reductionProblems(q: QuantizedImage): Problem[] {
  return q.reduced ? [{ code: "E407", args: { from: q.sourceColors, to: q.colors - 1 } }] : [];
}
