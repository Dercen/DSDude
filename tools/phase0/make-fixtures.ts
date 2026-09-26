// Writes fixtures/assets/ (C14): a 16x16 3-frame sprite strip, a 256x192 background and one WAV.
// Run: node tools/phase0/make-fixtures.ts. After the tag fixtures/assets/** belongs to WS5 (golden/ to WS0).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Image, type Rgba, tone, wav } from "./media.ts";

const dir = resolve(import.meta.dirname, "../../fixtures/assets");
mkdirSync(dir, { recursive: true });

// 16x16, 3 frames: a ball moving right inside a frame, 4 opaque colours + transparent
const sprite = new Image(48, 16);
const RED: Rgba = [224, 48, 48, 255];
const DARK: Rgba = [96, 16, 16, 255];
const WHITE: Rgba = [248, 248, 248, 255];
const GREY: Rgba = [128, 128, 128, 255];
for (let f = 0; f < 3; f++) {
  const x = f * 16;
  sprite.rect(x, 15, 16, 1, GREY);
  sprite.ellipse(x + 2 + f * 2, 3, 10, 10, DARK);
  sprite.ellipse(x + 3 + f * 2, 4, 8, 8, RED);
  sprite.rect(x + 5 + f * 2, 6, 2, 2, WHITE);
}
writeFileSync(join(dir, "sprite16x16x3.png"), sprite.png());

// 256x192: sky gradient in 8-pixel bands, ground, and a checker strip (tile-friendly, <= 16 colours)
const bg = new Image(256, 192);
for (let band = 0; band < 20; band++) {
  const c = 120 + band * 5;
  bg.rect(0, band * 8, 256, 8, [64, Math.min(255, c), 240, 255]);
}
bg.rect(0, 160, 256, 32, [96, 168, 64, 255]);
for (let x = 0; x < 256; x += 16) bg.rect(x, 160, 8, 8, [72, 136, 48, 255]);
writeFileSync(join(dir, "background256x192.png"), bg.png());

writeFileSync(join(dir, "blip.wav"), wav(tone(0.2, 660, 990)));
console.log("wrote fixtures/assets");
