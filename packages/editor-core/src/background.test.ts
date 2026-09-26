import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { convertBackground, decodePng, encodeDsIndexedPng } from "@dsdude/asset-pipeline/browser";
import { describe, expect, it } from "vitest";
import { backgroundDocFromPng, backgroundStats, bgSide, oneOffTiles, tileKeys } from "./background.ts";
import type { Frame } from "./pixels.ts";

/** Test input: the Phase-0 256x192 background (fixtures/editors/README.md names it). */
const BG = resolve(import.meta.dirname, "../../../fixtures/assets/background256x192.png");

function only(frames: Frame[]): Frame {
  const f = frames[0];
  if (!f) throw new Error("no frame");
  return f;
}

/** A width x height PNG of 4-colour noise from a seeded xorshift32 (every tile different, so the count is high). */
function noisePng(width: number, height: number, seed = 7): Uint8Array {
  let s = seed;
  const indices = new Uint8Array(width * height);
  for (let i = 0; i < indices.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    indices[i] = 1 + ((s >>> 0) % 4);
  }
  return encodeDsIndexedPng(width, height, indices, [0x7c1f, 0x001f, 0x03e0, 0x7c00, 0x7fff]);
}

describe("background core", () => {
  it("counts the same unique tiles and VRAM as the pipeline for the Phase-0 background", () => {
    const png = readFileSync(BG);
    const doc = backgroundDocFromPng(png);
    const f = only(doc.frames);
    expect([f.width, f.height]).toEqual([256, 192]);
    const converted = convertBackground(decodePng(png)).value;
    if (!converted) throw new Error("the fixture must convert");
    const stats = backgroundStats(f);
    expect(stats).toMatchObject({
      paddedWidth: converted.paddedWidth,
      paddedHeight: converted.paddedHeight,
      tiles: converted.tiles,
      vramBytes: converted.vramBytes,
      tooBig: false,
      tooManyTiles: false,
      maxTiles: 1024,
      maxSize: 512,
    });
  });

  it("reports more than 1024 tiles with the pipeline's own figure (E406), and oversize images (E405)", () => {
    const png = noisePng(320, 256);
    const stats = backgroundStats(only(backgroundDocFromPng(png).frames));
    const r = convertBackground(decodePng(png));
    expect(r.value).toBeNull();
    expect(r.problems.find((p) => p.code === "E406")?.args).toMatchObject({ tiles: stats.tiles, max: 1024 });
    expect(stats).toMatchObject({ paddedWidth: 512, paddedHeight: 256, tooManyTiles: true, tooBig: false });

    const big = backgroundStats({ width: 520, height: 16, pixels: new Uint8Array(520 * 16) });
    expect(big).toMatchObject({ tooBig: true, paddedWidth: 520, paddedHeight: 16, tiles: 1 });
    expect(bgSide(200)).toBe(256);
    expect(bgSide(257)).toBe(512);
  });

  it("merges flipped copies into one tile and finds the one-off tiles", () => {
    // 24x8: tile 0 a diagonal, tile 1 its mirror, tile 2 a single dot.
    const f: Frame = { width: 24, height: 8, pixels: new Uint8Array(24 * 8) };
    for (let i = 0; i < 8; i++) {
      f.pixels[i * 24 + i] = 1;
      f.pixels[i * 24 + 8 + (7 - i)] = 1;
    }
    f.pixels[3 * 24 + 16 + 3] = 2;
    const { columns, rows, keys } = tileKeys(f);
    expect([columns, rows]).toEqual([32, 32]);
    expect(keys[0]).toBe(keys[1]);
    // Two patterns in the image plus the blank padding tile.
    expect(backgroundStats(f).tiles).toBe(3);
    expect(oneOffTiles(f)).toEqual([{ x: 16, y: 0, width: 8, height: 8 }]);
  });
});
