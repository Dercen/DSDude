import type { CliCommand } from "@dsdude/toolchain";
import { describe, expect, it } from "vitest";
import { commandRegistry, formatHelp, packageName } from "./index.ts";

const cmd = (name: string, summary = name): CliCommand => ({ name, summary, run: async () => 0 });

describe("@dsdude/cli", () => {
  it("exports its package name", () => {
    expect(packageName).toBe("@dsdude/cli");
  });

  it("registers the toolchain commands and loads the optional packages without failing", async () => {
    const names = (await commandRegistry()).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["toolchain", "emulator", "build", "play", "screenshot"]));
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
