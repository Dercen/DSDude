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
- **Lockfile:** `packages/ipc-contract/package.json` depends on `@dsdude/asset-pipeline` (the type-only C12 link); WS0 regenerated the lockfile at checkpoint-1 (`b23a325`).
- **2026-09-26: merged `main` (checkpoint-1; fast-forward, both earlier WS6 commits were already on main). No `IF-` entries for WS6.**
- **C5 0.3.0 (T1):** `BuildRequestSchema` gains optional `debug` (follows C4 0.3.0). The compile-time C1/C4/C12 links missed it, because mutual assignability ignores an optional key on one side only. They now also compare key sets, and I verified that dropping `debug` fails `tsc -b`.
- **Task 3: store, layout, Play/Stop against the mock: done (2026-09-26).**
  - Main (PLAN 3.2):
    - A `utilityProcess` build worker, `out/main/build-worker.js` (a second main entry), runs `BuildService.build`/`compileOnly` for steps 3-6.
    - `BuildWorkerHost` forks it lazily (one per app), times each request out after 12 min (killing the worker) and forks a fresh one after a crash.
    - `PlayController` runs step 7 in main through the EmulatorManager. It turns BuildEvents into `build.progress`, `build.log` (30 ms batches) and `build.diagnostics` (sent only when they change), and emulator lines into `emulator.log` (30 ms batches, `DSD|PAD|` dropped) and `emulator.exit`.
    - The Controls line is the first Output line of every launch.
    - `reconcile()` runs at startup, and a graceful stop plus `reconcile()` run before quit (C4 0.3.0).
  - Build-service switch (`src/main/build/modes.ts`):
    - `mock` (default until CP-B): MockBuildService plus fake emulators.
    - `fake` (`DSDUDE_FAKE_TOOLCHAIN=1`): createFakeToolchain, i.e. the real LocalBuildService with fake tools.
    - `real` (`DSDUDE_BUILD_SERVICE=real`): LocalBuildService plus LocalEmulatorManager, with `deps` still null (task 5).
    - `DSDUDE_MOCK_DIAGNOSTICS` (JSON) makes the mock fail, for tests.
  - Bundling: `import.meta.url` in bundled `packages/*` sources is pinned to the source file's URL (an electron-vite transform). Otherwise the toolchain's fixture and screenshot paths would resolve relative to `out/main`. This matters for development and test builds only; WS8's packaged app uses resources.
  - Renderer:
    - A zustand store (`src/renderer/store/ide.ts`) over the C1 Project. Document ids are project-relative paths, the same strings as C9 `file`.
    - The store tracks dirty documents, saves through `project.save`, and saves dirty documents before Play.
    - Output keeps the newest 5000 lines. Problems deduplicates load, build and runtime (`DSD|ERR`) diagnostics.
    - A failed Play shows 'Fix N problem(s) to play' and focuses Problems.
    - A C8 parser (`log.ts`) drops PAD and unknown line types; STAT and MEM figures are kept for the meters.
    - dockview layout (`workbench.ts`): project tree | document tabs (Monaco, one model per document, plain text) | Output + Problems.
    - Problems entries become Monaco markers, and a Problems click opens the file at its line.
    - Toolbar with Open, Save, and Play/Stop; a status bar with the phase and fps; toast.
    - Keys: Ctrl+S saves, F5 plays, Shift+F5 stops. Output never activates itself.
    - The last project reopens at startup (`recentProjects`).
    - Resource JSON opens read-only until the forms and editors exist.
  - Tests (all green):
    - 49 node tests, including the store end to end through `createLocalBridge`, the real main handlers, PlayController and MockBuildService.
    - 6 Playwright `_electron` tests:
      - open flappy (folder dialog stubbed in main), edit, Ctrl+S, file on disk;
      - Play: Controls line, fake log, no PAD, status 'Game running'; Stop: 'Game ended';
      - failing build: toast, a Problems row, a click opens the file with a squiggle;
      - fake mode: LocalBuildService in the worker reports E641;
      - the spike 13 checks, updated to open a document first.
    - Screenshots checked. `electron-vite dev` starts cleanly with the worker entry. No `electron` process was left after any run.

## Next
- Task 4 (before CP-A): C12 `apps/ide/src/renderer/panels/api.ts` (EditorPanel + host services), `fixtures/ide/mock-host` (headless Chromium, no Electron), and the Learn panel host (markdown renderer + sanitiser).

## Leftovers / ADR-pending
- None open.
- Deferred:
  - chokidar `project.changed` watcher (with the object editor).
  - `assets.*`, `toolchain.*` and `doctor.run` handlers (tasks 5-6).
  - dockview layout persistence.
  - Unsaved-changes prompt on close.

## Integration feedback
