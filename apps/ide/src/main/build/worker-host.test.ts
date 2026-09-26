import { EventEmitter } from "node:events";
import { type BuildEvent, MockBuildService } from "@dsdude/toolchain";
import { describe, expect, it } from "vitest";
import { runBuildWorker } from "../../worker/build-worker.ts";
import type { WorkerMessage, WorkerRequest } from "./protocol.ts";
import { BuildWorkerHost, type WorkerChild } from "./worker-host.ts";

/** A worker child that runs the real worker loop in-process, with structured-clone copies like IPC. */
function inProcessChild(service = new MockBuildService()): WorkerChild & { killed: boolean } {
  const toMain = new EventEmitter();
  const toWorker = new EventEmitter();
  runBuildWorker(service, {
    postMessage: (m) => queueMicrotask(() => toMain.emit("message", structuredClone(m))),
    onMessage: (l) => toWorker.on("message", l),
  });
  const child = {
    killed: false,
    postMessage: (m: WorkerRequest) => queueMicrotask(() => toWorker.emit("message", structuredClone(m))),
    on(event: "message" | "exit", listener: (arg: never) => void) {
      toMain.on(event, listener as (...args: unknown[]) => void);
      return child;
    },
    kill() {
      child.killed = true;
      toMain.emit("exit", 1);
      return true;
    },
  };
  return child as WorkerChild & { killed: boolean };
}

describe("BuildWorkerHost", () => {
  it("forks lazily once, runs builds and forwards events", async () => {
    let spawned = 0;
    const events: BuildEvent[] = [];
    const host = new BuildWorkerHost({
      spawn: () => {
        spawned++;
        return inProcessChild();
      },
      onEvent: (e) => events.push(e),
    });
    expect(spawned).toBe(0);
    const r1 = await host.run("build", { projectDir: "C:/p" });
    const r2 = await host.run("compileOnly", { projectDir: "C:/p" });
    expect(spawned).toBe(1);
    expect(r1.ok).toBe(true);
    expect(r1.ndsPath).toMatch(/game\.nds$/);
    expect(r2.ndsPath).toBeNull();
    expect(events.map((e) => e.phase)).toContain("done");
  });

  it("fails pending requests when the worker exits and forks a fresh one next time", async () => {
    const children: ReturnType<typeof inProcessChild>[] = [];
    const never = { onEvent: () => () => {}, build: () => new Promise(() => {}) } as unknown as MockBuildService;
    const host = new BuildWorkerHost({
      spawn: () => {
        const c = children.length === 0 ? inProcessChild(never) : inProcessChild();
        children.push(c);
        return c;
      },
      onEvent: () => {},
    });
    const hung = host.run("build", { projectDir: "C:/p" });
    await new Promise((r) => setTimeout(r, 5));
    children[0]?.kill();
    await expect(hung).rejects.toThrow("exit code 1");
    await expect(host.run("build", { projectDir: "C:/p" })).resolves.toMatchObject({ ok: true });
    expect(children).toHaveLength(2);
  });

  it("kills a worker that exceeds the timeout", async () => {
    const never = { onEvent: () => () => {}, build: () => new Promise(() => {}) } as unknown as MockBuildService;
    const child = inProcessChild(never);
    const host = new BuildWorkerHost({ spawn: () => child, onEvent: () => {}, timeoutMs: 20 });
    await expect(host.run("build", { projectDir: "C:/p" })).rejects.toThrow("longer than");
    expect(child.killed).toBe(true);
  });

  it("reports a service error as a rejected request", async () => {
    const failing = {
      onEvent: () => () => {},
      build: () => Promise.reject(new Error("boom")),
    } as unknown as MockBuildService;
    const host = new BuildWorkerHost({ spawn: () => inProcessChild(failing), onEvent: () => {} });
    await expect(host.run("build", { projectDir: "C:/p" })).rejects.toThrow("boom");
  });

  it("passes cancel through to the service", async () => {
    const messages: WorkerMessage[] = [];
    const svc = new MockBuildService();
    const host = new BuildWorkerHost({
      spawn: () => inProcessChild(svc),
      onEvent: (e) => messages.push({ type: "event", event: e }),
    });
    const run = host.run("build", { projectDir: "C:/p" });
    host.cancel();
    const r = await run;
    expect(r.ok).toBe(false);
  });
});
