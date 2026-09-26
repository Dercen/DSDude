/**
 * utilityProcess entry of the build worker (a second main-process bundle, `out/main/build-worker.js`). One per app,
 * forked lazily by main; a hung tool here never blocks the UI. The env comes from main unchanged (CHERE_INVOKING=1).
 * This is the IDE's composition root for C4: it injects WS4's compileProject and WS5's packAssets and
 * checkRoomBudgets into the BuildService, as packages/cli does for `dsdude`.
 */
import { checkRoomBudgets, packAssets } from "@dsdude/asset-pipeline";
import { compileProject } from "@dsdude/compiler";
import { type BuildServiceDeps, dsdudeHome } from "@dsdude/toolchain";
import { buildServiceMode, createWorkerBuildService } from "../main/build/modes.ts";
import type { WorkerRequest } from "../main/build/protocol.ts";
import { runBuildWorker } from "./build-worker.ts";

export const buildDeps: BuildServiceDeps = { compile: compileProject, packAssets, checkRoomBudgets };

const env = process.env;
runBuildWorker(createWorkerBuildService(buildServiceMode(env), dsdudeHome(env), env, buildDeps), {
  postMessage: (message) => process.parentPort.postMessage(message),
  onMessage: (listener) => process.parentPort.on("message", (e: { data: WorkerRequest }) => listener(e.data)),
});
