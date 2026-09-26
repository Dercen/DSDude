import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodePng, diffPixels } from "./png.ts";
import { checkLog, SELFTEST_CASES } from "./selftest-cases.ts";

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../fixtures/runtime/selftest");

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** An RGB PNG whose rows use filters 0-4 in turn, so every unfilter path runs. */
function encodeRgb(width: number, height: number, px: (x: number, y: number) => [number, number, number]): Buffer {
  const stride = width * 3;
  const raw: number[] = [];
  const rows: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) row.push(...px(x, y));
    rows.push(row);
    const f = y % 5;
    raw.push(f);
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? row[i - 3] : 0;
      const b = y > 0 ? rows[y - 1][i] : 0;
      const c = i >= 3 && y > 0 ? rows[y - 1][i - 3] : 0;
      const p = a + b - c;
      const paeth =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][f];
      raw.push((row[i] - pred) & 0xff);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(raw))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("decodePng", () => {
  const pixel = (x: number, y: number): [number, number, number] => [(x * 37 + y) & 255, (y * 91) & 255, (x ^ y) & 255];

  it("decodes every filter type to the original pixels", () => {
    const img = decodePng(encodeRgb(7, 10, pixel));
    expect([img.width, img.height]).toEqual([7, 10]);
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 7; x++) {
        const i = (y * 7 + x) * 4;
        expect([...img.data.subarray(i, i + 4)]).toEqual([...pixel(x, y), 255]);
      }
  });

  it("counts differing pixels, and every pixel when the sizes differ", () => {
    const a = decodePng(encodeRgb(4, 4, pixel));
    const b = decodePng(encodeRgb(4, 4, (x, y) => (x === 1 && y === 2 ? [1, 2, 3] : pixel(x, y))));
    expect(diffPixels(a, a)).toBe(0);
    expect(diffPixels(a, b)).toBe(1);
    expect(diffPixels(a, decodePng(encodeRgb(4, 3, pixel)))).toBe(16);
  });

  it("reads the committed selftest goldens (256x192 screens)", () => {
    for (const c of SELFTEST_CASES)
      for (const screen of c.golden) {
        const img = decodePng(readFileSync(path.join(fixtureDir, "golden", `${c.name}-${screen}.png`)));
        expect([img.width, img.height]).toEqual([256, 192]);
      }
  });

  it("rejects what it cannot read", () => {
    expect(() => decodePng(Buffer.from("not a png"))).toThrow(/not a PNG/);
  });
});

describe("selftest cases", () => {
  it("have a key script for every case that names one", () => {
    for (const c of SELFTEST_CASES)
      if (c.keys) expect(readFileSync(path.join(fixtureDir, "keys", c.keys), "utf8")).toMatch(/^\d+(-\d+)? /m);
  });

  it("checkLog reports missing lines and wrong counts", () => {
    const c = { expect: [/^DSD\|LOG\|a$/, /^DSD\|LOG\|b$/], once: [/^DSD\|READY\|/] };
    expect(checkLog(["DSD|READY|0.1.0|0dd9987a", "DSD|LOG|a", "DSD|LOG|b"], c)).toEqual([]);
    expect(checkLog(["DSD|LOG|a", "DSD|LOG|a"], c)).toEqual([
      "no line matches /^DSD\\|LOG\\|b$/",
      "0 lines match /^DSD\\|READY\\|/ (want exactly 1)",
    ]);
  });

  it("the boot patterns match the log the selftest printed on melonDS (2026-09-26)", () => {
    const long = `DSD|LOG|long300:89${"0123456789".repeat(29)}`;
    const log = [
      "DSD|READY|0.1.0|0dd9987a",
      "DSD|LOG|selftest: emulator=melonDS 1.1 log=raw",
      "DSD|LOG|bg: nitro:/bg/bg.grf screen=0 err=0",
      "DSD|LOG|bg: nitro:/bg/bg.grf screen=1 err=0",
      "DSD|LOG|grf: nitro:/gfx/spr16.grf screen=0 err=0 bpp=8 frames=3 offset=0 stride=256 upload=ok",
      "DSD|LOG|grf: nitro:/gfx/spr16.grf screen=1 err=0 bpp=8 frames=3 offset=0 stride=256 upload=ok",
      "DSD|LOG|grf: nitro:/gfx/spr8x8.grf screen=1 err=0 bpp=4 frames=1 offset=768 stride=128 upload=ok",
      "DSD|LOG|grf: nitro:/gfx/spr64.grf screen=0 err=0 bpp=8 frames=1 offset=768 stride=4096 upload=ok",
      "DSD|LOG|mm: mmInitDefault(nitro:/soundbank.bin)=ok",
      "DSD|LOG|mm: mmLoad(MOD_SELFTEST)=0",
      "DSD|LOG|mm: mmLoadEffect(SFX_BLIP)=0",
      "DSD|LOG|mm: mmLoadEffect(SFX_LOOP)=0",
      "DSD|LOG|mm: mmLoadEffect(8)=1 (bad id)",
      "DSD|LOG|mm: mmEffect(SFX_BLIP)=1",
      "DSD|LOG|nitrofs: read 1048576 B sum=133693440 ok in 423177 us (14182347 ticks, 28364694 ARM9 cycles, 2419 KB/s)",
      long,
      "DSD|LOG|percent: 100% done %d %s %%",
      "DSD|LOG|split: first",
      "DSD|LOG|split: second",
      "DSD|MEM|heapfree=3909,snd=15/768,objvram_top=5/128,objvram_bot=1/128,cstack=4/10",
      "DSD|LOG|mm: after 60 frames active=1 position=0 row=11",
      "DSD|STAT|fps=60,inst=0,spr_top=128,spr_bot=128,oam_drop=0,aff_drop=0,sfx_drop=0,ops=0",
    ];
    expect(long.length).toBe(8 + 300);
    const boot = SELFTEST_CASES.find((c) => c.name === "boot");
    expect(boot && checkLog(log, boot)).toEqual([]);
  });
});
