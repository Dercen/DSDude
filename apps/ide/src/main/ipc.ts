/**
 * C5 in the main process: every invoke channel goes through the sender check, then `dispatchInvoke` (request schema,
 * handler, response schema). Events are validated before they are sent. The Electron objects are injected, so node
 * Vitest drives this module with fakes.
 */
import {
  dispatchInvoke,
  type EventChannel,
  type EventPayload,
  INVOKE_CHANNELS,
  type InvokeHandlers,
  IpcError,
  validateEvent,
} from "@dsdude/ipc-contract";
import { isTrustedRendererUrl } from "./security.ts";

/** What the sender check needs from an IpcMainInvokeEvent. */
export interface SenderInfo {
  /** URL of the sending frame; null when the frame is gone. */
  url: string | null;
  /** The sending frame is its page's main frame (no iframes). */
  isMainFrame: boolean;
  /** The sender is the webContents of a window this app created. */
  isAppWindow: boolean;
}

export function isTrustedSender(info: SenderInfo, devServerUrl: string | undefined): boolean {
  return info.isAppWindow && info.isMainFrame && info.url !== null && isTrustedRendererUrl(info.url, devServerUrl);
}

/** The subset of `ipcMain` used here. */
export interface IpcMainLike<E> {
  handle(channel: string, listener: (event: E, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

/** Registers every C5 invoke channel; channels without a handler answer `[not-implemented]`. Returns an unregister. */
export function registerIpc<E>(
  ipcMain: IpcMainLike<E>,
  handlers: InvokeHandlers,
  senderInfo: (event: E) => SenderInfo,
  devServerUrl: string | undefined,
): () => void {
  for (const channel of INVOKE_CHANNELS) {
    ipcMain.handle(channel, (event, raw) => {
      if (!isTrustedSender(senderInfo(event), devServerUrl))
        throw new IpcError("bad-sender", `${channel}: sender is not the IDE window`);
      return dispatchInvoke(handlers, channel, raw);
    });
  }
  return () => {
    for (const channel of INVOKE_CHANNELS) ipcMain.removeHandler(channel);
  };
}

/** The subset of `webContents` an event needs. */
export interface EventTarget {
  send(channel: string, payload: unknown): void;
  isDestroyed(): boolean;
}

export type SendEvent = <C extends EventChannel>(channel: C, payload: EventPayload<C>) => void;

/** Validates each event payload, then sends it to every live target. */
export function createEventSender(targets: () => Iterable<EventTarget>): SendEvent {
  return (channel, payload) => {
    const valid = validateEvent(channel, payload);
    for (const t of targets()) if (!t.isDestroyed()) t.send(channel, valid);
  };
}
