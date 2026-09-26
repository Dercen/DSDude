import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type Change,
  checkChanges,
  feedbackSection,
  globToRegExp,
  isGenerated,
  type Ownership,
  onlyAddsLines,
  ownersOf,
  statusFileStream,
} from "./check-ownership.ts";

const root = resolve(import.meta.dirname, "..");
const own = JSON.parse(readFileSync(resolve(root, "tools/ownership.json"), "utf8")) as Ownership;
const tags =
  (...t: string[]) =>
  (tag: string) =>
    t.includes(tag);
const preTag = tags();
const postTag = tags("phase0");
const noContent = () => ({ before: null, after: null });
const add = (path: string): Change => ({ status: "A", path });
const mod = (path: string): Change => ({ status: "M", path });

describe("globs", () => {
  it("matches ** across segments and * within one", () => {
    expect(globToRegExp("packages/cli/**").test("packages/cli/src/main.ts")).toBe(true);
    expect(globToRegExp("fixtures/**/*.dsdb").test("fixtures/bytecode/hello.dsdb")).toBe(true);
    expect(globToRegExp("fixtures/**/*.dsdb").test("fixtures/hello.dsdb")).toBe(true);
    expect(globToRegExp("tools/*.test.ts").test("tools/gen-docs/a.test.ts")).toBe(false);
    expect(globToRegExp("LICENSE*").test("LICENSE")).toBe(true);
  });
});

describe("the Phase-0 tree after the tag", () => {
  const files = execFileSync("git", ["ls-files", "--cached"], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
  })
    .split("\n")
    .filter(Boolean);

  it("gives every file an owner", () => {
    const orphans = files.filter(
      (f) => !ownersOf(f, own, postTag).length && !statusFileStream(f, own) && !isGenerated(f, own),
    );
    expect(orphans).toEqual([]);
  });

  it("assigns the tricky paths as PLAN.md 3.4 says", () => {
    const o = (p: string) => ownersOf(p, own, postTag);
    expect(o("runtime/tsconfig.json")).toEqual(["WS3"]);
    expect(o("runtime/vitest.config.ts")).toEqual(["WS3"]);
    expect(o("runtime/src/index.ts")).toEqual(["WS3"]);
    expect(o("runtime/CLAUDE.md")).toEqual(["WS2"]);
    expect(o("runtime/LICENSE")).toEqual(["WS0"]);
    expect(o("fixtures/conformance/v0/01-arith.dss")).toEqual(["WS4"]);
    expect(o("fixtures/conformance/expected/v0/01-arith.log")).toEqual(["WS2"]);
    expect(o("fixtures/runtime-core/flappy-nitrofs/gfx/spr_bird.grf")).toEqual(["WS0"]);
    expect(o("fixtures/assets/golden/top.png")).toEqual(["WS0"]);
    expect(o("fixtures/assets/sprite16x16x3.png")).toEqual(["WS5"]);
    expect(o("tools/tsconfig.json")).toEqual(["WS0"]);
    expect(o("tsconfig.json")).toEqual(["WS0"]);
    expect(o("samples/flappy/project.json")).toEqual(["WS4"]);
    expect(ownersOf("samples/flappy/project.json", own, tags("phase0", "m2"))).toEqual(["WS7"]);
    expect(o("apps/ide/src/renderer/editors/sprite.tsx").sort()).toEqual(["WS6", "WS6b"]);
    expect(ownersOf("apps/ide/src/renderer/editors/x.tsx", own, tags("phase0", "start-ws6b"))).toEqual(["WS6b"]);
    expect(o("packages/cli/src/main.ts")).toEqual(["WS1"]);
    expect(ownersOf("packages/cli/src/main.ts", own, tags("phase0", "start-ws8"))).toEqual(["WS8"]);
    expect(o("contracts/opcodes.json").sort()).toEqual(["WS0", "WS4"]);
    expect(ownersOf("contracts/opcodes.json", own, tags("phase0", "start-ws4"))).toEqual(["WS4"]);
  });
});

describe("checkChanges", () => {
  it("before the tag: WS0 anywhere except WS1's entries (beyond the skeletons); WS1 its own", () => {
    expect(checkChanges("WS0", [add("runtime/core/vm.c")], own, preTag, noContent)).toEqual([]);
    expect(checkChanges("WS0", [mod("packages/toolchain/src/api.ts")], own, preTag, noContent)).toEqual([]);
    expect(checkChanges("WS0", [add("packages/toolchain/src/spawn.ts")], own, preTag, noContent)).toHaveLength(1);
    expect(checkChanges("WS1", [add("packages/toolchain/src/spike.ts")], own, preTag, noContent)).toEqual([]);
    expect(checkChanges("WS1", [add("runtime/core/spike.c")], own, preTag, noContent)).toHaveLength(1);
  });

  it("after the tag: WS0 keeps only its rows", () => {
    expect(checkChanges("WS0", [add("runtime/core/vm.c")], own, postTag, noContent)).toHaveLength(1);
    expect(checkChanges("WS0", [mod("CLAUDE.md")], own, postTag, noContent)).toEqual([]);
  });

  it("generated paths pass only with an input in the same commit", () => {
    const gen = [mod("runtime/gen/opcodes.h")];
    expect(checkChanges("WS4", gen, own, postTag, noContent)).toHaveLength(1);
    expect(checkChanges("WS4", [...gen, mod("contracts/opcodes.json")], own, postTag, noContent)).toEqual([]);
    const dsdb = [mod("fixtures/compiler/x/game.dsdb"), mod("fixtures/compiler/x/game.dsda")];
    expect(checkChanges("WS4", dsdb, own, postTag, noContent)).toEqual([]);
    expect(checkChanges("WS5", [mod("fixtures/compiler/x/game.dsdb")], own, postTag, noContent)).toHaveLength(1);
  });

  it("CHANGELOG is append-only for contract owners", () => {
    const before = "# CHANGELOG\n\n## C2\n- a\n\n## C4\n- b\n";
    const ok = () => ({ before, after: "# CHANGELOG\n\n## C2\n- a\n- new\n\n## C4\n- b\n" });
    const bad = () => ({ before, after: "# CHANGELOG\n\n## C2\n- A\n\n## C4\n- b\n" });
    expect(checkChanges("WS7", [mod("contracts/CHANGELOG.md")], own, postTag, ok)).toEqual([]);
    expect(checkChanges("WS7", [mod("contracts/CHANGELOG.md")], own, postTag, bad)).toHaveLength(1);
  });

  it("new ADRs from any stream; edits to existing ones are WS0's", () => {
    expect(checkChanges("WS5", [add("docs/adr/0007-x.md")], own, postTag, noContent)).toEqual([]);
    expect(checkChanges("WS5", [mod("docs/adr/0001-flappy-pipe-geometry.md")], own, postTag, noContent)).toHaveLength(
      1,
    );
    expect(checkChanges("WS0", [mod("docs/adr/0001-flappy-pipe-geometry.md")], own, postTag, noContent)).toEqual([]);
  });

  it("WS7 may change only doc/example fields of builtins.json", () => {
    const b = {
      contract: "C2",
      version: "0.1.0",
      entries: [{ id: 0, name: "floor", doc: "TODO(WS7)", example: "TODO(WS7)" }],
    };
    const withDoc = { ...b, entries: [{ ...b.entries[0], doc: "Rounds down." }] };
    const withName = { ...b, entries: [{ ...b.entries[0], name: "flor" }] };
    const c = (after: object) => () => ({ before: JSON.stringify(b), after: JSON.stringify(after) });
    expect(checkChanges("WS7", [mod("contracts/builtins.json")], own, postTag, c(withDoc))).toEqual([]);
    expect(checkChanges("WS7", [mod("contracts/builtins.json")], own, postTag, c(withName))).toHaveLength(1);
    expect(checkChanges("WS4", [mod("contracts/builtins.json")], own, postTag, c(withDoc))).toHaveLength(1);
  });

  it("status files: the stream above the heading, WS0 appends below it", () => {
    const base = "# WS4 status\n\nprogress\n\n## Integration feedback\n";
    const streamEdit = () => ({ before: base, after: base.replace("progress", "progress 2") });
    const streamBad = () => ({ before: base, after: `${base}- IF-1 fake\n` });
    const ws0Append = () => ({ before: base, after: `${base}- IF-1 2026-10-01 checkpoint-1 @abc: x failed\n` });
    const ws0Bad = () => ({ before: base, after: base.replace("progress", "edited") });
    const p = [mod("docs/status/ws4.md")];
    expect(checkChanges("WS4", p, own, postTag, streamEdit)).toEqual([]);
    expect(checkChanges("WS4", p, own, postTag, streamBad)).toHaveLength(1);
    expect(checkChanges("WS0", p, own, postTag, ws0Append)).toEqual([]);
    expect(checkChanges("WS0", p, own, postTag, ws0Bad)).toHaveLength(1);
    expect(checkChanges("WS5", p, own, postTag, streamEdit)).toHaveLength(1);
    const ws1 = () => ({ before: "# WS1\n\nnotes\n", after: "# WS1\n\nnotes\n\n## Integration feedback\n" });
    expect(checkChanges("WS0", [mod("docs/status/ws1.md")], own, preTag, ws1)).toEqual([]);
  });

  it("helpers", () => {
    expect(onlyAddsLines("a\nb\n", "a\nx\nb\n")).toBe(true);
    expect(onlyAddsLines("a\nb\n", "b\na\n")).toBe(false);
    expect(feedbackSection("x\n## Integration feedback\n- IF-1\n", "## Integration feedback")).toBe(
      "## Integration feedback\n- IF-1\n",
    );
  });
});
