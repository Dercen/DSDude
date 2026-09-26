/**
 * utilityProcess entry of the build worker (a second main-process bundle, `out/main/build-worker.js`). One per app,
 * forked lazily by main; a hung tool here never blocks the UI. The env comes from main unchanged (CHERE_INVOKING=1).
 */
import { dsdudeHome } from "@dsdude/toolchain";
import { buildServiceMode, createWorkerBuildService } from "../main/build/modes.ts";
import type { WorkerRequest } from "../main/build/protocol.ts";
import { runBuildWorker } from "./build-worker.ts";

const env = process.env;
runBuildWorker(createWorkerBuildService(buildServiceMode(env), dsdudeHome(env), env), {
  postMessage: (message) => process.parentPort.postMessage(message),
  onMessage: (listener) => process.parentPort.on("message", (e: { data: WorkerRequest }) => listener(e.data)),
});
