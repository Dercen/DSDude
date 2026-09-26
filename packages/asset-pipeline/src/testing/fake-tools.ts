/**
 * Test helpers: fake grit and mmutil (unit tests mock the tools; the real ones run only at WS0's integration),
 * and small throwaway projects. Node side, used only by *.test.ts.
 */
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { encodeIndexedPng } from "../image/png.ts";
import type { ToolRun, ToolRunner } from "../pack/tools.ts";
import { REPO_ROOT } from "./golden.ts";

/** One recorded fake-tool call. */
export interface FakeCall {
  tool: "grit" | "mmutil";
  args: string[];
  cwd: string;
}

export interface FakeTools {
  run: ToolRunner;
  calls: FakeCall[];
  /** Fake executables that exist on disk (checkTool stats them). */
  paths: { grit: string; mmutil: string };
}

const ok = (stdout = ""): ToolRun => ({ exitCode: 0, stdout, stderr: "", timedOut: false, spawnError: null });

/** Payload bytes the fake soundbank gives each effect sample and each song. */
export const FAKE_SAMPLE_BYTES = 1000;
export const FAKE_SONG_BYTES = 400;

/**
 * An MSL image with `samples` effect samples and `songs` songs of fixed sizes; each song uses no bank sample. The
 * layout is the one src/sound/soundbank.ts reads.
 */
export function fakeSoundbank(samples: number, songs: number, sampleBytes = FAKE_SAMPLE_BYTES): Uint8Array {
  const MSL_HEADER = 12;
  const PREFIX = 8;
  const SONG_HEADER = 276;
  const entries = [
    ...Array.from({ length: samples }, () => new Uint8Array(sampleBytes)),
    ...Array.from({ length: songs }, () => new Uint8Array(Math.max(FAKE_SONG_BYTES, SONG_HEADER))),
  ];
  let at = MSL_HEADER + entries.length * 4;
  const offsets = entries.map((e) => {
    const o = at;
    at += PREFIX + e.length;
    return o;
  });
  const out = new Uint8Array(at);
  const view = new DataView(out.buffer);
  view.setUint16(0, samples, true);
  view.setUint16(2, songs, true);
  out.set(new TextEncoder().encode("*maxmod*"), 4);
  offsets.forEach((o, i) => {
    view.setUint32(MSL_HEADER + i * 4, o, true);
    view.setUint32(o, (entries[i] as Uint8Array).length, true);
  });
  return out;
}

/**
 * Fake grit/mmutil. grit writes `<-o value>.grf` holding "GRF" plus the arguments; mmutil writes a fake soundbank
 * and a CRLF header numbering the WAVs, then the modules, from 0 (as the real one does when WAVs come first).
 * `fail` makes the named tool exit 1 without output; `silent` makes it exit 0 without output.
 */
/** How a fake tool misbehaves or what it writes (all optional). */
export interface FakeToolOptions {
  /** This tool exits 1 without output. */
  fail?: "grit" | "mmutil";
  /** This tool exits 0 without output. */
  silent?: "grit" | "mmutil";
  /** Payload bytes of every effect sample in the fake soundbank (default FAKE_SAMPLE_BYTES). */
  sampleBytes?: number;
  /** Added to every SFX_ id in soundbank.h, to imitate a header that disagrees with the expected ids. */
  idShift?: number;
}

export function fakeTools(dir: string, opts: FakeToolOptions = {}): FakeTools {
  const paths = { grit: path.join(dir, "grit.exe"), mmutil: path.join(dir, "mmutil.exe") };
  for (const p of Object.values(paths)) writeFileSync(p, "fake");
  const calls: FakeCall[] = [];
  const run: ToolRunner = async (exe, args, runOpts) => {
    const tool = exe === paths.grit ? "grit" : "mmutil";
    if (args[0] === "-V") return ok(`${tool} v1.24.0-dirty\n`);
    calls.push({ tool, args: [...args], cwd: runOpts.cwd });
    if (opts.fail === tool)
      return { exitCode: 1, stdout: "", stderr: `${tool}: bad input`, timedOut: false, spawnError: null };
    if (opts.silent === tool) return ok();
    if (tool === "grit") {
      const out = args[args.indexOf("-o") + 1] as string;
      writeFileSync(`${out}.grf`, `GRF ${args.slice(1).join(" ")}`);
      return ok();
    }
    const bank = (args.find((a) => a.startsWith("-o")) as string).slice(2);
    const header = (args.find((a) => a.startsWith("-h")) as string).slice(2);
    const inputs = args.filter((a) => !a.startsWith("-"));
    const stem = (p: string) => path.basename(p).replace(/\..*$/, "").toUpperCase();
    const wavs = inputs.filter((p) => p.endsWith(".wav"));
    const mods = inputs.filter((p) => !p.endsWith(".wav"));
    const lines = [
      ...wavs.map((p, i) => `#define SFX_${stem(p)}\t${i + (opts.idShift ?? 0)}`),
      ...mods.map((p, i) => `#define MOD_${stem(p)}\t${i}`),
      `#define MSL_NSONGS\t${mods.length}`,
      `#define MSL_NSAMPS\t${wavs.length}`,
    ];
    writeFileSync(header, `${lines.join("\r\n")}\r\n`);
    writeFileSync(bank, fakeSoundbank(wavs.length, mods.length, opts.sampleBytes));
    return ok();
  };
  return { run, calls, paths };
}

/** A fresh temporary folder. */
export function tempDir(prefix = "ws5-"): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

/** Copies a sample project (e.g. "samples/flappy") into a temporary folder and returns its path. */
export function copySample(sample: string): string {
  const dir = path.join(tempDir(), path.basename(sample));
  cpSync(path.join(REPO_ROOT, sample), dir, { recursive: true });
  return dir;
}

/** Writes a JSON file (two-space, final LF), creating folders. */
export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Adds a sprite whose sheet is `width` x `height` pixels of one opaque colour, with matching sprite.json. */
export function addSprite(projectDir: string, name: string, frames: number, width: number, height: number): void {
  const dir = path.join(projectDir, "sprites", name);
  writeJson(path.join(dir, "sprite.json"), {
    frames,
    frameWidth: width / frames,
    frameHeight: height,
    origin: { x: 0, y: 0 },
    bbox: { left: 0, top: 0, right: width / frames - 1, bottom: height - 1 },
    colorMode: "auto",
    transparent: "alpha",
  });
  const RED = 0xff0000;
  const png = encodeIndexedPng({ width, height, indices: new Uint8Array(width * height).fill(1), palette: [0, RED] });
  writeFileSync(path.join(dir, "sheet.png"), png);
}

/** Adds a sound with the given file name and bytes. */
export function addSound(projectDir: string, name: string, kind: "effect" | "music", file: string, bytes: Uint8Array) {
  const dir = path.join(projectDir, "sounds", name);
  writeJson(path.join(dir, "sound.json"), { kind, file });
  writeFileSync(path.join(dir, file), bytes);
}
