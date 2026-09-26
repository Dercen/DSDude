/**
 * The background core: what a background costs on the DS, computed the way the asset pipeline builds it (C3
 * section 4). The image is one 8bpp frame (a single-frame SpriteDoc, loaded through the C12 preview in 256-colour
 * mode) padded to a text-BG size of 256 or 512 per side with index 0; its unique 8x8 tiles merge copies that are
 * equal up to horizontal and vertical flips (grit -mRtf). Pure.
 */
import { decodePng, LIMITS, previewSprite } from "@dsdude/asset-pipeline/browser";
import type { Frame, Rect } from "./pixels.ts";
import { type SpriteDoc, spriteDocFromPreview } from "./sprite.ts";

export const TILE = 8;
/** Bytes of one 8bpp tile and of one text-BG map entry. */
const TILE_BYTES = 64;
const MAP_ENTRY_BYTES = 2;
/** Opaque colours an 8bpp background may use (index 0 is the backdrop). */
export const BG_MAX_COLORS = 255;

/** The text-BG side for an image side: 256 when it fits, else 512. */
export function bgSide(side: number): number {
  return side <= 256 ? 256 : 512;
}

/**
 * A background PNG as a one-frame document: the pipeline's own 256-colour quantisation (as convertBackground runs
 * it), so the editor starts from the colours the DS will show. Throws on an unreadable PNG.
 */
export function backgroundDocFromPng(png: Uint8Array): SpriteDoc {
  const { width, height } = decodePng(png);
  const preview = previewSprite(png, {
    frameWidth: width,
    frameHeight: height,
    colorMode: "256",
    transparent: "alpha",
  });
  return spriteDocFromPreview(preview, width, height);
}

export interface BackgroundStats {
  width: number;
  height: number;
  /** The text-BG size the pipeline pads to (whole tiles when the image is too big to build). */
  paddedWidth: number;
  paddedHeight: number;
  tiles: number;
  /** Tile bytes plus the map. */
  vramBytes: number;
  /** Wider or taller than C13 `bgMaxSize` (the pipeline refuses it: E405). */
  tooBig: boolean;
  /** More unique tiles than C13 `bgTilesMax` (E406). */
  tooManyTiles: boolean;
  maxSize: number;
  maxTiles: number;
}

function roundUp(v: number, to: number): number {
  return Math.ceil(v / to) * to;
}

function paddedSize(frame: Frame): [number, number, boolean] {
  const tooBig = frame.width > LIMITS.bgMaxSize || frame.height > LIMITS.bgMaxSize;
  return tooBig
    ? [roundUp(frame.width, TILE), roundUp(frame.height, TILE), true]
    : [bgSide(frame.width), bgSide(frame.height), false];
}

/**
 * The flip-invariant key of every tile of the padded image, row by row (the smallest of the four flip variants,
 * as the pipeline's countUniqueTiles does). Pixels outside the image are index 0.
 */
export function tileKeys(frame: Frame): { columns: number; rows: number; keys: string[] } {
  const [pw, ph] = paddedSize(frame);
  const columns = pw / TILE;
  const rows = ph / TILE;
  const keys: string[] = [];
  const variant = new Array<number>(TILE * TILE);
  const at = (x: number, y: number) =>
    x < frame.width && y < frame.height ? (frame.pixels[y * frame.width + x] as number) : 0;
  for (let ty = 0; ty < ph; ty += TILE) {
    for (let tx = 0; tx < pw; tx += TILE) {
      let key: string | null = null;
      for (const [fx, fy] of [
        [false, false],
        [true, false],
        [false, true],
        [true, true],
      ] as const) {
        for (let y = 0; y < TILE; y++)
          for (let x = 0; x < TILE; x++)
            variant[y * TILE + x] = at(tx + (fx ? TILE - 1 - x : x), ty + (fy ? TILE - 1 - y : y));
        const k = String.fromCharCode(...variant);
        if (key === null || k < key) key = k;
      }
      keys.push(key as string);
    }
  }
  return { columns, rows, keys };
}

export function backgroundStats(frame: Frame): BackgroundStats {
  const [paddedWidth, paddedHeight, tooBig] = paddedSize(frame);
  const tiles = new Set(tileKeys(frame).keys).size;
  const mapBytes = (paddedWidth / TILE) * (paddedHeight / TILE) * MAP_ENTRY_BYTES;
  return {
    width: frame.width,
    height: frame.height,
    paddedWidth,
    paddedHeight,
    tiles,
    vramBytes: tiles * TILE_BYTES + mapBytes,
    tooBig,
    tooManyTiles: tiles > LIMITS.bgTilesMax,
    maxSize: LIMITS.bgMaxSize,
    maxTiles: LIMITS.bgTilesMax,
  };
}

/**
 * Tiles inside the image whose pattern (up to flips) appears nowhere else: each one costs a tile of its own, so
 * they are where a background over the tile limit can be simplified.
 */
export function oneOffTiles(frame: Frame): Rect[] {
  const { columns, keys } = tileKeys(frame);
  const count = new Map<string, number>();
  for (const k of keys) count.set(k, (count.get(k) ?? 0) + 1);
  const out: Rect[] = [];
  keys.forEach((k, i) => {
    const x = (i % columns) * TILE;
    const y = Math.floor(i / columns) * TILE;
    if (count.get(k) === 1 && x < frame.width && y < frame.height) out.push({ x, y, width: TILE, height: TILE });
  });
  return out;
}
