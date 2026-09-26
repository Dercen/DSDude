import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PackRomOptions } from "./api.ts";
import { bannerTitle, checkRom, ndstoolArgs, readRomHeader } from "./rom.ts";
import { FIXTURE_PACKROM, FIXTURE_ROM } from "./test-support.ts";

const rom = () => new Uint8Array(readFileSync(FIXTURE_ROM));
const u32 = (buf: Uint8Array, at: number, value: number) => new DataView(buf.buffer).setUint32(at, value, true);

describe("ROM header check (verification.md claim 3)", () => {
  it("passes on the hello fixture and matches packrom.json", () => {
    const buf = rom();
    const expected = JSON.parse(readFileSync(FIXTURE_PACKROM, "utf8")) as { header: unknown; nitrofsFiles: number };
    expect(readRomHeader(buf)).toEqual(expected.header);
    expect(checkRom(buf, "game.nds")).toEqual([]);
    expect(expected.nitrofsFiles).toBe(1);
  });

  it("E613 when the NitroFS! mark is zeroed", () => {
    const buf = rom();
    const header = readRomHeader(buf);
    if (!header) throw new Error("fixture has no header");
    buf.fill(0, header.magicOffset, header.magicOffset + 8);
    expect(checkRom(buf, "game.nds").map((d) => d.code)).toEqual(["E613"]);
  });

  it("E612 when the FAT size is zeroed", () => {
    const buf = rom();
    u32(buf, 0x4c, 0);
    expect(checkRom(buf, "game.nds").map((d) => d.code)).toEqual(["E612"]);
  });

  it("E611 when the file table starts below 0x8000", () => {
    const buf = rom();
    u32(buf, 0x48, 0x4000);
    const [d] = checkRom(buf, "game.nds");
    expect(d?.code).toBe("E611");
    expect(d?.message).toContain("0x4000");
  });

  it("E614 for a file shorter than a header", () => {
    expect(checkRom(new Uint8Array(100), "x.nds").map((d) => d.code)).toEqual(["E614"]);
  });

  it("diagnostics carry the toolchain source and an error severity", () => {
    const [d] = checkRom(new Uint8Array(1), "x.nds");
    expect(d).toMatchObject({ source: "toolchain", severity: "error", file: null });
  });
});

describe("ndstool arguments", () => {
  const opts: PackRomOptions = {
    arm9Elf: "C:\\r\\arm9.elf",
    nitrofsDir: "C:\\b\\nitrofs",
    outNds: "C:\\b\\game.nds",
    title: "hello",
    subtitle: "DSDude",
    author: "Me;You",
    iconPng: null,
    gamecode: "####",
  };

  it("always passes -7 and the NitroFS folder", () => {
    expect(ndstoolArgs(opts, "C:\\core\\arm7_maxmod.elf", "C:\\core\\icon.bmp")).toEqual([
      "-c",
      "C:\\b\\game.nds",
      "-9",
      "C:\\r\\arm9.elf",
      "-7",
      "C:\\core\\arm7_maxmod.elf",
      "-b",
      "C:\\core\\icon.bmp",
      "hello;DSDude;Me,You",
      "-d",
      "C:\\b\\nitrofs",
    ]);
  });

  it("uses the build's own icon and a real game code", () => {
    const args = ndstoolArgs({ ...opts, iconPng: "C:\\b\\icon.png", gamecode: "ABCD" }, "a7", "def");
    expect(args).toContain("C:\\b\\icon.png");
    expect(args.slice(args.indexOf("-g"), args.indexOf("-g") + 2)).toEqual(["-g", "ABCD"]);
  });

  it("drops empty banner parts", () => {
    expect(bannerTitle({ title: "t", subtitle: "", author: "a" })).toBe("t;a");
  });
});
