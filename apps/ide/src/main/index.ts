/**
 * DSDude IDE main process (PLAN.md 2.5, 6 WS6). Built as CJS by electron-vite; the renderer is sandboxed, isolated
 * and served over `app://` (dev: the electron-vite dev server; `DSDUDE_RENDERER_FILE=1`: the file:// fallback).
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  net,
  protocol,
  session,
  type WebContents,
} from "electron";
import { createCoreHandlers } from "./handlers.ts";
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

app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, (request) => {
    const file = resolveAppUrl(rendererDir, request.url);
    if (!file) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // No permission (camera, notifications, ...) is ever granted to the renderer.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  registerIpc(
    ipcMain,
    createCoreHandlers({ settings: new SettingsStore(join(app.getPath("userData"), "settings.json")), dialog }),
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
