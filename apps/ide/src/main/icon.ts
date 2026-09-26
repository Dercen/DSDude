/**
 * The default 32x32 project icon for new empty projects (C1 requires icon.png; ndstool wants <= 15 colours plus
 * transparent). A plain PNG encoder over node:zlib: RGBA, filter 0, one IDAT.
 */
import { crc32, deflateSync } from "node:zlib";

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** A PNG of `width` x `height` RGBA pixels from `pixel(x, y)` -> [r, g, b, a]. */
export function encodePng(width: number, height: number, pixel: (x: number, y: number) => number[]): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), row + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Two colours: a light-blue rounded tile with a white "screen", on transparent. */
export function defaultIconPng(): Buffer {
  const BLUE = [0x3a, 0x8f, 0xd8, 255];
  const WHITE = [0xf2, 0xf2, 0xf2, 255];
  const CLEAR = [0, 0, 0, 0];
  return encodePng(32, 32, (x, y) => {
    const corner =
      (x < 3 || x > 28) && (y < 3 || y > 28) && Math.hypot(x < 3 ? 3 - x : x - 28, y < 3 ? 3 - y : y - 28) > 3;
    if (x < 1 || x > 30 || y < 1 || y > 30 || corner) return CLEAR;
    return x >= 7 && x <= 24 && y >= 8 && y <= 20 ? WHITE : BLUE;
  });
}
