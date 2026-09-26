import { describe, expect, it } from "vitest";
import {
  blankFrame,
  copyRegion,
  type Frame,
  fill,
  getPixel,
  line,
  linePoints,
  mirror,
  moveRegion,
  paste,
  pencil,
  rect,
  rectBetween,
  replaceIndex,
} from "./pixels.ts";

/** A frame from rows of digits ("0" transparent). */
const F = (...rows: string[]): Frame => {
  const f = blankFrame(rows[0]?.length ?? 0, rows.length);
  for (const [y, r] of rows.entries()) for (const [x, c] of [...r].entries()) f.pixels[y * f.width + x] = Number(c);
  return f;
};
const rows = (f: Frame) =>
  Array.from({ length: f.height }, (_, y) => [...f.pixels.subarray(y * f.width, (y + 1) * f.width)].join(""));

describe("pixel tools", () => {
  it("pencil sets one pixel, ignores off-frame points and never mutates its input", () => {
    const a = blankFrame(3, 2);
    const b = pencil(a, 1, 1, 5);
    expect(rows(b)).toEqual(["000", "050"]);
    expect(rows(a)).toEqual(["000", "000"]);
    expect(pencil(a, 7, 7, 5)).toBe(a);
    expect(pencil(b, 1, 1, 5)).toBe(b);
    expect(getPixel(b, -1, 0)).toBe(0);
  });

  it("draws Bresenham lines and rectangles (outline or filled, any corner order)", () => {
    expect(linePoints(0, 0, 3, 1)).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
    ]);
    expect(rows(line(blankFrame(4, 4), 3, 3, 0, 0, 2))).toEqual(["2000", "0200", "0020", "0002"]);
    expect(rectBetween(3, 2, 1, 0)).toEqual({ x: 1, y: 0, width: 3, height: 3 });
    expect(rows(rect(blankFrame(4, 4), rectBetween(0, 0, 3, 3), 1))).toEqual(["1111", "1001", "1001", "1111"]);
    expect(rows(rect(blankFrame(3, 3), rectBetween(0, 0, 1, 1), 4, true))).toEqual(["440", "440", "000"]);
  });

  it("flood-fills a 4-connected area only", () => {
    const f = F("1100", "1010", "0011");
    expect(rows(fill(f, 3, 0, 7))).toEqual(["1177", "1017", "0011"]);
    expect(rows(fill(f, 0, 0, 2))).toEqual(["2200", "2010", "0011"]);
    expect(fill(f, 0, 0, 1)).toBe(f);
  });

  it("copies, pastes (transparent or opaque) and moves a selection", () => {
    const f = F("1230", "4560", "0000");
    const piece = copyRegion(f, { x: 1, y: 0, width: 2, height: 2 });
    expect(rows(piece)).toEqual(["23", "56"]);
    expect(rows(paste(blankFrame(3, 2), F("10", "01"), 1, 0))).toEqual(["010", "001"]);
    expect(rows(paste(F("99", "99"), F("10", "01"), 0, 0, true))).toEqual(["10", "01"]);
    const moved = moveRegion(f, { x: 0, y: 0, width: 2, height: 1 }, 1, 2);
    expect(rows(moved.frame)).toEqual(["0030", "4560", "0120"]);
    expect(moved.rect).toEqual({ x: 1, y: 2, width: 2, height: 1 });
  });

  it("mirrors the frame or a selection", () => {
    const f = F("123", "456");
    expect(rows(mirror(f, "horizontal"))).toEqual(["321", "654"]);
    expect(rows(mirror(f, "vertical"))).toEqual(["456", "123"]);
    expect(rows(mirror(f, "horizontal", { x: 0, y: 0, width: 2, height: 1 }))).toEqual(["213", "456"]);
    expect(rows(replaceIndex(f, 5, 0))).toEqual(["123", "406"]);
  });
});
