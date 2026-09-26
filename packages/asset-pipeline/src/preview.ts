/**
 * Contract C12 (preview half) v0.1.0: the asset preview API types. Phase-0 types by WS0; owner WS5, which
 * implements `previewSprite` and freezes the API at CP-B. Pure TypeScript, no ToolPaths, no Node imports, so the
 * IDE renderer, WS6b's editors and the cloud tests can call it.
 * How to change me: T0 comments; T1 (minor bump + CHANGELOG) for an optional option or result field;
 * T2 (ADR co-signed by WS6 and WS6b) for anything else.
 */
import type { ColorMode } from "@dsdude/project-format";

export const PREVIEW_CONTRACT_VERSION = "0.1.0";

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
