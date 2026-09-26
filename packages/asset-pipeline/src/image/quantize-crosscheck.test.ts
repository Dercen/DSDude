/**
 * image-q as a test cross-check only (docs/kickoff/ws5.md task 2): the in-house quantizer's average error must stay
 * at or near that of image-q's Wu quantizer with nearest-colour mapping, on images that need colour reduction, and
 * be exact where no reduction is needed. image-q is a devDependency; the pipeline never imports it.
 */
import { applyPaletteSync, buildPaletteSync, utils } from "image-q";
import { describe, expect, it } from "vitest";
import { readRepoFile } from "../testing/golden.ts";
import { decodePng, type RgbaImage } from "./png.ts";
import { MAX_OPAQUE_16, MAX_OPAQUE_256, quantizeImage } from "./quantize.ts";
import { dsDistance2, rgb8ToDs } from "./rgb555.ts";

/** Bytes per RGBA8 pixel. */
const RGBA_BYTES = 4;
/** Alpha below this is transparent (C3 section 3 step 2); such pixels are not scored. */
const ALPHA_OPAQUE_MIN = 128;
/** How much worse than image-q the in-house result may be: 2 % (measured: from 8 % better to 0.5 % worse). */
const TOLERANCE = 1.02;

/** A fully opaque image from a colour function. */
function opaque(width: number, height: number, colour: (x: number, y: number) => number[]): RgbaImage {
  const OPAQUE = 255;
  const rgba = new Uint8Array(width * height * RGBA_BYTES);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rgba.set([...colour(x, y), OPAQUE], (y * width + x) * RGBA_BYTES);
  }
  return { width, height, rgba };
}

/** Many-colour test images: a smooth two-way gradient and a sine "plasma". */
const REDUCED: [string, RgbaImage][] = [
  ["gradient", opaque(64, 64, (x, y) => [(x * 255) / 63, (y * 255) / 63, ((x + y) * 3) & 255])],
  [
    "plasma",
    opaque(96, 96, (x, y) =>
      [128 + 127 * Math.sin(x / 7), 128 + 127 * Math.sin(y / 5 + x / 11), 128 + 127 * Math.sin((x + y) / 9)].map(
        Math.round,
      ),
    ),
  ],
];

/** Mean squared RGB555 error per opaque pixel: in-house quantizer vs image-q (Wu + nearest). */
function errors(image: RgbaImage, mode: "16" | "256"): { ours: number; imageQ: number } {
  const colours = mode === "16" ? MAX_OPAQUE_16 : MAX_OPAQUE_256;
  const q = quantizeImage(image, mode, "alpha");
  const points = utils.PointContainer.fromUint8Array(image.rgba, image.width, image.height);
  const palette = buildPaletteSync([points], {
    colors: colours,
    paletteQuantization: "wuquant",
    colorDistanceFormula: "euclidean",
  });
  const theirs = applyPaletteSync(points, palette, {
    imageQuantization: "nearest",
    colorDistanceFormula: "euclidean",
  }).toUint8Array();
  let ours = 0;
  let imageQ = 0;
  let n = 0;
  for (let i = 0; i < image.width * image.height; i++) {
    const at = i * RGBA_BYTES;
    if ((image.rgba[at + 3] as number) < ALPHA_OPAQUE_MIN) continue;
    const source = rgb8ToDs(image.rgba[at] as number, image.rgba[at + 1] as number, image.rgba[at + 2] as number);
    ours += dsDistance2(source, q.palette[q.indices[i] as number] as number);
    imageQ += dsDistance2(source, rgb8ToDs(theirs[at] as number, theirs[at + 1] as number, theirs[at + 2] as number));
    n++;
  }
  return { ours: ours / n, imageQ: imageQ / n };
}

describe("quantizer vs image-q", () => {
  it.each(REDUCED.flatMap(([name, image]) => (["16", "256"] as const).map((mode) => [name, mode, image] as const)))(
    "%s in %s colours: average error at most 2 %% above image-q's",
    (_name, mode, image) => {
      const { ours, imageQ } = errors(image, mode);
      expect(ours).toBeLessThanOrEqual(imageQ * TOLERANCE);
    },
  );

  it("is exact where no reduction is needed (the sample sprite and the fixture background)", () => {
    for (const path of ["samples/flappy/sprites/spr_bird/sheet.png", "fixtures/assets/background256x192.png"]) {
      expect(errors(decodePng(readRepoFile(path)), "256").ours).toBe(0);
    }
  });
});
