/**
 * Generates WS5's sound fixtures in fixtures/assets/ (C14: the XM fixture is WS5's). Everything is synthesised
 * here, so the files carry no third-party rights: they are dedicated to the public domain (CC0), see
 * fixtures/assets/README.md. Deterministic: running it again rewrites identical bytes.
 *
 *   node packages/asset-pipeline/scripts/make-fixtures.ts
 *
 * - tune.xm: a 4-channel FastTracker 2 module, one looped 8-bit square-wave instrument, one 16-row pattern
 *   playing C-E-G-C.
 * - loop-stereo-44k.wav: 0.25 s of a stereo 16-bit 44100 Hz tone with a `smpl` loop (1000..9000) and a LIST
 *   chunk, to exercise mono mixing, resampling, loop scaling and chunk stripping.
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/assets");

/** Growable little-endian byte builder. */
function bytes(): {
  u8(v: number): void;
  u16(v: number): void;
  u32(v: number): void;
  str(s: string, n: number): void;
  out(): Uint8Array;
} {
  const parts: number[] = [];
  return {
    u8: (v) => parts.push(v & 0xff),
    u16: (v) => parts.push(v & 0xff, (v >> 8) & 0xff),
    u32: (v) => parts.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff),
    str: (s, n) => {
      for (let i = 0; i < n; i++) parts.push(i < s.length ? s.charCodeAt(i) : 0);
    },
    out: () => Uint8Array.from(parts),
  };
}

// ---------------------------------------------------------------------------------------------------------
// tune.xm

/** XM format constants (FastTracker 2 v1.04). */
const XM_VERSION = 0x0104;
/** Header size field: counted from itself, 4 + 16 bytes of fields + the 256-entry order table. */
const XM_HEADER_SIZE = 276;
const XM_CHANNELS = 4;
const XM_ROWS = 16;
const XM_TEMPO = 6;
const XM_BPM = 125;
const XM_FLAG_LINEAR = 1;
const XM_ORDER_TABLE = 256;
/** Pattern header length (length field + packing type + rows + packed size). */
const XM_PATTERN_HEADER = 9;
/** Instrument header size with samples (29 base bytes + 234 extra). */
const XM_INSTRUMENT_SIZE = 263;
const XM_SAMPLE_HEADER_SIZE = 40;
/** Notes: 1 = C-0; C-4 is 49. Key-off is 97. */
const NOTE_C4 = 49;
const NOTE_E4 = 53;
const NOTE_G4 = 56;
const NOTE_C5 = 61;
/** Square wave: 32 samples, half high, half low, looped whole. */
const WAVE_LENGTH = 32;
const WAVE_HIGH = 48;
const SAMPLE_LOOP_FORWARD = 1;
const SAMPLE_VOLUME = 48;
const SAMPLE_PANNING_CENTRE = 128;
/** The XM instrument keymap covers 96 notes; envelopes hold 12 points of two u16 each. */
const XM_KEYMAP = 96;
const XM_ENVELOPE_BYTES = 48;
const XM_RESERVED = 22;

function makeXm(): Uint8Array {
  const b = bytes();
  b.str("Extended Module: ", 17);
  b.str("dsdude fixture", 20);
  b.u8(0x1a);
  b.str("dsdude make-fixtures", 20);
  b.u16(XM_VERSION);
  b.u32(XM_HEADER_SIZE);
  b.u16(1); // song length (orders)
  b.u16(0); // restart position
  b.u16(XM_CHANNELS);
  b.u16(1); // patterns
  b.u16(1); // instruments
  b.u16(XM_FLAG_LINEAR);
  b.u16(XM_TEMPO);
  b.u16(XM_BPM);
  for (let i = 0; i < XM_ORDER_TABLE; i++) b.u8(0);

  // Pattern 0, unpacked cells (note, instrument, volume, effect, parameter) packed with the 0x80 scheme:
  // a note with instrument 1 on channel 0 every 4 rows, everything else empty (0x80 = "nothing follows").
  const notes = [NOTE_C4, NOTE_E4, NOTE_G4, NOTE_C5];
  const cells: number[] = [];
  const ROWS_PER_NOTE = 4;
  for (let row = 0; row < XM_ROWS; row++) {
    for (let ch = 0; ch < XM_CHANNELS; ch++) {
      if (ch === 0 && row % ROWS_PER_NOTE === 0)
        cells.push(0x80 | 0x01 | 0x02, notes[row / ROWS_PER_NOTE] as number, 1);
      else cells.push(0x80);
    }
  }
  b.u32(XM_PATTERN_HEADER);
  b.u8(0); // packing type
  b.u16(XM_ROWS);
  b.u16(cells.length);
  for (const c of cells) b.u8(c);

  // Instrument 1 with one sample.
  b.u32(XM_INSTRUMENT_SIZE);
  b.str("square", 22);
  b.u8(0); // type
  b.u16(1); // samples
  b.u32(XM_SAMPLE_HEADER_SIZE);
  for (let i = 0; i < XM_KEYMAP; i++) b.u8(0);
  for (let i = 0; i < 2 * XM_ENVELOPE_BYTES; i++) b.u8(0); // volume and panning envelopes
  for (let i = 0; i < 8; i++) b.u8(0); // point counts, sustain and loop points
  b.u8(0); // volume envelope type
  b.u8(0); // panning envelope type
  for (let i = 0; i < 4; i++) b.u8(0); // vibrato type, sweep, depth, rate
  b.u16(0); // fadeout
  for (let i = 0; i < XM_RESERVED; i++) b.u8(0);
  // Sample header.
  b.u32(WAVE_LENGTH); // bytes (8-bit)
  b.u32(0); // loop start
  b.u32(WAVE_LENGTH); // loop length
  b.u8(SAMPLE_VOLUME);
  b.u8(0); // finetune
  b.u8(SAMPLE_LOOP_FORWARD);
  b.u8(SAMPLE_PANNING_CENTRE);
  b.u8(0); // relative note
  b.u8(0); // reserved
  b.str("square", 22);
  // Sample data, delta-encoded 8-bit.
  let previous = 0;
  for (let i = 0; i < WAVE_LENGTH; i++) {
    const v = i < WAVE_LENGTH / 2 ? WAVE_HIGH : -WAVE_HIGH;
    b.u8(v - previous);
    previous = v;
  }
  return b.out();
}

// ---------------------------------------------------------------------------------------------------------
// loop-stereo-44k.wav

const WAV_RATE = 44100;
const WAV_SECONDS = 0.25;
const WAV_CHANNELS = 2;
const WAV_BITS = 16;
const TONE_LEFT_HZ = 440;
const TONE_RIGHT_HZ = 660;
const TONE_AMPLITUDE = 12000;
const LOOP_START = 1000;
const LOOP_END = 9000;

/** A deterministic triangle wave (integer maths, no Math.sin) at `hz`. */
function triangle(i: number, hz: number): number {
  const period = WAV_RATE / hz;
  const phase = (i % period) / period;
  return Math.round(TONE_AMPLITUDE * (phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase));
}

function makeLoopWav(): Uint8Array {
  const frames = Math.round(WAV_RATE * WAV_SECONDS);
  const data = bytes();
  for (let i = 0; i < frames; i++) {
    data.u16(triangle(i, TONE_LEFT_HZ));
    data.u16(triangle(i, TONE_RIGHT_HZ));
  }
  const pcm = data.out();
  const list = bytes();
  list.str("INFO", 4);
  list.str("ISFT", 4);
  list.u32(5);
  list.str("dsdud", 5); // odd size: needs a pad byte, which mmutil would trip over
  list.u8(0);
  const listBytes = list.out();
  const b = bytes();
  const smplSize = 36 + 24;
  const riffSize = 4 + (8 + 16) + (8 + listBytes.length - 1 + 1) + (8 + pcm.length) + (8 + smplSize);
  b.str("RIFF", 4);
  b.u32(riffSize);
  b.str("WAVE", 4);
  b.str("fmt ", 4);
  b.u32(16);
  b.u16(1);
  b.u16(WAV_CHANNELS);
  b.u32(WAV_RATE);
  b.u32((WAV_RATE * WAV_CHANNELS * WAV_BITS) / 8);
  b.u16((WAV_CHANNELS * WAV_BITS) / 8);
  b.u16(WAV_BITS);
  b.str("LIST", 4);
  b.u32(listBytes.length - 1); // the declared size excludes the pad byte
  for (const x of listBytes) b.u8(x);
  b.str("data", 4);
  b.u32(pcm.length);
  for (const x of pcm) b.u8(x);
  b.str("smpl", 4);
  b.u32(smplSize);
  for (const v of [0, 0, Math.floor(1e9 / WAV_RATE), 60, 0, 0, 0, 1, 0]) b.u32(v);
  for (const v of [0, 0, LOOP_START, LOOP_END, 0, 0]) b.u32(v);
  return b.out();
}

writeFileSync(join(OUT, "tune.xm"), makeXm());
writeFileSync(join(OUT, "loop-stereo-44k.wav"), makeLoopWav());
console.log(`wrote ${join(OUT, "tune.xm")} and ${join(OUT, "loop-stereo-44k.wav")}`);
