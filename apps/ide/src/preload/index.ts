/** Sandboxed CJS preload: one self-contained bundle (electron-vite, externalizeDeps: false). */
import { contextBridge, ipcRenderer } from "electron";
import { createBridge } from "./bridge.ts";

contextBridge.exposeInMainWorld("dsdude", createBridge(ipcRenderer));
