// Shared helpers for the Playwright `_electron` suite: build once, launch the built app with an isolated DSDUDE_HOME.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { _electron, type ElectronApplication } from "@playwright/test";

export const appDir = resolve(import.meta.dirname, "..");
export const skipElectron = process.env.DSDUDE_SKIP_ELECTRON === "1";

let built = false;

/** `electron-vite build` (once per worker), with a timeout like every spawned process. */
export function buildApp(): void {
  if (built) return;
  const pkg = createRequire(join(appDir, "package.json")).resolve("electron-vite/package.json");
  const cli = join(dirname(pkg), "bin", "electron-vite.js");
  const r = spawnSync(process.execPath, [cli, "build"], {
    cwd: appDir,
    encoding: "utf8",
    timeout: 300_000,
    windowsHide: true,
    env: { ...process.env, ELECTRON_RENDERER_URL: "" },
  });
  if (r.status !== 0) throw new Error(`electron-vite build failed (${r.status ?? r.error?.message}):\n${r.stderr}`);
  built = true;
}

export interface LaunchedApp {
  app: ElectronApplication;
  /** Every renderer console line the main process forwarded (`renderer|<level>|<text>`), plus main's own stdout. */
  stdout: string[];
  home: string;
  close(): Promise<void>;
}

export async function launchApp(extraEnv: Record<string, string> = {}): Promise<LaunchedApp> {
  const home = mkdtempSync(join(tmpdir(), "dsdude-e2e-"));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== "ELECTRON_RENDERER_URL") env[k] = v;
  const app = await _electron.launch({
    args: ["."],
    cwd: appDir,
    env: { ...env, DSDUDE_HOME: home, ...extraEnv },
    timeout: 60_000,
  });
  const stdout: string[] = [];
  app.process().stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split(/\r?\n/)) if (line) stdout.push(line);
  });
  return {
    app,
    stdout,
    home,
    async close() {
      await app.close().catch(() => undefined);
      rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    },
  };
}
