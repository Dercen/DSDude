import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { clampLoop, dsLoop, peaks, readLoop, wavInfo, withLoop } from "./sound.ts";

/** Test inputs (fixtures/editors/README.md names them). */
const asset = (name: string) =>
  new Uint8Array(readFileSync(resolve(import.meta.dirname, "../../../fixtures/assets", name)));

describe("sound core", () => {
  it("reads the format and the smpl loop of the looped fixture (1000..9000, odd LIST chunk)", () => {
    const info = wavInfo(asset("loop-stereo-44k.wav"));
    expect(info).toMatchObject({ formatTag: 1, channels: 2, sampleRate: 44100, bitsPerSample: 16 });
    expect(info?.frames).toBeGreaterThan(9000);
    expect(info?.loop).toEqual({ start: 1000, end: 9000 });
    expect(wavInfo(asset("tone-44k.mp3"))).toBeNull();
  });

  it("writes, replaces and removes a loop, keeping every other chunk byte for byte", () => {
    const blip = asset("blip.wav");
    const info = wavInfo(blip);
    if (!info) throw new Error("blip.wav must parse");
    expect(info.loop).toBeNull();
    const looped = withLoop(blip, { start: 100, end: 900 });
    if (!looped) throw new Error("withLoop failed");
    expect(readLoop(looped)).toEqual({ start: 100, end: 900 });
    expect(wavInfo(looped)).toMatchObject({ ...info, loop: { start: 100, end: 900 } });
    // The original bytes come first unchanged (the RIFF size aside); smpl is appended.
    expect(looped.subarray(8, blip.length)).toEqual(blip.subarray(8));
    expect(new DataView(looped.buffer).getUint32(4, true)).toBe(looped.length - 8);

    const moved = withLoop(looped, { start: 50, end: 70 });
    expect(moved && readLoop(moved)).toEqual({ start: 50, end: 70 });
    expect(moved?.length).toBe(looped.length);
    expect(withLoop(looped, null)).toEqual(blip);

    const stereo = asset("loop-stereo-44k.wav");
    const replaced = withLoop(stereo, { start: 2000, end: 4000 });
    expect(replaced && wavInfo(replaced)).toMatchObject({ channels: 2, loop: { start: 2000, end: 4000 } });
    expect(withLoop(asset("tone-44k.mp3"), null)).toBeNull();
  });

  it("predicts the DS loop as the pipeline scales it, flagging loops under 16 samples", () => {
    // 44100 -> 22050 halves the loop (floor).
    expect(dsLoop({ start: 1000, end: 9000 }, 44100, 20000)).toEqual({
      rate: 22050,
      loop: { start: 500, end: 4500 },
      length: 4000,
      tooShort: false,
    });
    expect(dsLoop({ start: 100, end: 130 }, 44100, 20000)).toMatchObject({ loop: null, length: 15, tooShort: true });
    expect(dsLoop({ start: 100, end: 116 }, 11025, 20000)).toMatchObject({ rate: 11025, length: 16, tooShort: false });
    expect(clampLoop({ start: -5, end: 99999 }, 1000)).toEqual({ start: 0, end: 1000 });
    expect(clampLoop({ start: 500, end: 200 }, 1000)).toEqual({ start: 500, end: 501 });
  });

  it("computes waveform peaks", () => {
    const s = new Float32Array([0, 0.5, -0.25, 1, -1, 0.1]);
    expect([...peaks(s, 3)]).toEqual([0, 0.5, -0.25, 1, -1, 0.10000000149011612]);
  });
});
