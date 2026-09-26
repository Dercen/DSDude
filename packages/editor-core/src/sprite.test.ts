import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodePng, encodeDsIndexedPng, previewSprite } from "@dsdude/asset-pipeline/browser";
import { describe, expect, it } from "vitest";
import { dsToHex, dsToRgb, hexToDs, rgbToDs } from "./color.ts";
import { edit } from "./history.ts";
import { pencil } from "./pixels.ts";
import {
  addFrame,
  colorsUsed,
  deleteFrame,
  moveFrame,
  paletteIndex,
  renderFrame,
  type SpriteDoc,
  sameSprite,
  setFrame,
  sheetIndices,
  spriteDocFromPreview,
} from "./sprite.ts";

/** Test input: the Phase-0 16x16, 3-frame sprite (fixtures/editors/README.md names it). */
const SHEET = resolve(import.meta.dirname, "../../../fixtures/assets/sprite16x16x3.png");
const opts = { frameWidth: 16, frameHeight: 16, colorMode: "auto", transparent: "alpha" } as const;

/** Frame n of a doc (the tests' docs always have it). */
function frame(doc: SpriteDoc, n: number) {
  const f = doc.frames[n];
  if (!f) throw new Error(`no frame ${n}`);
  return f;
}

function load(): SpriteDoc {
  return spriteDocFromPreview(previewSprite(new Uint8Array(readFileSync(SHEET)), opts), 16, 16);
}

describe("DS colours", () => {
  it("round-trip like the asset pipeline (to5 rounds, to8 replicates bits)", () => {
    expect(dsToRgb(0x7fff)).toBe(0xffffff);
    expect(rgbToDs(0xffffff)).toBe(0x7fff);
    expect(rgbToDs(0xff0000)).toBe(0x001f);
    for (const ds of [0, 1, 0x3def, 0x7c00, 0x03e0, 0x1234]) expect(rgbToDs(dsToRgb(ds))).toBe(ds);
    expect(hexToDs(dsToHex(0x1234))).toBe(0x1234);
    expect(hexToDs("red")).toBeNull();
  });
});

describe("sprite document", () => {
  it("loads frames and the palette from the C12 preview", () => {
    const doc = load();
    expect(doc.frames).toHaveLength(3);
    expect(doc.frames[0]?.pixels).toHaveLength(256);
    expect(colorsUsed(doc)).toBeGreaterThan(0);
    expect(colorsUsed(doc)).toBeLessThan(doc.palette.length);
  });

  it("saves as a DS indexed PNG that the pipeline reads back to the same pixels and colours", () => {
    let doc = load();
    const ds = rgbToDs(0x00ff00);
    const pal = paletteIndex(doc, ds, 16);
    doc = setFrame(pal.doc, 1, pencil(frame(pal.doc, 1), 3, 4, pal.index));
    const { width, height, indices } = sheetIndices(doc);
    expect([width, height]).toEqual([48, 16]);
    const png = encodeDsIndexedPng(width, height, indices, doc.palette);
    expect(decodePng(png).width).toBe(48);
    const again = spriteDocFromPreview(previewSprite(png, opts), 16, 16);
    // The quantiser may reorder the palette: compare the colours pixel by pixel.
    const colours = (d: SpriteDoc, f: number) =>
      [...(d.frames[f]?.pixels ?? [])].map((v) => (v === 0 ? -1 : d.palette[v]));
    for (const f of [0, 1, 2]) expect(colours(again, f)).toEqual(colours(doc, f));
  });

  it("renders RGBA with index 0 transparent and a faint onion skin of the previous frame", () => {
    const doc = load();
    const first = renderFrame(doc, 0);
    const i = [...(doc.frames[0]?.pixels ?? [])].findIndex((v) => v !== 0);
    expect(first[i * 4 + 3]).toBe(255);
    const blank = setFrame(doc, 1, { ...frame(doc, 1), pixels: new Uint8Array(256) });
    expect(renderFrame(blank, 1)[i * 4 + 3]).toBe(0);
    expect(renderFrame(blank, 1, { onion: true, onionAlpha: 0.5 })[i * 4 + 3]).toBe(128);
  });

  it("adds, copies, deletes and reorders frames in the strip", () => {
    const doc = load();
    const added = addFrame(doc, 0);
    expect(added.frames).toHaveLength(4);
    expect(added.frames[1]?.pixels).toEqual(doc.frames[0]?.pixels);
    expect(added.frames[1]?.pixels).not.toBe(doc.frames[0]?.pixels);
    expect(addFrame(doc, 2, false).frames[3]?.pixels.every((v) => v === 0)).toBe(true);
    expect(deleteFrame(doc, 1).frames).toHaveLength(2);
    expect(deleteFrame({ ...doc, frames: [frame(doc, 0)] }, 0).frames).toHaveLength(1);
    const moved = moveFrame(doc, 0, 2);
    expect(moved.frames[2]).toBe(doc.frames[0]);
  });

  it("finds or adds palette colours within the colour limit", () => {
    const doc = load();
    const existing = doc.palette[1] as number;
    expect(paletteIndex(doc, existing).index).toBe(1);
    const full = { ...doc, palette: Array.from({ length: 16 }, (_, i) => i) };
    expect(paletteIndex(full, 0x7fff, 16).index).toBe(-1);
  });
});

describe("sameSprite", () => {
  it("compares content, not identity", () => {
    const doc = load();
    const copy = {
      ...doc,
      frames: doc.frames.map((f) => ({ ...f, pixels: f.pixels.slice() })),
      palette: [...doc.palette],
    };
    expect(sameSprite(doc, copy)).toBe(true);
    expect(sameSprite(doc, setFrame(doc, 0, pencil(frame(doc, 0), 0, 0, 1)))).toBe(false);
    expect(sameSprite(doc, addFrame(doc, 0))).toBe(false);
  });
});

describe("undo through immer patches", () => {
  it("replays only its own change", () => {
    const doc = load();
    const a = edit(doc, (d) => {
      d.frames[0] = pencil(frame(doc, 0), 0, 0, 1);
    });
    expect(a.changed).toBe(true);
    // A later, unrelated change survives the undo.
    const later = addFrame(a.next, 2, false);
    const undone = a.undo(later);
    expect(undone.frames[0]?.pixels[0]).toBe(doc.frames[0]?.pixels[0]);
    expect(undone.frames).toHaveLength(4);
    expect(a.redo(undone).frames[0]?.pixels[0]).toBe(1);
    expect(edit(doc, () => {}).changed).toBe(false);
  });
});
