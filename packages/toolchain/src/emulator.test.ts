import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DESMUME_KEYS,
  desmumeOverrides,
  LineSplitter,
  LocalEmulatorManager,
  MELONDS_KEYS,
  melonDsOverrides,
  type ProcessInfo,
  patchIni,
  patchToml,
  RECONCILE_TOLERANCE_MS,
} from "./emulator.ts";
import { desmumeExe, melonDsExe } from "./layout.ts";
import { MELONDS_DEFAULT_TOML } from "./melonds-default.ts";
import { type FakeChild, FIXTURE_ROM, fakeChild } from "./test-support.ts";

describe("LineSplitter", () => {
  it("splits on \\n, accepts \\r\\n, drops DSD|PAD| lines and keeps partial lines", () => {
    const s = new LineSplitter();
    expect(s.push("DSD|LOG|he")).toEqual([]);
    expect(s.push("llo\r\nDSD|PAD|....\nDSD|PAD|..")).toEqual(["DSD|LOG|hello"]);
    expect(s.push("..\nDSD|STAT|fps=60\n")).toEqual(["DSD|STAT|fps=60"]);
    expect(s.push("tail")).toEqual([]);
    expect(s.end()).toEqual(["tail"]);
    expect(s.end()).toEqual([]);
  });
});

describe("melonDS.toml", () => {
  const existing = [
    "RecentROM = [",
    '    "C:\\\\a.nds",',
    "]",
    "LimitFPS = true",
    "",
    "[Instance0.Keyboard]",
    "Up = -1",
    "A = -1",
    "HK_Lid = -1",
    "",
    "[Instance0.Window0]",
    "ShowOSD = true",
    'Geometry = "AdnQ"',
    "IntegerScaling = false",
    "",
    "[3D]",
    "Renderer = 1",
    "",
  ].join("\r\n");

  it("sets DSDude's keys, keeps everything else and keeps the file's CRLF line endings", () => {
    const crlf = patchToml(existing, melonDsOverrides());
    expect(
      crlf
        .split("\r\n")
        .slice(0, -1)
        .every((l) => !l.includes("\n")),
    ).toBe(true);
    const out = crlf.replace(/\r\n/g, "\n");
    expect(out).toContain('RecentROM = [\n    "C:\\\\a.nds",\n]');
    expect(out).toContain('Geometry = "AdnQ"');
    expect(out).toContain("HK_Lid = -1");
    expect(out).toContain(`A = ${MELONDS_KEYS.A}`);
    expect(out).toContain("Start = 16777220");
    expect(out).toContain("IntegerScaling = true");
    expect(out).toContain("ShowOSD = false");
    expect(out).toContain("Renderer = 0");
    expect(out).toMatch(/\[Screen\]\nUseGL = false/);
    expect(out).toMatch(/\[Instance0\.Gdb\]\nEnabled = false/);
    expect(out.match(/^A = /gm)).toHaveLength(1);
  });

  it("is idempotent and writes a fresh file from nothing", () => {
    const once = patchToml(null, melonDsOverrides());
    expect(patchToml(once, melonDsOverrides())).toBe(once);
    expect(once.startsWith("[Instance0.Keyboard]\n")).toBe(true);
  });

  it("desmume.ini gets the same mapping as Windows virtual-key codes under [Controls]", () => {
    const ini = patchIni("[Video]\nWidth=256\n[Controls]\nA=1\n", desmumeOverrides());
    expect(ini).toMatch(/^\[Video\]\nWidth=256\n\[Controls\]\nA=88\n/);
    for (const line of [
      "B=90",
      "X=83",
      "Y=65",
      "L=81",
      "R=87",
      "Start=13",
      "Select=16",
      "Up=38",
      "Down=40",
      "Left=37",
      "Right=39",
    ]) {
      expect(ini).toContain(`${line}\n`);
    }
    expect(Object.keys(DESMUME_KEYS)).toEqual(Object.keys(MELONDS_KEYS));
  });

  it("enables the GDB stub only when asked", () => {
    expect(patchToml(null, melonDsOverrides({ gdb: true }))).toMatch(/\[Instance0\.Gdb\]\nEnabled = true/);
  });
});

describe("LocalEmulatorManager", () => {
  let home = "";
  let children: FakeChild[] = [];
  let kills: string[][] = [];
  let spawns: { exe: string; args: string[]; cwd: string }[] = [];

  const manager = (onKill: (args: string[], child: FakeChild | undefined) => void, extra = {}) =>
    new LocalEmulatorManager({
      home,
      gracefulStopMs: 50,
      spawn: (exe, args, opts) => {
        spawns.push({ exe, args, cwd: opts.cwd });
        const child = fakeChild();
        children.push(child);
        return child;
      },
      taskkill: async (args) => {
        kills.push(args);
        onKill(args, children.at(-1));
      },
      // No real PowerShell in unit tests.
      processInfo: async () => null,
      ...extra,
    });

  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), "dsdude-emu-"));
    for (const exe of [melonDsExe(home), desmumeExe(home)]) {
      mkdirSync(path.dirname(exe), { recursive: true });
      writeFileSync(exe, "");
    }
    children = [];
    kills = [];
    spawns = [];
  });

  it("launches from the emulator folder, writes melonDS.toml and streams lines without pads", async () => {
    const mgr = manager((_args, child) => child?.finish(0));
    const handle = await mgr.launch(FIXTURE_ROM, { kind: "melonds" });
    expect(spawns[0]).toEqual({
      exe: melonDsExe(home),
      args: [path.resolve(FIXTURE_ROM)],
      cwd: path.dirname(melonDsExe(home)),
    });
    expect(readFileSync(path.join(path.dirname(melonDsExe(home)), "melonDS.toml"), "utf8")).toContain("A = 88");
    expect(existsSync(mgr.runningFile)).toBe(true);
    const lines: string[] = [];
    children[0]?.print("DSD|LOG|hello\r\nDSD|PAD|...\n");
    await new Promise((r) => setImmediate(r));
    handle.onLine((l) => lines.push(l));
    await handle.stop();
    expect(kills).toEqual([["/PID", String(handle.pid)]]);
    expect(lines).toEqual(["DSD|LOG|hello"]);
    expect(await handle.exited).toBe(0);
    await new Promise((r) => setImmediate(r));
    expect(existsSync(mgr.runningFile)).toBe(false);
  });

  it("forces /F /T when the emulator ignores the graceful close, and delivers the flushed tail", async () => {
    const mgr = manager((args, child) => {
      if (args[0] === "/F") {
        child?.print("DSD|LOG|tail");
        child?.finish(1);
      }
    });
    const handle = await mgr.launch(FIXTURE_ROM, { kind: "desmume" });
    const lines: string[] = [];
    handle.onLine((l) => lines.push(l));
    await handle.stop();
    expect(kills).toEqual([
      ["/PID", String(handle.pid)],
      ["/F", "/T", "/PID", String(handle.pid)],
    ]);
    expect(lines).toEqual(["DSD|LOG|tail"]);
  });

  it("stops the previous emulator before the next launch", async () => {
    // taskkill closes the newest child, which at the second launch is still the first one.
    const mgr = manager((_args, child) => child?.finish(0));
    const first = await mgr.launch(FIXTURE_ROM, { kind: "melonds" });
    const second = await mgr.launch(FIXTURE_ROM, { kind: "melonds" });
    expect(kills).toEqual([["/PID", String(first.pid)]]);
    // The first exit must not delete the second launch's record.
    expect(JSON.parse(readFileSync(mgr.runningFile, "utf8")).pid).toBe(second.pid);
    expect(await first.exited).toBe(0);
    expect(children).toHaveLength(2);
  });

  it("reconcile kills a recorded emulator only while the PID is still that exe, started at that time", async () => {
    const t = Date.parse("2026-09-26T10:00:00Z");
    const exe = melonDsExe(home);
    const cases: [ProcessInfo | null, boolean, string][] = [
      [{ path: exe.toUpperCase(), startedAt: new Date(t + 800) }, true, "same exe, same start"],
      [{ path: exe, startedAt: new Date(t + RECONCILE_TOLERANCE_MS + 1) }, false, "PID reused later"],
      [{ path: "C:\\other\\melonDS-1.1\\melonDS.exe", startedAt: new Date(t) }, false, "another worktree"],
      [null, false, "no such process"],
    ];
    for (const [info, expectKill, label] of cases) {
      kills = [];
      const mgr = manager(() => {}, { processInfo: async () => info });
      mkdirSync(path.dirname(mgr.runningFile), { recursive: true });
      const rec = { pid: 777, kind: "melonds", exe, rom: "x", startedAt: new Date(t).toISOString() };
      writeFileSync(mgr.runningFile, JSON.stringify(rec));
      expect(await mgr.reconcile(), label).toBe(expectKill);
      expect(kills.length > 0, label).toBe(expectKill);
      if (expectKill) expect(kills[0]).toEqual(["/F", "/T", "/PID", "777"]);
      expect(existsSync(mgr.runningFile)).toBe(false);
    }
  });

  it("records exe and start time at launch", async () => {
    const mgr = manager((_args, child) => child?.finish(0));
    const before = Date.now();
    const handle = await mgr.launch(FIXTURE_ROM, { kind: "melonds" });
    const rec = JSON.parse(readFileSync(mgr.runningFile, "utf8")) as { pid: number; exe: string; startedAt: string };
    expect(rec).toMatchObject({ pid: handle.pid, exe: melonDsExe(home) });
    expect(Date.parse(rec.startedAt)).toBeGreaterThanOrEqual(before);
    await handle.stop();
  });

  it("Debug turns on melonDS's GDB stub; DeSmuME has none (E623)", async () => {
    const mgr = manager((_args, child) => child?.finish(0));
    const handle = await mgr.launch(FIXTURE_ROM, { kind: "melonds", debug: true });
    const toml = readFileSync(path.join(path.dirname(melonDsExe(home)), "melonDS.toml"), "utf8");
    expect(toml).toMatch(/\[Instance0\.Gdb\]\nEnabled = true/);
    expect(toml).toMatch(/\[Instance0\.Gdb\.ARM9\]\n(?:[^[]*\n)?Port = 3333\n/);
    await handle.stop();
    await mgr.launch(FIXTURE_ROM, { kind: "melonds" });
    expect(readFileSync(path.join(path.dirname(melonDsExe(home)), "melonDS.toml"), "utf8")).toMatch(
      /\[Instance0\.Gdb\]\nEnabled = false/,
    );
    await mgr.stopCurrent();
    await expect(mgr.launch(FIXTURE_ROM, { kind: "desmume", debug: true })).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "E623" })],
    });
  });

  it("seeds a missing or empty melonDS.toml with melonDS's defaults (melonDS 1.1 crashes on a partial file)", async () => {
    const mgr = manager((_args, child) => child?.finish(0));
    const file = path.join(path.dirname(melonDsExe(home)), "melonDS.toml");
    for (const before of [null, "", "\r\n"]) {
      if (before !== null) writeFileSync(file, before);
      await mgr.launch(FIXTURE_ROM, { kind: "melonds" });
      await mgr.stopCurrent();
      const toml = readFileSync(file, "utf8");
      expect(toml).toBe(patchToml(MELONDS_DEFAULT_TOML, melonDsOverrides()));
      for (const section of ["[Emu]", "[Instance0.Firmware]", "[Instance0.Joystick]", "[JIT]"]) {
        expect(toml).toContain(`${section}\n`);
      }
      expect(toml).not.toMatch(/RecentROM|Geometry/);
    }
    // A file melonDS wrote itself is patched, never replaced.
    writeFileSync(file, "LimitFPS = false\r\n");
    await mgr.launch(FIXTURE_ROM, { kind: "melonds" });
    await mgr.stopCurrent();
    expect(readFileSync(file, "utf8")).toMatch(/^LimitFPS = false\r\n/);
    expect(readFileSync(file, "utf8")).not.toContain("[JIT]");
  });

  it("writes LaunchOptions.keys into both emulators and falls back per button with E625 (ADR-0007)", async () => {
    const mgr = manager((_args, child) => child?.finish(0));
    const keys = { a: "k", b: "F13", start: " ", select: "Control", up: "I", x: "/" };
    const melon = await mgr.launch(FIXTURE_ROM, { kind: "melonds", keys });
    await mgr.stopCurrent();
    const toml = readFileSync(path.join(path.dirname(melonDsExe(home)), "melonDS.toml"), "utf8");
    const keyboard = /\[Instance0\.Keyboard\]\n([^[]*)/.exec(toml)?.[1] ?? "";
    for (const line of [
      "A = 75",
      "B = 90",
      "X = 47",
      "Start = 32",
      "Select = 16777249",
      "Up = 73",
      "Down = 16777237",
    ]) {
      expect(keyboard).toMatch(new RegExp(`^${line}$`, "m"));
    }
    expect(melon.diagnostics).toEqual([
      expect.objectContaining({
        code: "E625",
        severity: "warning",
        message: "The key 'F13' can't be used for the B button, so B stays on z.",
      }),
    ]);
    const desmume = await mgr.launch(FIXTURE_ROM, { kind: "desmume", keys });
    await mgr.stopCurrent();
    const ini = readFileSync(path.join(path.dirname(desmumeExe(home)), "desmume.ini"), "utf8");
    for (const line of ["A=75", "B=90", "X=191", "Start=32", "Select=17", "Up=73", "Down=40"]) {
      expect(ini).toContain(`${line}\n`);
    }
    expect(desmume.diagnostics?.map((d) => d.code)).toEqual(["E625"]);
    const plain = await mgr.launch(FIXTURE_ROM, { kind: "desmume" });
    expect(plain.diagnostics).toEqual([]);
    expect(readFileSync(path.join(path.dirname(desmumeExe(home)), "desmume.ini"), "utf8")).toContain("A=88\n");
    await mgr.stopCurrent();
  });

  it("E620 when DeSmuME is missing, E607 when the ROM is", async () => {
    const empty = new LocalEmulatorManager({ home: mkdtempSync(path.join(tmpdir(), "dsdude-emu-")) });
    await expect(empty.ensureInstalled("desmume")).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "E620" })],
    });
    const mgr = manager(() => {});
    await expect(mgr.launch(path.join(home, "missing.nds"), { kind: "melonds" })).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ code: "E607" })],
    });
  });

  it("copies DeSmuME from its source folder when missing", async () => {
    const src = mkdtempSync(path.join(tmpdir(), "dsdude-src-"));
    writeFileSync(path.join(src, "DeSmuME_0.9.13_x64.exe"), "exe");
    const fresh = mkdtempSync(path.join(tmpdir(), "dsdude-emu-"));
    const mgr = new LocalEmulatorManager({ home: fresh, desmumeSource: src });
    expect(await mgr.ensureInstalled("desmume")).toBe(desmumeExe(fresh));
    expect(readFileSync(desmumeExe(fresh), "utf8")).toBe("exe");
  });
});
