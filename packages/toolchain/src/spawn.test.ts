/**
 * Every spawn, mocked: its argv, its env (CHERE_INVOKING=1, the PATH prefix, a POSIX BLOCKSDS), windowsHide (set for
 * tools, absent for emulators) and a timeout. Runs on any OS: no real process starts.
 */
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeChild, FIXTURE_ELF, FIXTURE_ROM, fakeChild } from "./test-support.ts";

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: spawnMock,
}));

const { packRom } = await import("./rom.ts");
const { runMake } = await import("./runtime.ts");
const { takeScreenshot } = await import("./screenshot.ts");
const { spawnEmulator } = await import("./emulator.ts");
const { toolEnv, wonderfulLayout } = await import("./layout.ts");

const layout = wonderfulLayout("C:\\msys64");
const WF_BIN = "C:\\msys64\\opt\\wonderful\\bin";
let dir = "";

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "dsdude-spawn-"));
  spawnMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

type SpawnOpts = {
  env: Record<string, string>;
  windowsHide?: boolean;
  timeout?: number;
  cwd?: string;
  stdio?: unknown;
};
const call = (i = 0) => spawnMock.mock.calls[i] as [string, string[], SpawnOpts];

describe("ndstool (packRom)", () => {
  it("spawns hidden, with a timeout, the Wonderful bin first on PATH and -7 explicit", async () => {
    const nitrofs = path.join(dir, "nitrofs");
    mkdirSync(nitrofs);
    const out = path.join(dir, "out", "game.nds");
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      // ndstool "writes" the ROM: the hello fixture.
      setImmediate(() => {
        copyFileSync(FIXTURE_ROM, out);
        child.finish(0);
      });
      return child;
    });
    const result = await packRom(
      {
        arm9Elf: FIXTURE_ELF,
        nitrofsDir: nitrofs,
        outNds: out,
        title: "hello",
        subtitle: "DSDude",
        author: "DSDude",
        iconPng: null,
        gamecode: "####",
      },
      {
        paths: { ndstool: layout.ndstool, arm7Elf: layout.arm7Elf, icon: layout.icon },
        env: toolEnv({ Path: "C:\\Windows" }, layout),
      },
    );
    const [exe, args, opts] = call();
    expect(exe).toBe(layout.ndstool);
    expect(args.slice(0, 6)).toEqual(["-c", out, "-9", FIXTURE_ELF, "-7", layout.arm7Elf]);
    expect(opts.windowsHide).toBe(true);
    expect(opts.timeout).toBeGreaterThan(0);
    expect(opts.env.Path?.startsWith(`${WF_BIN};`)).toBe(true);
    expect(result.info.nitrofsFiles).toBe(1);
  });

  it("deletes the ROM and reports E602 when a DLL is missing", async () => {
    const nitrofs = path.join(dir, "nitrofs");
    mkdirSync(nitrofs);
    const out = path.join(dir, "game.nds");
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      setImmediate(() => {
        writeFileSync(out, "partial");
        child.finish(0xc0000135);
      });
      return child;
    });
    const packing = packRom(
      {
        arm9Elf: FIXTURE_ELF,
        nitrofsDir: nitrofs,
        outNds: out,
        title: "t",
        subtitle: "",
        author: "",
        iconPng: null,
        gamecode: "####",
      },
      { paths: { ndstool: "nds.exe", arm7Elf: "a7.elf", icon: "i.bmp" }, env: {} },
    );
    await expect(packing).rejects.toMatchObject({ diagnostics: [expect.objectContaining({ code: "E602" })] });
    const { existsSync } = await import("node:fs");
    expect(existsSync(out)).toBe(false);
  });
});

describe("make (runMake / buildRuntime)", () => {
  it("runs bash -lc 'make -jN' hidden, in the Makefile folder, with the Wonderful env", async () => {
    mkdirSync(path.join(dir, "build"));
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      setImmediate(() => {
        writeFileSync(path.join(dir, "build", "hello.elf"), "elf");
        child.finish(0);
      });
      return child;
    });
    const result = await runMake({
      dir,
      elf: path.join("build", "hello.elf"),
      jobs: 4,
      paths: { bash: layout.bash, gcc: layout.gcc },
      layout,
      env: { PATH: "C:\\Windows", SHLVL: undefined },
    });
    const [exe, args, opts] = call();
    expect(exe).toBe("C:\\msys64\\usr\\bin\\bash.exe");
    expect(args).toEqual(["-lc", "make -j4"]);
    expect(opts.cwd).toBe(dir);
    expect(opts.windowsHide).toBe(true);
    expect(opts.timeout).toBeGreaterThan(0);
    expect(opts.env).toMatchObject({
      CHERE_INVOKING: "1",
      MSYSTEM: "UCRT64",
      BLOCKSDS: "/opt/wonderful/thirdparty/blocksds/core",
      PATH: `${WF_BIN};C:\\Windows`,
    });
    expect(result).toMatchObject({ ok: true, arm9Elf: path.join(dir, "build", "hello.elf") });
  });

  it("takes -j from DSDUDE_MAKE_JOBS and reports E640 with the output tail", async () => {
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      setImmediate(() => {
        child.print("main.c:3: error: expected ';'\n");
        child.finish(2);
      });
      return child;
    });
    const result = await runMake({
      dir,
      elf: "x.elf",
      paths: { bash: layout.bash, gcc: layout.gcc },
      layout,
      env: { DSDUDE_MAKE_JOBS: "3" },
    });
    expect(call()[1]).toEqual(["-lc", "make -j3"]);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("E640");
    expect(result.diagnostics[0]?.message).toContain("expected ';'");
  });
});

describe("python (takeScreenshot)", () => {
  it("spawns hidden with a timeout and the SDL dummy drivers", async () => {
    const out = path.join(dir, "shots");
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      setImmediate(() => {
        mkdirSync(out, { recursive: true });
        writeFileSync(
          path.join(out, "screenshot.json"),
          JSON.stringify({ ok: true, top: "t.png", bottom: "b.png", uniform: { top: false, bottom: false } }),
        );
        child.print("junk\nDSD|LOG|hello\nDSD|PAD|....\n");
        child.finish(0);
      });
      return child;
    });
    const shot = await takeScreenshot({ rom: FIXTURE_ROM, frames: 60, out, python: "py.exe", script: "s.py" });
    const [exe, args, opts] = call();
    expect(exe).toBe("py.exe");
    expect(args).toEqual(["s.py", path.resolve(FIXTURE_ROM), "--frames", "60", "--out", path.resolve(out)]);
    expect(opts.windowsHide).toBe(true);
    expect(opts.timeout).toBeGreaterThan(0);
    expect(opts.env).toMatchObject({ SDL_VIDEODRIVER: "dummy", SDL_AUDIODRIVER: "dummy" });
    expect(shot).toMatchObject({ ok: true, top: "t.png", bottom: "b.png", log: ["DSD|LOG|hello"] });
  });

  it("reports E630 when py-desmume is missing", async () => {
    spawnMock.mockImplementation(() => {
      const child = fakeChild();
      setImmediate(() => {
        child.printErr("py-desmume is not installed (No module named 'desmume')\n");
        child.finish(2);
      });
      return child;
    });
    const shot = await takeScreenshot({ rom: FIXTURE_ROM, frames: 1, out: dir, python: "py.exe", script: "s.py" });
    expect(shot.diagnostics.map((d) => d.code)).toEqual(["E630"]);
  });
});

describe("emulators", () => {
  it("spawn with stdio pipe and WITHOUT windowsHide (spike 2)", () => {
    const child: FakeChild = fakeChild();
    spawnMock.mockReturnValue(child);
    spawnEmulator("C:\\e\\melonDS.exe", ["C:\\b\\game.nds"], { cwd: "C:\\e", env: { A: "1" } });
    const [exe, args, opts] = call();
    expect(exe).toBe("C:\\e\\melonDS.exe");
    expect(args).toEqual(["C:\\b\\game.nds"]);
    expect(opts.stdio).toBe("pipe");
    expect(opts.cwd).toBe("C:\\e");
    expect("windowsHide" in opts).toBe(false);
  });
});
