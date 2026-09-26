import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { Project } from "@dsdude/project-format";
import { loadProject } from "@dsdude/project-format/node";
import { describe, expect, it } from "vitest";
import { serializeManifest } from "../manifest.ts";
import { addSound, addSprite, copySample, FAKE_SAMPLE_BYTES, fakeTools, tempDir } from "../testing/fake-tools.ts";
import { readRepoFile } from "../testing/golden.ts";
import { packAssets } from "./pack.ts";

async function load(dir: string): Promise<Project> {
  const { project, diagnostics } = await loadProject(dir);
  if (project === null) throw new Error(JSON.stringify(diagnostics));
  return project;
}

const codes = (ds: readonly { code: string }[]) => ds.map((d) => d.code);

describe("packAssets without tools (cloud)", () => {
  it("converts, checks and writes the manifest, with E605 for grit and mmutil and no GRFs", async () => {
    const project = await load(copySample("samples/flappy"));
    const out = tempDir();
    const { manifest, diagnostics } = await packAssets(project, {}, out);
    expect(codes(diagnostics)).toEqual(["E605", "E605"]);
    expect(diagnostics.every((d) => d.source === "toolchain")).toBe(true);
    expect(Object.keys(manifest.sprites)).toEqual(["spr_bird", "spr_gap", "spr_pipe"]);
    expect(manifest.sprites.spr_gap).toMatchObject({
      id: 1,
      file: "gfx/spr_gap.grf",
      paddedWidth: 32,
      paddedHeight: 64,
      frameStrideBytes: 1024,
      vramBytes: 1024,
    });
    expect(manifest.sprites.spr_bird).toMatchObject({ id: 0, colorMode: "16", frameBytes: 128, vramBytes: 384 });
    expect(manifest.sounds).toMatchObject({
      snd_flap: { id: 0, kind: "effect", define: "SFX_SND_FLAP", estimated: true },
      snd_hit: { id: 1 },
      snd_point: { id: 2 },
    });
    expect(manifest.soundbank).toBeNull();
    expect(manifest.tools).toEqual({ grit: null, mmutil: null });
    expect(readdirSync(path.join(out, "nitrofs/gfx"))).toEqual([]);
    expect(existsSync(path.join(out, "icon.png"))).toBe(true);
    expect(readFileSync(path.join(out, "assets.manifest.json"), "utf8")).toBe(serializeManifest(manifest));
  });
});

describe("packAssets with fake grit and mmutil", () => {
  it("writes GRFs, the soundbank and ids from soundbank.h, then serves a second run from the cache", async () => {
    const project = await load(copySample("samples/flappy"));
    const out = tempDir();
    const tools = fakeTools(tempDir());
    const first = await packAssets(project, tools.paths, out, { runTool: tools.run });
    expect(first.diagnostics).toEqual([]);
    expect(readdirSync(path.join(out, "nitrofs/gfx")).sort()).toEqual(["spr_bird.grf", "spr_gap.grf", "spr_pipe.grf"]);
    // grit got the C3 lines: 4bpp with a 16-entry palette for 16-colour sprites.
    const bird = tools.calls.find((c) => c.tool === "grit" && c.args[0]?.endsWith("spr_bird.png"));
    expect(bird?.args.slice(1)).toEqual([
      "-gB4",
      "-pn16",
      "-gt",
      "-gTFF00FF",
      "-m!",
      "-ftr",
      "-fh!",
      "-W1",
      "-o",
      expect.any(String),
    ]);
    // mmutil: WAVs in name order, -d, attached -o/-h into the build folder, cwd the build folder.
    const mm = tools.calls.filter((c) => c.tool === "mmutil");
    expect(mm).toHaveLength(1);
    expect(mm[0]?.args.slice(0, 3).map((a) => path.basename(a))).toEqual([
      "snd_flap.wav",
      "snd_hit.wav",
      "snd_point.wav",
    ]);
    expect(mm[0]?.args.slice(3)).toEqual([
      "-d",
      `-o${path.join(out, "nitrofs", "soundbank.bin")}`,
      `-h${path.join(out, "soundbank.h")}`,
    ]);
    expect(mm[0]?.cwd).toBe(out);
    expect(first.manifest.tools).toEqual({ grit: "1.24.0", mmutil: "1.24.0" });
    expect(first.manifest.sounds.snd_hit).toMatchObject({ id: 1, ramBytes: FAKE_SAMPLE_BYTES, estimated: false });
    expect(first.manifest.soundbank?.bytes).toBe(readFileSync(path.join(out, "nitrofs/soundbank.bin")).length);

    const callsBefore = tools.calls.length;
    const started = performance.now();
    const second = await packAssets(project, tools.paths, out, { runTool: tools.run });
    const ms = performance.now() - started;
    expect(tools.calls.length).toBe(callsBefore); // everything came from the cache
    expect(serializeManifest(second.manifest)).toBe(serializeManifest(first.manifest));
    expect(second.diagnostics).toEqual([]);
    // PLAN's target is < 50 ms on the Windows machine; allow slack for loaded CI hosts.
    const SECOND_RUN_BUDGET_MS = 500;
    expect(ms).toBeLessThan(SECOND_RUN_BUDGET_MS);
  });

  it("rebuilds the files an earlier run left, and removes GRFs of deleted sprites", async () => {
    const dir = copySample("samples/flappy");
    const out = tempDir();
    const tools = fakeTools(tempDir());
    await packAssets(await load(dir), tools.paths, out, { runTool: tools.run });
    rmSync(path.join(dir, "sprites", "spr_gap"), { recursive: true });
    const again = await packAssets(await load(dir), tools.paths, out, { runTool: tools.run });
    expect(Object.keys(again.manifest.sprites)).toEqual(["spr_bird", "spr_pipe"]);
    expect(readdirSync(path.join(out, "nitrofs/gfx")).sort()).toEqual(["spr_bird.grf", "spr_pipe.grf"]);
  });

  it("orders WAVs before modules and takes music ids from MOD_ defines", async () => {
    const dir = copySample("samples/flappy");
    addSound(dir, "mus_a", "music", "a.xm", readRepoFile("fixtures/assets/tune.xm"));
    const tools = fakeTools(tempDir());
    const { manifest, diagnostics } = await packAssets(await load(dir), tools.paths, tempDir(), { runTool: tools.run });
    expect(diagnostics).toEqual([]);
    const mm = tools.calls.find((c) => c.tool === "mmutil");
    expect(mm?.args.slice(0, 4).map((a) => path.basename(a))).toEqual([
      "snd_flap.wav",
      "snd_hit.wav",
      "snd_point.wav",
      "mus_a.xm",
    ]);
    expect(manifest.sounds.mus_a).toMatchObject({ id: 0, kind: "music", define: "MOD_MUS_A", estimated: false });
  });

  it("packs an MP3 effect as a WAV for mmutil", async () => {
    const dir = copySample("samples/minimal");
    addSound(dir, "snd_tone", "effect", "tone.mp3", readRepoFile("fixtures/assets/tone-44k.mp3"));
    const tools = fakeTools(tempDir());
    const { manifest, diagnostics } = await packAssets(await load(dir), tools.paths, tempDir(), { runTool: tools.run });
    expect(diagnostics).toEqual([]);
    expect(manifest.sounds.snd_tone).toMatchObject({
      id: 0,
      kind: "effect",
      define: "SFX_SND_TONE",
      sampleRate: 22050,
    });
    const mm = tools.calls.find((c) => c.tool === "mmutil");
    expect(mm?.args.slice(0, 1).map((a) => path.basename(a))).toEqual(["snd_tone.wav"]);
  });

  it("reports tool failures: grit exit 1 is E603 + E422, a silent mmutil is E421", async () => {
    const project = await load(copySample("samples/flappy"));
    const gritFails = fakeTools(tempDir(), { fail: "grit" });
    const a = await packAssets(project, gritFails.paths, tempDir(), { runTool: gritFails.run });
    expect(codes(a.diagnostics)).toEqual(["E603", "E422", "E603", "E422", "E603", "E422"]);
    expect(a.manifest.sprites).toEqual({});
    const mmSilent = fakeTools(tempDir(), { silent: "mmutil" });
    const b = await packAssets(project, mmSilent.paths, tempDir(), { runTool: mmSilent.run });
    expect(codes(b.diagnostics)).toEqual(["E421"]);
    expect(b.manifest.soundbank).toBeNull();
  });
});

describe("packAssets sound limits and checks", () => {
  /** samples/flappy (three effects) packed with a fake mmutil that writes the given sample size or ids. */
  async function packFlappy(opts: { sampleBytes?: number; idShift?: number }) {
    const project = await load(copySample("samples/flappy"));
    const tools = fakeTools(tempDir(), opts);
    return packAssets(project, tools.paths, tempDir(), { runTool: tools.run });
  }

  it("reports E411 for one sound bigger than a room's sound memory", async () => {
    const TOO_BIG = 800_000; // above soundRamBytes (786432); the three together also exceed 1 MB (E410, not checked here)
    const { diagnostics } = await packFlappy({ sampleBytes: TOO_BIG });
    const e411 = diagnostics.filter((d) => d.code === "E411");
    expect(e411.map((d) => [d.file, d.message])).toEqual(
      ["snd_flap", "snd_hit", "snd_point"].map((n) => [
        `sounds/${n}/${n.slice(4)}.wav`,
        `${n} needs ${TOO_BIG} bytes of sound memory, but a room can use at most 786432.`,
      ]),
    );
  });

  it("reports E410 when the whole soundbank is bigger than 1 MB, naming the biggest sounds", async () => {
    const LARGE = 400_000; // each fits a room, but three make a bank above 1048576 bytes
    const { diagnostics, manifest } = await packFlappy({ sampleBytes: LARGE });
    expect(diagnostics.map((d) => d.code)).toEqual(["E410"]);
    expect(diagnostics[0]?.message).toBe(
      `All sounds together take ${manifest.soundbank?.bytes} bytes, but a DS game can hold at most 1048576.`,
    );
    expect(diagnostics[0]?.hint).toBe("Shorten or remove some sounds. The biggest are snd_flap, snd_hit, snd_point.");
  });

  it("reports E421 when soundbank.h disagrees with the expected ids, and uses the header's ids", async () => {
    const { diagnostics, manifest } = await packFlappy({ idShift: 1 });
    expect(diagnostics.map((d) => [d.code, d.message])).toEqual([
      ["E421", "The sound converter did not finish: soundbank.h gives SFX_SND_FLAP = 1, expected 0."],
      ["E421", "The sound converter did not finish: soundbank.h gives SFX_SND_HIT = 2, expected 1."],
      ["E421", "The sound converter did not finish: soundbank.h gives SFX_SND_POINT = 3, expected 2."],
    ]);
    expect(manifest.sounds.snd_flap?.id).toBe(1);
  });

  it("numbers music modules from 0 in name order after every effect, whatever their format", async () => {
    const dir = copySample("samples/flappy");
    addSound(dir, "mus_b", "music", "b.xm", readRepoFile("fixtures/assets/tune.xm"));
    addSound(dir, "mus_a", "music", "a.mod", modFile());
    const tools = fakeTools(tempDir());
    const { manifest, diagnostics } = await packAssets(await load(dir), tools.paths, tempDir(), { runTool: tools.run });
    expect(diagnostics).toEqual([]);
    const mm = tools.calls.find((c) => c.tool === "mmutil");
    expect(mm?.args.slice(0, 5).map((a) => path.basename(a))).toEqual([
      "snd_flap.wav",
      "snd_hit.wav",
      "snd_point.wav",
      "mus_a.mod",
      "mus_b.xm",
    ]);
    expect([manifest.sounds.mus_a?.id, manifest.sounds.mus_b?.id]).toEqual([0, 1]);
  });

  it("reports E409 for a tracker file used as an effect, a WAV used as music, and a broken module", async () => {
    const dir = copySample("samples/minimal");
    addSound(dir, "snd_xm", "effect", "x.xm", readRepoFile("fixtures/assets/tune.xm"));
    addSound(dir, "mus_wav", "music", "m.wav", readRepoFile("fixtures/assets/blip.wav"));
    addSound(dir, "mus_bad", "music", "bad.it", new TextEncoder().encode("not a module"));
    const { diagnostics } = await packAssets(await load(dir), {}, tempDir());
    expect(diagnostics.filter((d) => d.code === "E409").map((d) => [d.file, d.message])).toEqual([
      [
        "sounds/mus_bad/bad.it",
        "mus_bad: DSDude can't read sounds/mus_bad/bad.it as a sound (it is not a valid IT module).",
      ],
      [
        "sounds/mus_wav/m.wav",
        "mus_wav: DSDude can't read sounds/mus_wav/m.wav as a sound (.wav files can't be music).",
      ],
      ["sounds/snd_xm/x.xm", "snd_xm: DSDude can't read sounds/snd_xm/x.xm as a sound (.xm files can't be effects)."],
    ]);
  });

  it("reports E420 for a name that cannot be a DS file name (only reachable in memory: C1 names always pass)", async () => {
    const project = await load(copySample("samples/flappy"));
    const flap = project.sounds[0];
    if (flap === undefined) throw new Error("fixture sound missing");
    project.sounds = [{ ...flap, name: "snd.flap" }, ...project.sounds.slice(1)];
    const { diagnostics, manifest } = await packAssets(project, {}, tempDir());
    expect(diagnostics.filter((d) => d.code === "E420").map((d) => d.message)).toEqual([
      "The name snd.flap can't be used as a file name on the DS.",
    ]);
    expect(Object.keys(manifest.sounds)).not.toContain("snd.flap");
  });
});

/** A minimal 4-channel ProTracker MOD: 20-byte title, 31 empty sample records, order table, "M.K." and one pattern. */
function modFile(): Uint8Array {
  const TITLE = 20;
  const SAMPLE_RECORD = 30;
  const SAMPLES = 31;
  const ORDER_TABLE = 128;
  const PATTERN_BYTES = 64 * 4 * 4; // 64 rows x 4 channels x 4 bytes
  const header = TITLE + SAMPLES * SAMPLE_RECORD;
  const out = new Uint8Array(header + 2 + ORDER_TABLE + 4 + PATTERN_BYTES);
  out[header] = 1; // song length: one order
  out.set(new TextEncoder().encode("M.K."), header + 2 + ORDER_TABLE);
  return out;
}

describe("packAssets limits", () => {
  it("names the asset, the limit and a fix", async () => {
    const dir = copySample("samples/minimal");
    addSprite(dir, "spr_boss", 1, 100, 100);
    addSound(dir, "mus_mp3", "music", "song.mp3", new Uint8Array(16));
    addSound(dir, "snd_bad", "effect", "bad.wav", new TextEncoder().encode("junk"));
    const { diagnostics } = await packAssets(await load(dir), {}, tempDir());
    const byCode = Object.fromEntries(diagnostics.map((d) => [d.code, d]));
    expect(byCode.E401).toMatchObject({
      severity: "error",
      source: "assets",
      message: "spr_boss is 100x100. DS sprites can be at most 64x64.",
      hint: "Shrink it, or make it a Background.",
      file: "sprites/spr_boss/sheet.png",
    });
    expect(byCode.E408?.file).toBe("sounds/mus_mp3/song.mp3");
    expect(byCode.E409?.message).toMatch(/^snd_bad: DSDude can't read sounds\/snd_bad\/bad.wav as a sound/);
  });

  // IF-2: two folders whose names differ only in case are one folder on NTFS, so the clash is built in memory: the
  // loaded project gets a second resource whose name differs only in case. That keeps E412 covered on every OS.
  it("reports names that differ only in capital letters as E412, whatever the filesystem's case rules", async () => {
    const dir = copySample("samples/minimal");
    addSprite(dir, "spr_tiny", 1, 8, 8);
    addSound(dir, "snd_a", "effect", "a.wav", readRepoFile("fixtures/assets/blip.wav"));
    const project = await load(dir);
    const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const tiny = project.sprites.find((x) => x.name === "spr_tiny");
    const snd = project.sounds.find((x) => x.name === "snd_a");
    if (tiny === undefined || snd === undefined) throw new Error("fixture resources missing");
    project.sprites = [...project.sprites, { ...tiny, name: "spr_Tiny" }].sort(byName);
    project.sounds = [...project.sounds, { ...snd, name: "snd_A" }].sort(byName);
    const { diagnostics, manifest } = await packAssets(project, {}, tempDir());
    // The later name in code-point order ("spr_tiny" after "spr_Tiny") is reported and skipped.
    expect(diagnostics.filter((d) => d.code === "E412").map((d) => [d.message, d.file])).toEqual([
      ["spr_tiny and spr_Tiny differ only in capital letters, and the DS can't tell them apart.", "sprites/spr_tiny"],
      ["snd_a and snd_A differ only in capital letters, and the DS can't tell them apart.", "sounds/snd_a"],
    ]);
    expect(Object.keys(manifest.sprites)).not.toContain("spr_tiny");
    expect(Object.keys(manifest.sounds)).not.toContain("snd_a");
  });

  it("reports an unreadable sheet or icon as E404 with the reason", async () => {
    const dir = copySample("samples/minimal");
    const junk = new TextEncoder().encode("this is not a PNG");
    writeFileSync(path.join(dir, "sprites/spr_player/sheet.png"), junk);
    writeFileSync(path.join(dir, "icon.png"), junk);
    const { diagnostics, manifest } = await packAssets(await load(dir), {}, tempDir());
    expect(diagnostics.filter((d) => d.code === "E404").map((d) => [d.file, d.message])).toEqual([
      [
        "sprites/spr_player/sheet.png",
        "spr_player: sprites/spr_player/sheet.png is not a PNG image DSDude can read (it does not start like a PNG file).",
      ],
      ["icon.png", "The game icon: icon.png is not a PNG image DSDude can read (it does not start like a PNG file)."],
    ]);
    expect(manifest.sprites).toEqual({});
    expect(manifest.icon).toBeNull();
  });

  it("reports a missing sheet as E403 and a missing icon as the warning E418", async () => {
    const dir = copySample("samples/minimal");
    rmSync(path.join(dir, "sprites/spr_player/sheet.png"));
    rmSync(path.join(dir, "icon.png"));
    const out = tempDir();
    const { diagnostics, manifest } = await packAssets(await load(dir), {}, out);
    expect(diagnostics.filter((d) => d.source === "assets").map((d) => [d.code, d.severity, d.file])).toEqual([
      ["E403", "error", "sprites/spr_player/sheet.png"],
      ["E418", "warning", "icon.png"],
    ]);
    expect(manifest.icon).toBeNull();
    expect(existsSync(path.join(out, "icon.png"))).toBe(false);
  });
});
