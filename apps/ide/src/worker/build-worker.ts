/**
 * The build worker's message loop (PLAN.md 3.2 steps 3-6): runs BuildService.build/compileOnly for main and streams
 * its BuildEvents back. Electron-free (the port is injected), so node Vitest runs it in-process.
 */
import type { BuildService } from "@dsdude/toolchain";
import type { WorkerMessage, WorkerRequest } from "../main/build/protocol.ts";

export interface WorkerPort {
  postMessage(message: WorkerMessage): void;
  onMessage(listener: (message: WorkerRequest) => void): void;
}

export function runBuildWorker(service: BuildService, port: WorkerPort): void {
  service.onEvent((event) => port.postMessage({ type: "event", event }));
  port.onMessage((msg) => {
    if (msg.type === "cancel") {
      service.cancel();
      return;
    }
    const work = msg.mode === "compileOnly" ? service.compileOnly(msg.request) : service.build(msg.request);
    work.then(
      (result) => port.postMessage({ type: "result", id: msg.id, result }),
      (err: unknown) =>
        port.postMessage({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) }),
    );
  });
}
