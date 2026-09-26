import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { Diagnostic } from "@dsdude/project-format";
import { describe, expect, it } from "vitest";
import { exitCodeFor, formatDiagnostic, makeCliCommands } from "./cli.ts";
import { toolchainDiagnostic } from "./diagnostics/catalog.ts";

function harness() {
  const out: string[] = [];
  const err: string[] = [];
  const home = mkdtempSync(path.join(tmpdir(), "dsdude-cli-"));
  const commands = makeCliCommands({
    io: { out: (t) => out.push(t), err: (t) => err.push(t) },
    env: { ...process.env, DSDUDE_HOME: home },
  });
  const run = (name: string, argv: string[]) => {
    const cmd = commands.find((c) => c.name === name);
    if (!cmd) throw new Error(`no command ${name}`);
    return cmd.run(argv);
  };
  return { out, err, run, commands };
}

const project: Diagnostic = { ...toolchainDiagnostic("E607", { what: "x", path: "y" }), source: "compiler" };

describe("exit codes (C10)", () => {
  it("0 without errors, 1 for project errors, 2 for any toolchain error", () => {
    expect(exitCodeFor([])).toBe(0);
    expect(exitCodeFor([{ ...project, severity: "warning" }])).toBe(0);
    expect(exitCodeFor([project])).toBe(1);
    expect(exitCodeFor([project, toolchainDiagnostic("E600", { dir: "d" })])).toBe(2);
  });

  it("formats the code after the message", () => {
    expect(formatDiagnostic({ ...project, file: "a.dss", line: 3, col: 4 })).toBe(
      "a.dss:3:4: error: x y does not exist. (E607)",
    );
  });
});

describe("dsdude commands", () => {
  it("registers the C10 toolchain commands", () => {
    expect(harness().commands.map((c) => c.name)).toEqual([
      "toolchain",
      "emulator",
      "build",
      "play",
      "screenshot",
      "doctor",
    ]);
  });

  it("toolchain status --json prints exactly one JSON object", async () => {
    const h = harness();
    const code = await h.run("toolchain", ["status", "--json"]);
    expect(h.out).toHaveLength(1);
    const json = JSON.parse(h.out[0] ?? "") as { ok: boolean; installed: boolean; paths: object };
    expect(typeof json.installed).toBe("boolean");
    expect(code).toBe(json.ok ? 0 : 2);
  });

  it("play --no-build without a built ROM is E609, exit 2", async () => {
    const h = harness();
    const code = await h.run("play", [mkdtempSync(path.join(tmpdir(), "proj-")), "--no-build", "--json"]);
    expect(code).toBe(2);
    expect((JSON.parse(h.out[0] ?? "") as { diagnostics: Diagnostic[] }).diagnostics[0]?.code).toBe("E609");
  });

  it("build of a folder without project.json needs --skip-compile --skip-assets (E608)", async () => {
    const h = harness();
    const code = await h.run("build", [mkdtempSync(path.join(tmpdir(), "proj-")), "--json"]);
    expect(code).toBe(2);
    expect((JSON.parse(h.out[0] ?? "") as { diagnostics: Diagnostic[] }).diagnostics[0]?.code).toBe("E608");
  });

  it("usage errors exit 2 without a stack trace", async () => {
    const h = harness();
    expect(await h.run("screenshot", ["rom.nds"])).toBe(2);
    expect(await h.run("build", ["--bogus"])).toBe(2);
    expect(await h.run("play", ["p", "--emulator", "nope", "--json"])).toBe(2);
    expect(h.err.join("\n")).not.toMatch(/\n\s+at /);
  });
});
