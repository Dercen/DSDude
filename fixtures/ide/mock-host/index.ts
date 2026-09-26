/**
 * fixtures/ide/mock-host (C12): the IDE's renderer services without Electron, for headless Chromium.
 * The implementation lives in apps/ide (type-checked and tested there); import it as `@dsdude/ide/mock-host` from a
 * workspace package, or from this file by relative path. See README.md.
 */
export * from "../../../apps/ide/src/renderer/mock-host/index.ts";
