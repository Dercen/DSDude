/// <reference types="vite/client" />
import type { DsdudeBridge } from "@dsdude/ipc-contract";

declare global {
  interface Window {
    /** Exposed by the preload (C5): invoke/on for the listed channels only. */
    readonly dsdude: DsdudeBridge;
  }
}
