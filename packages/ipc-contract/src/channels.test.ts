import { describe, expect, it } from "vitest";
import { EVENT_CHANNELS, eventChannels, INVOKE_CHANNELS, invokeChannels } from "./channels.ts";

describe("C5 channel map", () => {
  it("lists the channels of PLAN.md 5.2 C5", () => {
    expect(INVOKE_CHANNELS).toEqual([
      "project.open",
      "project.save",
      "project.create",
      "assets.import",
      "assets.preview",
      "build.play",
      "build.build",
      "build.compileOnly",
      "build.cancel",
      "emulator.stop",
      "emulator.status",
      "emulator.install",
      "settings.get",
      "settings.set",
      "toolchain.status",
      "toolchain.install",
      "doctor.run",
    ]);
    expect(EVENT_CHANNELS).toEqual([
      "build.log",
      "build.progress",
      "build.diagnostics",
      "emulator.log",
      "emulator.exit",
      "project.changed",
    ]);
  });

  it("validates payloads", () => {
    expect(invokeChannels["build.play"].request.safeParse({ projectDir: "/p", emulator: "melonds" }).success).toBe(
      true,
    );
    expect(invokeChannels["build.play"].request.safeParse({ projectDir: 1 }).success).toBe(false);
    expect(eventChannels["emulator.exit"].safeParse({ code: 0 }).success).toBe(true);
  });
});
