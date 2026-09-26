/**
 * The sound core: loop points of a WAV effect, kept where the asset pipeline reads them (the first loop of the
 * `smpl` chunk, C3 section 5), and what the DS will get: the pipeline resamples to at most 22050 Hz, scales the
 * loop down (floor) and drops a loop shorter than 16 samples (E419; mmutil would drop it anyway,
 * docs/research/verification.md claim 9). Rewriting a loop copies every other chunk byte for byte. Pure.
 */

export interface Loop {
  /** First looped sample (smpl dwStart). */
  start: number;
  /** smpl dwEnd, as the pipeline reads it: the loop length is end - start. */
  end: number;
}

export interface WavInfo {
  formatTag: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  /** Samples per channel. */
  frames: number;
  loop: Loop | null;
}

/** The pipeline's rate cap and shortest loop (asset-pipeline sound/effect.ts). */
export const DS_MAX_RATE = 22050;
export const MIN_LOOP_SAMPLES = 16;

interface Chunk {
  id: string;
  /** Offset of the 8-byte header. */
  at: number;
  offset: number;
  size: number;
}

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const fourcc = (b: Uint8Array, at: number) => String.fromCharCode(...b.subarray(at, at + 4));

/** The RIFF/WAVE chunks (word-aligned, as the pipeline walks them), or null when the bytes are not a WAV. */
function chunks(b: Uint8Array): Chunk[] | null {
  if (b.length < 12 || fourcc(b, 0) !== "RIFF" || fourcc(b, 8) !== "WAVE") return null;
  const v = view(b);
  const out: Chunk[] = [];
  let at = 12;
  while (at + 8 <= b.length) {
    const size = v.getUint32(at + 4, true);
    if (at + 8 + size > b.length) break;
    out.push({ id: fourcc(b, at), at, offset: at + 8, size });
    at += 8 + size + (size % 2);
  }
  return out;
}

export function readLoop(b: Uint8Array): Loop | null {
  const smpl = chunks(b)?.find((c) => c.id === "smpl");
  if (!smpl || smpl.size < 36 + 24) return null;
  const v = view(b);
  if (v.getUint32(smpl.offset + 28, true) < 1) return null;
  return { start: v.getUint32(smpl.offset + 44, true), end: v.getUint32(smpl.offset + 48, true) };
}

export function wavInfo(b: Uint8Array): WavInfo | null {
  const list = chunks(b);
  const fmt = list?.find((c) => c.id === "fmt ");
  const data = list?.find((c) => c.id === "data");
  if (!fmt || !data || fmt.size < 16) return null;
  const v = view(b);
  const channels = v.getUint16(fmt.offset + 2, true);
  const bitsPerSample = v.getUint16(fmt.offset + 14, true);
  const blockAlign = v.getUint16(fmt.offset + 12, true) || (channels * bitsPerSample) / 8;
  return {
    formatTag: v.getUint16(fmt.offset, true),
    channels,
    sampleRate: v.getUint32(fmt.offset + 4, true),
    bitsPerSample,
    frames: blockAlign > 0 ? Math.floor(data.size / blockAlign) : 0,
    loop: readLoop(b),
  };
}

/** A 60-byte `smpl` chunk (header included) with one forward loop that repeats forever. */
function smplChunk(loop: Loop, sampleRate: number): Uint8Array {
  const out = new Uint8Array(8 + 60);
  const v = view(out);
  out.set([0x73, 0x6d, 0x70, 0x6c]); // "smpl"
  v.setUint32(4, 60, true);
  v.setUint32(8 + 8, sampleRate > 0 ? Math.round(1_000_000_000 / sampleRate) : 0, true); // sample period, ns
  v.setUint32(8 + 12, 60, true); // MIDI unity note (middle C)
  v.setUint32(8 + 28, 1, true); // one loop
  v.setUint32(8 + 44, loop.start, true);
  v.setUint32(8 + 48, loop.end, true);
  return out;
}

/**
 * The WAV with its loop replaced: every `smpl` chunk is dropped and, when `loop` is set, one new `smpl` chunk is
 * appended. The other chunks are copied unchanged. Returns null when the bytes are not a WAV.
 */
export function withLoop(b: Uint8Array, loop: Loop | null): Uint8Array | null {
  const list = chunks(b);
  const info = wavInfo(b);
  if (!list || !info) return null;
  const parts: Uint8Array[] = [b.subarray(0, 12)];
  for (const c of list)
    if (c.id !== "smpl") parts.push(b.subarray(c.at, Math.min(b.length, c.offset + c.size + (c.size % 2))));
  if (loop) parts.push(smplChunk(loop, info.sampleRate));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  view(out).setUint32(4, total - 8, true);
  return out;
}

/** A loop kept inside the sound: 0 <= start < end <= frames, whole samples. */
export function clampLoop(loop: Loop, frames: number): Loop {
  const start = Math.max(0, Math.min(Math.round(loop.start), Math.max(0, frames - 1)));
  const end = Math.max(start + 1, Math.min(Math.round(loop.end), frames));
  return { start, end };
}

/** The loop the DS gets (the pipeline's scaleLoop): null, with `tooShort`, when it ends up under 16 samples. */
export function dsLoop(
  loop: Loop,
  sampleRate: number,
  frames: number,
): { rate: number; loop: Loop | null; length: number; tooShort: boolean } {
  const rate = Math.min(sampleRate, DS_MAX_RATE);
  // resample16's output length.
  const total = sampleRate === rate || frames === 0 ? frames : Math.max(1, Math.floor((frames * rate) / sampleRate));
  const start = Math.floor((loop.start * rate) / sampleRate);
  const end = Math.min(Math.floor((loop.end * rate) / sampleRate), total);
  const n = Math.max(0, end - start);
  return n < MIN_LOOP_SAMPLES
    ? { rate, loop: null, length: n, tooShort: true }
    : { rate, loop: { start, end }, length: n, tooShort: false };
}

/** Min/max pairs of `samples` in `buckets` equal slices, for drawing a waveform. */
export function peaks(samples: Float32Array, buckets: number): Float32Array {
  const out = new Float32Array(buckets * 2);
  for (let i = 0; i < buckets; i++) {
    const from = Math.floor((i * samples.length) / buckets);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / buckets));
    let lo = 0;
    let hi = 0;
    for (let j = from; j < to && j < samples.length; j++) {
      const s = samples[j] as number;
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    out[i * 2] = lo;
    out[i * 2 + 1] = hi;
  }
  return out;
}
