import type { Diagnostic } from "@dsdude/project-format";
import { describe, expect, it } from "vitest";
import type { BuildEvent } from "./api.ts";
import { MockBuildService } from "./mock-build-service.ts";

const err: Diagnostic = {
  severity: "error",
  code: "E101",
  message: "Something is missing here.",
  hint: null,
  file: "objects/obj_bird/step.dss",
  line: 1,
  col: 1,
  endLine: null,
  endCol: null,
  source: "compiler",
};

describe("MockBuildService", () => {
  it("builds, emits events and plays a fake emulator that waits until stop", async () => {
    const svc = new MockBuildService();
    const events: BuildEvent[] = [];
    svc.onEvent((e) => events.push(e));
    const res = await svc.play({ projectDir: "/p" });
    expect(res.ok).toBe(true);
    expect(res.ndsPath).toBe("/p/build/mock.nds");
    expect(events.map((e) => e.phase)).toEqual(["compile", "assets", "pack", "done", "running"]);
    const lines: string[] = [];
    res.emulator?.onLine((l) => lines.push(l));
    await svc.stop();
    expect(lines).toEqual(["DSD|READY|0.1.0|00000000", "DSD|LOG|hello", "DSD|EXIT|0"]);
    expect(await res.emulator?.exited).toBe(0);
  });

  it("fails on an error diagnostic and does not launch", async () => {
    const res = await new MockBuildService({ diagnostics: [err] }).play({ projectDir: "/p" });
    expect(res.ok).toBe(false);
    expect(res.emulator).toBeNull();
    expect(res.diagnostics).toEqual([err]);
  });

  it("compileOnly produces no ROM", async () => {
    const res = await new MockBuildService().compileOnly({ projectDir: "/p" });
    expect(res).toMatchObject({ ok: true, ndsPath: null });
  });
});
