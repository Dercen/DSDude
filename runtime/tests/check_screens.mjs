// check_screens.mjs: an independent check of the host renderer (runtime/host/gfx.c) on the v4-screens fixture.
// It decodes the selftest source PNGs the GRFs were made from (fixtures/runtime/selftest/src) with pngjs and
// compares them, in RGB555, with dsdude-host's --png-dir output. Run from the repo root after building:
//     runtime/build-host/dsdude-host fixtures/runtime-core/v4-screens --frames 1 --seed 1 --png-dir <dir>
//     node runtime/tests/check_screens.mjs <dir>
// Exits 1 when a pixel differs. The C tests pin the same renders by hash (test_programs.c, test_screens).
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

const SRC = "fixtures/runtime/selftest/src/";
const SCREEN_W = 256;
const SCREEN_H = 192;
const ALPHA_OPAQUE = 128; // C3: alpha < 128 is transparent
const TOP_VIEW = [8, 4]; // game.dsda: `.screen top bg_room 8 4`
const BG_H = 192; // bg.png's height; rows below it are grit padding (index 0: transparent)
const AFFINE_MIN_AGREEMENT = 0.75; // DS affine sampling starts at pixel corners, so edge pixels differ from a
// pixel-centre model by up to one pixel

const dir = process.argv[2];
if (!dir) throw new Error("usage: node runtime/tests/check_screens.mjs <png-dir>");
const load = (p) => PNG.sync.read(readFileSync(p));
const [bg, s16, s8, s64] = ["bg", "spr16", "spr8x8", "spr64"].map((n) => load(`${SRC}${n}.png`));
const top = load(`${dir}/top.png`);
const bot = load(`${dir}/bottom.png`);

const px = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};
const rgb555 = ([r, g, b]) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
const opaque = (p) => p[3] >= ALPHA_OPAQUE && !(p[0] === 255 && p[1] === 0 && p[2] === 255); // magenta = index 0
const colour = (p) => (opaque(p) ? rgb555(p) : 0); // transparent shows the black backdrop

let bad = 0;
let checked = 0;
const expect = (img, x, y, want, what) => {
  checked++;
  const got = rgb555(px(img, x, y));
  if (got !== want && bad++ < 10)
    console.log(`${what} (${x}, ${y}): got ${got.toString(16)}, want ${want.toString(16)}`);
};

// Sprites drawn plainly: screen (left + i, top + j) shows sheet texel (fu(i), fv(j)) where opaque.
const covered = [new Set(), new Set()];
function sprite(screen, img, sheet, left, topY, w, h, fu, fv, what) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = px(sheet, fu(i), fv(j));
      if (opaque(p)) expect(img, left + i, topY + j, rgb555(p), what);
      covered[screen].add(`${left + i},${topY + j}`);
    }
  }
}
// Room positions minus the view: obj_still (48, 44), obj_mirror (96, 44) with xscale -1 and frame 1 (sheet rows
// 16-31), obj_small (208, 104), and obj_big (104, 64) on the bottom screen (view 0, 0).
sprite(
  0,
  top,
  s16,
  40,
  40,
  16,
  16,
  (i) => i,
  (j) => j,
  "obj_still",
);
sprite(
  0,
  top,
  s16,
  72,
  40,
  16,
  16,
  (i) => 15 - i,
  (j) => 16 + j,
  "obj_mirror",
);
sprite(
  0,
  top,
  s8,
  200,
  100,
  8,
  8,
  (i) => i,
  (j) => j,
  "obj_small",
);
sprite(
  1,
  bot,
  s64,
  104,
  64,
  64,
  64,
  (i) => i,
  (j) => j,
  "obj_big",
);

// Regions checked separately: obj_spin's double-size area and the UI rows (cells 19-22).
const AFFINE = { x0: 100, x1: 180, y0: 20, y1: 110 };
const UI = { y0: 152, y1: 184 };
const inAffine = (x, y) => x >= AFFINE.x0 && x < AFFINE.x1 && y >= AFFINE.y0 && y < AFFINE.y1;
const bgTop = (x, y) => {
  const by = y + TOP_VIEW[1];
  return by < BG_H ? colour(px(bg, (x + TOP_VIEW[0]) % SCREEN_W, by)) : 0;
};
for (let y = 0; y < SCREEN_H; y++) {
  for (let x = 0; x < SCREEN_W; x++) {
    const k = `${x},${y}`;
    if (!covered[0].has(k) && !inAffine(x, y) && (y < UI.y0 || y >= UI.y1)) expect(top, x, y, bgTop(x, y), "bg top");
    if (!covered[1].has(k)) expect(bot, x, y, colour(px(bg, x, y)), "bg bottom");
  }
}

// UI: draw_rectangle(8, 176, 39, 183) in c_yellow covers cells 0-3 x 21-22; the text row 19 has white pixels.
const YELLOW = (31 << 10) | (31 << 5);
const WHITE = 0x7fff;
for (let y = 168; y < 184; y++) for (let x = 0; x < 32; x++) expect(top, x, y, YELLOW, "draw_rectangle");
let white = 0;
for (let y = 152; y < 160; y++) for (let x = 0; x < SCREEN_W; x++) if (rgb555(px(top, x, y)) === WHITE) white++;
if (white === 0) {
  console.log("draw_text: no white pixels on row 19");
  bad++;
}

// obj_spin: spr16 frame 0, origin (0, 0) at screen (140, 60), scale 2, 45 degrees counter-clockwise (y down).
const a = Math.PI / 4;
let agree = 0;
let total = 0;
for (let y = AFFINE.y0; y < AFFINE.y1; y++) {
  for (let x = AFFINE.x0; x < AFFINE.x1; x++) {
    const dx = x + 0.5 - 140;
    const dy = y + 0.5 - 60;
    const u = (dx * Math.cos(a) - dy * Math.sin(a)) / 2;
    const v = (dx * Math.sin(a) + dy * Math.cos(a)) / 2;
    if (u < 0 || u >= 16 || v < 0 || v >= 16) continue;
    const p = px(s16, Math.floor(u), Math.floor(v));
    if (!opaque(p)) continue;
    total++;
    if (rgb555(px(top, x, y)) === rgb555(p)) agree++;
  }
}
const ratio = agree / total;
if (ratio < AFFINE_MIN_AGREEMENT) bad++;
console.log(`${checked} pixels checked, ${bad} wrong; affine agreement ${agree}/${total} (${ratio.toFixed(2)})`);
process.exit(bad === 0 ? 0 : 1);
