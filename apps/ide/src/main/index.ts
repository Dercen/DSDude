/**
 * DSDude IDE main process (PLAN.md 2.5, 6 WS6). Built as CJS by electron-vite; the renderer is sandboxed, isolated
 * and served over `app://` (dev: the electron-vite dev server; `DSDUDE_RENDERER_FILE=1`: the file:// fallback).
 */
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dsdudeHome } from "@dsdude/toolchain";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  utilityProcess,
  type WebContents,
} from "electron";
import { controlsLine, effectiveControls } from "../shared/controls.ts";
import { buildServiceMode, createEmulatorManager } from "./build/modes.ts";
import { PlayController } from "./build/play.ts";
import { BuildWorkerHost, type WorkerChild } from "./build/worker-host.ts";
import { createBuildHandlers, createCoreHandlers, createToolHandlers } from "./handlers.ts";
import { createEventSender, registerIpc, type SendEvent } from "./ipc.ts";
import { APP_ORIGIN, APP_SCHEME, resolveAppUrl } from "./protocol.ts";
import { isDockviewPopout, isTrustedRendererUrl } from "./security.ts";
import { SettingsStore } from "./settings.ts";

const devServerUrl = process.env.ELECTRON_RENDERER_URL;
const rendererDir = join(__dirname, "../renderer");

// Per-worktree state: userData under DSDUDE_HOME, never DSDUDE_HOME itself (it also holds emulators\ and build\).
if (process.env.DSDUDE_HOME) app.setPath("userData", join(process.env.DSDUDE_HOME, "userData"));

/** webContents of the IDE windows (and their dockview popouts): the only trusted IPC senders and event targets. */
const appContents = new Set<WebContents>();
function track(wc: WebContents): void {
  appContents.add(wc);
  wc.once("destroyed", () => appContents.delete(wc));
}

/** Sends a validated C5 event to every IDE window (build log, emulator log, project changes). */
export const sendEvent: SendEvent = createEventSender(() => appContents);

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: "DSDude",
    backgroundColor: "#1e1e1e",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true, // explicit: electron-vite's template ships sandbox: false
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  track(win.webContents);
  win.webContents.on("did-create-window", (child) => track(child.webContents));
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) =>
    isDockviewPopout(url, devServerUrl) ? { action: "allow" } : { action: "deny" },
  );
  win.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, devServerUrl)) event.preventDefault();
  });
  // You cannot see the window: renderer console lines go to stdout with a prefix (spike 13, Playwright, dev logs).
  win.webContents.on("console-message", (event) => {
    process.stdout.write(`renderer|${event.level}|${event.message}\n`);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    process.stdout.write(`renderer|gone|${details.reason}\n`);
  });

  if (devServerUrl) void win.loadURL(devServerUrl);
  else if (process.env.DSDUDE_RENDERER_FILE === "1") void win.loadFile(join(rendererDir, "index.html"));
  else void win.loadURL(`${APP_ORIGIN}/index.html`);
  return win;
}

/** The folder holding docs/: DSDUDE_DOCS_DIR's parent, resources/ when packaged (WS8), else the repo. */
function learnRoot(): string {
  if (process.env.DSDUDE_DOCS_DIR) return dirname(resolve(process.env.DSDUDE_DOCS_DIR));
  return app.isPackaged ? process.resourcesPath : resolve(app.getAppPath(), "../..");
}

/** Forks the build worker (out/main/build-worker.js) with main's env unchanged; its output goes to main's stdout. */
function forkWorker(): WorkerChild {
  const child = utilityProcess.fork(join(__dirname, "build-worker.js"), [], {
    serviceName: "DSDude build worker",
    stdio: "pipe",
    env: { ...process.env },
  });
  for (const stream of [child.stdout, child.stderr])
    stream?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) if (line) process.stdout.write(`worker|${line}\n`);
    });
  return child as unknown as WorkerChild;
}

app.whenReady().then(() => {
  const home = dsdudeHome(process.env);
  const mode = buildServiceMode(process.env);
  process.stdout.write(`main|build-service|${mode}\n`);
  const settings = new SettingsStore(join(app.getPath("userData"), "settings.json"));
  const emulators = createEmulatorManager(mode, home);
  const worker: BuildWorkerHost = new BuildWorkerHost({ spawn: forkWorker, onEvent: (e) => play.onBuildEvent(e) });
  const play: PlayController = new PlayController({
    worker,
    emulators,
    send: sendEvent,
    controlsLine: async () => controlsLine(effectiveControls({ controls: await settings.get("controls") })),
    defaultEmulator: () => settings.get("emulator"),
  });
  // An emulator an earlier IDE left running is killed at startup and before quit (C4 reconcile).
  void emulators.reconcile?.();
  let quitting = false;
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    const stopped = Promise.race([play.stop(), new Promise((r) => setTimeout(r, 5_000))]);
    void stopped
      .then(() => emulators.reconcile?.())
      .catch(() => undefined)
      .finally(() => {
        worker.dispose();
        app.quit();
      });
  });

  protocol.handle(APP_SCHEME, (request) => {
    const file = resolveAppUrl(rendererDir, request.url);
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // No permission (camera, notifications, ...) is granted to the renderer, except writing text to the clipboard
  // (the Learn panel's Copy buttons).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(permission === "clipboard-sanitized-write"),
  );
  registerIpc(
    ipcMain,
    {
      ...createCoreHandlers({
        settings,
        dialog,
        shell,
        learnRoot: learnRoot(),
        samplesDir: app.isPackaged ? null : resolve(app.getAppPath(), "../../samples"),
        appInfo: {
          version: app.getVersion(),
          packaged: app.isPackaged,
          defaultProjectsDir: join(app.getPath("home"), "DSDudeProjects"),
          oneDriveDirs: [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter(
            (d, i, all): d is string => !!d && all.indexOf(d) === i,
          ),
        },
      }),
      ...createBuildHandlers(play, emulators, home),
      ...createToolHandlers(mode),
    },
    (event: IpcMainInvokeEvent) => ({
      url: event.senderFrame?.url ?? null,
      isMainFrame: !!event.senderFrame && event.senderFrame.parent === null,
      isAppWindow: appContents.has(event.sender),
    }),
    devServerUrl,
  );
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
