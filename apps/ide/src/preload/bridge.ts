/**
 * The renderer's only door to main (C5, contracts/ipc.md): `invoke` and `on` for the listed channels, nothing else.
 * Listeners never see the IpcRendererEvent. Main validates the sender and every payload against the zod schema.
 * Electron-free (the IPC object is injected), so node Vitest covers it.
 */
import { type DsdudeBridge, EVENT_CHANNELS, type EventChannel, INVOKE_CHANNELS } from "@dsdude/ipc-contract";

/** The subset of `ipcRenderer` the bridge uses. */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

const invokeSet: ReadonlySet<string> = new Set(INVOKE_CHANNELS);
const eventSet: ReadonlySet<string> = new Set(EVENT_CHANNELS);

export function createBridge(ipc: IpcRendererLike): DsdudeBridge {
  return {
    invoke(channel, request) {
      if (!invokeSet.has(channel)) return Promise.reject(new Error(`unknown IPC channel: ${String(channel)}`));
      return ipc.invoke(channel, request) as never;
    },
    on<C extends EventChannel>(channel: C, listener: (payload: never) => void) {
      if (!eventSet.has(channel)) throw new Error(`unknown IPC event: ${String(channel)}`);
      const wrapped = (_event: unknown, payload: unknown) => listener(payload as never);
      ipc.on(channel, wrapped);
      return () => {
        ipc.removeListener(channel, wrapped);
      };
    },
  };
}
