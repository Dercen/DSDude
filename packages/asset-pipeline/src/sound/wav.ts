/**
 * RIFF/WAVE helpers for sound effects (C3 section 5): reading a source's first `smpl` loop, and writing the WAVs
 * mmutil gets, which hold only `fmt ` (PCM, mono, 16-bit), `data` and, when there is a loop, `smpl` (mmutil is not
 * RIFF pad-byte aware and rejects odd LIST chunks; docs/research/verification.md claim 9). The chunk order is
 * wavefile's (fmt, data, smpl), which spike 11 checked against the real mmutil. Pure TypeScript.
 */

/** A loop in samples, as the `smpl` chunk states it: `start` = dwStart, `end` = dwEnd. */
export interface Loop {
  start: number;
  end: number;
}

/** One RIFF chunk: its four-character id and where its payload lies. */
export interface RiffChunk {
  id: string;
  /** Offset of the payload (after the 8-byte chunk header). */
  offset: number;
  size: number;
}

/** Bytes of a chunk header (id + size) and of the RIFF form header (RIFF + size + form type). */
const CHUNK_HEADER_BYTES = 8;
const RIFF_HEADER_BYTES = 12;
/** RIFF chunks are word-aligned: an odd-sized payload is followed by one pad byte. */
const RIFF_ALIGN = 2;
/** `smpl` payload: 9 u32 fields (manufacturer .. sampler data) before the loop records. */
const SMPL_FIXED_BYTES = 36;
/** Offset of dwNumSampleLoops inside the `smpl` payload. */
const SMPL_NUM_LOOPS_OFFSET = 28;
/** Bytes of one `smpl` loop record (id, type, start, end, fraction, play count). */
const SMPL_LOOP_BYTES = 24;
/** Offsets of dwStart and dwEnd inside a loop record. */
const SMPL_LOOP_START = 8;
const SMPL_LOOP_END = 12;
/** `fmt ` payload for PCM. */
const FMT_BYTES = 16;
/** WAVE format tag for integer PCM. */
const WAVE_FORMAT_PCM = 1;
/** The only sample format we write. */
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const MONO = 1;
/** Nanoseconds per second, for the `smpl` sample period field. */
const NANOSECONDS_PER_SECOND = 1_000_000_000;
/** MIDI unity note written into `smpl` (middle C), the usual default. */
const SMPL_UNITY_NOTE = 60;

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(
    bytes[at] as number,
    bytes[at + 1] as number,
    bytes[at + 2] as number,
    bytes[at + 3] as number,
  );
}

function u32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, true);
}

/** Lists the chunks of a RIFF/WAVE file, or returns null when it is not one. Stops quietly at a truncated chunk. */
export function listWaveChunks(bytes: Uint8Array): RiffChunk[] | null {
  if (bytes.length < RIFF_HEADER_BYTES || fourcc(bytes, 0) !== "RIFF" || fourcc(bytes, 8) !== "WAVE") return null;
  const chunks: RiffChunk[] = [];
  let at = RIFF_HEADER_BYTES;
  while (at + CHUNK_HEADER_BYTES <= bytes.length) {
    const size = u32(bytes, at + 4);
    const offset = at + CHUNK_HEADER_BYTES;
    if (offset + size > bytes.length) break;
    chunks.push({ id: fourcc(bytes, at), offset, size });
    at = offset + size + (size % RIFF_ALIGN);
  }
  return chunks;
}

/** The first loop of a WAV's `smpl` chunk, or null when there is none. */
export function readSmplLoop(bytes: Uint8Array): Loop | null {
  const smpl = listWaveChunks(bytes)?.find((c) => c.id === "smpl");
  if (smpl === undefined || smpl.size < SMPL_FIXED_BYTES + SMPL_LOOP_BYTES) return null;
  if (u32(bytes, smpl.offset + SMPL_NUM_LOOPS_OFFSET) < 1) return null;
  const loop = smpl.offset + SMPL_FIXED_BYTES;
  return { start: u32(bytes, loop + SMPL_LOOP_START), end: u32(bytes, loop + SMPL_LOOP_END) };
}

/**
 * Rebuilds a WAV with only its `fmt ` and `data` chunks (payloads copied unchanged), or returns null when either
 * is missing. Decoders then never meet the chunks they mishandle (odd-sized LIST without its pad byte, and so on).
 */
export function canonicalWave(bytes: Uint8Array): Uint8Array | null {
  const chunks = listWaveChunks(bytes);
  const fmt = chunks?.find((c) => c.id === "fmt ");
  const data = chunks?.find((c) => c.id === "data");
  if (fmt === undefined || data === undefined) return null;
  const fmtPad = fmt.size % RIFF_ALIGN;
  const total = RIFF_HEADER_BYTES + CHUNK_HEADER_BYTES + fmt.size + fmtPad + CHUNK_HEADER_BYTES + data.size;
  const w = new Writer(total);
  w.id("RIFF");
  w.u32(total - CHUNK_HEADER_BYTES);
  w.id("WAVE");
  w.id("fmt ");
  w.u32(fmt.size);
  w.raw(bytes.subarray(fmt.offset, fmt.offset + fmt.size));
  if (fmtPad > 0) w.raw(new Uint8Array(fmtPad));
  w.id("data");
  w.u32(data.size);
  w.raw(bytes.subarray(data.offset, data.offset + data.size));
  return w.bytes;
}

/** A little-endian byte writer over a fixed-size buffer. */
class Writer {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  private at = 0;
  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }
  id(s: string): void {
    for (let i = 0; i < s.length; i++) this.bytes[this.at + i] = s.charCodeAt(i);
    this.at += s.length;
  }
  u16(v: number): void {
    this.view.setUint16(this.at, v, true);
    this.at += 2;
  }
  u32(v: number): void {
    this.view.setUint32(this.at, v, true);
    this.at += 4;
  }
  i16(v: number): void {
    this.view.setInt16(this.at, v, true);
    this.at += 2;
  }
  raw(b: Uint8Array): void {
    this.bytes.set(b, this.at);
    this.at += b.length;
  }
}

/**
 * Writes a mono 16-bit PCM WAV with only `fmt `, `data` and (when `loop` is given) a one-loop `smpl` chunk. The
 * same input always yields the same bytes. 16-bit mono data is always even-sized, so no pad bytes are needed.
 */
export function writeWav(samples: Int16Array, sampleRate: number, loop: Loop | null): Uint8Array {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const smplBytes = loop === null ? 0 : CHUNK_HEADER_BYTES + SMPL_FIXED_BYTES + SMPL_LOOP_BYTES;
  const total = RIFF_HEADER_BYTES + CHUNK_HEADER_BYTES + FMT_BYTES + CHUNK_HEADER_BYTES + dataBytes + smplBytes;
  const w = new Writer(total);
  w.id("RIFF");
  w.u32(total - CHUNK_HEADER_BYTES);
  w.id("WAVE");
  w.id("fmt ");
  w.u32(FMT_BYTES);
  w.u16(WAVE_FORMAT_PCM);
  w.u16(MONO);
  w.u32(sampleRate);
  w.u32(sampleRate * BYTES_PER_SAMPLE * MONO); // byte rate
  w.u16(BYTES_PER_SAMPLE * MONO); // block align
  w.u16(BITS_PER_SAMPLE);
  w.id("data");
  w.u32(dataBytes);
  for (const s of samples) w.i16(s);
  if (loop !== null) {
    w.id("smpl");
    w.u32(SMPL_FIXED_BYTES + SMPL_LOOP_BYTES);
    w.u32(0); // manufacturer
    w.u32(0); // product
    w.u32(Math.floor(NANOSECONDS_PER_SECOND / sampleRate)); // sample period in ns
    w.u32(SMPL_UNITY_NOTE);
    w.u32(0); // pitch fraction
    w.u32(0); // SMPTE format
    w.u32(0); // SMPTE offset
    w.u32(1); // one loop
    w.u32(0); // sampler data bytes
    w.u32(0); // loop id
    w.u32(0); // loop type 0: forward
    w.u32(loop.start);
    w.u32(loop.end);
    w.u32(0); // fraction
    w.u32(0); // play count 0: forever
  }
  return w.bytes;
}
