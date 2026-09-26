/** Real ndstool runs. Skipped when detectToolchain() finds no toolchain (Linux, cloud sessions). */
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { PackRomOptions } from "./api.ts";
import { detectToolchain } from "./detect.ts";
import { toolEnv, wonderfulLayout } from "./layout.ts";
import { packRom, verifyRom } from "./rom.ts";
import { FIXTURE_ELF, FIXTURE_NITROFS, FIXTURE_PACKROM } from "./test-support.ts";

const status = await detectToolchain();
if (!status.installed) console.log("skipped: no ToolPaths");

describe.skipIf(!status.installed)("packRom with the real ndstool", () => {
  const deps = { paths: status.paths, env: toolEnv(process.env, wonderfulLayout()) };
  const opts = (nitrofsDir: string, outNds: string): PackRomOptions => ({
    arm9Elf: FIXTURE_ELF,
    nitrofsDir,
    outNds,
    title: "hello",
    subtitle: "DSDude",
    author: "DSDude",
    iconPng: null,
    gamecode: "####",
  });

  it("reproduces fixtures/build/hello byte for byte", async () => {
    const out = path.join(mkdtempSync(path.join(tmpdir(), "dsdude-pack-")), "game.nds");
    const result = await packRom(opts(FIXTURE_NITROFS, out), deps);
    const expected = JSON.parse(readFileSync(FIXTURE_PACKROM, "utf8")) as { sha256: string; header: unknown };
    expect(result.info.sha256).toBe(expected.sha256);
    expect(result.info.header).toEqual(expected.header);
    expect((await verifyRom(out)).ok).toBe(true);
  });

  it("an empty NitroFS folder is E612 and leaves no ROM behind", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "dsdude-empty-"));
    mkdirSync(path.join(dir, "nitrofs"));
    const out = path.join(dir, "game.nds");
    await expect(packRom(opts(path.join(dir, "nitrofs"), out), deps)).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "E612" })],
    });
    expect(existsSync(out)).toBe(false);
  });
});
