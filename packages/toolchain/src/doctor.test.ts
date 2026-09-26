import { describe, expect, it } from "vitest";
import type { ToolchainStatus, ToolRunResult } from "./api.ts";
import { toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { type DoctorOptions, isUnder, oneDriveRoots, runDoctor } from "./doctor.ts";
import { FAKE_TOOL_PATHS } from "./fake-toolchain.ts";
import { melonDsExe } from "./layout.ts";

const HOME = "C:\\DSDude";
const installed: ToolchainStatus = {
  installed: true,
  blocksdsVersion: "1.24.0",
  paths: { ...FAKE_TOOL_PATHS, melonds: melonDsExe(HOME), python: "C:\\py\\python.exe" },
  diagnostics: [],
};
const ok = (stdout: string): ToolRunResult => ({ exitCode: 0, stdout, stderr: "", timedOut: false, diagnostics: [] });

function doctor(over: Partial<DoctorOptions> = {}) {
  return runDoctor({
    platform: "win32",
    env: { DSDUDE_HOME: HOME },
    cwd: "C:\\repo",
    detect: async () => installed,
    runVersion: async (tool) => ok(`${tool} v1.24.0-dirty\n`),
    checkPyDesmume: async () => null,
    isRunning: async () => false,
    ...over,
  });
}

const statusOf = (report: Awaited<ReturnType<typeof runDoctor>>, name: string) =>
  report.checks.filter((c) => c.name === name).map((c) => c.status);

describe("dsdude doctor", () => {
  it("all green on a complete machine", async () => {
    const report = await doctor();
    expect(report.ok).toBe(true);
    expect(report.diagnostics).toEqual([]);
    for (const name of ["BlocksDS", "ndstool", "grit", "mmutil", "melonDS", "py-desmume", "path length", "OneDrive"]) {
      expect(statusOf(report, name), name).toEqual(["ok"]);
    }
    expect(statusOf(report, "DeSmuME")).toEqual(["info"]);
  });

  it("names the fix for a missing toolchain", async () => {
    const report = await doctor({
      detect: async () => ({
        installed: false,
        blocksdsVersion: null,
        paths: {},
        diagnostics: [toolchainDiagnostic("E600", { dir: "C:\\msys64\\opt\\wonderful" })],
      }),
    });
    expect(report.ok).toBe(false);
    expect(report.checks[0]).toMatchObject({ name: "BlocksDS", status: "fail" });
    expect(report.checks[0]?.detail).toContain("scripts/install-toolchain.ps1");
  });

  it("reports 0xC0000135 from a tool as a missing DLL (E602)", async () => {
    const report = await doctor({
      runVersion: async (tool) =>
        tool === "grit"
          ? {
              exitCode: 0xc0000135,
              stdout: "",
              stderr: "",
              timedOut: false,
              diagnostics: [toolchainDiagnostic("E602", { tool })],
            }
          : ok(`${tool} v1.24.0\n`),
    });
    expect(statusOf(report, "grit")).toEqual(["fail"]);
    expect(report.diagnostics.map((d) => d.code)).toEqual(["E602"]);
  });

  it("E620 with the install command when melonDS is missing; E630 when py-desmume does not import", async () => {
    const report = await doctor({
      detect: async () => ({ ...installed, paths: { ...installed.paths, melonds: undefined } }),
      checkPyDesmume: async () => "ModuleNotFoundError: No module named 'desmume'",
    });
    expect(report.diagnostics.map((d) => d.code)).toEqual(["E620", "E630"]);
    expect(report.checks.find((c) => c.name === "melonDS")?.detail).toContain("dsdude emulator install melonds");
  });

  it("warns (E651) when a build folder gets near 250 characters, without failing", async () => {
    const longHome = `C:\\${"x".repeat(200)}`;
    const report = await doctor({
      env: { DSDUDE_HOME: longHome },
      detect: async () => ({ ...installed, paths: { ...installed.paths, melonds: melonDsExe(longHome) } }),
    });
    expect(statusOf(report, "path length")).toContain("warn");
    expect(report.diagnostics.map((d) => [d.code, d.severity])).toContainEqual(["E651", "warning"]);
    expect(report.ok).toBe(true);
  });

  it("warns (E650) only while OneDrive.exe runs and a path is under %OneDrive%", async () => {
    const env = { DSDUDE_HOME: HOME, OneDrive: "C:\\Users\\me\\OneDrive" };
    const cwd = "C:\\Users\\me\\OneDrive\\Desktop\\DSDude";
    expect(statusOf(await doctor({ env, cwd, isRunning: async () => false }), "OneDrive")).toEqual(["ok"]);
    const running = await doctor({ env, cwd, isRunning: async () => true });
    expect(statusOf(running, "OneDrive")).toEqual(["warn"]);
    expect(running.diagnostics.map((d) => d.code)).toEqual(["E650"]);
    expect(running.ok).toBe(true);
  });

  it("off Windows: one E605", async () => {
    const report = await doctor({ platform: "linux" });
    expect(report).toMatchObject({ ok: false, checks: [{ name: "platform", status: "fail" }] });
  });

  it("path helpers", () => {
    expect(isUnder("C:\\Users\\Me\\OneDrive\\a", "c:\\users\\me\\onedrive\\")).toBe(true);
    expect(isUnder("C:\\Users\\Me\\OneDriveX", "C:\\Users\\Me\\OneDrive")).toBe(false);
    expect(oneDriveRoots({ OneDrive: "A", OneDriveCommercial: "B", OneDriveConsumer: "" })).toEqual(["A", "B"]);
  });
});
