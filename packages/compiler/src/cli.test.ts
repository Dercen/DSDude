import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { cliCommands, makeCompilerCliCommands } from "./cli.ts";
import { REPO_ROOT, readBytes } from "./golden.ts";

/** A scratch folder for outputs, removed after the tests. */
const scratch = mkdtempSync(join(tmpdir(), "dsdude-compile-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Runs `dsdude compile` with captured output. */
async function run(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const [compile] = makeCompilerCliCommands({
    io: { out: (t) => out.push(t), err: (t) => err.push(t) },
    env: { DSDUDE_HOME: scratch },
  });
  const code = await compile?.run(argv);
  return { code, out, err };
}

describe("dsdude compile", () => {
  it("is exported as the compile command", () => {
    expect(cliCommands.map((c) => c.name)).toEqual(["compile"]);
  });

  it("writes the same DSDB as the golden and prints one JSON object with --json", async () => {
    const output = join(scratch, "flappy", "game.dsdb");
    const r = await run([join(REPO_ROOT, "samples", "flappy"), "-o", output, "--json"]);
    expect(r.code).toBe(0);
    expect(r.out).toHaveLength(1);
    const result = JSON.parse(r.out[0] as string);
    expect(result).toMatchObject({
      ok: true,
      diagnostics: [],
      output,
      bytes: readBytes("fixtures/compiler/samples/flappy.dsdb").length,
    });
    expect(new Uint8Array(readFileSync(output))).toEqual(readBytes("fixtures/compiler/samples/flappy.dsdb"));
  });

  it("defaults the output to <DSDUDE_HOME>/build/<project-hash>/nitrofs/game.dsdb", async () => {
    const r = await run([join(REPO_ROOT, "samples", "minimal")]);
    expect(r.code).toBe(0);
    expect(r.err.at(-1)).toMatch(/[\\/]build[\\/][0-9a-f]{16}[\\/]nitrofs[\\/]game\.dsdb \(\d+ bytes\) in \d+ ms$/);
  });

  it("stamps --seed into the header", async () => {
    const output = join(scratch, "seeded.dsdb");
    expect((await run([join(REPO_ROOT, "samples", "minimal"), "-o", output, "--seed", "1234"])).code).toBe(0);
    const bytes = readFileSync(output);
    expect(bytes.readUInt32LE(12)).toBe(1234);
  });

  it("exits 1 with the diagnostics when the code has errors", async () => {
    const project = join(scratch, "broken");
    cpSync(join(REPO_ROOT, "samples", "minimal"), project, { recursive: true });
    const step = join(project, "objects", "obj_player", "step.dss");
    writeFileSync(step, "x = (1 +\n");
    const r = await run([project, "--json"]);
    expect(r.code).toBe(1);
    const result = JSON.parse(r.out[0] as string);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((d: { code: string }) => d.code)).toEqual(["E112"]);
    expect(r.err[0]).toMatch(/^objects\/obj_player\/step\.dss:1:\d+: error: /);
  });

  it("exits 2 with a usage line on wrong arguments", async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(["a", "b"])).code).toBe(2);
    expect((await run(["a", "--seed", "x"])).code).toBe(2);
    expect((await run(["a", "--bogus"])).code).toBe(2);
  });
});
