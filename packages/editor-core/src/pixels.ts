/**
 * Pixel tools over one frame: a `Uint8Array` of palette indices, row-major, `width x height`, index 0 transparent.
 * Every tool is pure: it returns a new buffer (or the same one when nothing changed), never mutates its input.
 */

export interface Frame {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function blankFrame(width: number, height: number): Frame {
  return { width, height, pixels: new Uint8Array(width * height) };
}

const inside = (f: Frame, x: number, y: number) => x >= 0 && y >= 0 && x < f.width && y < f.height;

export function getPixel(f: Frame, x: number, y: number): number {
  return inside(f, x, y) ? (f.pixels[y * f.width + x] ?? 0) : 0;
}

function withPixels(f: Frame, pixels: Uint8Array): Frame {
  return { width: f.width, height: f.height, pixels };
}

/** Sets the listed points (off-frame points are skipped). */
export function plot(f: Frame, points: Iterable<readonly [number, number]>, color: number): Frame {
  let out: Uint8Array | null = null;
  for (const [x, y] of points) {
    if (!inside(f, x, y)) continue;
    const i = y * f.width + x;
    if ((out ?? f.pixels)[i] === color) continue;
    out ??= f.pixels.slice();
    out[i] = color;
  }
  return out ? withPixels(f, out) : f;
}

export function pencil(f: Frame, x: number, y: number, color: number): Frame {
  return plot(f, [[x, y]], color);
}

/** Bresenham line points from (x0, y0) to (x1, y1), both ends included. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
}

export function line(f: Frame, x0: number, y0: number, x1: number, y1: number, color: number): Frame {
  return plot(f, linePoints(x0, y0, x1, y1), color);
}

/** The rectangle spanned by two corners (inclusive), in any order. */
export function rectBetween(x0: number, y0: number, x1: number, y1: number): Rect {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0) + 1, height: Math.abs(y1 - y0) + 1 };
}

export function rect(f: Frame, r: Rect, color: number, filled = false): Frame {
  const pts: [number, number][] = [];
  const x1 = r.x + r.width - 1;
  const y1 = r.y + r.height - 1;
  for (let y = r.y; y <= y1; y++)
    for (let x = r.x; x <= x1; x++) if (filled || x === r.x || x === x1 || y === r.y || y === y1) pts.push([x, y]);
  return plot(f, pts, color);
}

/** 4-connected flood fill from (x, y). */
export function fill(f: Frame, x: number, y: number, color: number): Frame {
  if (!inside(f, x, y)) return f;
  const target = getPixel(f, x, y);
  if (target === color) return f;
  const out = f.pixels.slice();
  const stack = [y * f.width + x];
  while (stack.length > 0) {
    const i = stack.pop() as number;
    if (out[i] !== target) continue;
    out[i] = color;
    const px = i % f.width;
    const py = (i - px) / f.width;
    if (px > 0) stack.push(i - 1);
    if (px < f.width - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - f.width);
    if (py < f.height - 1) stack.push(i + f.width);
  }
  return withPixels(f, out);
}

/** The rect clipped to the frame (width/height 0 when fully outside). */
export function clip(f: Frame, r: Rect): Rect {
  const x0 = Math.max(0, r.x);
  const y0 = Math.max(0, r.y);
  const x1 = Math.min(f.width, r.x + r.width);
  const y1 = Math.min(f.height, r.y + r.height);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** The pixels inside `r` as their own frame. */
export function copyRegion(f: Frame, r: Rect): Frame {
  const c = clip(f, r);
  const out = blankFrame(c.width, c.height);
  for (let y = 0; y < c.height; y++)
    out.pixels.set(f.pixels.subarray((c.y + y) * f.width + c.x, (c.y + y) * f.width + c.x + c.width), y * c.width);
  return out;
}

/** Draws `src` at (x, y); transparent (0) source pixels leave the frame's pixel unless `opaque`. */
export function paste(f: Frame, src: Frame, x: number, y: number, opaque = false): Frame {
  const pts: [number, number, number][] = [];
  for (let sy = 0; sy < src.height; sy++)
    for (let sx = 0; sx < src.width; sx++) {
      const v = src.pixels[sy * src.width + sx] ?? 0;
      if (v !== 0 || opaque) pts.push([x + sx, y + sy, v]);
    }
  let out: Uint8Array | null = null;
  for (const [px, py, v] of pts) {
    if (!inside(f, px, py)) continue;
    const i = py * f.width + px;
    if ((out ?? f.pixels)[i] === v) continue;
    out ??= f.pixels.slice();
    out[i] = v;
  }
  return out ? withPixels(f, out) : f;
}

/** Moves the selection by (dx, dy): its old place becomes transparent. Returns the frame and the moved rect. */
export function moveRegion(f: Frame, r: Rect, dx: number, dy: number): { frame: Frame; rect: Rect } {
  const c = clip(f, r);
  if (c.width === 0 || c.height === 0 || (dx === 0 && dy === 0)) return { frame: f, rect: c };
  const piece = copyRegion(f, c);
  const cleared = rect(f, c, 0, true);
  return { frame: paste(cleared, piece, c.x + dx, c.y + dy, true), rect: { ...c, x: c.x + dx, y: c.y + dy } };
}

/** Mirrors the whole frame or the selection: "horizontal" swaps left and right, "vertical" top and bottom. */
export function mirror(f: Frame, axis: "horizontal" | "vertical", r?: Rect): Frame {
  const c = clip(f, r ?? { x: 0, y: 0, width: f.width, height: f.height });
  const out = f.pixels.slice();
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < c.width; x++) {
      const sx = axis === "horizontal" ? c.width - 1 - x : x;
      const sy = axis === "vertical" ? c.height - 1 - y : y;
      out[(c.y + y) * f.width + c.x + x] = f.pixels[(c.y + sy) * f.width + c.x + sx] ?? 0;
    }
  return withPixels(f, out);
}

/** Replaces every pixel of one index with another (e.g. after a palette entry is removed). */
export function replaceIndex(f: Frame, from: number, to: number): Frame {
  if (!f.pixels.includes(from)) return f;
  return withPixels(
    f,
    f.pixels.map((v) => (v === from ? to : v)),
  );
}
