import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalBuildService, LocalEmulatorManager, MockBuildService } from "@dsdude/toolchain";
import { describe, expect, it } from "vitest";
import { buildServiceMode, createEmulatorManager, createWorkerBuildService, FakeEmulatorManager } from "./modes.ts";

describe("build-service modes", () => {
  it("picks mock by default, fake with DSDUDE_FAKE_TOOLCHAIN=1, real on request", () => {
    expect(buildServiceMode({})).toBe("mock");
    expect(buildServiceMode({ DSDUDE_FAKE_TOOLCHAIN: "1" })).toBe("fake");
    expect(buildServiceMode({ DSDUDE_BUILD_SERVICE: "real" })).toBe("real");
    expect(buildServiceMode({ DSDUDE_BUILD_SERVICE: "real", DSDUDE_FAKE_TOOLCHAIN: "1" })).toBe("fake");
    expect(buildServiceMode({ DSDUDE_BUILD_SERVICE: "bogus" })).toBe("mock");
  });

  it("creates the matching services", () => {
    expect(createWorkerBuildService("mock", "C:/h", {})).toBeInstanceOf(MockBuildService);
    expect(createWorkerBuildService("fake", "C:/h", {})).toBeInstanceOf(LocalBuildService);
    expect(createWorkerBuildService("real", "C:/h", {})).toBeInstanceOf(LocalBuildService);
    expect(createEmulatorManager("mock", "C:/h")).toBeInstanceOf(FakeEmulatorManager);
    expect(createEmulatorManager("real", "C:/h")).toBeInstanceOf(LocalEmulatorManager);
  });

  it("makes the mock fail with DSDUDE_MOCK_DIAGNOSTICS", async () => {
    const diag = {
      severity: "error",
      code: "E101",
      message: "A ')' is missing.",
      hint: null,
      file: "objects/obj_bird/step.dss",
      line: 3,
      col: 5,
      endLine: null,
      endCol: null,
      source: "compiler",
    };
    const svc = createWorkerBuildService("mock", "C:/h", { DSDUDE_MOCK_DIAGNOSTICS: JSON.stringify([diag]) });
    const r = await svc.build({ projectDir: "C:/p" });
    expect(r.ok).toBe(false);
    expect(r.diagnostics).toEqual([diag]);
  });

  it("fake mode builds the hello fixture folder end to end without tools", async () => {
    const home = mkdtempSync(join(tmpdir(), "dsdude-fake-"));
    try {
      const svc = createWorkerBuildService("fake", home, {});
      const helloDir = join(import.meta.dirname, "../../../../../samples/hello");
      const r = await svc.build({ projectDir: helloDir, skipCompile: true, skipAssets: true });
      // samples/hello is a plain BlocksDS folder or a skip-flag build: either way the fake packs the fixture ROM.
      expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.ndsPath).toMatch(/game\.nds$/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
