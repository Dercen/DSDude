import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
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

describe("packAssets limits", () => {
  it("names the asset, the limit and a fix", async () => {
    const dir = copySample("samples/minimal");
    addSprite(dir, "spr_boss", 1, 100, 100);
    addSprite(dir, "spr_Tiny", 1, 8, 8);
    addSprite(dir, "spr_tiny", 1, 8, 8);
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
    expect(byCode.E412?.message).toBe(
      "spr_tiny and spr_Tiny differ only in capital letters, and the DS can't tell them apart.",
    );
    expect(byCode.E408?.file).toBe("sounds/mus_mp3/song.mp3");
    expect(byCode.E409?.message).toMatch(/^snd_bad: DSDude can't read sounds\/snd_bad\/bad.wav as a sound/);
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
