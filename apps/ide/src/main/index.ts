/**
 * DSDude IDE main process (PLAN.md 2.5, 6 WS6). Built as CJS by electron-vite; the renderer is sandboxed, isolated
 * and served over `app://` (dev: the electron-vite dev server; `DSDUDE_RENDERER_FILE=1`: the file:// fallback).
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, net, protocol, session } from "electron";
import { APP_ORIGIN, APP_SCHEME, resolveAppUrl } from "./protocol.ts";
import { isDockviewPopout, isTrustedRendererUrl } from "./security.ts";

const devServerUrl = process.env.ELECTRON_RENDERER_URL;
const rendererDir = join(__dirname, "../renderer");

// Per-worktree state: userData under DSDUDE_HOME, never DSDUDE_HOME itself (it also holds emulators\ and build\).
if (process.env.DSDUDE_HOME) app.setPath("userData", join(process.env.DSDUDE_HOME, "userData"));

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
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
