/**
 * The C12 preview API implementation: `previewSprite` (matching `PreviewSpriteFn` in preview.ts) and the richer
 * `previewSpriteDetails` the import dialog uses for "original vs converted" and the colour-reduction warning.
 * Pure TypeScript over byte arrays: no fs, no Node imports, so the IDE renderer, WS6b's editors and the cloud
 * tests can call it. The conversion is exactly the pack's (C3 section 3), so what the dialog shows is what the DS
 * gets.
 */
import type { Diagnostic } from "@dsdude/project-format";
import { OBJ_MAX_SIDE, objSizeFor, roundUp, TILE_SIDE } from "./image/objsize.ts";
import { decodePng, type RgbaImage } from "./image/png.ts";
import { type Dither, quantizeImage, reductionProblems } from "./image/quantize.ts";
import { dsToRgb } from "./image/rgb555.ts";
import type { PreviewFrame, PreviewSpriteOptions, SpritePreview } from "./preview.ts";
import { toDiagnostic } from "./problems.ts";

/** Bytes per RGBA8 pixel. */
const RGBA_BYTES = 4;
/** Fully opaque alpha, for rendered converted pixels. */
const ALPHA_OPAQUE = 255;
/** The name used in preview diagnostics when the caller gives none. */
const DEFAULT_PREVIEW_NAME = "This sprite";

/** Extra, optional inputs of `previewSpriteDetails` (beyond the frozen C12 options). */
export interface PreviewDetailsOptions extends PreviewSpriteOptions {
  /** Dithering for colour reduction; packs use "none" in 0.1 (C3 step 5). Default "none". */
  dither?: Dither;
  /** Asset name for the diagnostics' `{name}`; default "This sprite". */
  name?: string;
}

/** Everything the import dialog shows. */
export interface SpritePreviewDetails {
  /** The C12 result, exactly as `previewSprite` returns it. */
  preview: SpritePreview;
  /** The frames as imported: `frames * frameWidth` x `frameHeight`, RGBA8 (outside the PNG: transparent). */
  original: RgbaImage;
  /** The same area after DS conversion, RGBA8 (index 0 fully transparent). */
  converted: RgbaImage;
  /** Distinct opaque colours in the original. */
  sourceColors: number;
  /** True when colours were merged (then `diagnostics` holds the warning E407). */
  reduced: boolean;
  /** E401 (frame larger than 64x64) and E407 (colour reduction), with `file` null. */
  diagnostics: Diagnostic[];
}

/** Frames the preview shows: every whole frame across the PNG, at least one. */
function frameCount(pngWidth: number, frameWidth: number): number {
  return Math.max(1, Math.floor(pngWidth / frameWidth));
}

/** Copies the frames' area out of the PNG (`frames * fw` x `fh`); parts outside the PNG stay transparent. */
function cropFrames(image: RgbaImage, frames: number, fw: number, fh: number): RgbaImage {
  const width = frames * fw;
  const rgba = new Uint8Array(width * fh * RGBA_BYTES);
  const copyWidth = Math.min(width, image.width);
  for (let y = 0; y < Math.min(fh, image.height); y++) {
    const from = y * image.width * RGBA_BYTES;
    rgba.set(image.rgba.subarray(from, from + copyWidth * RGBA_BYTES), y * width * RGBA_BYTES);
  }
  return { width, height: fh, rgba };
}

/** Reorders a strip of indices (frames side by side) into frame-after-frame blocks of `fw * fh` indices. */
function framesInOrder(strip: Uint8Array, frames: number, fw: number, fh: number): Uint8Array {
  const out = new Uint8Array(strip.length);
  const stripWidth = frames * fw;
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < fh; y++) {
      const from = y * stripWidth + f * fw;
      out.set(strip.subarray(from, from + fw), f * fw * fh + y * fw);
    }
  }
  return out;
}

/** Renders indices through a palette of 0xRRGGBB values to RGBA8; index 0 is transparent. */
export function renderIndices(
  indices: Uint8Array,
  width: number,
  height: number,
  palette: readonly number[],
): RgbaImage {
  const rgba = new Uint8Array(width * height * RGBA_BYTES);
  indices.forEach((index, i) => {
    if (index === 0) return;
    const rgb = palette[index] ?? 0;
    rgba.set([(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff, ALPHA_OPAQUE], i * RGBA_BYTES);
  });
  return { width, height, rgba };
}

/**
 * The preview with original and converted pixels and the diagnostics. Throws `PngError` when `png` is not a
 * readable PNG (the pack reports that as E404). Frames above 64x64 are still previewed, padded only to whole tiles,
 * with E401 in `diagnostics`.
 */
export function previewSpriteDetails(png: Uint8Array, opts: PreviewDetailsOptions): SpritePreviewDetails {
  const image = decodePng(png);
  const { frameWidth: fw, frameHeight: fh } = opts;
  const frames = frameCount(image.width, fw);
  const original = cropFrames(image, frames, fw, fh);
  const q = quantizeImage(original, opts.colorMode, opts.transparent, opts.dither ?? "none");
  const size = objSizeFor(fw, fh) ?? { width: roundUp(fw, TILE_SIDE), height: roundUp(fh, TILE_SIDE) };
  const problems = reductionProblems(q);
  if (objSizeFor(fw, fh) === null)
    problems.unshift({ code: "E401", args: { width: fw, height: fh, max: OBJ_MAX_SIDE } });
  const palette = q.palette.slice(0, q.colors).map(dsToRgb);
  const frameList: PreviewFrame[] = Array.from({ length: frames }, (_, f) => ({
    offset: f * fw * fh,
    paddedWidth: size.width,
    paddedHeight: size.height,
  }));
  return {
    preview: {
      palette,
      indices: framesInOrder(q.indices, frames, fw, fh),
      colorCount: q.colors,
      colorMode: q.colorMode,
      frames: frameList,
    },
    original,
    converted: renderIndices(q.indices, original.width, fh, palette),
    sourceColors: q.sourceColors,
    reduced: q.reduced,
    diagnostics: problems.map((p) => toDiagnostic(p, opts.name ?? DEFAULT_PREVIEW_NAME, null)),
  };
}

/** C12 `previewSprite`: `{palette, indices, colorCount, colorMode, frames}` for a PNG strip. */
export function previewSprite(png: Uint8Array, opts: PreviewSpriteOptions): SpritePreview {
  return previewSpriteDetails(png, opts).preview;
}
