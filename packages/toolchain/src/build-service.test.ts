/**
 * LocalBuildService through createFakeToolchain(): the real pipeline with fake tools and fake WS4/WS5 functions.
 * Runs on any OS.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Diagnostic, Project } from "@dsdude/project-format";
import { describe, expect, it, vi } from "vitest";
import type { AssetManifest, BuildEvent, BuildServiceDeps, CompileOutput } from "./api.ts";
import { toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { createFakeToolchain } from "./fake-toolchain.ts";
import { MOCK_EMULATOR_LINES } from "./mock-build-service.ts";
import { MANIFEST_JSON } from "./project-build.ts";
import { readRomHeader } from "./rom.ts";
import { FIXTURE_ELF, FIXTURE_ROM } from "./test-support.ts";

const HELLO = fileURLToPath(new URL("../../../samples/hello", import.meta.url));
const MINIMAL = fileURLToPath(new URL("../../../samples/minimal", import.meta.url));
const home = () => mkdtempSync(path.join(tmpdir(), "dsdude-bs-"));
const phases = (events: BuildEvent[]) => events.map((e) => e.phase);

/** A 32-byte DSDB header (C2) plus a body, magic "DSDB", seed 0. */
function fakeDsdb(): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x44, 0x53, 0x44, 0x42], 0);
  new DataView(b.buffer).setUint32(16, b.length, true);
  return b;
}

const compileError: Diagnostic = {
  severity: "error",
  code: "E101",
  message: "The line ends before the ( is closed.",
  hint: null,
  file: "objects/obj_player/step.dss",
  line: 1,
  col: 1,
  endLine: null,
  endCol: null,
  source: "compiler",
};

function fakeDeps(opts: { compileDiagnostics?: Diagnostic[]; icon?: boolean } = {}) {
  const manifest: AssetManifest = {
    provisional: true,
    sprites: { spr_player: { id: 0, frames: 1, frameWidth: 16, frameHeight: 16, colorMode: "256" } },
    backgrounds: {},
    sounds: {},
  };
  const deps = {
    packAssets: vi.fn(async (_project: unknown, _paths: unknown, outDir: string) => {
      mkdirSync(path.join(outDir, "nitrofs", "gfx"), { recursive: true });
      writeFileSync(path.join(outDir, "nitrofs", "gfx", "spr_player.grf"), "grf");
      if (opts.icon) writeFileSync(path.join(outDir, "icon.png"), "png");
      return { manifest, diagnostics: [] };
    }),
    compile: vi.fn(
      (_project: Project, _manifest: AssetManifest): CompileOutput => ({
        dsdb: opts.compileDiagnostics ? new Uint8Array() : fakeDsdb(),
        roomSets: [
          {
            room: "rm_main",
            screens: { top: { sprites: ["spr_player"], backgrounds: [] }, bottom: { sprites: [], backgrounds: [] } },
            sounds: [],
          },
        ],
        diagnostics: opts.compileDiagnostics ?? [],
      }),
    ),
    checkRoomBudgets: vi.fn((m: AssetManifest) => ({ manifest: { ...m, sounds: { ...m.sounds } }, diagnostics: [] })),
  } satisfies BuildServiceDeps;
  return { deps, manifest };
}

describe("plain BlocksDS folder (samples/hello)", () => {
  it("copies nitrofs, packs game.nds and writes packrom.json", async () => {
    const fake = createFakeToolchain({ home: home() });
    const events: BuildEvent[] = [];
    fake.service.onEvent((e) => events.push(e));
    const res = await fake.service.build({
      projectDir: HELLO,
      runtime: FIXTURE_ELF,
      skipCompile: true,
      skipAssets: true,
    });
    expect(res.ok).toBe(true);
    const buildDir = fake.service.buildDir(HELLO);
    expect(res.ndsPath).toBe(path.join(buildDir, "game.nds"));
    expect(readFileSync(path.join(buildDir, "nitrofs", "hello.txt"), "utf8")).toBe("hello\n");
    expect(fake.packs[0]).toMatchObject({ title: "hello", subtitle: "DSDude", iconPng: null, arm9Elf: FIXTURE_ELF });
    const record = JSON.parse(readFileSync(path.join(buildDir, "packrom.json"), "utf8"));
    expect(record).toMatchObject({ rom: "game.nds", title: "hello", nitrofsFiles: 1 });
    expect([...new Set(phases(events))]).toEqual(["load", "assets", "runtime", "pack", "done"]);
    expect(events.at(-1)?.progress).toBe(1);
  });

  it("needs --skip-compile --skip-assets (E608)", async () => {
    const res = await createFakeToolchain({ home: home() }).service.build({ projectDir: HELLO, runtime: FIXTURE_ELF });
    expect(res.diagnostics.map((d) => d.code)).toEqual(["E608"]);
  });

  it("builds the runtime when no --runtime is given", async () => {
    const res = await createFakeToolchain({ home: home() }).service.build({
      projectDir: HELLO,
      skipCompile: true,
      skipAssets: true,
    });
    expect(res.ok).toBe(true);
  });

  it("play launches the emulator and streams its lines as running events; stop ends it", async () => {
    const fake = createFakeToolchain({ home: home() });
    const logged: string[] = [];
    fake.service.onEvent((e) => e.phase === "running" && logged.push(...e.log));
    const res = await fake.service.play({
      projectDir: HELLO,
      runtime: FIXTURE_ELF,
      skipCompile: true,
      skipAssets: true,
      emulator: "desmume",
    });
    expect(res.ok).toBe(true);
    expect(fake.launches).toEqual([{ romPath: res.ndsPath, kind: "desmume", debug: false }]);
    expect(logged).toEqual([...MOCK_EMULATOR_LINES]);
    await fake.service.stop();
    expect(await res.emulator?.exited).toBe(0);
  });

  it("Debug with DeSmuME fails with E623 and launches nothing", async () => {
    const fake = createFakeToolchain({ home: home() });
    const res = await fake.service.play({
      projectDir: HELLO,
      runtime: FIXTURE_ELF,
      skipCompile: true,
      skipAssets: true,
      emulator: "desmume",
      debug: true,
    });
    expect(res.ok).toBe(false);
    expect(res.emulator).toBeNull();
    expect(res.diagnostics.map((d) => d.code)).toEqual(["E623"]);
    expect(fake.launches).toEqual([]);
  });

  it("a ROM whose NitroFS! mark is missing fails the build with E613 and is removed", async () => {
    const rom = new Uint8Array(readFileSync(FIXTURE_ROM));
    const header = readRomHeader(rom);
    if (!header) throw new Error("no header");
    rom.fill(0, header.magicOffset, header.magicOffset + 8);
    const fake = createFakeToolchain({ home: home(), rom });
    const res = await fake.service.build({
      projectDir: HELLO,
      runtime: FIXTURE_ELF,
      skipCompile: true,
      skipAssets: true,
    });
    expect(res.diagnostics.map((d) => d.code)).toEqual(["E613"]);
    expect(existsSync(fake.service.romPath(HELLO))).toBe(false);
  });

  it("a tool failure is reported, not thrown", async () => {
    const fake = createFakeToolchain({ home: home(), packFailure: [toolchainDiagnostic("E602", { tool: "ndstool" })] });
    const res = await fake.service.build({
      projectDir: HELLO,
      runtime: FIXTURE_ELF,
      skipCompile: true,
      skipAssets: true,
    });
    expect(res).toMatchObject({ ok: false, ndsPath: null });
    expect(res.diagnostics.map((d) => d.code)).toEqual(["E602"]);
  });
});

describe("DSDude project (samples/minimal)", () => {
  it("assets -> compile -> budgets -> runtime -> pack, with the seed patched into game.dsdb", async () => {
    const { deps, manifest } = fakeDeps({ icon: true });
    const fake = createFakeToolchain({ home: home(), deps });
    const events: BuildEvent[] = [];
    fake.service.onEvent((e) => events.push(e));
    const res = await fake.service.build({ projectDir: MINIMAL, runtime: FIXTURE_ELF, seed: 7 });
    expect(res.ok).toBe(true);
    const buildDir = fake.service.buildDir(MINIMAL);
    expect(deps.packAssets).toHaveBeenCalledWith(
      expect.objectContaining({ project: expect.objectContaining({ name: "minimal" }) }),
      fake.status.paths,
      buildDir,
    );
    expect(deps.compile).toHaveBeenCalledWith(expect.anything(), manifest);
    expect(deps.checkRoomBudgets).toHaveBeenCalledWith(manifest, deps.compile.mock.results[0]?.value.roomSets);
    const dsdb = readFileSync(path.join(buildDir, "nitrofs", "game.dsdb"));
    expect(dsdb.subarray(0, 4).toString("latin1")).toBe("DSDB");
    expect(dsdb.readUInt32LE(12)).toBe(7);
    expect(JSON.parse(readFileSync(path.join(buildDir, MANIFEST_JSON), "utf8"))).toEqual(manifest);
    expect(fake.packs[0]).toMatchObject({
      title: "Minimal",
      subtitle: "Move with the D-pad",
      author: "DSDude",
      gamecode: "####",
      iconPng: path.join(buildDir, "icon.png"),
      nitrofsDir: path.join(buildDir, "nitrofs"),
    });
    expect([...new Set(phases(events))]).toEqual(["load", "assets", "compile", "budgets", "runtime", "pack", "done"]);
  });

  it("a compile error stops before the runtime and pack (and would exit 1)", async () => {
    const { deps } = fakeDeps({ compileDiagnostics: [compileError] });
    const fake = createFakeToolchain({ home: home(), deps });
    const res = await fake.service.build({ projectDir: MINIMAL, runtime: FIXTURE_ELF });
    expect(res).toMatchObject({ ok: false, ndsPath: null, diagnostics: [compileError] });
    expect(deps.checkRoomBudgets).not.toHaveBeenCalled();
    expect(fake.packs).toEqual([]);
    expect(existsSync(path.join(fake.service.buildDir(MINIMAL), "nitrofs", "game.dsdb"))).toBe(false);
  });

  it("--skip-compile --skip-assets reuses the last build without the compiler, re-seeding game.dsdb", async () => {
    const dir = home();
    const { deps } = fakeDeps();
    expect(
      (await createFakeToolchain({ home: dir, deps }).service.build({ projectDir: MINIMAL, runtime: FIXTURE_ELF })).ok,
    ).toBe(true);
    const again = createFakeToolchain({ home: dir });
    const res = await again.service.build({
      projectDir: MINIMAL,
      runtime: FIXTURE_ELF,
      skipCompile: true,
      skipAssets: true,
      seed: 99,
    });
    expect(res.ok).toBe(true);
    expect(readFileSync(path.join(again.service.buildDir(MINIMAL), "nitrofs", "game.dsdb")).readUInt32LE(12)).toBe(99);
    expect(again.packs[0]?.iconPng).toBeNull();
  });

  it("the skip flags on a project never built are E609", async () => {
    const res = await createFakeToolchain({ home: home() }).service.build({
      projectDir: MINIMAL,
      runtime: FIXTURE_ELF,
      skipCompile: true,
      skipAssets: true,
    });
    expect(res.diagnostics.map((d) => d.code)).toEqual(["E609"]);
  });

  it("without the compiler wired in, a full build is E641", async () => {
    const res = await createFakeToolchain({ home: home() }).service.build({
      projectDir: MINIMAL,
      runtime: FIXTURE_ELF,
    });
    expect(res.diagnostics.map((d) => d.code)).toEqual(["E641"]);
  });

  it("compileOnly compiles against a provisional manifest when nothing was built, and writes nothing", async () => {
    const { deps } = fakeDeps();
    const fake = createFakeToolchain({ home: home(), deps });
    const res = await fake.service.compileOnly({ projectDir: MINIMAL });
    expect(res).toMatchObject({ ok: true, ndsPath: null });
    expect(deps.packAssets).not.toHaveBeenCalled();
    const manifest = deps.compile.mock.calls[0]?.[1] as AssetManifest;
    expect(manifest.sprites.spr_player).toMatchObject({ id: 0, frames: expect.any(Number) });
    expect(existsSync(fake.service.buildDir(MINIMAL))).toBe(false);
  });

  it("cancel() during assets ends the build as cancelled, and the next build works", async () => {
    const { deps } = fakeDeps();
    // Only the first packAssets call waits for release(); the build after the cancel runs straight through.
    let release: () => void = () => {};
    let first = true;
    const slow = {
      ...deps,
      packAssets: vi.fn(async (...args: Parameters<typeof deps.packAssets>) => {
        if (first) {
          first = false;
          await new Promise<void>((r) => {
            release = r;
          });
        }
        return deps.packAssets(...args);
      }),
    };
    const fake = createFakeToolchain({ home: home(), deps: slow });
    const events: BuildEvent[] = [];
    fake.service.onEvent((e) => events.push(e));
    const building = fake.service.build({ projectDir: MINIMAL, runtime: FIXTURE_ELF });
    await vi.waitFor(() => expect(slow.packAssets).toHaveBeenCalled());
    fake.service.cancel();
    release();
    const res = await building;
    expect(res).toMatchObject({ ok: false, ndsPath: null });
    expect(events.at(-1)?.phase).toBe("cancelled");
    expect(deps.compile).not.toHaveBeenCalled();
    const next = await fake.service.build({ projectDir: MINIMAL, runtime: FIXTURE_ELF });
    expect(next.ok).toBe(true);
  });
});
