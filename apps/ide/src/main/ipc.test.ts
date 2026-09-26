import { INVOKE_CHANNELS } from "@dsdude/ipc-contract";
import { describe, expect, it } from "vitest";
import { createEventSender, type IpcMainLike, isTrustedSender, registerIpc, type SenderInfo } from "./ipc.ts";

const dev = "http://localhost:5160/";
const good: SenderInfo = { url: "app://ide/index.html", isMainFrame: true, isAppWindow: true };

function fakeIpcMain() {
  const handlers = new Map<string, (event: SenderInfo, ...args: unknown[]) => unknown>();
  const ipcMain: IpcMainLike<SenderInfo> = {
    handle: (c, l) => void handlers.set(c, l),
    removeHandler: (c) => void handlers.delete(c),
  };
  const call = async (channel: string, sender: SenderInfo, raw: unknown) => handlers.get(channel)?.(sender, raw);
  return { ipcMain, handlers, call };
}

describe("isTrustedSender", () => {
  it("accepts only the IDE window's main frame on a trusted origin", () => {
    expect(isTrustedSender(good, undefined)).toBe(true);
    expect(isTrustedSender({ ...good, url: "http://localhost:5160/" }, dev)).toBe(true);
    expect(isTrustedSender({ ...good, isMainFrame: false }, undefined)).toBe(false);
    expect(isTrustedSender({ ...good, isAppWindow: false }, undefined)).toBe(false);
    expect(isTrustedSender({ ...good, url: null }, undefined)).toBe(false);
    expect(isTrustedSender({ ...good, url: "https://evil.example/" }, dev)).toBe(false);
  });
});

describe("registerIpc", () => {
  it("registers every invoke channel and unregisters them", () => {
    const { ipcMain, handlers } = fakeIpcMain();
    const off = registerIpc(ipcMain, {}, (e: SenderInfo) => e, undefined);
    expect([...handlers.keys()]).toEqual(INVOKE_CHANNELS);
    off();
    expect(handlers.size).toBe(0);
  });

  it("checks the sender before the schema, then dispatches", async () => {
    const { ipcMain, call } = fakeIpcMain();
    registerIpc(
      ipcMain,
      { "emulator.status": () => ({ running: false, kind: null, pid: null }) },
      (e: SenderInfo) => e,
      dev,
    );
    await expect(call("emulator.status", { ...good, isAppWindow: false }, {})).rejects.toThrow("[bad-sender]");
    await expect(call("emulator.status", good, "junk")).rejects.toThrow("[bad-request]");
    await expect(call("emulator.status", good, {})).resolves.toEqual({ running: false, kind: null, pid: null });
    await expect(call("doctor.run", good, {})).rejects.toThrow("[not-implemented]");
  });
});

describe("createEventSender", () => {
  it("validates payloads and skips destroyed targets", () => {
    const sent: [string, unknown][] = [];
    const live = { send: (c: string, p: unknown) => void sent.push([c, p]), isDestroyed: () => false };
    const dead = { send: () => expect.unreachable(), isDestroyed: () => true };
    const send = createEventSender(() => [live, dead]);
    send("emulator.exit", { code: 0 });
    expect(sent).toEqual([["emulator.exit", { code: 0 }]]);
    expect(() => send("build.progress", { phase: "linking", progress: 2 } as never)).toThrow("[bad-response]");
    expect(sent).toHaveLength(1);
  });
});
