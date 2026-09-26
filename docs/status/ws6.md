# WS6 IDE shell status

Local slot 3, hybrid mode, branch `ws6-ide`. Started 2026-09-25 (phase0 tag).

## Progress
- **Task 1: skeleton + spike 13: done (2026-09-26).**
  - `apps/ide`: electron-vite 5.0.0, CJS main/preload (no `"type": "module"`), React 19 renderer.
    - Main: `sandbox: true` set explicitly, contextIsolation, no nodeIntegration, `setWindowOpenHandler` allows only dockview `popout.html`, `will-navigate` blocked off-origin, all permission requests denied.
    - `app://ide` is registered as standard/secure/supportFetchAPI before ready and served from `out/renderer` with a traversal guard. The `file://` fallback is `DSDUDE_RENDERER_FILE=1`.
    - The CSP from PLAN 2.5 is in `index.html`; a unit test keeps it equal to `src/main/security.ts`.
    - `userData` = `DSDUDE_HOME\userData`; the dev-server port is `DSDUDE_PORT_BASE` (strictPort).
    - Renderer console lines go to main's stdout as `renderer|<level>|<text>`, so tests and dev logs can see them.
  - Bundling: electron-vite externalises only `dependencies`. `@dsdude/*` are devDependencies, so they are always bundled; main also bundles chokidar and zod (`externalizeDeps.exclude`); preload uses `externalizeDeps: false` and builds to one CJS file whose only `require` is `electron` (checked in `out/preload/index.js`).
  - Preload: `window.dsdude` = `{invoke, on}` for the C5 channel lists only; listeners never see the IpcRendererEvent.
  - Playwright `_electron` suite in `apps/ide/tests/` (`npm run test:e2e -w apps/ide`). It runs `electron-vite build` (5-minute timeout), then `_electron.launch({args:['.'], cwd})` with a temporary `DSDUDE_HOME`, and skips when `DSDUDE_SKIP_ELECTRON=1`. `tests/package.json` sets `"type": "module"` for the specs only, so `import.meta.dirname` works while the app stays CJS.
- **Spike 13 result: PASS, no fallback needed (Monaco 0.57.0 stays pinned).**
  - Built app, `app://` and `file://` (`tests/spike13.spec.ts`, 2/2 green):
    - dockview-react 8.3.1 and Monaco 0.57 (`monaco-editor/editor` + `features/register.all` + `editor/editor.worker?worker`) mount in the sandboxed, CSP'd window.
    - Typing works, and Ctrl+Space shows a word-based suggestion computed in the editor worker.
    - Playwright's `page.workers()` lists the dedicated worker.
    - No "Could not create web worker", getWorker, CSP or renderer error lines.
    - `typeof require` and `typeof process` are `undefined` in the renderer, and the bridge exposes only `invoke`/`on`.
    - Screenshot checked: tabs `step.dss` and `Output`, the typed text and the suggest widget.
  - `electron-vite dev` (40 s run, then `taskkill /T /F`): the main and preload builds, the dev server on 5160, `dockview|ready`, `monaco|mounted` and `monaco|worker|editorWorkerService` all logged, with no CSP or worker warnings (React StrictMode mounts twice in dev). Afterwards, no `electron` process was left.
  - Notes:
    - The renderer bundle is 9.1 MB, mostly Monaco `register.all`; trim to selected features later if startup suffers.
    - Rollup warns about zod 4.6.5 `@__PURE__` comment placement while bundling the preload; this is harmless.
- Electron: `node_modules\electron\path.txt` was present after the worktree `npm install` (no manual `install-electron`).

## Next
- Task 2: C5 IPC: complete the schemas, main-side handler registry with sender + schema validation, `contracts/ipc.md` bump.

## Leftovers / ADR-pending
- None.

## Integration feedback
