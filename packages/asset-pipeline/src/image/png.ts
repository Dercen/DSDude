/**
 * A small, pure PNG decoder and indexed-PNG encoder (C3 section 3 step 8). Pure TypeScript over fflate's
 * synchronous zlib: no Node imports, so the preview API can decode in the IDE renderer, and the encoder's bytes
 * are identical on every platform (pngjs cannot write palette PNGs and needs node:zlib).
 *
 * Decoding covers every PNG colour type (grey, RGB, palette, grey+alpha, RGBA), bit depths 1-16, tRNS and Adam7
 * interlacing, and always returns RGBA8 (other depths are scaled with rounding, as pngjs does).
 */
import { unzlibSync, zlibSync } from "fflate";
import type { PreviewImage } from "../preview.ts";
import { dsToRgb } from "./rgb555.ts";

/** Decoded image (C12 `PreviewImage`): `rgba` holds width * height * 4 bytes, row-major, R G B A per pixel. */
export type RgbaImage = PreviewImage;

/** Thrown for anything that is not a readable PNG; callers turn it into E404, so messages are plain words (C9). */
export class PngError extends Error {}

/** The 8-byte PNG signature. */
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Bytes per RGBA8 output pixel. */
const RGBA_BYTES = 4;
/** Bytes of a chunk's length field, type field and CRC field. */
const CHUNK_LENGTH_BYTES = 4;
const CHUNK_TYPE_BYTES = 4;
const CHUNK_CRC_BYTES = 4;
/** IHDR payload size. */
const IHDR_BYTES = 13;
/** Opaque alpha. */
const ALPHA_OPAQUE = 255;
/** Largest image side we accept; guards against absurd allocations from a corrupt header. */
const MAX_SIDE = 16384;
/** zlib level for the encoder: maximum compression, fixed so the output bytes never change (C3 step 8). */
const ZLIB_LEVEL = 9;

/** PNG colour types (IHDR byte 9). */
const COLOR_GREY = 0;
const COLOR_RGB = 2;
const COLOR_PALETTE = 3;
const COLOR_GREY_ALPHA = 4;
const COLOR_RGBA = 6;
/** Samples per pixel for each colour type. */
const CHANNELS: Readonly<Record<number, number>> = {
  [COLOR_GREY]: 1,
  [COLOR_RGB]: 3,
  [COLOR_PALETTE]: 1,
  [COLOR_GREY_ALPHA]: 2,
  [COLOR_RGBA]: 4,
};
/** Allowed bit depths per colour type (PNG spec table 11.1). */
const DEPTHS: Readonly<Record<number, readonly number[]>> = {
  [COLOR_GREY]: [1, 2, 4, 8, 16],
  [COLOR_RGB]: [8, 16],
  [COLOR_PALETTE]: [1, 2, 4, 8],
  [COLOR_GREY_ALPHA]: [8, 16],
  [COLOR_RGBA]: [8, 16],
};

/** Adam7 passes: [xStart, yStart, xStep, yStep]. */
const ADAM7: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
];

/** Scanline filter types. */
const FILTER_NONE = 0;
const FILTER_SUB = 1;
const FILTER_UP = 2;
const FILTER_AVERAGE = 3;
const FILTER_PAETH = 4;

// ---------------------------------------------------------------------------------------------------------
// CRC-32 (PNG chunk checksums)

/** The standard CRC-32 polynomial (reflected). */
const CRC_POLYNOMIAL = 0xedb88320;
/** Lazily built 256-entry CRC table. */
let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable !== null) return crcTable;
  const BYTE_VALUES = 256;
  const BITS_PER_BYTE = 8;
  const table = new Uint32Array(BYTE_VALUES);
  for (let n = 0; n < BYTE_VALUES; n++) {
    let c = n;
    for (let k = 0; k < BITS_PER_BYTE; k++) c = c & 1 ? CRC_POLYNOMIAL ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/** CRC-32 of `bytes[start, end)`. */
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = (table[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------------------------------------
// Decoding

function readU32(bytes: Uint8Array, at: number): number {
  return (
    (((bytes[at] as number) << 24) |
      ((bytes[at + 1] as number) << 16) |
      ((bytes[at + 2] as number) << 8) |
      (bytes[at + 3] as number)) >>>
    0
  );
}

function chunkType(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(
    bytes[at] as number,
    bytes[at + 1] as number,
    bytes[at + 2] as number,
    bytes[at + 3] as number,
  );
}

/** The parsed IHDR plus the ancillary chunks the decoder needs. */
interface PngHeader {
  width: number;
  height: number;
  depth: number;
  colorType: number;
  interlace: boolean;
  /** PLTE as r,g,b triples. */
  palette: Uint8Array | null;
  /** tRNS payload, or null. */
  trns: Uint8Array | null;
}

/** Splits the file into chunks, checks CRCs, and returns the header and the concatenated IDAT data. */
function readChunks(bytes: Uint8Array): { header: PngHeader; idat: Uint8Array } {
  if (bytes.length < SIGNATURE.length || SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new PngError("it does not start like a PNG file");
  }
  let at = SIGNATURE.length;
  let header: PngHeader | null = null;
  const idatParts: Uint8Array[] = [];
  let sawEnd = false;
  while (at + CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES <= bytes.length) {
    const length = readU32(bytes, at);
    const typeAt = at + CHUNK_LENGTH_BYTES;
    const dataAt = typeAt + CHUNK_TYPE_BYTES;
    const crcAt = dataAt + length;
    if (crcAt + CHUNK_CRC_BYTES > bytes.length) throw new PngError("the file ends too early");
    if (crc32(bytes, typeAt, crcAt) !== readU32(bytes, crcAt))
      throw new PngError("part of the file is damaged (a checksum does not match)");
    const type = chunkType(bytes, typeAt);
    const data = bytes.subarray(dataAt, crcAt);
    if (type === "IHDR") {
      if (length !== IHDR_BYTES) throw new PngError("its header is damaged");
      header = {
        width: readU32(data, 0),
        height: readU32(data, 4),
        depth: data[8] as number,
        colorType: data[9] as number,
        interlace: data[12] === 1,
        palette: null,
        trns: null,
      };
    } else if (header === null) {
      throw new PngError("its header is not where it should be");
    } else if (type === "PLTE") {
      header.palette = data;
    } else if (type === "tRNS") {
      header.trns = data;
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      sawEnd = true;
      break;
    }
    at = crcAt + CHUNK_CRC_BYTES;
  }
  if (header === null) throw new PngError("its header is missing");
  if (!sawEnd) throw new PngError("the file ends too early");
  if (idatParts.length === 0) throw new PngError("it has no picture data");
  const { width, height, depth, colorType } = header;
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE)
    throw new PngError("its size is 0 or larger than 16384 pixels");
  if (!(DEPTHS[colorType] ?? []).includes(depth)) throw new PngError("it uses a colour format PNG does not allow");
  if (colorType === COLOR_PALETTE && header.palette === null) throw new PngError("its colour list is missing");
  let total = 0;
  for (const part of idatParts) total += part.length;
  const idat = new Uint8Array(total);
  let offset = 0;
  for (const part of idatParts) {
    idat.set(part, offset);
    offset += part.length;
  }
  return { header, idat };
}

/** Paeth predictor (PNG spec 9.4). */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Undoes the scanline filters of one (sub)image in place. `raw` starts at `at`; returns the unfiltered rows
 * (without filter bytes) and the offset after the last row.
 */
function unfilter(
  raw: Uint8Array,
  at: number,
  rowBytes: number,
  rows: number,
  bpp: number,
): { data: Uint8Array; next: number } {
  const data = new Uint8Array(rowBytes * rows);
  for (let y = 0; y < rows; y++) {
    if (at >= raw.length) throw new PngError("the picture data ends early");
    const filter = raw[at] as number;
    at++;
    const row = y * rowBytes;
    const prev = row - rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const value = raw[at + x];
      if (value === undefined) throw new PngError("the picture data ends early");
      const left = x >= bpp ? (data[row + x - bpp] as number) : 0;
      const up = y > 0 ? (data[prev + x] as number) : 0;
      const upLeft = y > 0 && x >= bpp ? (data[prev + x - bpp] as number) : 0;
      let out: number;
      switch (filter) {
        case FILTER_NONE:
          out = value;
          break;
        case FILTER_SUB:
          out = value + left;
          break;
        case FILTER_UP:
          out = value + up;
          break;
        case FILTER_AVERAGE:
          out = value + ((left + up) >> 1);
          break;
        case FILTER_PAETH:
          out = value + paeth(left, up, upLeft);
          break;
        default:
          throw new PngError(`bad scanline filter ${filter}`);
      }
      data[row + x] = out & 0xff;
    }
    at += rowBytes;
  }
  return { data, next: at };
}

/** Reads sample `index` of a row at `depth` bits (1, 2, 4, 8 or 16; 16 returns the full 16-bit value). */
function sampleAt(row: Uint8Array, rowStart: number, index: number, depth: number): number {
  const BITS_PER_BYTE = 8;
  if (depth === 8) return row[rowStart + index] as number;
  if (depth === 16) return ((row[rowStart + 2 * index] as number) << 8) | (row[rowStart + 2 * index + 1] as number);
  const bit = index * depth;
  const byte = row[rowStart + (bit >> 3)] as number;
  const shift = BITS_PER_BYTE - depth - (bit & 7);
  return (byte >> shift) & ((1 << depth) - 1);
}

/** Scales a sample of `depth` bits to 8 bits, rounding to nearest: `round(value * 255 / (2^depth - 1))`. */
function scaleTo8(value: number, depth: number): number {
  if (depth === 8) return value;
  const MAX_8 = 255;
  const max = 2 ** depth - 1;
  return Math.floor((2 * value * MAX_8 + max) / (2 * max));
}

/** Writes one decoded pixel of the (sub)image into the RGBA output. */
function putPixel(
  header: PngHeader,
  row: Uint8Array,
  rowStart: number,
  x: number,
  out: Uint8Array,
  outAt: number,
): void {
  const { depth, colorType, palette, trns } = header;
  const channels = CHANNELS[colorType] as number;
  const s = (c: number): number => sampleAt(row, rowStart, x * channels + c, depth);
  let r: number;
  let g: number;
  let b: number;
  let a = ALPHA_OPAQUE;
  switch (colorType) {
    case COLOR_GREY: {
      const v = s(0);
      r = g = b = scaleTo8(v, depth);
      if (trns !== null && trns.length >= 2 && v === (((trns[0] as number) << 8) | (trns[1] as number))) a = 0;
      break;
    }
    case COLOR_RGB: {
      const rv = s(0);
      const gv = s(1);
      const bv = s(2);
      r = scaleTo8(rv, depth);
      g = scaleTo8(gv, depth);
      b = scaleTo8(bv, depth);
      const TRNS_RGB_BYTES = 6;
      if (trns !== null && trns.length >= TRNS_RGB_BYTES) {
        const tr = ((trns[0] as number) << 8) | (trns[1] as number);
        const tg = ((trns[2] as number) << 8) | (trns[3] as number);
        const tb = ((trns[4] as number) << 8) | (trns[5] as number);
        if (rv === tr && gv === tg && bv === tb) a = 0;
      }
      break;
    }
    case COLOR_PALETTE: {
      const index = s(0);
      const pal = palette as Uint8Array;
      if (3 * index + 2 >= pal.length) throw new PngError("a pixel uses a colour its colour list does not have");
      r = pal[3 * index] as number;
      g = pal[3 * index + 1] as number;
      b = pal[3 * index + 2] as number;
      if (trns !== null && index < trns.length) a = trns[index] as number;
      break;
    }
    case COLOR_GREY_ALPHA:
      r = g = b = scaleTo8(s(0), depth);
      a = scaleTo8(s(1), depth);
      break;
    default:
      r = scaleTo8(s(0), depth);
      g = scaleTo8(s(1), depth);
      b = scaleTo8(s(2), depth);
      a = scaleTo8(s(3), depth);
  }
  out[outAt] = r;
  out[outAt + 1] = g;
  out[outAt + 2] = b;
  out[outAt + 3] = a;
}

/** Decodes a PNG file into RGBA8. Throws PngError for anything unreadable. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  const { header, idat } = readChunks(bytes);
  let raw: Uint8Array;
  try {
    raw = unzlibSync(idat);
  } catch {
    throw new PngError("the picture data is damaged");
  }
  const { width, height, depth, colorType } = header;
  const channels = CHANNELS[colorType] as number;
  const bitsPerPixel = channels * depth;
  const BITS_PER_BYTE = 8;
  /** Filter byte distance: bytes per complete pixel, at least 1. */
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const rgba = new Uint8Array(width * height * RGBA_BYTES);
  const passes = header.interlace ? ADAM7 : [[0, 0, 1, 1] as const];
  let at = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const passWidth = Math.ceil((width - x0) / dx);
    const passHeight = Math.ceil((height - y0) / dy);
    if (passWidth <= 0 || passHeight <= 0) continue;
    const rowBytes = Math.ceil((passWidth * bitsPerPixel) / BITS_PER_BYTE);
    const { data, next } = unfilter(raw, at, rowBytes, passHeight, bpp);
    at = next;
    for (let py = 0; py < passHeight; py++) {
      const y = y0 + py * dy;
      for (let px = 0; px < passWidth; px++) {
        const x = x0 + px * dx;
        putPixel(header, data, py * rowBytes, px, rgba, (y * width + x) * RGBA_BYTES);
      }
    }
  }
  return { width, height, rgba };
}

// ---------------------------------------------------------------------------------------------------------
// Encoding (indexed PNGs for grit and the icon)

/** An 8-bit indexed image: one palette index per pixel, row-major. */
export interface IndexedImage {
  width: number;
  height: number;
  indices: Uint8Array;
  /** Palette as 0xRRGGBB values; 1-256 entries. */
  palette: readonly number[];
}

/** Largest PNG palette. */
const MAX_PALETTE = 256;

function writeU32(out: Uint8Array, at: number, value: number): void {
  out[at] = (value >>> 24) & 0xff;
  out[at + 1] = (value >>> 16) & 0xff;
  out[at + 2] = (value >>> 8) & 0xff;
  out[at + 3] = value & 0xff;
}

/** Builds one chunk: length, type, data, CRC over type + data. */
function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES + data.length + CHUNK_CRC_BYTES);
  writeU32(chunk, 0, data.length);
  for (let i = 0; i < CHUNK_TYPE_BYTES; i++) chunk[CHUNK_LENGTH_BYTES + i] = type.charCodeAt(i);
  chunk.set(data, CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES);
  const crcAt = CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES + data.length;
  writeU32(chunk, crcAt, crc32(chunk, CHUNK_LENGTH_BYTES, crcAt));
  return chunk;
}

/**
 * Encodes an 8-bit indexed PNG: IHDR, PLTE, tRNS (index 0 fully transparent, every other entry opaque; one byte
 * suffices because missing tRNS entries default to opaque), IDAT (filter 0 on every row, zlib level 9) and IEND.
 * The same input always yields the same bytes.
 */
export function encodeIndexedPng(image: IndexedImage): Uint8Array {
  const { width, height, indices, palette } = image;
  if (palette.length < 1 || palette.length > MAX_PALETTE) throw new Error("palette must have 1-256 entries");
  if (indices.length !== width * height) throw new Error("indices do not match the image size");
  const DEPTH_8 = 8;
  const ihdr = new Uint8Array(IHDR_BYTES);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = DEPTH_8;
  ihdr[9] = COLOR_PALETTE;
  // Bytes 10-12: compression 0, filter method 0, no interlace.
  const plte = new Uint8Array(3 * palette.length);
  palette.forEach((rgb, i) => {
    plte[3 * i] = (rgb >> 16) & 0xff;
    plte[3 * i + 1] = (rgb >> 8) & 0xff;
    plte[3 * i + 2] = rgb & 0xff;
  });
  const trns = new Uint8Array([0]);
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = FILTER_NONE;
    raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const chunks = [
    Uint8Array.from(SIGNATURE),
    makeChunk("IHDR", ihdr),
    makeChunk("PLTE", plte),
    makeChunk("tRNS", trns),
    makeChunk("IDAT", zlibSync(raw, { level: ZLIB_LEVEL })),
    makeChunk("IEND", new Uint8Array(0)),
  ];
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/**
 * Encodes palette indices with a DS palette (C3 step 8): each DS value is expanded to 0xRRGGBB, so grit's `>> 3`
 * reads back exactly the same DS colours, and index 0 (magenta) is transparent.
 */
export function encodeDsIndexedPng(
  width: number,
  height: number,
  indices: Uint8Array,
  dsPalette: readonly number[],
): Uint8Array {
  return encodeIndexedPng({ width, height, indices, palette: dsPalette.map(dsToRgb) });
}
