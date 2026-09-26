import { describe, expect, it } from "vitest";
import { detectToolchain } from "./detect.ts";
import { desmumeExe, melonDsExe, wonderfulLayout } from "./layout.ts";

const layout = wonderfulLayout("C:\\msys64");
const HOME = "C:\\home";
const everything = new Set([
  layout.bash,
  layout.core,
  layout.ndstool,
  layout.grit,
  layout.mmutil,
  layout.arm7Elf,
  layout.icon,
  layout.gcc,
  melonDsExe(HOME),
  "C:\\py\\python.exe",
]);

const detect = (files: Set<string>, platform: NodeJS.Platform = "win32") =>
  detectToolchain({
    platform,
    msys2Root: "C:\\msys64",
    home: HOME,
    env: { Path: "C:\\none;C:\\py" },
    exists: (p) => files.has(p),
    readText: (p) => (p === layout.versionFile ? "v1.24.0-dirty\n" : null),
  });

describe("detectToolchain", () => {
  it("reports every path when everything is there", async () => {
    const status = await detect(everything);
    expect(status).toMatchObject({ installed: true, blocksdsVersion: "1.24.0", diagnostics: [] });
    expect(status.paths).toMatchObject({
      bash: layout.bash,
      ndstool: layout.ndstool,
      arm7Elf: layout.arm7Elf,
      gcc: layout.gcc,
      blocksds: "/opt/wonderful/thirdparty/blocksds/core",
      melonds: melonDsExe(HOME),
      python: "C:\\py\\python.exe",
    });
    expect(status.paths.desmume).toBeUndefined();
    expect(desmumeExe(HOME)).toContain("desmume-0.9.13");
  });

  it("E601 per missing tool", async () => {
    const files = new Set(everything);
    files.delete(layout.grit);
    files.delete(layout.arm7Elf);
    const status = await detect(files);
    expect(status.installed).toBe(false);
    expect(status.blocksdsVersion).toBeNull();
    expect(status.diagnostics.map((d) => d.code)).toEqual(["E601", "E601"]);
    expect(status.diagnostics[0]?.message).toContain("grit");
  });

  it("E600 when BlocksDS is not installed at all", async () => {
    const status = await detect(new Set([layout.bash]));
    expect(status.diagnostics.map((d) => d.code)).toEqual(["E600"]);
  });

  it("never throws off Windows: installed false with E605", async () => {
    const status = await detect(everything, "linux");
    expect(status).toMatchObject({ installed: false, blocksdsVersion: null, paths: {} });
    expect(status.diagnostics.map((d) => d.code)).toEqual(["E605"]);
  });
});
