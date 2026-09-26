import { describe, expect, it, vi } from "vitest";
import { createBridge, type IpcRendererLike } from "./bridge.ts";

function fakeIpc() {
  const listeners = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>();
  const ipc: IpcRendererLike = {
    invoke: vi.fn(async (channel: string) => ({ channel })),
    on(channel, listener) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel)?.add(listener);
      return ipc;
    },
    removeListener(channel, listener) {
      listeners.get(channel)?.delete(listener);
      return ipc;
    },
  };
  const emit = (channel: string, payload: unknown) => {
    for (const l of listeners.get(channel) ?? []) l({ sender: "secret" }, payload);
  };
  return { ipc, emit, listeners };
}

describe("preload bridge", () => {
  it("forwards listed invoke channels and rejects others", async () => {
    const { ipc } = fakeIpc();
    const bridge = createBridge(ipc);
    await expect(bridge.invoke("emulator.status", {})).resolves.toEqual({ channel: "emulator.status" });
    await expect(bridge.invoke("fs.readFile" as never, {} as never)).rejects.toThrow(/unknown IPC channel/);
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
  });

  it("delivers event payloads without the IpcRendererEvent and unsubscribes", () => {
    const { ipc, emit, listeners } = fakeIpc();
    const bridge = createBridge(ipc);
    const got: unknown[][] = [];
    const off = bridge.on("build.log", (...args) => got.push(args));
    emit("build.log", { lines: ["a"] });
    expect(got).toEqual([[{ lines: ["a"] }]]);
    off();
    expect(listeners.get("build.log")?.size).toBe(0);
    expect(() => bridge.on("shell.exec" as never, () => {})).toThrow(/unknown IPC event/);
  });
});
