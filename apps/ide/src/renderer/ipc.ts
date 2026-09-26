/**
 * The renderer's typed IPC client over the preload bridge (C5). In development builds event payloads are validated
 * again on arrival (contracts/ipc.md, Rules). The mock host swaps in `createLocalBridge` via `setBridge`.
 */
import { type DsdudeBridge, parseIpcError, validateEvent } from "@dsdude/ipc-contract";

let current: DsdudeBridge | null = null;

/** Tests and the mock host inject a bridge; the IDE uses `window.dsdude` from the preload. */
export function setBridge(bridge: DsdudeBridge | null): void {
  current = bridge;
}

function bridge(): DsdudeBridge {
  const b = current ?? (globalThis as { dsdude?: DsdudeBridge }).dsdude;
  if (!b) throw new Error("no IPC bridge: window.dsdude is missing");
  return b;
}

export const ipc: DsdudeBridge = {
  invoke: (channel, request) => bridge().invoke(channel, request),
  on(channel, listener) {
    if (!import.meta.env?.DEV) return bridge().on(channel, listener);
    return bridge().on(channel, (payload) => listener(validateEvent(channel, payload)));
  },
};

export { parseIpcError };
