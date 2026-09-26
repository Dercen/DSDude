import { readdirSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { FIXTURES, REPO_ROOT, readRepoFile } from "../testing/golden.ts";
import { crc32, decodePng, encodeIndexedPng, PngError } from "./png.ts";

/** Decodes with pngjs, the reference decoder (tests only; pngjs needs node:zlib). */
function referenceDecode(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const png = PNG.sync.read(Buffer.from(bytes));
  return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
}

/** Every PNG committed under fixtures/assets and samples/. */
function repoPngs(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".png")) out.push(p.slice(REPO_ROOT.length + 1));
    }
  };
  walk(FIXTURES);
  walk(join(REPO_ROOT, "samples"));
  return out.sort();
}

/** A deterministic test image with varied colours and alpha. */
function testImage(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = (i * 37) & 0xff;
    rgba[i * 4 + 1] = (i * 91) & 0xff;
    rgba[i * 4 + 2] = (i * 13) & 0xff;
    rgba[i * 4 + 3] = i % 5 === 0 ? 0 : 255;
  }
  return rgba;
}

describe("decodePng", () => {
  it.each(repoPngs())("matches pngjs on %s", (path) => {
    const bytes = readRepoFile(path);
    expect(decodePng(bytes)).toEqual(referenceDecode(bytes));
  });

  // pngjs writes each colour type at 8 and 16 bits; our decoder must agree with its own reader.
  const TYPES = [0, 2, 4, 6] as const;
  it.each(TYPES.flatMap((colorType) => [8, 16].map((bitDepth) => ({ colorType, bitDepth }))))(
    "reads pngjs output, colour type $colorType at $bitDepth bits",
    ({ colorType, bitDepth }) => {
      const W = 7;
      const H = 5;
      const png = new PNG({ width: W, height: H, colorType, bitDepth, inputHasAlpha: true });
      png.data = Buffer.from(testImage(W, H));
      const bytes = new Uint8Array(PNG.sync.write(png, { colorType, bitDepth, inputHasAlpha: true }));
      expect(decodePng(bytes)).toEqual(referenceDecode(bytes));
    },
  );

  it("round-trips an indexed PNG it wrote", () => {
    const W = 9;
    const H = 4;
    const indices = Uint8Array.from({ length: W * H }, (_, i) => i % 3);
    const bytes = encodeIndexedPng({ width: W, height: H, indices, palette: [0xff00ff, 0x102030, 0xfffefd] });
    const img = decodePng(bytes);
    expect(img).toEqual(referenceDecode(bytes));
    // Index 0 is transparent through tRNS; the others are opaque.
    expect(img.rgba[3]).toBe(0);
    expect(Array.from(img.rgba.subarray(4, 8))).toEqual([0x10, 0x20, 0x30, 255]);
  });

  it("reads Adam7-interlaced images", () => {
    const W = 11;
    const H = 9;
    const rgba = testImage(W, H);
    expect(decodePng(encodeInterlacedRgba(W, H, rgba))).toEqual({ width: W, height: H, rgba });
  });

  it("reads 1-, 2- and 4-bit palette and grey images", () => {
    for (const depth of [1, 2, 4]) {
      const W = 13;
      const H = 3;
      const max = (1 << depth) - 1;
      const values = Array.from({ length: W * H }, (_, i) => (i * 7) % (max + 1));
      const palette = Array.from({ length: max + 1 }, (_, i) => [i * 10, 255 - i * 10, i]);
      const pal = decodePng(encodePacked(W, H, depth, 3, values, palette));
      const grey = decodePng(encodePacked(W, H, depth, 0, values, null));
      values.forEach((v, i) => {
        expect(Array.from(pal.rgba.subarray(i * 4, i * 4 + 4))).toEqual([...(palette[v] as number[]), 255]);
        const g = Math.floor((v * 255) / max);
        expect(Array.from(grey.rgba.subarray(i * 4, i * 4 + 4))).toEqual([g, g, g, 255]);
      });
    }
  });

  it("rejects what is not a readable PNG", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3]))).toThrow(PngError);
    const good = readRepoFile("fixtures/assets/sprite16x16x3.png");
    const bad = good.slice();
    bad[20] = (bad[20] as number) ^ 0xff; // inside IHDR: the checksum no longer matches
    expect(() => decodePng(bad)).toThrow(/checksum/);
    expect(() => decodePng(good.slice(0, good.length - 12))).toThrow(PngError);
  });
});

describe("encodeIndexedPng", () => {
  it("is deterministic", () => {
    const indices = Uint8Array.from({ length: 64 }, (_, i) => i & 15);
    const palette = Array.from({ length: 16 }, (_, i) => i * 0x111111);
    const a = encodeIndexedPng({ width: 8, height: 8, indices, palette });
    const b = encodeIndexedPng({ width: 8, height: 8, indices, palette });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("IEND"))).toBe(0xae426082);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Test-only encoders for PNG variants our encoder never writes.

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const body = Buffer.concat([head.subarray(4), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(new Uint8Array(body)), 0);
  return Buffer.concat([head.subarray(0, 4), body, crc]);
}

function assemble(ihdr: Buffer, raw: Buffer, extra: Buffer[] = []): Uint8Array {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(
    Buffer.concat([
      sig,
      chunk("IHDR", ihdr),
      ...extra,
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", new Uint8Array(0)),
    ]),
  );
}

function ihdr(w: number, h: number, depth: number, colorType: number, interlace: number): Buffer {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(w, 0);
  b.writeUInt32BE(h, 4);
  b[8] = depth;
  b[9] = colorType;
  b[12] = interlace;
  return b;
}

/** RGBA8, Adam7, filter 0 on every row. */
function encodeInterlacedRgba(w: number, h: number, rgba: Uint8Array): Uint8Array {
  const passes = [
    [0, 0, 8, 8],
    [4, 0, 8, 8],
    [0, 4, 4, 8],
    [2, 0, 4, 4],
    [0, 2, 2, 4],
    [1, 0, 2, 2],
    [0, 1, 1, 2],
  ];
  const parts: number[] = [];
  for (const [x0, y0, dx, dy] of passes as number[][]) {
    for (let y = y0 as number; y < h; y += dy as number) {
      const row: number[] = [];
      for (let x = x0 as number; x < w; x += dx as number)
        row.push(...rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));
      if (row.length > 0) parts.push(0, ...row);
    }
  }
  return assemble(ihdr(w, h, 8, 6, 1), Buffer.from(parts));
}

/** A packed low-bit-depth palette (type 3) or grey (type 0) image. */
function encodePacked(
  w: number,
  h: number,
  depth: number,
  colorType: number,
  values: number[],
  palette: number[][] | null,
): Uint8Array {
  const rowBytes = Math.ceil((w * depth) / 8);
  const raw = Buffer.alloc((rowBytes + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bit = x * depth;
      const at = y * (rowBytes + 1) + 1 + (bit >> 3);
      raw[at] = (raw[at] as number) | ((values[y * w + x] as number) << (8 - depth - (bit & 7)));
    }
  }
  const extra = palette === null ? [] : [chunk("PLTE", new Uint8Array(palette.flat()))];
  return assemble(ihdr(w, h, depth, colorType, 0), raw, extra);
}
