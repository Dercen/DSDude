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

- **Task 2: C5 IPC 0.2.0: done (2026-09-26).** T1 bump with a CHANGELOG line; the stub narrowings are listed there for WS0's review.
  - `packages/ipc-contract`:
    - One zod schema per channel. The whole C1 `Project` crosses IPC (`ProjectSchema`).
    - `SettingsSchema` is typed, and `controls` defaults to the PLAN Controls mapping.
    - `assets.preview` returns C12 `SpritePreview` (a `Uint8Array`) for an existing sprite or an import source.
    - `build.progress` carries a C4 `BuildPhase`.
    - New channels: `settings.getAll` and `dialog.open`.
    - Compile-time links (`tsc -b`) to C1 `Project`, C4 `BuildRequest`/`BuildResult`/`BuildPhase` and C12 `SpritePreview`.
  - `dispatch.ts` (Electron-free):
    - `dispatchInvoke` validates the request, runs the handler and validates the response.
    - `validateEvent` checks event payloads.
    - `createLocalBridge` provides the same bridge without Electron, for the mock host and tests.
    - `parseIpcError` handles the `[code]` error prefix (`unknown-channel`, `bad-sender`, `bad-request`, `bad-response`, `not-implemented`).
  - Tests: one valid request/response plus one invalid request per invoke channel, a valid/invalid payload per event (a missing sample is a type error), `samples/flappy` round-trips through `ProjectSchema` unchanged, and 55 tests in all.
  - `apps/ide` main:
    - `registerIpc` checks the sender (main frame of a tracked IDE window on a trusted origin) before the schema, for every channel.
    - `createEventSender` validates event payloads before sending them.
    - `SettingsStore` writes `userData\settings.json` atomically and keeps valid fields of a damaged file.
    - Core handlers: `project.open`/`project.save` over `@dsdude/project-format/node`, `settings.*` and `dialog.open`.
    - Build, emulator, assets, toolchain and doctor answer `[not-implemented]` until task 3 (worker + MockBuildService) and task 5 (real BuildService).
  - Renderer: `src/renderer/ipc.ts`, a typed client that re-validates events in dev builds; `setBridge` lets the mock host inject a bridge.
  - `tests/ipc.spec.ts` (`_electron`, green) covers:
    - settings persisting to `DSDUDE_HOME\userData\settings.json`;
    - `samples/flappy` opening through the real preload;
    - bad requests, unknown channels and unimplemented channels being refused with their codes.
  - The preload bundle still `require`s only `electron`.
- **Lockfile:** `packages/ipc-contract/package.json` now depends on `@dsdude/asset-pipeline` (for the type-only C12 link). WS0: please regenerate `package-lock.json` at the next integration. Nothing breaks without it, because the workspace link already exists.

## Next
- Task 3: zustand store over project-format, dockview layout (project tree, editor tabs, Output, Problems), build worker + EmulatorManager host, Play/Stop against `MockBuildService`.

## Leftovers / ADR-pending
- None.

## Integration feedback
