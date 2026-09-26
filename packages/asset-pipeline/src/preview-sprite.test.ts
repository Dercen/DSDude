import { describe, expect, it } from "vitest";
import { decodePng } from "./image/png.ts";
import { dsToRgb } from "./image/rgb555.ts";
import { convertSprite, spriteDefaults } from "./image/sprite.ts";
import type { DecodePngFn, PreviewSpriteDetailsFn, PreviewSpriteFn, SpriteDefaultsFn } from "./preview.ts";
import { previewSprite, previewSpriteDetails } from "./preview-sprite.ts";
import { readRepoFile } from "./testing/golden.ts";

/** Compile-time check: the implementation matches the C12 function type. */
const asContract: PreviewSpriteFn = previewSprite;
/** Compile-time checks for the 0.2.0 additions (the import dialog's other calls). */
export const contractChecks: [PreviewSpriteDetailsFn, SpriteDefaultsFn, DecodePngFn] = [
  previewSpriteDetails,
  spriteDefaults,
  decodePng,
];

const BIRD = "samples/flappy/sprites/spr_bird/sheet.png";
const OPTS = { frameWidth: 16, frameHeight: 16, colorMode: "auto", transparent: "alpha" } as const;

describe("previewSprite (C12)", () => {
  it("returns the pack's palette and indices, frame by frame", () => {
    const png = readRepoFile(BIRD);
    const preview = asContract(png, OPTS);
    const sprite = convertSprite(decodePng(png), { ...OPTS, frames: 3 }).value;
    if (sprite === null) throw new Error("conversion failed");
    expect(preview.colorMode).toBe(sprite.colorMode);
    expect(preview.colorCount).toBe(sprite.colors);
    expect(preview.palette).toEqual(sprite.palette.slice(0, sprite.colors).map(dsToRgb));
    expect(preview.palette[0]).toBe(0xff00ff);
    expect(preview.frames).toEqual([0, 1, 2].map((f) => ({ offset: f * 256, paddedWidth: 16, paddedHeight: 16 })));
    // Frame f's pixels are the sheet's cell f (16x16 frames need no padding).
    expect(Array.from(preview.indices)).toEqual(Array.from(sprite.sheet));
  });

  it("detects the frames from the PNG width and pads them to the OBJ size", () => {
    const preview = previewSprite(readRepoFile("samples/flappy/sprites/spr_gap/sheet.png"), {
      ...OPTS,
      frameWidth: 8,
      frameHeight: 48,
    });
    expect(preview.frames).toEqual([{ offset: 0, paddedWidth: 32, paddedHeight: 64 }]);
    expect(preview.indices).toHaveLength(8 * 48);
  });

  it("gives original and converted pixels and the diagnostics", () => {
    const d = previewSpriteDetails(readRepoFile(BIRD), {
      ...OPTS,
      frameWidth: 100,
      frameHeight: 100,
      name: "spr_bird",
    });
    expect(d.original).toMatchObject({ width: 100, height: 100 });
    expect(d.converted).toMatchObject({ width: 100, height: 100 });
    expect(d.diagnostics.map((x) => [x.code, x.severity, x.message])).toEqual([
      ["E401", "error", "spr_bird is 100x100. DS sprites can be at most 64x64."],
    ]);
    // The converted pixels match the original where the colours were exact.
    const ok = previewSpriteDetails(readRepoFile(BIRD), OPTS);
    expect(ok.reduced).toBe(false);
    expect(ok.diagnostics).toEqual([]);
    for (let i = 0; i < ok.original.rgba.length; i += 4) {
      const opaque = (ok.original.rgba[i + 3] as number) >= 128;
      expect(ok.converted.rgba[i + 3]).toBe(opaque ? 255 : 0);
    }
  });

  it("reports colour reduction as the warning E407", () => {
    const d = previewSpriteDetails(readRepoFile(BIRD), { ...OPTS, colorMode: "16", dither: "floyd-steinberg" });
    expect(d.reduced).toBe(false);
    const many = previewSpriteDetails(readRepoFile("fixtures/assets/background256x192.png"), {
      frameWidth: 64,
      frameHeight: 64,
      colorMode: "16",
      transparent: "alpha",
    });
    expect(many.reduced).toBe(many.sourceColors > 15);
    expect(many.diagnostics.map((x) => [x.code, x.severity])).toEqual(many.reduced ? [["E407", "warning"]] : []);
    expect(many.preview.colorCount).toBeLessThanOrEqual(16);
  });
});
