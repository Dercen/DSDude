import { describe, expect, it } from "vitest";
import { createLocalBridge, dispatchInvoke, IpcError, parseIpcError, validateEvent } from "./dispatch.ts";

describe("dispatchInvoke", () => {
  it("validates the request, runs the handler and returns the parsed response", async () => {
    let seen: unknown;
    const res = await dispatchInvoke(
      {
        "settings.get": (req) => {
          seen = req;
          return { value: "melonds" };
        },
      },
      "settings.get",
      { key: "emulator", extra: 1 },
    );
    expect(seen).toEqual({ key: "emulator" });
    expect(res).toEqual({ value: "melonds" });
  });

  it("refuses unknown channels, bad requests, missing handlers and bad responses", async () => {
    await expect(dispatchInvoke({}, "fs.read", {})).rejects.toThrow("[unknown-channel]");
    await expect(dispatchInvoke({}, "__proto__", {})).rejects.toThrow("[unknown-channel]");
    await expect(dispatchInvoke({}, "emulator.install", { kind: "mame" })).rejects.toThrow("[bad-request]");
    await expect(dispatchInvoke({}, "emulator.status", {})).rejects.toThrow("[not-implemented]");
    await expect(
      dispatchInvoke({ "emulator.status": () => ({ running: "yes" }) as never }, "emulator.status", {}),
    ).rejects.toThrow("[bad-response]");
  });

  it("lets handler errors through unchanged", async () => {
    await expect(
      dispatchInvoke(
        {
          "project.open": () => {
            throw new Error("disk on fire");
          },
        },
        "project.open",
        { dir: "C:/p" },
      ),
    ).rejects.toThrow("disk on fire");
  });
});

describe("parseIpcError", () => {
  it("recovers the code from Electron's wrapped message", () => {
    const wrapped = new Error(
      `Error invoking remote method 'build.play': ${new IpcError("bad-request", "build.play: jobs: too small").message}`,
    );
    expect(parseIpcError(wrapped)).toEqual({ code: "bad-request", message: "build.play: jobs: too small" });
    expect(parseIpcError(new Error("Error invoking remote method 'project.open': Error: ENOENT"))).toEqual({
      code: "failed",
      message: "ENOENT",
    });
  });
});

describe("createLocalBridge", () => {
  it("behaves like the preload bridge over in-process handlers", async () => {
    const original = { key: "recentProjects" as const, value: ["C:/p"] };
    let received: unknown;
    const { bridge, emit } = createLocalBridge({
      "settings.set": (req) => {
        received = req;
        return { ok: true };
      },
    });
    await expect(bridge.invoke("settings.set", original)).resolves.toEqual({ ok: true });
    expect(received).toEqual(original);
    expect(received).not.toBe(original);

    const got: string[][] = [];
    const off = bridge.on("emulator.log", (p) => got.push(p.lines));
    emit("emulator.log", { lines: ["DSD|LOG|hello"] });
    off();
    emit("emulator.log", { lines: ["late"] });
    expect(got).toEqual([["DSD|LOG|hello"]]);
    expect(() => emit("emulator.exit", { code: 1.5 } as never)).toThrow("[bad-response]");
    expect(() => validateEvent("nope" as never, {})).toThrow("[unknown-channel]");
  });
});
