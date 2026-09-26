/**
 * C5 runtime helpers, Electron-free: the one validation path for invoke requests, responses and event payloads.
 * The IDE main process wraps `dispatchInvoke` in `ipcMain.handle` (after its sender check); the mock host and tests
 * use `createLocalBridge`, which behaves like the preload bridge without Electron.
 */
import type { z } from "zod";
import {
  type DsdudeBridge,
  type EventChannel,
  type EventPayload,
  eventChannels,
  type InvokeChannel,
  type InvokeRequestParsed,
  type InvokeResponse,
  invokeChannels,
} from "./channels.ts";

export type IpcErrorCode = "unknown-channel" | "bad-sender" | "bad-request" | "bad-response" | "not-implemented";

/**
 * An IPC failure raised by the contract layer. Electron keeps only the message across IPC, so the code travels as a
 * `[code]` prefix; `parseIpcError` recovers it on the renderer side. Handler errors pass through unchanged.
 */
export class IpcError extends Error {
  readonly code: IpcErrorCode;
  constructor(code: IpcErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "IpcError";
    this.code = code;
  }
}

/** Recovers `{code, message}` from an invoke rejection (Electron wraps it as "Error invoking remote method ..."). */
export function parseIpcError(err: unknown): { code: IpcErrorCode | "failed"; message: string } {
  const text = err instanceof Error ? err.message : String(err);
  const m = /\[(unknown-channel|bad-sender|bad-request|bad-response|not-implemented)\] ([\s\S]*)$/.exec(text);
  if (m) return { code: m[1] as IpcErrorCode, message: m[2] ?? "" };
  return { code: "failed", message: text.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") };
}

export type InvokeHandler<C extends InvokeChannel> = (
  request: InvokeRequestParsed<C>,
) => InvokeResponse<C> | Promise<InvokeResponse<C>>;

/** Handlers for some or all invoke channels; a missing one answers `not-implemented`. */
export type InvokeHandlers = { [C in InvokeChannel]?: InvokeHandler<C> };

export const isInvokeChannel = (channel: unknown): channel is InvokeChannel =>
  typeof channel === "string" && Object.hasOwn(invokeChannels, channel);
export const isEventChannel = (channel: unknown): channel is EventChannel =>
  typeof channel === "string" && Object.hasOwn(eventChannels, channel);

function issues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

/** Validates the request, runs the handler, validates the response and returns the parsed response. */
export async function dispatchInvoke(handlers: InvokeHandlers, channel: string, raw: unknown): Promise<unknown> {
  if (!isInvokeChannel(channel)) throw new IpcError("unknown-channel", `unknown IPC channel: ${channel}`);
  const schema = invokeChannels[channel];
  const req = schema.request.safeParse(raw);
  if (!req.success) throw new IpcError("bad-request", `${channel}: ${issues(req.error)}`);
  const handler = handlers[channel] as InvokeHandler<typeof channel> | undefined;
  if (!handler) throw new IpcError("not-implemented", `${channel} is not implemented yet`);
  const result = await handler(req.data as never);
  const res = schema.response.safeParse(result);
  if (!res.success) throw new IpcError("bad-response", `${channel}: ${issues(res.error)}`);
  return res.data;
}

/** Validates an event payload before it is sent (main) or after it arrives (renderer, development builds). */
export function validateEvent<C extends EventChannel>(channel: C, payload: unknown): EventPayload<C> {
  if (!isEventChannel(channel)) throw new IpcError("unknown-channel", `unknown IPC event: ${String(channel)}`);
  const res = eventChannels[channel].safeParse(payload);
  if (!res.success) throw new IpcError("bad-response", `${channel}: ${issues(res.error)}`);
  return res.data as EventPayload<C>;
}

export interface LocalBridge {
  bridge: DsdudeBridge;
  /** Plays main's part: validates and delivers an event to every listener. */
  emit<C extends EventChannel>(channel: C, payload: EventPayload<C>): void;
}

/**
 * A DsdudeBridge over in-process handlers, with the same validation as the Electron path and structured-clone
 * copies in both directions (as IPC would). For the mock host (fixtures/ide/mock-host), browser tests and node tests.
 */
export function createLocalBridge(handlers: InvokeHandlers): LocalBridge {
  const listeners = new Map<EventChannel, Set<(payload: unknown) => void>>();
  const bridge: DsdudeBridge = {
    async invoke(channel, request) {
      const res = await dispatchInvoke(handlers, channel, structuredClone(request));
      return structuredClone(res) as never;
    },
    on(channel, listener) {
      if (!isEventChannel(channel)) throw new IpcError("unknown-channel", `unknown IPC event: ${String(channel)}`);
      const set = listeners.get(channel) ?? new Set();
      listeners.set(channel, set);
      const l = listener as (payload: unknown) => void;
      set.add(l);
      return () => {
        set.delete(l);
      };
    },
  };
  return {
    bridge,
    emit(channel, payload) {
      const valid = validateEvent(channel, payload);
      for (const l of listeners.get(channel) ?? []) l(structuredClone(valid));
    },
  };
}
