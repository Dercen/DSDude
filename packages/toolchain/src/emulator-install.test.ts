import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { LocalEmulatorManager } from "./emulator.ts";
import { installMelonDs, MELONDS_URL, MELONDS_ZIP_BYTES } from "./emulator-install.ts";
import { melonDsExe } from "./layout.ts";

const exeIn = () => path.join(mkdtempSync(path.join(tmpdir(), "dsdude-melon-")), "melonDS-1.1", "melonDS.exe");
const codes = (err: unknown) => (err as { diagnostics: { code: string }[] }).diagnostics.map((d) => d.code);

describe("installMelonDs", () => {
  it("E622 and nothing extracted when the checksum does not match", async () => {
    const extract = vi.fn();
    const download = vi.fn(async () => new Uint8Array(MELONDS_ZIP_BYTES));
    const exe = exeIn();
    const err = await installMelonDs({ exe, download, extract }).catch((e: unknown) => e);
    expect(codes(err)).toEqual(["E622"]);
    expect(download).toHaveBeenCalledWith(MELONDS_URL, expect.any(AbortSignal));
    expect(extract).not.toHaveBeenCalled();
    expect(existsSync(path.dirname(exe))).toBe(false);
  });

  it("E624 when the download fails", async () => {
    const download = async () => {
      throw new Error("getaddrinfo ENOTFOUND github.com");
    };
    const err = await installMelonDs({ exe: exeIn(), download }).catch((e: unknown) => e);
    expect(codes(err)).toEqual(["E624"]);
    expect((err as Error).message).toContain("ENOTFOUND");
  });

  it("reads a local zip instead of downloading, and checks it the same way", async () => {
    const zip = path.join(mkdtempSync(path.join(tmpdir(), "dsdude-zip-")), "melonDS.zip");
    writeFileSync(zip, "not the release");
    const download = vi.fn();
    const err = await installMelonDs({ exe: exeIn(), zip, download }).catch((e: unknown) => e);
    expect(codes(err)).toEqual(["E622"]);
    expect(download).not.toHaveBeenCalled();
  });

  it("the manager installs melonDS on demand through the same path", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "dsdude-home-"));
    const mgr = new LocalEmulatorManager({
      home,
      download: async () => {
        throw new Error("offline");
      },
    });
    const err = await mgr.ensureInstalled("melonds").catch((e: unknown) => e);
    expect(codes(err)).toEqual(["E624"]);
    expect(existsSync(melonDsExe(home))).toBe(false);
  });
});
