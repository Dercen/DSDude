import { createHash } from "node:crypto";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bashEnv,
  dsdudeHome,
  parseBlocksdsVersion,
  pathKey,
  projectBuildDir,
  projectHash,
  toolEnv,
  withPathPrefix,
  wonderfulLayout,
} from "./layout.ts";

const layout = wonderfulLayout("C:\\msys64");

describe("wonderfulLayout", () => {
  it("puts every tool under the MSYS2 root", () => {
    expect(layout.bash).toBe("C:\\msys64\\usr\\bin\\bash.exe");
    expect(layout.ndstool).toBe("C:\\msys64\\opt\\wonderful\\thirdparty\\blocksds\\core\\tools\\ndstool\\ndstool.exe");
    expect(layout.arm7Elf).toBe(
      "C:\\msys64\\opt\\wonderful\\thirdparty\\blocksds\\core\\sys\\arm7\\main_core\\arm7_maxmod.elf",
    );
    expect(layout.gcc).toBe("C:\\msys64\\opt\\wonderful\\toolchain\\gcc-arm-none-eabi\\bin\\arm-none-eabi-gcc.exe");
  });
});

describe("PATH handling", () => {
  it("finds the PATH key case-insensitively", () => {
    expect(pathKey({ Path: "x" })).toBe("Path");
    expect(pathKey({ PATH: "x" })).toBe("PATH");
    expect(pathKey({})).toBe("PATH");
  });

  it("prefixes once and keeps the original key", () => {
    const env = withPathPrefix(
      { Path: "C:\\a;C:\\B\\;c:\\msys64\\opt\\wonderful\\bin", HOME: "h" },
      layout.wonderfulBin,
    );
    expect(env.Path).toBe("C:\\msys64\\opt\\wonderful\\bin;C:\\a;C:\\B\\");
    expect(env.PATH).toBeUndefined();
    expect(withPathPrefix(env, layout.wonderfulBin).Path).toBe(env.Path);
  });

  it("tool env only prefixes PATH", () => {
    const env = toolEnv({ PATH: "C:\\x" }, layout);
    expect(env).toEqual({ PATH: "C:\\msys64\\opt\\wonderful\\bin;C:\\x" });
  });

  it("bash env carries CHERE_INVOKING and POSIX BlocksDS paths", () => {
    const env = bashEnv({ Path: "C:\\x", SHLVL: undefined }, layout);
    expect(env).toMatchObject({
      Path: "C:\\msys64\\opt\\wonderful\\bin;C:\\x",
      MSYSTEM: "UCRT64",
      MSYS2_PATH_TYPE: "inherit",
      CHERE_INVOKING: "1",
      BLOCKSDS: "/opt/wonderful/thirdparty/blocksds/core",
      BLOCKSDSEXT: "/opt/wonderful/thirdparty/blocksds/external",
      WONDERFUL_TOOLCHAIN: "/opt/wonderful",
    });
    expect("SHLVL" in env).toBe(false);
  });
});

describe("DSDUDE_HOME and build folders", () => {
  it("prefers DSDUDE_HOME, then LOCALAPPDATA", () => {
    expect(dsdudeHome({ DSDUDE_HOME: "D:\\h", LOCALAPPDATA: "C:\\L" })).toBe("D:\\h");
    expect(dsdudeHome({ LOCALAPPDATA: "C:\\L" })).toBe("C:\\L\\DSDude");
  });

  it("hashes the lower-cased absolute project path to 16 hex digits", () => {
    const dir = path.resolve("Some", "Project");
    const expected = createHash("sha256").update(dir.toLowerCase()).digest("hex").slice(0, 16);
    expect(projectHash(dir)).toBe(expected);
    expect(projectHash(dir.toUpperCase())).toBe(projectHash(dir.toLowerCase()));
    expect(projectBuildDir(dir, "H")).toBe(path.join("H", "build", expected));
  });
});

describe("parseBlocksdsVersion", () => {
  it("reads version.txt", () => {
    expect(parseBlocksdsVersion("v1.24.0-dirty\n")).toBe("1.24.0");
    expect(parseBlocksdsVersion("garbage")).toBeNull();
  });
});
