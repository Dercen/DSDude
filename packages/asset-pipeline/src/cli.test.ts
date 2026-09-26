import { existsSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { cliCommands, makeAssetsCommand } from "./cli.ts";
import { copySample, fakeTools, tempDir } from "./testing/fake-tools.ts";

/** Runs `dsdude assets` with captured output and DSDUDE_HOME in a temporary folder. */
async function run(argv: string[], tools?: ReturnType<typeof fakeTools>) {
  const out: string[] = [];
  const err: string[] = [];
  const home = tempDir();
  const cmd = makeAssetsCommand({
    io: { out: (t) => out.push(t), err: (t) => err.push(t) },
    env: { DSDUDE_HOME: home },
    toolPaths: tools?.paths ?? {},
    pack: tools === undefined ? {} : { runTool: tools.run },
  });
  const code = await cmd.run(argv);
  return { code, out, err, home };
}

describe("dsdude assets", () => {
  it("is registered as the `assets` command", () => {
    expect(cliCommands.map((c) => c.name)).toEqual(["assets"]);
  });

  it("exits 2 with E605 and still writes the manifest when the tools are missing (cloud)", async () => {
    const { code, out } = await run([copySample("samples/flappy"), "--json"]);
    expect(code).toBe(2);
    expect(out).toHaveLength(1);
    const result = JSON.parse(out[0] as string);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d: { code: string }) => d.code)).toEqual(["E605", "E605"]);
    expect(existsSync(result.manifestPath)).toBe(true);
    expect(Object.keys(result.manifest.sprites)).toEqual(["spr_bird", "spr_gap", "spr_pipe"]);
  });

  it("exits 0 with the tools and writes into <DSDUDE_HOME>/build/<project-hash>", async () => {
    const { code, out, home } = await run([copySample("samples/flappy"), "--json"], fakeTools(tempDir()));
    expect(code).toBe(0);
    const result = JSON.parse(out[0] as string);
    expect(result.ok).toBe(true);
    expect(path.dirname(result.buildDir)).toBe(path.join(home, "build"));
    expect(existsSync(path.join(result.buildDir, "nitrofs", "soundbank.bin"))).toBe(true);
  });

  it("exits 1 for a folder without project.json, and 2 for a usage mistake", async () => {
    const missing = await run([tempDir(), "--json"]);
    expect(missing.code).toBe(1);
    expect(JSON.parse(missing.out[0] as string).diagnostics[0].code).toBe("E290");
    expect((await run([])).code).toBe(2);
    expect((await run(["a", "b"])).code).toBe(2);
    expect((await run(["--bogus", "x"])).code).toBe(2);
  });

  it("prints a summary on stderr without --json", async () => {
    const { out, err } = await run([copySample("samples/minimal")], fakeTools(tempDir()));
    expect(out).toEqual([]);
    expect(err.at(-1)).toMatch(/^assets: 1 sprites, 0 backgrounds, 0 sounds, no soundbank -> /);
  });
});
