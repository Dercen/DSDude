/**
 * Contract C12 (preview half) v0.2.0: the asset preview API types. Phase-0 types by WS0; owner WS5, which
 * implements them in `@dsdude/asset-pipeline/browser` and freezes the API at CP-B. Pure TypeScript, no ToolPaths,
 * no Node imports, so the IDE renderer, WS6b's editors and the cloud tests can call it.
 * 0.2.0 (T1): the import dialog's other calls come under the contract too: `previewSpriteDetails`
 * (`PreviewSpriteDetailsFn`), `spriteDefaults` (`SpriteDefaultsFn`) and `decodePng` (`DecodePngFn`). The 0.1.0
 * types are unchanged.
 * How to change me: T0 comments; T1 (minor bump + CHANGELOG) for an optional option or result field;
 * T2 (ADR co-signed by WS6 and WS6b) for anything else.
 */
import type { ColorMode, Diagnostic } from "@dsdude/project-format";

export const PREVIEW_CONTRACT_VERSION = "0.2.0";

export interface PreviewSpriteOptions {
  /** Frame size in pixels; the PNG is a horizontal strip of frames (C1 sprite.json). */
  frameWidth: number;
  frameHeight: number;
  /** "auto" picks 16 colours when the frames fit, else 256 (C1 colorMode). */
  colorMode: ColorMode;
  /** "alpha" uses the PNG alpha channel; "#rrggbb" marks that colour transparent. */
  transparent: "alpha" | `#${string}`;
}

export interface PreviewFrame {
  /** Index into `indices` where this frame's pixels start (row-major, frameWidth x frameHeight). */
  offset: number;
  /** Frame size padded to the next of the 12 OBJ sizes (C3). */
  paddedWidth: number;
  paddedHeight: number;
}

export interface SpritePreview {
  /** RGB555 colours as 0xRRGGBB after DS quantisation; index 0 is transparent. */
  palette: number[];
  /** One palette index per pixel for every frame, row-major, frames in order. */
  indices: Uint8Array;
  /** Colours used, including the transparent index. */
  colorCount: number;
  /** "16" or "256": the mode the pipeline will build. */
  colorMode: "16" | "256";
  frames: PreviewFrame[];
}

/** Implemented by WS5 as `previewSprite` in @dsdude/asset-pipeline. `png` is the raw PNG file. */
export type PreviewSpriteFn = (png: Uint8Array, opts: PreviewSpriteOptions) => SpritePreview;

// ---------------------------------------------------------------------------------------------------------
// 0.2.0: the rest of what the import dialog calls

/** A decoded image: `rgba` holds width * height * 4 bytes, row-major, R G B A per pixel. */
export interface PreviewImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** Dithering for colour reduction; packs use "none" in C3 0.1 (C1 has no field for it). */
export type PreviewDither = "none" | "floyd-steinberg" | "bayer";

/** `previewSpriteDetails` options: the C12 options plus optional extras. */
export interface PreviewDetailsOptions extends PreviewSpriteOptions {
  /** Default "none". */
  dither?: PreviewDither;
  /** Asset name for the diagnostics' `{name}`; default "This sprite". */
  name?: string;
}

/** Everything the import dialog shows. */
export interface SpritePreviewDetails {
  /** The C12 result, exactly as `previewSprite` returns it. */
  preview: SpritePreview;
  /** The frames as imported: `frames * frameWidth` x `frameHeight`, RGBA8 (outside the PNG: transparent). */
  original: PreviewImage;
  /** The same area after DS conversion, RGBA8 (index 0 fully transparent). */
  converted: PreviewImage;
  /** Distinct opaque colours in the original. */
  sourceColors: number;
  /** True when colours were merged (then `diagnostics` holds the warning E407). */
  reduced: boolean;
  /** E401 (frame larger than 64x64) and E407 (colour reduction), with `file` null. */
  diagnostics: Diagnostic[];
}

/** The C1 `sprite.json` fields a new import starts with (C1 import defaults). */
export interface SpriteDefaults {
  frames: number;
  frameWidth: number;
  frameHeight: number;
  /** The frame centre. */
  origin: { x: number; y: number };
  /** The opaque bounds over all frames, inclusive, in frame pixels (the whole frame when nothing is opaque). */
  bbox: { left: number; top: number; right: number; bottom: number };
}

/**
 * `previewSpriteDetails`: the preview plus original vs converted pixels and diagnostics. Frames are every whole
 * frame across the PNG; frames above 64x64 are still previewed, with E401. Throws `PngError` for an unreadable PNG.
 */
export type PreviewSpriteDetailsFn = (png: Uint8Array, opts: PreviewDetailsOptions) => SpritePreviewDetails;

/**
 * `spriteDefaults`: frame detection (exactly one OBJ size = one frame; width a multiple of height <= 64 = square
 * frames; else one frame), the frame centre as origin, the opaque bounds as bbox.
 */
export type SpriteDefaultsFn = (image: PreviewImage, transparent?: "alpha" | `#${string}`) => SpriteDefaults;

/** `decodePng`: any PNG (every colour type and depth, tRNS, Adam7) to RGBA8; throws `PngError` when unreadable. */
export type DecodePngFn = (png: Uint8Array) => PreviewImage;
