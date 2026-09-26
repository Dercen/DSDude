/**
 * Integration tests with the real BlocksDS 1.24.0 grit and mmutil. They run only where detectToolchain() finds
 * them (WS0's Windows integration); in a cloud session they skip and print `skipped: no ToolPaths`.
 */
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { loadProject } from "@dsdude/project-format/node";
import { detectToolchain, type ToolPaths } from "@dsdude/toolchain";
import { beforeAll, describe, expect, it } from "vitest";
import { addSound, copySample, tempDir } from "../testing/fake-tools.ts";
import { readRepoFile } from "../testing/golden.ts";
import { packAssets } from "./pack.ts";

let paths: ToolPaths = {};
beforeAll(async () => {
  paths = (await detectToolchain()).paths;
  if (paths.grit === undefined || paths.mmutil === undefined) console.log("skipped: no ToolPaths");
});

/** Every file under a folder, relative path -> bytes. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = path.join(entry.parentPath, entry.name);
    out[path.relative(dir, full)] = readFileSync(full).toString("hex");
  }
  return out;
}

const hasTools = () => paths.grit !== undefined && paths.mmutil !== undefined;
/** Real tool runs on Windows are slower than the unit tests. */
const REAL_TOOL_TEST_TIMEOUT_MS = 120_000;

describe("real grit and mmutil", () => {
  it(
    "packs samples/flappy plus the XM fixture into byte-identical files on two clean runs",
    async (ctx) => {
      if (!hasTools()) ctx.skip();
      const dir = copySample("samples/flappy");
      addSound(dir, "mus_tune", "music", "tune.xm", readRepoFile("fixtures/assets/tune.xm"));
      const loaded = await loadProject(dir);
      if (loaded.project === null) throw new Error("project did not load");
      const a = tempDir();
      const b = tempDir();
      const first = await packAssets(loaded.project, paths, a);
      const second = await packAssets(loaded.project, paths, b);
      expect(first.diagnostics).toEqual([]);
      expect(second.diagnostics).toEqual([]);
      expect(snapshot(path.join(b, "nitrofs"))).toEqual(snapshot(path.join(a, "nitrofs")));
      // grit wrote RIFF/"GRF " files; mmutil's header gave every id and the bank parsed exactly.
      const grf = readFileSync(path.join(a, "nitrofs/gfx/spr_bird.grf"));
      expect(grf.subarray(0, 4).toString("latin1")).toBe("RIFF");
      expect(grf.subarray(8, 12).toString("latin1")).toBe("GRF ");
      expect(first.manifest.tools.grit).toMatch(/^1\.24\./);
      expect(first.manifest.sounds.mus_tune).toMatchObject({ id: 0, kind: "music", estimated: false });
      expect(Object.values(first.manifest.sounds).every((s) => !s.estimated)).toBe(true);
    },
    REAL_TOOL_TEST_TIMEOUT_MS,
  );
});
