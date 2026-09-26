import { describe, expect, it } from "vitest";
import { matchGolden, readRepoFile } from "../testing/golden.ts";
import { convertEffect, MAX_SAMPLE_RATE, mixToMono16, resample16, scaleLoop } from "./effect.ts";
import {
  effectRamBytes,
  estimateEffectRam,
  isTrackerModule,
  musicRamBytes,
  parseSoundbank,
  parseSoundbankHeader,
  soundDefine,
} from "./soundbank.ts";
import { listWaveChunks, readSmplLoop, writeWav } from "./wav.ts";

describe("WAV chunks", () => {
  it("reads the smpl loop and skips odd-sized chunks with their pad byte", () => {
    const bytes = readRepoFile("fixtures/assets/loop-stereo-44k.wav");
    expect(listWaveChunks(bytes)?.map((c) => c.id)).toEqual(["fmt ", "LIST", "data", "smpl"]);
    expect(readSmplLoop(bytes)).toEqual({ start: 1000, end: 9000 });
    expect(readSmplLoop(readRepoFile("fixtures/assets/blip.wav"))).toBeNull();
    expect(listWaveChunks(new Uint8Array(4))).toBeNull();
  });

  it("writes only fmt, data and smpl, and reads back its own loop", () => {
    const wav = writeWav(Int16Array.from([1, -2, 3, -4]), 11025, { start: 0, end: 3 });
    expect(listWaveChunks(wav)?.map((c) => [c.id, c.size])).toEqual([
      ["fmt ", 16],
      ["data", 8],
      ["smpl", 60],
    ]);
    expect(readSmplLoop(wav)).toEqual({ start: 0, end: 3 });
    expect(listWaveChunks(writeWav(new Int16Array(3), 8000, null))?.map((c) => c.id)).toEqual(["fmt ", "data"]);
  });
});

describe("mixing and resampling", () => {
  it("averages channels after quantising each to 16 bits", () => {
    const l = Float32Array.from([0.5, -1, 1]);
    const r = Float32Array.from([0, -1, -1]);
    expect(Array.from(mixToMono16([l, r]))).toEqual([8192, -32768, 0]);
  });

  it("keeps rates at or below 22050 and resamples above it at exact positions", () => {
    const input = Int16Array.from({ length: 10 }, (_, i) => i * 100);
    expect(Array.from(resample16(input, 22050, 22050))).toEqual(Array.from(input));
    // Halving a ramp: a box filter of 2 (each sample and the next), then every other sample.
    expect(Array.from(resample16(input, 44100, 22050))).toEqual([50, 250, 450, 650, 850]);
    expect(resample16(new Int16Array(1000), 48000, 22050)).toHaveLength(459);
  });

  it("scales loops to the new rate and drops loops under 16 samples with E419", () => {
    expect(scaleLoop({ start: 1000, end: 9000 }, 44100, 22050, 5512)).toEqual({
      loop: { start: 500, end: 4500 },
      problems: [],
    });
    expect(scaleLoop({ start: 10, end: 40 }, 44100, 22050, 100)).toEqual({
      loop: null,
      problems: [{ code: "E419", args: { length: 15, min: 16 } }],
    });
  });
});

describe("convertEffect", () => {
  it("converts the stereo 44.1 kHz looped fixture to its golden mono 22050 Hz WAV", async () => {
    const { value, problems } = await convertEffect(readRepoFile("fixtures/assets/loop-stereo-44k.wav"), ".wav");
    expect(problems).toEqual([]);
    expect(value?.sampleRate).toBe(MAX_SAMPLE_RATE);
    expect(value?.loop).toEqual({ start: 500, end: 4500 });
    expect(matchGolden("sounds/loop-stereo-44k.wav", value?.wav ?? new Uint8Array()).equal).toBe(true);
  });

  it("keeps a 22050 Hz mono 16-bit WAV sample for sample", async () => {
    const src = readRepoFile("fixtures/assets/blip.wav");
    const { value } = await convertEffect(src, ".wav");
    const data = listWaveChunks(src)?.find((c) => c.id === "data");
    if (value === null || data === undefined) throw new Error("conversion failed");
    const original = new Int16Array(src.slice(data.offset, data.offset + data.size).buffer);
    expect(Array.from(value.samples)).toEqual(Array.from(original));
    expect(matchGolden("sounds/blip.wav", value.wav).equal).toBe(true);
  });

  it("decodes the MP3 fixture (44.1 kHz mono tone) to a 22050 Hz mono effect", async () => {
    const { value, problems } = await convertEffect(readRepoFile("fixtures/assets/tone-44k.mp3"), ".mp3");
    expect(problems).toEqual([]);
    if (value === null) throw new Error("MP3 did not decode");
    expect(value.sampleRate).toBe(MAX_SAMPLE_RATE);
    expect(value.loop).toBeNull();
    // 0.25 s of audio, plus the encoder's start delay and end padding (at most two 1152-sample frames at 44.1 kHz).
    const SOURCE_SECONDS = 0.25;
    const PADDING_SAMPLES = 1152;
    const minimum = Math.floor(SOURCE_SECONDS * MAX_SAMPLE_RATE);
    expect(value.samples.length).toBeGreaterThanOrEqual(minimum);
    expect(value.samples.length).toBeLessThanOrEqual(minimum + PADDING_SAMPLES);
    // The 440 Hz triangle (peak 12000) survives: loud enough, and about 440 periods per second. Periods are counted
    // with a hysteresis band, so the near-silent noise in the encoder's padding does not count.
    const BAND = 1000;
    let sumSquares = 0;
    let periods = 0;
    let armed = false;
    for (const v of value.samples) {
      sumSquares += v * v;
      if (v < -BAND) armed = true;
      else if (armed && v > BAND) {
        periods++;
        armed = false;
      }
    }
    const TRIANGLE_RMS = 12000 / Math.sqrt(3);
    expect(Math.sqrt(sumSquares / value.samples.length)).toBeGreaterThan(TRIANGLE_RMS / 2);
    const TONE_HZ = 440;
    const PERIOD_TOLERANCE = 0.1;
    expect(Math.abs(periods - TONE_HZ * SOURCE_SECONDS)).toBeLessThan(TONE_HZ * SOURCE_SECONDS * PERIOD_TOLERANCE);
  });

  it("reports unreadable audio as E409", async () => {
    const { value, problems } = await convertEffect(new TextEncoder().encode("not audio"), ".wav");
    expect(value).toBeNull();
    expect(problems.map((p) => p.code)).toEqual(["E409"]);
    expect((await convertEffect(new Uint8Array(8), ".ogg")).problems.map((p) => p.code)).toEqual(["E409"]);
  });
});

describe("soundbank.h and soundbank.bin", () => {
  it("parses CRLF and LF defines", () => {
    const text = "#define SFX_SND_FLAP\t0\r\n#define MOD_TUNE 0\r\n#define MSL_NSONGS\t1\n// comment\n";
    expect(Object.fromEntries(parseSoundbankHeader(text))).toEqual({ SFX_SND_FLAP: 0, MOD_TUNE: 0, MSL_NSONGS: 1 });
    expect(soundDefine("snd_flap", "effect")).toBe("SFX_SND_FLAP");
    expect(soundDefine("mus_Title", "music")).toBe("MOD_MUS_TITLE");
  });

  it("reads entry sizes and a song's samples from an MSL image", () => {
    const bank = syntheticBank();
    const sizes = parseSoundbank(bank);
    expect(sizes).toEqual({ samples: [40, 24, 16], songs: [{ bytes: 330, sampleIds: [1, 2] }] });
    if (sizes === null) throw new Error("unreadable");
    expect(effectRamBytes(sizes, 0)).toBe(40);
    expect(musicRamBytes(sizes, 0)).toBe(330 + 24 + 16);
    expect(parseSoundbank(bank.subarray(0, 20))).toBeNull();
    expect(parseSoundbank(new Uint8Array(64))).toBeNull();
  });

  it("estimates RAM before mmutil ran", () => {
    expect(estimateEffectRam(3)).toBe(12 + 8);
  });

  it("checks tracker signatures", () => {
    expect(isTrackerModule(readRepoFile("fixtures/assets/tune.xm"), ".xm")).toBe(true);
    expect(isTrackerModule(readRepoFile("fixtures/assets/tune.xm"), ".it")).toBe(false);
    expect(isTrackerModule(new Uint8Array(10), ".mod")).toBe(false);
  });
});

/** An MSL image with 3 samples (payloads 40, 24, 16) and one 330-byte song using samples 2 and 1 (and one embedded). */
function syntheticBank(): Uint8Array {
  const payloads = [40, 24, 16];
  const SONG_BYTES = 330;
  const SAMPLE_TABLE = 276;
  const RECORD_BYTES = 12;
  const song = new Uint8Array(SONG_BYTES);
  const songView = new DataView(song.buffer);
  song[1] = 0; // instruments
  song[2] = 3; // samples
  // Three sample records after the table, holding msl_id 2, 1 and 0xFFFF (embedded) at byte 10.
  [2, 1, 0xffff].forEach((id, i) => {
    const record = SAMPLE_TABLE + 3 * 4 + i * RECORD_BYTES;
    songView.setUint32(SAMPLE_TABLE + i * 4, record, true);
    songView.setUint16(record + 10, id, true);
  });
  const entries = [...payloads.map((n) => new Uint8Array(n)), song];
  let at = 12 + entries.length * 4;
  const offsets = entries.map((e) => {
    const o = at;
    at += 8 + e.length;
    return o;
  });
  const out = new Uint8Array(at);
  const view = new DataView(out.buffer);
  view.setUint16(0, 3, true);
  view.setUint16(2, 1, true);
  out.set(new TextEncoder().encode("*maxmod*"), 4);
  offsets.forEach((o, i) => {
    view.setUint32(12 + i * 4, o, true);
    view.setUint32(o, (entries[i] as Uint8Array).length, true);
    out.set(entries[i] as Uint8Array, o + 8);
  });
  return out;
}
