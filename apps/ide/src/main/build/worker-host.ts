/**
 * Main's side of the build worker: forks it lazily (one per app), matches results to requests, forwards BuildEvents,
 * and bounds every request with a timeout that kills the worker (the next request forks a fresh one).
 */
import type { BuildEvent, BuildRequest, BuildResult } from "@dsdude/toolchain";
import type { WorkerMessage, WorkerRequest } from "./protocol.ts";

/** The subset of Electron's UtilityProcess used here. */
export interface WorkerChild {
  postMessage(message: WorkerRequest): void;
  on(event: "message", listener: (message: WorkerMessage) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  kill(): boolean;
}

/** Longer than make's 10-minute timeout (contracts/toolchain-api.md) plus the other steps. */
export const BUILD_TIMEOUT_MS = 12 * 60_000;

interface Pending {
  resolve: (r: BuildResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class BuildWorkerHost {
  readonly #spawn: () => WorkerChild;
  readonly #onEvent: (e: BuildEvent) => void;
  readonly #timeoutMs: number;
  #child: WorkerChild | null = null;
  #nextId = 1;
  readonly #pending = new Map<number, Pending>();

  constructor(opts: { spawn: () => WorkerChild; onEvent: (e: BuildEvent) => void; timeoutMs?: number }) {
    this.#spawn = opts.spawn;
    this.#onEvent = opts.onEvent;
    this.#timeoutMs = opts.timeoutMs ?? BUILD_TIMEOUT_MS;
  }

  run(mode: "build" | "compileOnly", request: BuildRequest): Promise<BuildResult> {
    const child = this.#ensure();
    const id = this.#nextId++;
    return new Promise<BuildResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#fail(new Error(`the build took longer than ${Math.round(this.#timeoutMs / 60_000)} minutes`));
        child.kill();
      }, this.#timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      child.postMessage({ type: "run", id, mode, request });
    });
  }

  cancel(): void {
    this.#child?.postMessage({ type: "cancel" });
  }

  dispose(): void {
    this.#fail(new Error("the IDE is closing"));
    this.#child?.kill();
    this.#child = null;
  }

  #ensure(): WorkerChild {
    if (this.#child) return this.#child;
    const child = this.#spawn();
    child.on("message", (msg) => this.#message(msg));
    child.on("exit", (code) => {
      if (this.#child === child) this.#child = null;
      this.#fail(new Error(`the build worker stopped (exit code ${code})`));
    });
    this.#child = child;
    return child;
  }

  #message(msg: WorkerMessage): void {
    if (msg.type === "event") {
      this.#onEvent(msg.event);
      return;
    }
    const p = this.#pending.get(msg.id);
    if (!p) return;
    this.#pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.type === "result") p.resolve(msg.result);
    else p.reject(new Error(msg.message));
  }

  #fail(err: Error): void {
    for (const p of this.#pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.#pending.clear();
  }
}
