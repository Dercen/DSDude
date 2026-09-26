import type { CliCommand } from "@dsdude/toolchain";
import { describe, expect, it } from "vitest";
import { commandRegistry, defaultSources, formatHelp, packageName, resolveBuildDeps } from "./index.ts";

const cmd = (name: string, summary = name): CliCommand => ({ name, summary, run: async () => 0 });

describe("@dsdude/cli", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@dsdude/cli");
  });

  it("registers the toolchain commands and loads the optional packages without failing", async () => {
    const names = (await commandRegistry()).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["toolchain", "emulator", "build", "play", "screenshot"]));
  });

  it("injects the build functions only when all three exist", async () => {
    const fn = () => undefined;
    const today = await resolveBuildDeps();
    expect(today.deps === null).toBe(today.missing.length > 0);
    const partial = await resolveBuildDeps(async (pkg) => (pkg === "@dsdude/compiler" ? { compileProject: fn } : {}));
    expect(partial).toEqual({
      deps: null,
      missing: ["@dsdude/asset-pipeline packAssets", "@dsdude/asset-pipeline checkRoomBudgets"],
    });
    const all = await resolveBuildDeps(async (pkg) =>
      pkg === "@dsdude/compiler" ? { compileProject: fn } : { packAssets: fn, checkRoomBudgets: fn },
    );
    expect(all).toEqual({ deps: { compile: fn, packAssets: fn, checkRoomBudgets: fn }, missing: [] });
  });

  it("picks up cliCommands from the optional packages", async () => {
    const extra = cmd("compile");
    const list = await commandRegistry(
      defaultSources(async (pkg) => (pkg === "@dsdude/compiler" ? { cliCommands: [extra] } : {})),
    );
    expect(list.map((c) => c.name)).toEqual([
      "toolchain",
      "emulator",
      "build",
      "play",
      "screenshot",
      "doctor",
      "compile",
    ]);
  });

  it("keeps the first command of a name", async () => {
    const first = cmd("build", "first");
    const list = await commandRegistry([async () => [first], async () => [cmd("build", "second"), cmd("compile")]]);
    expect(list).toEqual([first, expect.objectContaining({ name: "compile" })]);
  });

  it("formats help with aligned summaries and the exit codes", () => {
    const help = formatHelp([cmd("a", "one"), cmd("longer", "two")]);
    expect(help).toContain("exit codes: 0 ok, 1 project errors, 2 tool or environment failure");
    expect(help).toContain("  a       one");
    expect(help).toContain("  longer  two");
  });
});
