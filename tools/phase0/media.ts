// Minimal deterministic PNG (RGBA8) and WAV (PCM16 mono) writers for Phase-0 samples and fixtures.
// No dependencies: node:zlib provides deflate and crc32. Output bytes depend only on the inputs.
import { crc32, deflateSync } from "node:zlib";

export type Rgba = readonly [number, number, number, number];

export class Image {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  set(x: number, y: number, c: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.data.set(c, (y * this.width + x) * 4);
  }

  rect(x0: number, y0: number, w: number, h: number, c: Rgba): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }

  /** Filled ellipse inside the box (x0, y0, w, h). */
  ellipse(x0: number, y0: number, w: number, h: number, c: Rgba): void {
    const cx = x0 + (w - 1) / 2;
    const cy = y0 + (h - 1) / 2;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++)
        if (((x - cx) / (w / 2)) ** 2 + ((y - cy) / (h / 2)) ** 2 <= 1) this.set(x, y, c);
  }

  png(): Buffer {
    const raw = Buffer.alloc((this.width * 4 + 1) * this.height);
    for (let y = 0; y < this.height; y++) {
      raw[y * (this.width * 4 + 1)] = 0; // filter: none
      Buffer.from(this.data.buffer, y * this.width * 4, this.width * 4).copy(raw, y * (this.width * 4 + 1) + 1);
    }
    const chunk = (type: string, body: Buffer) => {
      const head = Buffer.alloc(8);
      head.writeUInt32BE(body.length, 0);
      head.write(type, 4, "ascii");
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
      return Buffer.concat([head, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
}

/** 16-bit mono PCM WAV from samples in [-1, 1]. */
export function wav(samples: number[], rate = 22050): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2);
  });
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8, "ascii");
  h.write("fmt ", 12, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** A tone sweeping from f0 to f1 Hz with a linear fade-out; square when `square`, else sine. */
export function tone(seconds: number, f0: number, f1: number, square = false, rate = 22050): number[] {
  const n = Math.round(seconds * rate);
  const out: number[] = [];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    phase += (2 * Math.PI * (f0 + (f1 - f0) * t)) / rate;
    const v = square ? (Math.sin(phase) >= 0 ? 1 : -1) : Math.sin(phase);
    out.push(0.5 * v * (1 - t));
  }
  return out;
}
