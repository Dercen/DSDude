/**
 * A minimal PNG reader for golden comparisons: 8-bit greyscale, RGB, RGBA, grey+alpha and palette images, not
 * interlaced. Returns RGBA pixels so two PNGs compare by content, whatever encoder wrote them.
 */
import { inflateSync } from "node:zlib";

export interface Rgba {
  width: number;
  height: number;
  /** width * height * 4 bytes. */
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(file: Uint8Array): Rgba {
  const buf = Buffer.from(file.buffer, file.byteOffset, file.byteLength);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let width = 0;
  let height = 0;
  let colorType = -1;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  for (let at = 8; at < buf.length; ) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("latin1", at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      colorType = body[9];
      if (depth !== 8 || body[12] !== 0 || CHANNELS[colorType] === undefined) {
        throw new Error(`unsupported PNG: depth ${depth}, colour type ${colorType}, interlace ${body[12]}`);
      }
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    at += 12 + len;
  }
  const ch = CHANNELS[colorType];
  const stride = width * ch;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error("PNG data size does not match its header");

  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[dst + x - ch] : 0;
      const b = y > 0 ? px[dst - stride + x] : 0;
      const c = x >= ch && y > 0 ? px[dst - stride + x - ch] : 0;
      const v = raw[src + x];
      const pred =
        filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
      if (filter > 4) throw new Error(`bad PNG filter ${filter}`);
      px[dst + x] = (v + pred) & 0xff;
    }
  }

  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * ch;
    let r: number;
    let g: number;
    let b: number;
    let a = 255;
    if (colorType === 3) {
      if (!palette) throw new Error("palette PNG without PLTE");
      const k = px[s];
      r = palette[k * 3];
      g = palette[k * 3 + 1];
      b = palette[k * 3 + 2];
      if (trns && k < trns.length) a = trns[k];
    } else if (colorType === 0 || colorType === 4) {
      r = g = b = px[s];
      if (colorType === 4) a = px[s + 1];
    } else {
      r = px[s];
      g = px[s + 1];
      b = px[s + 2];
      if (colorType === 6) a = px[s + 3];
    }
    out.set([r, g, b, a], i * 4);
  }
  return { width, height, data: out };
}

/** Pixels that differ between two images (all of them when the sizes differ). */
export function diffPixels(a: Rgba, b: Rgba): number {
  if (a.width !== b.width || a.height !== b.height) return Math.max(a.width * a.height, b.width * b.height);
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
  }
  return n;
}
