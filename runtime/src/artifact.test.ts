import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  formatReport,
  formatVersion,
  ITCM_CEILING_BYTES,
  memoryReport,
  parseNm,
  parseSizeA,
  parseVersion,
  readAbiHash,
  reportProblems,
  runtimeTreeHash,
} from "./artifact.ts";

// Captured from the first dist/arm9-debug.elf (BlocksDS 1.24.0, 2026-09-26), shortened.
const SIZE_A = `dist/arm9-debug.elf  :
section              size       addr
.crt0                 512   33554432
.text               57024   33573640
.rodata              7364   33630672
.data                1352   33638048
.dtcm                   0   50293696
.itcm                1088   16777216
.sbss                   0   50293696
.bss                 7680   33639400
.twl                  872   33647124
.debug_info        123456          0
Total              845776
`;

const NM = `00001200 A __dtcm_data_size
02ff6bc0 A __dtcm_data_start
02ff4000 R __dtcm_start
02016a14 A __end__
01000440 A __itcm_end
02ff6bc0 A __sp_usr
         U some_undefined
02016544 B fake_heap_end
`;

describe("memory report", () => {
  const report = memoryReport(parseSizeA(SIZE_A), parseNm(NM));

  it("reads ITCM, DTCM, the C stack and the image from size -A and nm", () => {
    expect(report).toEqual({ itcm: 1088, dtcm: 0, dtcmData: 0x1200, cstack: 11200, image: 0x16a14 });
  });

  it("ignores header, Total and undefined-symbol lines", () => {
    expect(Object.keys(parseSizeA(SIZE_A))).not.toContain("Total");
    expect(parseNm(NM).has("some_undefined")).toBe(false);
  });

  it("flags ITCM over 24 KB, DTCM data over its reservation and an image over 0.7 MB", () => {
    expect(reportProblems(report)).toEqual([]);
    const bad = { ...report, itcm: ITCM_CEILING_BYTES + 4, dtcm: 0x1204, image: 800 * 1024 };
    expect(reportProblems(bad)).toHaveLength(3);
    expect(reportProblems({ ...report, itcm: ITCM_CEILING_BYTES })).toEqual([]);
  });

  it("fails loudly when a layout symbol is missing", () => {
    expect(() => memoryReport(parseSizeA(SIZE_A), parseNm("02016a14 A __end__\n"))).toThrow(/__dtcm_data_size/);
  });

  it("prints one line per figure", () => {
    expect(formatReport(report).split("\n")).toHaveLength(4);
    expect(formatReport(report)).toContain("itcm   1088 B (1.1 KB of 24.0 KB)");
  });
});

describe("VERSION", () => {
  it("is key=value lines in a fixed order, LF, and parses back", () => {
    const text = formatVersion({
      runtime: "0.1.0",
      abi: "0dd9987a",
      tree: "a".repeat(40),
      blocksds: "1.24.0",
      arm9Sha256: "b".repeat(64),
      report: { itcm: 1088, dtcm: 0, dtcmData: 4608, cstack: 11200, image: 92692 },
    });
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toContain("\r");
    expect(text.split("\n")[0]).toBe("runtime=0.1.0");
    const v = parseVersion(text);
    expect(v.abi).toBe("0dd9987a");
    expect(v.arm7).toBe("$BLOCKSDS/sys/arm7/main_core/arm7_maxmod.elf");
    expect(v.cstack).toBe("11200");
  });

  it("takes the ABI hash from builtins_table.h as 8 lowercase hex digits", () => {
    expect(readAbiHash("#define DSD_ABI_HASH 0x0dd9987au\n")).toBe("0dd9987a");
    expect(readAbiHash("#define DSD_ABI_HASH 0xABCu")).toBe("00000abc");
    expect(() => readAbiHash("nothing")).toThrow();
  });
});

describe("runtimeTreeHash", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, timeout: 30_000, windowsHide: true, encoding: "utf8" });

  function repo(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "dsdude-tree-test-"));
    dirs.push(dir);
    git(dir, "init", "-q");
    git(dir, "config", "user.email", "test@example.invalid");
    git(dir, "config", "user.name", "test");
    git(dir, "config", "core.autocrlf", "false");
    mkdirSync(path.join(dir, "runtime", "dist"), { recursive: true });
    writeFileSync(path.join(dir, "runtime", "a.c"), "int a;\n");
    writeFileSync(path.join(dir, "runtime", "dist", "VERSION"), "runtime=0.0.0\n");
    writeFileSync(path.join(dir, "other.txt"), "x\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "init");
    return dir;
  }

  it("is the tree of runtime/ without dist/, from the working tree, leaving the real index alone", async () => {
    const dir = repo();
    const clean = await runtimeTreeHash(dir);
    expect(clean).toMatch(/^[0-9a-f]{40}$/);

    // dist/ and files outside runtime/ do not count.
    writeFileSync(path.join(dir, "runtime", "dist", "VERSION"), "runtime=9.9.9\n");
    writeFileSync(path.join(dir, "other.txt"), "y\n");
    expect(await runtimeTreeHash(dir)).toBe(clean);

    // An uncommitted source change does, and the real index stays as it was.
    writeFileSync(path.join(dir, "runtime", "b.c"), "int b;\n");
    const changed = await runtimeTreeHash(dir);
    expect(changed).not.toBe(clean);
    expect(git(dir, "diff", "--cached", "--name-only")).toBe("");

    // Committing that source gives a tree whose runtime/ minus dist/ is the same hash.
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "b");
    expect(await runtimeTreeHash(dir)).toBe(changed);
  });
});
