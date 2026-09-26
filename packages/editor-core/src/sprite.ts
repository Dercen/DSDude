/**
 * The sprite document: equal-size frames of palette indices plus a DS palette (index 0 transparent). Loads from the
 * C12 `SpritePreview` of the sheet (so the editor starts from exactly what the DS will show) and saves as a DS
 * indexed PNG strip (C3: grit reads the palette back unchanged). Pure; immer-friendly (frames are replaced, never
 * mutated, so patches carry whole buffers).
 */
import type { SpritePreview } from "@dsdude/asset-pipeline/browser";
import { dsToRgb8, rgbToDs } from "./color.ts";
import { blankFrame, type Frame } from "./pixels.ts";

export const MAX_COLORS_16 = 16;
export const MAX_COLORS_256 = 256;

export interface SpriteDoc {
  frameWidth: number;
  frameHeight: number;
  frames: Frame[];
  /** DS values; index 0 is transparent (its colour is never drawn). */
  palette: number[];
}

/** A doc from the preview of the sheet (`previewSprite(png, {frameWidth, frameHeight, ...})`). */
export function spriteDocFromPreview(preview: SpritePreview, frameWidth: number, frameHeight: number): SpriteDoc {
  const size = frameWidth * frameHeight;
  return {
    frameWidth,
    frameHeight,
    frames: preview.frames.map((f) => ({
      width: frameWidth,
      height: frameHeight,
      pixels: preview.indices.slice(f.offset, f.offset + size),
    })),
    palette: preview.palette.map(rgbToDs),
  };
}

export function blankSprite(frameWidth: number, frameHeight: number, palette: number[] = [0x7c1f]): SpriteDoc {
  return { frameWidth, frameHeight, frames: [blankFrame(frameWidth, frameHeight)], palette };
}

/** The whole strip (frames left to right) as one index buffer, for `encodeDsIndexedPng(width, height, ...)`. */
export function sheetIndices(doc: SpriteDoc): { width: number; height: number; indices: Uint8Array } {
  const width = doc.frameWidth * doc.frames.length;
  const indices = new Uint8Array(width * doc.frameHeight);
  doc.frames.forEach((f, n) => {
    for (let y = 0; y < doc.frameHeight; y++)
      indices.set(f.pixels.subarray(y * doc.frameWidth, (y + 1) * doc.frameWidth), y * width + n * doc.frameWidth);
  });
  return { width, height: doc.frameHeight, indices };
}

/**
 * RGBA pixels of one frame for a canvas: palette colours, index 0 transparent. With `onion`, the previous frame
 * shows faintly (alpha `onionAlpha`) where the frame is transparent.
 */
export function renderFrame(
  doc: SpriteDoc,
  index: number,
  opts: { onion?: boolean; onionAlpha?: number } = {},
): Uint8ClampedArray<ArrayBuffer> {
  const frame = doc.frames[index];
  const out = new Uint8ClampedArray(doc.frameWidth * doc.frameHeight * 4);
  if (!frame) return out;
  const prev = opts.onion && index > 0 ? doc.frames[index - 1] : undefined;
  const alpha = Math.round((opts.onionAlpha ?? 0.3) * 255);
  const rgb = doc.palette.map(dsToRgb8);
  for (let i = 0; i < frame.pixels.length; i++) {
    let v = frame.pixels[i] ?? 0;
    let a = 255;
    if (v === 0 && prev) {
      v = prev.pixels[i] ?? 0;
      a = alpha;
    }
    if (v === 0) continue;
    const c = rgb[v] ?? [255, 0, 255];
    out.set([c[0], c[1], c[2], a], i * 4);
  }
  return out;
}

/** Whether two docs have the same frames, pixels and palette (undo rebuilds equal docs as new objects). */
export function sameSprite(a: SpriteDoc, b: SpriteDoc): boolean {
  if (a === b) return true;
  if (a.frameWidth !== b.frameWidth || a.frameHeight !== b.frameHeight) return false;
  if (a.frames.length !== b.frames.length || a.palette.length !== b.palette.length) return false;
  if (a.palette.some((c, i) => c !== b.palette[i])) return false;
  return a.frames.every((f, i) => {
    const g = b.frames[i];
    if (!g) return false;
    if (f.pixels === g.pixels) return true;
    for (let p = 0; p < f.pixels.length; p++) if (f.pixels[p] !== g.pixels[p]) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------------------------------------
// Animation strip

export function setFrame(doc: SpriteDoc, index: number, frame: Frame): SpriteDoc {
  if (doc.frames[index] === frame) return doc;
  const frames = doc.frames.slice();
  frames[index] = frame;
  return { ...doc, frames };
}

/** Inserts a frame after `index` (a copy of that frame, or blank). */
export function addFrame(doc: SpriteDoc, index: number, copy = true): SpriteDoc {
  const src = doc.frames[index];
  const frame = copy && src ? { ...src, pixels: src.pixels.slice() } : blankFrame(doc.frameWidth, doc.frameHeight);
  const frames = doc.frames.slice();
  frames.splice(index + 1, 0, frame);
  return { ...doc, frames };
}

/** Removes a frame; the last frame cannot go. */
export function deleteFrame(doc: SpriteDoc, index: number): SpriteDoc {
  if (doc.frames.length <= 1 || !doc.frames[index]) return doc;
  return { ...doc, frames: doc.frames.filter((_, i) => i !== index) };
}

export function moveFrame(doc: SpriteDoc, from: number, to: number): SpriteDoc {
  if (from === to || !doc.frames[from] || to < 0 || to >= doc.frames.length) return doc;
  const frames = doc.frames.slice();
  const [f] = frames.splice(from, 1);
  frames.splice(to, 0, f as Frame);
  return { ...doc, frames };
}

// ---------------------------------------------------------------------------------------------------------
// Palette

/** The index of a DS colour in the palette (never 0: that is transparent), adding it when there is room. */
export function paletteIndex(doc: SpriteDoc, ds: number, max = MAX_COLORS_256): { doc: SpriteDoc; index: number } {
  const found = doc.palette.indexOf(ds, 1);
  if (found > 0) return { doc, index: found };
  if (doc.palette.length >= max) return { doc, index: -1 };
  return { doc: { ...doc, palette: [...doc.palette, ds] }, index: doc.palette.length };
}

export function setPaletteColor(doc: SpriteDoc, index: number, ds: number): SpriteDoc {
  if (index <= 0 || index >= doc.palette.length || doc.palette[index] === ds) return doc;
  const palette = doc.palette.slice();
  palette[index] = ds;
  return { ...doc, palette };
}

/** Colours in use (index 0 excluded), for the colour meter: 15 fit the 16-colour mode. */
export function colorsUsed(doc: SpriteDoc): number {
  const used = new Set<number>();
  for (const f of doc.frames) for (const v of f.pixels) if (v !== 0) used.add(v);
  return used.size;
}
