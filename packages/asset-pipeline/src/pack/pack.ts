/**
 * `packAssets` (C4 `PackAssetsFn`, C3): converts every sprite, background, sound and the icon of a project into
 * `<outDir>/nitrofs/{gfx,bg}/*.grf`, `nitrofs/soundbank.bin`, `icon.png` and `assets.manifest.json`, through the
 * content-hash cache. Node side (fs, spawn); the conversions themselves are the pure modules under src/image and
 * src/sound.
 *
 * Without grit or mmutil (a cloud session) it still converts, checks and writes the manifest, reports E605/E601 for
 * the missing tool, and writes no GRF or soundbank (C3 section 7).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";
import type { Diagnostic, Project } from "@dsdude/project-format";
import type { ToolPaths } from "@dsdude/toolchain";
import { ASSET_CATALOG } from "../diagnostics/catalog.ts";
import { convertBackground } from "../image/background.ts";
import { convertIcon } from "../image/icon.ts";
import { frameBytes, roundUp } from "../image/objsize.ts";
import { decodePng, encodeDsIndexedPng, PngError, type RgbaImage } from "../image/png.ts";
import type { TransparentSetting } from "../image/quantize.ts";
import { convertSprite } from "../image/sprite.ts";
import { LIMITS } from "../limits.ts";
import {
  ASSETPACK_CONTRACT_VERSION,
  type AssetPackManifest,
  type BackgroundEntry,
  type ManifestBudgets,
  type SoundEntry,
  type SpriteEntry,
  serializeManifest,
} from "../manifest.ts";
import { type Problem, toDiagnostic } from "../problems.ts";
import { convertEffect } from "../sound/effect.ts";
import {
  effectRamBytes,
  estimateEffectRam,
  estimateMusicRam,
  isTrackerModule,
  MUSIC_EXTENSIONS,
  musicRamBytes,
  parseSoundbank,
  parseSoundbankHeader,
  type SoundbankSizes,
  soundDefine,
} from "../sound/soundbank.ts";
import type { Loop } from "../sound/wav.ts";
import { AssetCache, cacheKey } from "./cache.ts";
import {
  checkTool,
  GRIT_TIMEOUT_MS,
  gritBackgroundArgs,
  gritSpriteArgs,
  MMUTIL_TIMEOUT_MS,
  mmutilArgs,
  parseToolVersion,
  runDiagnostics,
  spawnTool,
  type ToolRunner,
  type ToolState,
  toolEnvironment,
  toolStamp,
  VERSION_TIMEOUT_MS,
} from "./tools.ts";

/** Build-folder names (C3 section 1). */
export const NITROFS_DIR = "nitrofs";
export const GFX_DIR = "gfx";
export const BG_DIR = "bg";
export const SOUNDBANK_BIN = "soundbank.bin";
export const SOUNDBANK_H = "soundbank.h";
export const ICON_PNG = "icon.png";
export const MANIFEST_JSON = "assets.manifest.json";
/** The extension grit gives its output for -ftr. */
const GRF_EXT = ".grf";
/** Cached tool versions, keyed by tool stamp, so `-V` runs only when a tool changes. */
const TOOL_VERSIONS_JSON = "tools.json";
/** NitroFS names: printable ASCII, at most 127 characters (claim 3). Sound stems: no '.', at most 63 (claim 9). */
const NITROFS_NAME = /^[\x20-\x7e]{1,127}$/;
const SOUND_STEM = /^[\x20-\x2d\x2f-\x7e]{1,63}$/;

/** Optional seams for tests and embedders. */
export interface PackOptions {
  /** Runs grit/mmutil; default spawns them. Unit tests pass a fake. */
  runTool?: ToolRunner;
  /** Base environment for tools; default process.env. */
  env?: Record<string, string | undefined>;
}

/** Everything one pack run shares. */
interface PackContext {
  project: Project;
  outDir: string;
  cache: AssetCache;
  run: ToolRunner;
  env: Record<string, string>;
  grit: ToolState;
  mmutil: ToolState;
  /** Stamps that key cache entries to the tool that made them ("none" without the tool). */
  gritStamp: string;
  mmutilStamp: string;
  diagnostics: Diagnostic[];
}

/** The C13 limits recorded in the manifest (C3 section 7 `budgets`). */
export function manifestBudgets(): ManifestBudgets {
  const {
    objVramBytesPerScreen,
    objVramAlignBytes,
    obj16PalettesPerScreen,
    obj256PalettesPerScreen,
    bg256PaletteSlotsPerScreen,
    bgTilesMax,
    bgMaxSize,
    soundRamBytes,
    soundbankMaxBytes,
  } = LIMITS;
  return {
    objVramBytesPerScreen,
    objVramAlignBytes,
    obj16PalettesPerScreen,
    obj256PalettesPerScreen,
    bg256PaletteSlotsPerScreen,
    bgTilesMax,
    bgMaxSize,
    soundRamBytes,
    soundbankMaxBytes,
  };
}

/** Reads a project file as bytes, or null when it does not exist. */
function readProjectFile(project: Project, relative: string): Uint8Array | null {
  const file = path.join(project.dir, relative);
  return existsSync(file) && statSync(file).isFile() ? new Uint8Array(readFileSync(file)) : null;
}

/** Adds problems as diagnostics for one asset. */
function report(ctx: PackContext, problems: readonly Problem[], name: string | null, file: string | null): void {
  for (const p of problems) ctx.diagnostics.push(toDiagnostic(p, name, file));
}

/** True when the problem blocks the asset; warnings (E407, E418, E419) never do. */
function isError(p: Problem): boolean {
  return ASSET_CATALOG[p.code].severity === "error";
}

/** Decodes a PNG, or reports E404 and returns null. */
function decodeOrReport(ctx: PackContext, bytes: Uint8Array, name: string, file: string): RgbaImage | null {
  try {
    return decodePng(bytes);
  } catch (err) {
    if (!(err instanceof PngError)) throw err;
    report(ctx, [{ code: "E404", args: { detail: err.message } }], name, file);
    return null;
  }
}

/** A tool's version from `-V`, cached per tool stamp in cache/tools.json. */
async function toolVersion(ctx: PackContext, state: ToolState, stamp: string): Promise<string | null> {
  if (!state.ok) return null;
  const file = path.join(ctx.cache.root, TOOL_VERSIONS_JSON);
  let known: Record<string, string | null> = {};
  try {
    known = JSON.parse(readFileSync(file, "utf8")) as Record<string, string | null>;
  } catch {
    // No cache yet.
  }
  if (stamp in known) return known[stamp] ?? null;
  const run = await ctx.run(state.exe, ["-V"], { cwd: ctx.outDir, env: ctx.env, timeoutMs: VERSION_TIMEOUT_MS });
  const version = run.exitCode === 0 ? parseToolVersion(`${run.stdout}\n${run.stderr}`) : null;
  known[stamp] = version;
  writeFileSync(file, `${JSON.stringify(known, null, 2)}\n`);
  return version;
}

// ---------------------------------------------------------------------------------------------------------
// Names (C3 section 2)

/**
 * Reports E412 for names of one kind that differ only in letter case, and E420 for names that are not
 * NitroFS/mmutil-safe; returns the names to skip (the later name of each clash, and every unsafe name).
 */
function checkNames(
  ctx: PackContext,
  names: readonly string[],
  kind: string,
  folder: string,
  sound: boolean,
): Set<string> {
  const skip = new Set<string>();
  const seen = new Map<string, string>();
  for (const name of names) {
    const unsafe = !NITROFS_NAME.test(name) || (sound && !SOUND_STEM.test(name));
    if (unsafe) {
      report(ctx, [{ code: "E420", args: {} }], name, `${folder}/${name}`);
      skip.add(name);
      continue;
    }
    const lower = name.toLowerCase();
    const other = seen.get(lower);
    if (other !== undefined) {
      report(ctx, [{ code: "E412", args: { other, kind } }], name, `${folder}/${name}`);
      skip.add(name);
    } else seen.set(lower, name);
  }
  return skip;
}

// ---------------------------------------------------------------------------------------------------------
// Images (sprites and backgrounds share the grit path)

/** What an image conversion hands to the shared grit + cache step. */
interface ImageJob<E> {
  name: string;
  /** Project-relative source path (for diagnostics). */
  file: string;
  /** Folder under nitrofs/ ("gfx" or "bg"). */
  nitroDir: string;
  /** Extra key parts: the JSON settings the conversion reads. */
  settings: string;
  /**
   * Converts the decoded image: its problems, and unless they stop it, the indexed PNG for grit, the manifest entry
   * (without id and file) and grit's arguments.
   */
  convert(image: RgbaImage): {
    problems: Problem[];
    value: { png: Uint8Array; entry: E; gritArgs(png: string, outBase: string): string[] } | null;
  };
}

/** Cached result of one image: its manifest entry and the warnings to re-report on every run. */
interface ImageMeta<E> {
  entry: E;
  problems: Problem[];
}

/**
 * Converts one image through the cache: a hit copies the cached GRF; a miss decodes, converts, runs grit (when
 * present) and caches the result. Returns the manifest entry, or null when the image has errors.
 */
async function packImage<E>(ctx: PackContext, job: ImageJob<E>): Promise<E | null> {
  const bytes = readProjectFile(ctx.project, job.file);
  if (bytes === null) {
    report(
      ctx,
      [{ code: "E403", args: { kind: job.nitroDir === GFX_DIR ? "sprite" : "background" } }],
      job.name,
      job.file,
    );
    return null;
  }
  const grf = `${job.name}${GRF_EXT}`;
  const target = path.join(ctx.outDir, NITROFS_DIR, job.nitroDir, grf);
  const key = cacheKey([job.nitroDir, bytes, job.settings, ctx.gritStamp]);
  const cached = ctx.cache.read<ImageMeta<E>>(key, ctx.grit.ok ? [grf] : []);
  if (cached !== null) {
    report(ctx, cached.problems, job.name, job.file);
    if (ctx.grit.ok) copyFileSync(path.join(ctx.cache.dir(key), grf), target);
    return cached.entry;
  }
  const image = decodeOrReport(ctx, bytes, job.name, job.file);
  if (image === null) return null;
  const { problems, value: converted } = job.convert(image);
  report(ctx, problems, job.name, job.file);
  if (converted === null || problems.some(isError)) return null;
  const staged = ctx.cache.stage(key);
  const pngName = `${job.name}.png`;
  writeFileSync(path.join(staged, pngName), converted.png);
  if (ctx.grit.ok) {
    const outBase = path.join(staged, job.name);
    const run = await ctx.run(ctx.grit.exe, converted.gritArgs(path.join(staged, pngName), outBase), {
      cwd: staged,
      env: ctx.env,
      timeoutMs: GRIT_TIMEOUT_MS,
    });
    const toolProblems = runDiagnostics("grit", run, GRIT_TIMEOUT_MS);
    if (toolProblems.length > 0 || !existsSync(path.join(staged, grf))) {
      ctx.diagnostics.push(...toolProblems);
      const detail = toolProblems.length > 0 ? "see the grit message" : `no ${grf} was written`;
      report(ctx, [{ code: "E422", args: { detail } }], job.name, job.file);
      ctx.cache.discard(staged);
      return null;
    }
  }
  const meta: ImageMeta<E> = { entry: converted.entry, problems };
  const dir = ctx.cache.commit(key, staged, meta);
  if (ctx.grit.ok) copyFileSync(path.join(dir, grf), target);
  return converted.entry;
}

/** The sprite fields of a manifest entry, without id and file (those depend on the project, not the pixels). */
type SpriteBody = Omit<SpriteEntry, "id" | "file">;
type BackgroundBody = Omit<BackgroundEntry, "id" | "file">;

async function packSprites(ctx: PackContext, skip: Set<string>): Promise<Record<string, SpriteEntry>> {
  const out: Record<string, SpriteEntry> = {};
  for (const [id, s] of ctx.project.sprites.entries()) {
    if (skip.has(s.name)) continue;
    const settings = {
      frames: s.frames,
      frameWidth: s.frameWidth,
      frameHeight: s.frameHeight,
      colorMode: s.colorMode,
      transparent: s.transparent as TransparentSetting,
    };
    const body = await packImage<SpriteBody>(ctx, {
      name: s.name,
      file: `sprites/${s.name}/sheet.png`,
      nitroDir: GFX_DIR,
      settings: JSON.stringify(settings),
      convert(image) {
        const { value, problems } = convertSprite(image, settings);
        if (value === null) return { problems, value: null };
        const bytesPerFrame = frameBytes(value.paddedWidth, value.paddedHeight, value.colorMode);
        const stride = roundUp(bytesPerFrame, LIMITS.objVramAlignBytes);
        return {
          problems,
          value: {
            png: encodeDsIndexedPng(value.paddedWidth, s.frames * value.paddedHeight, value.sheet, value.palette),
            entry: {
              frames: s.frames,
              frameWidth: s.frameWidth,
              frameHeight: s.frameHeight,
              paddedWidth: value.paddedWidth,
              paddedHeight: value.paddedHeight,
              colorMode: value.colorMode,
              colors: value.colors,
              reduced: value.reduced,
              frameBytes: bytesPerFrame,
              frameStrideBytes: stride,
              vramBytes: s.frames * stride,
              origin: { x: s.origin.x, y: s.origin.y },
              bbox: { left: s.bbox.left, top: s.bbox.top, right: s.bbox.right, bottom: s.bbox.bottom },
            },
            gritArgs: (png, outBase) => gritSpriteArgs(png, outBase, value.colorMode),
          },
        };
      },
    });
    if (body !== null) out[s.name] = { id, file: `${GFX_DIR}/${s.name}${GRF_EXT}`, ...body };
  }
  return out;
}

async function packBackgrounds(ctx: PackContext, skip: Set<string>): Promise<Record<string, BackgroundEntry>> {
  const out: Record<string, BackgroundEntry> = {};
  for (const [id, b] of ctx.project.backgrounds.entries()) {
    if (skip.has(b.name)) continue;
    const body = await packImage<BackgroundBody>(ctx, {
      name: b.name,
      file: `backgrounds/${b.name}/${b.file}`,
      nitroDir: BG_DIR,
      settings: "",
      convert(image) {
        const { value, problems } = convertBackground(image);
        if (value === null) return { problems, value: null };
        return {
          problems,
          value: {
            png: encodeDsIndexedPng(value.paddedWidth, value.paddedHeight, value.image, value.palette),
            entry: {
              width: value.width,
              height: value.height,
              paddedWidth: value.paddedWidth,
              paddedHeight: value.paddedHeight,
              colors: value.colors,
              reduced: value.reduced,
              tiles: value.tiles,
              vramBytes: value.vramBytes,
            },
            gritArgs: gritBackgroundArgs,
          },
        };
      },
    });
    if (body !== null) out[b.name] = { id, file: `${BG_DIR}/${b.name}${GRF_EXT}`, ...body };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Icon (C3 section 6)

interface IconMeta {
  colors: number;
  reduced: boolean;
  problems: Problem[];
}

async function packIcon(ctx: PackContext): Promise<AssetPackManifest["icon"]> {
  const target = path.join(ctx.outDir, ICON_PNG);
  const relative = ctx.project.project.icon;
  const bytes = readProjectFile(ctx.project, relative);
  if (bytes === null) {
    rmSync(target, { force: true });
    report(ctx, [{ code: "E418", args: {} }], null, relative);
    return null;
  }
  const key = cacheKey(["icon", bytes]);
  let meta = ctx.cache.read<IconMeta>(key, [ICON_PNG]);
  if (meta === null) {
    const image = decodeOrReport(ctx, bytes, "The game icon", relative);
    if (image === null) {
      rmSync(target, { force: true });
      return null;
    }
    const { value, problems } = convertIcon(image);
    if (value === null) return null;
    const ICON_SIDE = 32;
    const png = encodeDsIndexedPng(ICON_SIDE, ICON_SIDE, value.indices, value.palette);
    meta = { colors: value.colors, reduced: value.reduced, problems };
    ctx.cache.write(key, { [ICON_PNG]: png }, meta);
  }
  report(ctx, meta.problems, "The game icon", relative);
  copyFileSync(path.join(ctx.cache.dir(key), ICON_PNG), target);
  return { file: ICON_PNG, colors: meta.colors, reduced: meta.reduced };
}

// ---------------------------------------------------------------------------------------------------------
// Sounds (C3 section 5)

/** One sound staged for mmutil. */
interface StagedSound {
  name: string;
  kind: "effect" | "music";
  /** Absolute path of the file mmutil reads (stem = the sound name). */
  input: string;
  /** Cache key, part of the soundbank's key. */
  key: string;
  sampleRate: number | null;
  samples: number | null;
  loop: Loop | null;
  /** The source's size (music RAM estimate). */
  fileBytes: number;
  /** Project-relative source path (for diagnostics). */
  file: string;
}

interface EffectMeta {
  sampleRate: number;
  samples: number;
  loop: Loop | null;
  problems: Problem[];
}

/** Lower-cased extension including the dot. */
function extensionOf(file: string): string {
  return path.extname(file).toLowerCase();
}

/** Converts or passes through one sound through the cache; null (with diagnostics) when it cannot be used. */
async function stageSound(ctx: PackContext, s: Project["sounds"][number]): Promise<StagedSound | null> {
  const file = `sounds/${s.name}/${s.file}`;
  const ext = extensionOf(s.file);
  const isMusicExt = (MUSIC_EXTENSIONS as readonly string[]).includes(ext);
  if (s.kind === "music" && ext === ".mp3") {
    report(ctx, [{ code: "E408", args: {} }], s.name, file);
    return null;
  }
  if ((s.kind === "music") !== isMusicExt) {
    report(
      ctx,
      [{ code: "E409", args: { detail: `${ext} files can't be ${s.kind === "effect" ? "effects" : "music"}` } }],
      s.name,
      file,
    );
    return null;
  }
  const bytes = readProjectFile(ctx.project, file);
  if (bytes === null) {
    report(ctx, [{ code: "E403", args: { kind: "sound" } }], s.name, file);
    return null;
  }
  const base = { name: s.name, kind: s.kind, fileBytes: bytes.length, file };
  if (s.kind === "music") {
    if (!isTrackerModule(bytes, ext)) {
      report(
        ctx,
        [{ code: "E409", args: { detail: `it is not a valid ${ext.slice(1).toUpperCase()} module` } }],
        s.name,
        file,
      );
      return null;
    }
    const moduleName = `${s.name}${ext}`;
    const key = cacheKey(["music", bytes, ext]);
    if (ctx.cache.read(key, [moduleName]) === null) ctx.cache.write(key, { [moduleName]: bytes }, {});
    const input = path.join(ctx.cache.dir(key), moduleName);
    return { ...base, input, key, sampleRate: null, samples: null, loop: null };
  }
  const wavName = `${s.name}.wav`;
  const key = cacheKey(["effect", bytes, ext]);
  let meta = ctx.cache.read<EffectMeta>(key, [wavName]);
  if (meta === null) {
    const { value, problems } = await convertEffect(bytes, ext);
    if (value === null) {
      report(ctx, problems, s.name, file);
      return null;
    }
    meta = { sampleRate: value.sampleRate, samples: value.samples.length, loop: value.loop, problems };
    ctx.cache.write(key, { [wavName]: value.wav }, meta);
  }
  report(ctx, meta.problems, s.name, file);
  const input = path.join(ctx.cache.dir(key), wavName);
  return { ...base, input, key, sampleRate: meta.sampleRate, samples: meta.samples, loop: meta.loop };
}

/** Result of the soundbank step. */
interface BankResult {
  /** soundbank.h defines, or null when mmutil did not run. */
  defines: Map<string, number> | null;
  sizes: SoundbankSizes | null;
  bytes: number | null;
}

/**
 * Builds soundbank.bin with mmutil (effects sorted by name, then modules sorted by name), through the cache. The
 * outputs are deleted first and a missing output is E421 whatever the exit code (claim 9).
 */
async function buildSoundbank(ctx: PackContext, staged: readonly StagedSound[]): Promise<BankResult> {
  const bank = path.join(ctx.outDir, NITROFS_DIR, SOUNDBANK_BIN);
  const header = path.join(ctx.outDir, SOUNDBANK_H);
  rmSync(bank, { force: true });
  rmSync(header, { force: true });
  if (!ctx.mmutil.ok || staged.length === 0) return { defines: null, sizes: null, bytes: null };
  const key = cacheKey(["soundbank", ctx.mmutilStamp, ...staged.map((s) => `${s.kind}:${s.name}:${s.key}`)]);
  if (ctx.cache.read(key, [SOUNDBANK_BIN, SOUNDBANK_H]) === null) {
    const effects = staged.filter((s) => s.kind === "effect").map((s) => s.input);
    const modules = staged.filter((s) => s.kind === "music").map((s) => s.input);
    const run = await ctx.run(ctx.mmutil.exe, mmutilArgs(effects, modules, bank, header), {
      cwd: ctx.outDir,
      env: ctx.env,
      timeoutMs: MMUTIL_TIMEOUT_MS,
    });
    const toolProblems = runDiagnostics("mmutil", run, MMUTIL_TIMEOUT_MS);
    if (toolProblems.length > 0 || !existsSync(bank) || !existsSync(header)) {
      ctx.diagnostics.push(...toolProblems);
      const detail = toolProblems.length > 0 ? "see the mmutil message" : "mmutil wrote no soundbank";
      report(ctx, [{ code: "E421", args: { detail } }], null, null);
      rmSync(bank, { force: true });
      rmSync(header, { force: true });
      return { defines: null, sizes: null, bytes: null };
    }
    ctx.cache.write(
      key,
      { [SOUNDBANK_BIN]: new Uint8Array(readFileSync(bank)), [SOUNDBANK_H]: new Uint8Array(readFileSync(header)) },
      {},
    );
  } else {
    copyFileSync(path.join(ctx.cache.dir(key), SOUNDBANK_BIN), bank);
    copyFileSync(path.join(ctx.cache.dir(key), SOUNDBANK_H), header);
  }
  const bytes = new Uint8Array(readFileSync(bank));
  return {
    defines: parseSoundbankHeader(readFileSync(header, "latin1")),
    sizes: parseSoundbank(bytes),
    bytes: bytes.length,
  };
}

async function packSounds(
  ctx: PackContext,
  skip: Set<string>,
): Promise<{ sounds: Record<string, SoundEntry>; soundbank: AssetPackManifest["soundbank"] }> {
  const staged: StagedSound[] = [];
  let failed = false;
  for (const s of ctx.project.sounds) {
    if (skip.has(s.name)) continue;
    const one = await stageSound(ctx, s);
    if (one === null) failed = true;
    else staged.push(one);
  }
  // Effects first, then music; each already in name order (project lists are sorted by name).
  staged.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "effect" ? -1 : 1));
  const bank = failed ? await buildSoundbank(ctx, []) : await buildSoundbank(ctx, staged);
  const sounds: Record<string, SoundEntry> = {};
  for (const s of [...staged].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    // Expected ids: every effect precedes every module, so each kind counts from 0 in name order (C3 section 5).
    const expected = staged.filter((x) => x.kind === s.kind).indexOf(s);
    const define = soundDefine(s.name, s.kind);
    let id = expected;
    if (bank.defines !== null) {
      const actual = bank.defines.get(define);
      if (actual !== expected) {
        const detail = `soundbank.h gives ${define} = ${actual ?? "nothing"}, expected ${expected}`;
        report(ctx, [{ code: "E421", args: { detail } }], s.name, s.file);
      }
      id = actual ?? expected;
    }
    const exact =
      bank.sizes === null ? null : s.kind === "effect" ? effectRamBytes(bank.sizes, id) : musicRamBytes(bank.sizes, id);
    const estimate = s.kind === "effect" ? estimateEffectRam(s.samples ?? 0) : estimateMusicRam(s.fileBytes);
    const ramBytes = exact ?? estimate;
    if (ramBytes > LIMITS.soundRamBytes) {
      report(ctx, [{ code: "E411", args: { bytes: ramBytes, max: LIMITS.soundRamBytes } }], s.name, s.file);
    }
    sounds[s.name] = {
      id,
      kind: s.kind,
      define,
      sampleRate: s.sampleRate,
      samples: s.samples,
      loop: s.loop,
      ramBytes,
      estimated: exact === null,
    };
  }
  if (bank.bytes !== null && bank.bytes > LIMITS.soundbankMaxBytes) {
    const list = Object.entries(sounds)
      .sort((a, b) => b[1].ramBytes - a[1].ramBytes)
      .slice(0, 3)
      .map(([n]) => n)
      .join(", ");
    report(ctx, [{ code: "E410", args: { bytes: bank.bytes, max: LIMITS.soundbankMaxBytes, list } }], null, null);
  }
  return { sounds, soundbank: bank.bytes === null ? null : { file: SOUNDBANK_BIN, bytes: bank.bytes } };
}

// ---------------------------------------------------------------------------------------------------------
// The entry point

/** Deletes GRFs in `dir` that belong to no current asset (a renamed sprite leaves nothing behind). */
function removeStale(dir: string, keep: readonly string[]): void {
  const wanted = new Set(keep.map((n) => `${n}${GRF_EXT}`));
  for (const f of readdirSync(dir))
    if (f.endsWith(GRF_EXT) && !wanted.has(f)) rmSync(path.join(dir, f), { force: true });
}

/**
 * C4 `packAssets`: packs the project's assets into `outDir` (the build folder) and returns the C3 manifest plus
 * every diagnostic (E4xx from the catalog, E6xx for tools). It also writes `assets.manifest.json`.
 */
export async function packAssets(
  project: Project,
  toolPaths: ToolPaths,
  outDir: string,
  options: PackOptions = {},
): Promise<{ manifest: AssetPackManifest; diagnostics: Diagnostic[] }> {
  const gfx = path.join(outDir, NITROFS_DIR, GFX_DIR);
  const bg = path.join(outDir, NITROFS_DIR, BG_DIR);
  const cache = new AssetCache(outDir);
  for (const dir of [gfx, bg, cache.root]) mkdirSync(dir, { recursive: true });
  const hasImages = project.sprites.length + project.backgrounds.length > 0;
  const grit = checkTool("grit", toolPaths, "Converting sprites and backgrounds (grit)");
  const mmutil = checkTool("mmutil", toolPaths, "Building the soundbank (mmutil)");
  const ctx: PackContext = {
    project,
    outDir,
    cache,
    run: options.runTool ?? spawnTool,
    env: toolEnvironment(toolPaths, options.env),
    grit,
    mmutil,
    gritStamp: grit.ok ? toolStamp(grit.exe) : "none",
    mmutilStamp: mmutil.ok ? toolStamp(mmutil.exe) : "none",
    diagnostics: [],
  };
  if (!grit.ok && hasImages) ctx.diagnostics.push(grit.diagnostic);
  if (!mmutil.ok && project.sounds.length > 0) ctx.diagnostics.push(mmutil.diagnostic);

  const skipSprites = checkNames(
    ctx,
    project.sprites.map((s) => s.name),
    "sprite",
    "sprites",
    false,
  );
  const skipBackgrounds = checkNames(
    ctx,
    project.backgrounds.map((b) => b.name),
    "background",
    "backgrounds",
    false,
  );
  const skipSounds = checkNames(
    ctx,
    project.sounds.map((s) => s.name),
    "sound",
    "sounds",
    true,
  );

  const sprites = await packSprites(ctx, skipSprites);
  const backgrounds = await packBackgrounds(ctx, skipBackgrounds);
  const { sounds, soundbank } = await packSounds(ctx, skipSounds);
  const icon = await packIcon(ctx);
  removeStale(gfx, grit.ok ? Object.keys(sprites) : []);
  removeStale(bg, grit.ok ? Object.keys(backgrounds) : []);

  const manifest: AssetPackManifest = {
    contract: "C3",
    version: ASSETPACK_CONTRACT_VERSION,
    provisional: true,
    tools: {
      grit: hasImages ? await toolVersion(ctx, grit, ctx.gritStamp) : null,
      mmutil: soundbank === null ? null : await toolVersion(ctx, mmutil, ctx.mmutilStamp),
    },
    sprites,
    backgrounds,
    sounds,
    soundbank,
    icon,
    budgets: manifestBudgets(),
  };
  writeFileSync(path.join(outDir, MANIFEST_JSON), serializeManifest(manifest));
  return { manifest, diagnostics: ctx.diagnostics };
}
