/**
 * DS colours (BGR555: `b << 10 | g << 5 | r`) and their 8-bit forms, rounded exactly as the asset pipeline does
 * (C3 step 3: to5 rounds to nearest, to8 replicates bits), so a palette survives PNG round trips unchanged.
 */

const MAX5 = 31;
const MAX8 = 255;

export function to5(c8: number): number {
  return Math.floor((c8 * MAX5 + (MAX8 >> 1)) / MAX8);
}

export function to8(c5: number): number {
  return (c5 << 3) | (c5 >> 2);
}

export function rgb8ToDs(r: number, g: number, b: number): number {
  return (to5(b) << 10) | (to5(g) << 5) | to5(r);
}

/** 0xRRGGBB -> DS value. */
export function rgbToDs(rgb: number): number {
  return rgb8ToDs((rgb >> 16) & MAX8, (rgb >> 8) & MAX8, rgb & MAX8);
}

/** DS value -> [r, g, b] (8-bit). */
export function dsToRgb8(ds: number): [number, number, number] {
  return [to8(ds & MAX5), to8((ds >> 5) & MAX5), to8((ds >> 10) & MAX5)];
}

/** DS value -> 0xRRGGBB. */
export function dsToRgb(ds: number): number {
  const [r, g, b] = dsToRgb8(ds);
  return (r << 16) | (g << 8) | b;
}

/** DS value -> "#rrggbb" (colour pickers). */
export function dsToHex(ds: number): string {
  return `#${dsToRgb(ds).toString(16).padStart(6, "0")}`;
}

/** "#rrggbb" -> DS value, or null. */
export function hexToDs(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  return m?.[1] ? rgbToDs(Number.parseInt(m[1], 16)) : null;
}
