/**
 * Sound effects (C3 section 5): decode a WAV or MP3 with the pinned MIT decoders, mix to mono, resample to at most
 * 22050 Hz and write the fmt/data/smpl WAV mmutil gets. Integer maths after decoding, so the output bytes are the
 * same on every platform. Pure TypeScript (the decoders are pure JS / WebAssembly).
 */
import decodeWav from "@audio/decode-wav";
import type { Problem } from "../problems.ts";
import { canonicalWave, type Loop, readSmplLoop, writeWav } from "./wav.ts";

/** The highest sample rate the pipeline keeps (C3 section 5). */
export const MAX_SAMPLE_RATE = 22050;
/** mmutil drops loops shorter than this many samples (claim 9); the pipeline drops them first, with E419. */
export const MIN_LOOP_SAMPLES = 16;
/** Scale between a float sample (-1..1) and a signed 16-bit sample. */
const INT16_SCALE = 32768;
const INT16_MIN = -32768;
const INT16_MAX = 32767;

/** Decoder output: one Float32Array per channel. */
interface DecodedAudio {
  channelData: Float32Array[];
  sampleRate: number;
}

/** A converted effect, ready for mmutil. */
export interface ConvertedEffect {
  sampleRate: number;
  /** Mono 16-bit samples at `sampleRate`. */
  samples: Int16Array;
  loop: Loop | null;
  /** The WAV file bytes (fmt, data, smpl). */
  wav: Uint8Array;
}

/** Converts one float sample to 16-bit, rounding to nearest and clamping. */
function toInt16(x: number): number {
  const v = Math.round(x * INT16_SCALE);
  return v < INT16_MIN ? INT16_MIN : v > INT16_MAX ? INT16_MAX : v;
}

/** Mixes decoded channels to one 16-bit channel: each channel is quantised first, then averaged (rounded). */
export function mixToMono16(channels: readonly Float32Array[]): Int16Array {
  const n = channels.length;
  const length = Math.min(...channels.map((c) => c.length));
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const c of channels) sum += toInt16(c[i] as number);
    out[i] = Math.round(sum / n);
  }
  return out;
}

/**
 * Resamples 16-bit mono from `from` Hz to `to` Hz (to <= from): a box filter as wide as the rate ratio (a cheap
 * anti-alias), then linear interpolation at exact rational positions. Integer maths only.
 */
export function resample16(input: Int16Array, from: number, to: number): Int16Array {
  if (from === to || input.length === 0) return input.slice();
  // Box filter: each sample becomes the mean of the `width` samples centred on it (edges clamp).
  const width = Math.ceil(from / to);
  let filtered = input;
  if (width > 1) {
    filtered = new Int16Array(input.length);
    const before = Math.floor((width - 1) / 2);
    for (let i = 0; i < input.length; i++) {
      let sum = 0;
      for (let k = 0; k < width; k++) {
        const j = Math.min(input.length - 1, Math.max(0, i - before + k));
        sum += input[j] as number;
      }
      filtered[i] = Math.round(sum / width);
    }
  }
  const length = Math.max(1, Math.floor((input.length * to) / from));
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const num = i * from; // position i * from / to, as whole part + remainder over `to`
    const index = Math.floor(num / to);
    const frac = num - index * to;
    const a = filtered[index] as number;
    const b = filtered[Math.min(index + 1, filtered.length - 1)] as number;
    out[i] = Math.round((a * (to - frac) + b * frac) / to);
  }
  return out;
}

/** Scales a loop to the new rate (floor), or returns null (with E419) when it ends up shorter than 16 samples. */
export function scaleLoop(
  loop: Loop | null,
  from: number,
  to: number,
  length: number,
): { loop: Loop | null; problems: Problem[] } {
  if (loop === null) return { loop: null, problems: [] };
  const start = Math.floor((loop.start * to) / from);
  const end = Math.min(Math.floor((loop.end * to) / from), length);
  if (end - start < MIN_LOOP_SAMPLES) {
    return {
      loop: null,
      problems: [{ code: "E419", args: { length: Math.max(0, end - start), min: MIN_LOOP_SAMPLES } }],
    };
  }
  return { loop: { start, end }, problems: [] };
}

/** Converts decoded audio (plus the source's loop) into the effect WAV. */
export function convertDecoded(
  audio: DecodedAudio,
  loop: Loop | null,
): { value: ConvertedEffect | null; problems: Problem[] } {
  if (audio.channelData.length === 0 || audio.sampleRate <= 0) {
    return { value: null, problems: [{ code: "E409", args: { detail: "no audio data" } }] };
  }
  const rate = Math.min(audio.sampleRate, MAX_SAMPLE_RATE);
  const samples = resample16(mixToMono16(audio.channelData), audio.sampleRate, rate);
  const scaled = scaleLoop(loop, audio.sampleRate, rate, samples.length);
  return {
    value: { sampleRate: rate, samples, loop: scaled.loop, wav: writeWav(samples, rate, scaled.loop) },
    problems: scaled.problems,
  };
}

/** The effect source formats and their decoders. */
export const EFFECT_EXTENSIONS = [".wav", ".mp3"] as const;

/**
 * Decodes and converts an effect file (`.wav` or `.mp3`, by extension). Unreadable audio is E409 with the
 * decoder's reason as `{detail}`.
 */
export async function convertEffect(
  bytes: Uint8Array,
  extension: string,
): Promise<{ value: ConvertedEffect | null; problems: Problem[] }> {
  try {
    if (extension === ".wav") {
      // decode-wav trips over odd-sized chunks before `data`, so it gets only fmt + data.
      const canonical = canonicalWave(bytes);
      if (canonical === null) return { value: null, problems: [{ code: "E409", args: { detail: "not a WAV file" } }] };
      return convertDecoded(decodeWav(canonical) as DecodedAudio, readSmplLoop(bytes));
    }
    if (extension === ".mp3") {
      // Loaded on first use: the MP3 decoder carries a WebAssembly module that WAV-only projects never need.
      const { default: decodeMp3 } = await import("@audio/decode-mp3");
      return convertDecoded((await decodeMp3(bytes)) as DecodedAudio, null);
    }
  } catch (err) {
    return { value: null, problems: [{ code: "E409", args: { detail: (err as Error).message } }] };
  }
  return { value: null, problems: [{ code: "E409", args: { detail: `${extension} is not an effect format` } }] };
}
