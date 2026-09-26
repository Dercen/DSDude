import { describe, expect, it } from "vitest";
import { matchGolden, readRepoFile, sha256 } from "../testing/golden.ts";
import { bgSide, convertBackground, countUniqueTiles } from "./background.ts";
import { convertIcon, fitSize, ICON_SIDE } from "./icon.ts";
import { frameBytes, isObjSize, OBJ_SIZES, objSizeFor, roundUp } from "./objsize.ts";
import { decodePng, encodeDsIndexedPng, type RgbaImage } from "./png.ts";
import {
  buildPalette,
  histogram,
  MAX_OPAQUE_16,
  MAX_OPAQUE_256,
  mapToIndices,
  TRANSPARENT,
  toDsPixels,
} from "./quantize.ts";
import { MAGENTA_DS, MAGENTA_NUDGED_DS, rgb8ToDs, to5, to8 } from "./rgb555.ts";
import { convertSprite, detectFrames, type SpriteSettings, spriteDefaults, stitchFrames } from "./sprite.ts";

/** Narrows away null/undefined, failing the test when the value is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

/** Builds an RGBA image from a per-pixel colour function returning [r, g, b, a]. */
function makeImage(width: number, height: number, px: (x: number, y: number) => number[]): RgbaImage {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) rgba.set(px(x, y), (y * width + x) * 4);
  return { width, height, rgba };
}

/** A smooth many-colour gradient with a transparent corner: forces colour reduction. */
const gradient = (w: number, h: number): RgbaImage =>
  makeImage(w, h, (x, y) =>
    x + y < 4 ? [0, 0, 0, 0] : [(x * 255) / (w - 1), (y * 255) / (h - 1), ((x + y) * 3) & 255, 255],
  );

/** Sprite settings as C1 defaults them. */
const settings = (frames: number, frameWidth: number, frameHeight: number, extra: Partial<SpriteSettings> = {}) => ({
  frames,
  frameWidth,
  frameHeight,
  colorMode: "auto" as const,
  transparent: "alpha" as const,
  ...extra,
});

describe("RGB555", () => {
  it("rounds 8-bit channels to nearest and widens them back exactly", () => {
    expect([0, 4, 5, 127, 128, 250, 251, 255].map(to5)).toEqual([0, 0, 1, 15, 16, 30, 31, 31]);
    for (let c5 = 0; c5 < 32; c5++) {
      expect(to5(to8(c5))).toBe(c5);
      expect(to8(c5) >> 3).toBe(c5); // what grit does with a PNG palette entry
    }
  });
});

describe("OBJ sizes", () => {
  it("has a unique smallest containing size for every frame up to 64x64", () => {
    for (let w = 1; w <= 64; w++) {
      for (let h = 1; h <= 64; h++) {
        const pick = objSizeFor(w, h);
        const containing = OBJ_SIZES.filter((s) => s.width >= w && s.height >= h);
        const minArea = Math.min(...containing.map((s) => s.width * s.height));
        expect(containing.filter((s) => s.width * s.height === minArea)).toEqual([pick]);
      }
    }
    expect(objSizeFor(65, 8)).toBeNull();
    expect(objSizeFor(100, 100)).toBeNull();
  });

  it("pads the flappy gap (8x48) to 32x64 and counts padded, 128-byte-aligned bytes", () => {
    expect(objSizeFor(8, 48)).toEqual({ width: 32, height: 64 });
    expect(frameBytes(8, 8, "256")).toBe(64);
    expect(roundUp(frameBytes(8, 8, "256"), 128)).toBe(128);
    expect(roundUp(frameBytes(16, 8, "16"), 128)).toBe(128);
    expect(frameBytes(32, 64, "256")).toBe(2048);
  });
});

describe("quantizer", () => {
  it("keeps exact colours when they fit and sorts them by DS value", () => {
    const rgb = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 0, 0],
    ];
    const img = makeImage(4, 1, (x) => must(rgb[x]).concat(255));
    const pixels = toDsPixels(img, "alpha");
    const pal = buildPalette(histogram(pixels), MAX_OPAQUE_16);
    expect(pal).toEqual({ colors: [0x001f, 0x03e0, 0x7c00], sourceColors: 3, reduced: false });
    expect(Array.from(mapToIndices(pixels, 4, 1, pal.colors))).toEqual([1, 2, 3, 1]);
  });

  it("applies the transparency rules of C3 step 2", () => {
    const magenta = [255, 0, 255, 255];
    const key = [10, 20, 30, 255];
    const img = makeImage(3, 1, (x) => must([magenta, key, [1, 2, 3, 0]][x]));
    // Some alpha < 128: alpha decides; opaque magenta is nudged off index 0's colour.
    expect(Array.from(toDsPixels(img, "alpha"))).toEqual([MAGENTA_NUDGED_DS, rgb8ToDs(10, 20, 30), TRANSPARENT]);
    // "#rrggbb": that colour (in RGB555) is transparent as well.
    expect(Array.from(toDsPixels(img, "#0a141e"))).toEqual([MAGENTA_NUDGED_DS, TRANSPARENT, TRANSPARENT]);
    // "alpha" with no transparent pixel at all: magenta is the key.
    const opaque = makeImage(2, 1, (x) => must([magenta, key][x]));
    expect(Array.from(toDsPixels(opaque, "alpha"))).toEqual([TRANSPARENT, rgb8ToDs(10, 20, 30)]);
    expect(MAGENTA_DS).toBe(0x7c1f);
  });

  it("reduces to at most 15 or 255 colours, deterministically", () => {
    const pixels = toDsPixels(gradient(64, 64), "alpha");
    const hist = histogram(pixels);
    for (const max of [MAX_OPAQUE_16, MAX_OPAQUE_256]) {
      const a = buildPalette(hist, max);
      expect(a.reduced).toBe(true);
      expect(a.colors.length).toBeLessThanOrEqual(max);
      expect(a.colors.length).toBeGreaterThan(max - 3);
      expect(a.colors).not.toContain(MAGENTA_DS);
      expect([...a.colors].sort((x, y) => x - y)).toEqual(a.colors);
      expect(buildPalette(hist, max)).toEqual(a);
    }
  });

  it("dithers only when asked, and every mode stays in the palette", () => {
    const img = gradient(32, 32);
    const pixels = toDsPixels(img, "alpha");
    const pal = buildPalette(histogram(pixels), MAX_OPAQUE_16);
    const plain = mapToIndices(pixels, 32, 32, pal.colors);
    for (const dither of ["floyd-steinberg", "bayer"] as const) {
      const d = mapToIndices(pixels, 32, 32, pal.colors, dither);
      expect(Buffer.from(d).equals(Buffer.from(plain))).toBe(false);
      expect(Math.max(...d)).toBeLessThanOrEqual(pal.colors.length);
      d.forEach((v, i) => {
        expect(v === 0).toBe(pixels[i] === TRANSPARENT);
      });
    }
  });
});

describe("sprites", () => {
  it("stitches a horizontal strip into padded vertical frames", () => {
    // Two 2x1 frames [1,2] and [3,4] padded to 3x2 cells.
    const sheet = stitchFrames(Uint8Array.from([1, 2, 3, 4]), 2, 2, 1, 3, 2);
    expect(Array.from(sheet)).toEqual([1, 2, 0, 0, 0, 0, 3, 4, 0, 0, 0, 0]);
  });

  it("reports E402 and E401 before converting", () => {
    const img = gradient(100, 100);
    expect(convertSprite(img, settings(1, 100, 100)).problems.map((p) => p.code)).toEqual(["E401"]);
    expect(convertSprite(img, settings(3, 16, 16)).problems).toEqual([
      {
        code: "E402",
        args: { width: 100, height: 100, frames: 3, frameWidth: 16, frameHeight: 16, wantWidth: 48 },
      },
    ]);
  });

  it("warns E407 with the colour counts when it reduces, and picks 256 colours in auto mode", () => {
    const { value, problems } = convertSprite(gradient(64, 64), settings(1, 64, 64));
    expect(value?.colorMode).toBe("256");
    expect(problems).toEqual([{ code: "E407", args: { from: must(value).sourceColors, to: must(value).colors - 1 } }]);
    const forced = must(convertSprite(gradient(64, 64), settings(1, 64, 64, { colorMode: "16" })).value);
    expect(forced.colors).toBeLessThanOrEqual(16);
    expect(forced.palette).toHaveLength(16);
  });

  // Golden bytes: the indexed PNG handed to grit, for the fixture strip and every sample sprite.
  const SPRITES: [string, string, SpriteSettings][] = [
    ["fixture-sprite16x16x3", "fixtures/assets/sprite16x16x3.png", settings(3, 16, 16)],
    ["flappy-spr_bird", "samples/flappy/sprites/spr_bird/sheet.png", settings(3, 16, 16)],
    ["flappy-spr_gap", "samples/flappy/sprites/spr_gap/sheet.png", settings(1, 8, 48)],
    ["flappy-spr_pipe", "samples/flappy/sprites/spr_pipe/sheet.png", settings(1, 32, 64)],
    ["minimal-spr_player", "samples/minimal/sprites/spr_player/sheet.png", settings(1, 16, 16)],
    ["gradient-64x64-256", "", settings(1, 64, 64)],
    ["gradient-64x64-16", "", settings(1, 64, 64, { colorMode: "16" })],
  ];
  it.each(SPRITES)("converts %s to its golden sheet", (name, path, s) => {
    const image = path === "" ? gradient(64, 64) : decodePng(readRepoFile(path));
    const run = () => must(convertSprite(image, s).value);
    const sprite = run();
    const png = encodeDsIndexedPng(sprite.paddedWidth, s.frames * sprite.paddedHeight, sprite.sheet, sprite.palette);
    // Deterministic across runs, and equal to the committed golden.
    const again = run();
    expect(
      sha256(encodeDsIndexedPng(again.paddedWidth, s.frames * again.paddedHeight, again.sheet, again.palette)),
    ).toBe(sha256(png));
    expect(matchGolden(`sprites/${name}.png`, png).equal).toBe(true);
    // Decoding the sheet gives back the source pixels (exact colours) in each padded cell.
    if (path !== "" && !sprite.reduced) {
      const sheet = decodePng(png);
      const src = toDsPixels(image, s.transparent);
      for (let f = 0; f < s.frames; f++) {
        for (let y = 0; y < s.frameHeight; y++) {
          for (let x = 0; x < s.frameWidth; x++) {
            const want = src[y * image.width + f * s.frameWidth + x] as number;
            const at = ((f * sprite.paddedHeight + y) * sprite.paddedWidth + x) * 4;
            if (want === TRANSPARENT) expect(sheet.rgba[at + 3]).toBe(0);
            else expect(rgb8ToDs(must(sheet.rgba[at]), must(sheet.rgba[at + 1]), must(sheet.rgba[at + 2]))).toBe(want);
          }
        }
      }
    }
  });

  it("computes the C1 import defaults of the sample sprites", () => {
    expect(spriteDefaults(decodePng(readRepoFile("samples/flappy/sprites/spr_bird/sheet.png")))).toEqual({
      frames: 3,
      frameWidth: 16,
      frameHeight: 16,
      origin: { x: 8, y: 8 },
      // The opaque bounds (the sample's hand-written sprite.json says left 2; the wing reaches column 1).
      bbox: { left: 1, top: 3, right: 15, bottom: 13 },
    });
    expect(detectFrames(32, 64)).toEqual({ frames: 1, frameWidth: 32 });
    expect(detectFrames(8, 48)).toEqual({ frames: 1, frameWidth: 8 });
    expect(detectFrames(96, 32)).toEqual({ frames: 3, frameWidth: 32 });
    expect(isObjSize(64, 32)).toBe(true);
  });
});

describe("backgrounds", () => {
  it("pads to the text-BG size and counts flip-merged tiles", () => {
    expect([1, 256, 257, 512].map(bgSide)).toEqual([256, 256, 512, 512]);
    // Four tiles: a pattern, its horizontal mirror, its vertical mirror, and a different one -> 2 unique.
    const W = 32;
    const img = new Uint8Array(W * 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const v = (x * 3 + y * 5) & 7;
        img[y * W + x] = v;
        img[y * W + 8 + (7 - x)] = v;
        img[(7 - y) * W + 16 + x] = v;
        img[y * W + 24 + x] = 9;
      }
    }
    expect(countUniqueTiles(img, W, 8)).toBe(2);
  });

  it("converts the fixture background to its golden image", () => {
    const { value, problems } = convertBackground(decodePng(readRepoFile("fixtures/assets/background256x192.png")));
    expect(problems).toEqual([]);
    const bg = must(value);
    expect([bg.width, bg.height, bg.paddedWidth, bg.paddedHeight]).toEqual([256, 192, 256, 256]);
    expect(bg.vramBytes).toBe(bg.tiles * 64 + 32 * 32 * 2);
    const png = encodeDsIndexedPng(bg.paddedWidth, bg.paddedHeight, bg.image, bg.palette);
    expect(matchGolden("backgrounds/fixture-background256x192.png", png).equal).toBe(true);
  });

  it("reports E405 for a background above 512 pixels", () => {
    const { value, problems } = convertBackground(makeImage(513, 8, () => [0, 0, 0, 255]));
    expect(value).toBeNull();
    expect(problems).toEqual([{ code: "E405", args: { width: 513, height: 8, max: 512 } }]);
  });

  it("reports E406 when a background has more than 1024 unique tiles", () => {
    // 512x512 = 4096 tiles; tile t lights the pixels of row 0 and the left half of row 1 that spell t in binary,
    // so nearly every tile is unique even after merging flips.
    const big = makeImage(512, 512, (x, y) => {
      const t = (y >> 3) * 64 + (x >> 3);
      const bit = (y & 7) * 8 + (x & 7);
      return bit < 12 && (t >> bit) & 1 ? [255, 255, 255, 255] : [0, 0, 0, 255];
    });
    const { problems } = convertBackground(big);
    expect(problems.map((p) => p.code)).toContain("E406");
  });
});

describe("icon", () => {
  it("fits any image into 32x32", () => {
    expect(fitSize(64, 64)).toEqual({ width: 32, height: 32 });
    expect(fitSize(100, 50)).toEqual({ width: 32, height: 16 });
    expect(fitSize(3, 12)).toEqual({ width: 8, height: 32 });
  });

  it.each([
    ["flappy", "samples/flappy/icon.png"],
    ["minimal", "samples/minimal/icon.png"],
  ])("converts the %s icon to its golden PNG", (name, path) => {
    const { value } = convertIcon(decodePng(readRepoFile(path)));
    const icon = must(value);
    expect(icon.palette).toHaveLength(16);
    expect(icon.colors).toBeLessThanOrEqual(16);
    const png = encodeDsIndexedPng(ICON_SIDE, ICON_SIDE, icon.indices, icon.palette);
    expect(matchGolden(`icons/${name}.png`, png).equal).toBe(true);
  });

  it("reduces a many-colour icon to 15 colours with E407", () => {
    const { value, problems } = convertIcon(gradient(100, 60));
    expect(must(value).colors).toBeLessThanOrEqual(16);
    expect(problems.map((p) => p.code)).toEqual(["E407"]);
    // Letterboxed: the top and bottom rows are transparent.
    expect(must(value).indices[0]).toBe(0);
    expect(must(value).indices[ICON_SIDE * ICON_SIDE - 1]).toBe(0);
  });
});
