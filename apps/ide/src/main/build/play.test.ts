import type { EventChannel, EventPayload } from "@dsdude/ipc-contract";
import type { Diagnostic } from "@dsdude/project-format";
import {
  type BuildRequest,
  type BuildResult,
  MockBuildService,
  ToolchainError,
  toolchainDiagnostic,
} from "@dsdude/toolchain";
import { describe, expect, it } from "vitest";
import { createEventSender } from "../ipc.ts";
import { FakeEmulatorManager } from "./modes.ts";
import { PlayController } from "./play.ts";

type Sent = { [C in EventChannel]: [C, EventPayload<C>] }[EventChannel];

const error: Diagnostic = {
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

function setup(opts: { diagnostics?: Diagnostic[]; lines?: string[]; launchFails?: boolean } = {}) {
  const sent: Sent[] = [];
  const service = new MockBuildService({ diagnostics: opts.diagnostics });
  const emulators = new FakeEmulatorManager(
    opts.lines ?? ["DSD|READY|0.1.0|00000000", "DSD|PAD|.....", "DSD|LOG|hello"],
  );
  if (opts.launchFails)
    emulators.launch = async () => {
      throw new ToolchainError([toolchainDiagnostic("E623")]);
    };
  const send = createEventSender(() => [
    { send: (c: string, p: unknown) => void sent.push([c, p] as Sent), isDestroyed: () => false },
  ]);
  const play: PlayController = new PlayController({
    worker: {
      run: (mode: "build" | "compileOnly", req: BuildRequest): Promise<BuildResult> =>
        mode === "build" ? service.build(req) : service.compileOnly(req),
      cancel: () => service.cancel(),
    },
    emulators,
    send,
    controlsLine: async () => "Controls: Arrows = D-pad",
    defaultEmulator: async () => "melonds",
  });
  service.onEvent(play.onBuildEvent);
  const of = <C extends EventChannel>(c: C) => sent.filter((s) => s[0] === c).map((s) => s[1] as EventPayload<C>);
  return { play, sent, of };
}

const settle = () => new Promise((r) => setTimeout(r, 60));

describe("PlayController", () => {
  it("builds, prints the Controls line, launches and streams emulator lines without the pad", async () => {
    const { play, of } = setup();
    const res = await play.play({ projectDir: "C:/p" });
    expect(res.ok).toBe(true);
    expect(res.emulator).toEqual({ kind: "melonds", pid: null });
    await settle();
    const buildLines = of("build.log").flatMap((p) => p.lines);
    expect(buildLines.at(-1)).toBe("Controls: Arrows = D-pad");
    expect(buildLines).toContain("mock compile");
    expect(of("emulator.log").flatMap((p) => p.lines)).toEqual(["DSD|READY|0.1.0|00000000", "DSD|LOG|hello"]);
    expect(of("build.progress").map((p) => p.phase)).toEqual(expect.arrayContaining(["done", "launch", "running"]));
    expect(play.status()).toMatchObject({ running: true, kind: "melonds" });

    await play.stop();
    await settle();
    expect(
      of("emulator.log")
        .flatMap((p) => p.lines)
        .at(-1),
    ).toBe("DSD|EXIT|0");
    expect(of("emulator.exit")).toEqual([{ code: 0 }]);
    expect(play.status()).toEqual({ running: false, kind: null, pid: null });
  });

  it("does not launch when the build fails, and sends the diagnostics once", async () => {
    const { play, of } = setup({ diagnostics: [error] });
    const res = await play.play({ projectDir: "C:/p" });
    expect(res).toMatchObject({ ok: false, emulator: null });
    expect(of("build.diagnostics").at(-1)).toEqual({ diagnostics: [error] });
    // The first event clears the list; then the error arrives once, not once per phase.
    expect(of("build.diagnostics").filter((d) => d.diagnostics.length > 0)).toHaveLength(1);
    expect(of("build.progress").at(-1)).toEqual({ phase: "failed", progress: 1 });
    expect(of("emulator.log")).toEqual([]);
  });

  it("turns a launch error into diagnostics", async () => {
    const { play, of } = setup({ launchFails: true });
    const res = await play.play({ projectDir: "C:/p" });
    expect(res.ok).toBe(false);
    expect(res.diagnostics.map((d) => d.code)).toEqual(["E623"]);
    expect(
      of("build.diagnostics")
        .at(-1)
        ?.diagnostics.map((d) => d.code),
    ).toEqual(["E623"]);
  });

  it("stops the previous emulator before a second Play", async () => {
    const { play, of } = setup();
    await play.play({ projectDir: "C:/p" });
    await play.play({ projectDir: "C:/p" });
    await settle();
    expect(of("emulator.exit")).toEqual([{ code: 0 }]);
    expect(play.status().running).toBe(true);
    await play.stop();
  });

  it("reports a dead worker in the log and fails the request", async () => {
    const sent: Sent[] = [];
    const play = new PlayController({
      worker: { run: () => Promise.reject(new Error("the build worker stopped (exit code 1)")), cancel: () => {} },
      emulators: new FakeEmulatorManager(),
      send: createEventSender(() => [{ send: (c, p) => void sent.push([c, p] as Sent), isDestroyed: () => false }]),
      controlsLine: async () => "",
      defaultEmulator: async () => "melonds",
    });
    const res = await play.build("build", { projectDir: "C:/p" });
    expect(res.ok).toBe(false);
    expect(sent).toContainEqual(["build.log", { lines: ["Build stopped: the build worker stopped (exit code 1)"] }]);
  });
});
