# C5: IPC channel map

Version: 0.8.0 · Owner: WS6 · Changes: see the tiers in contracts/README.md

The typed channels between the IDE's renderer and its main process. Source: PLAN.md section 5.2 C5. The Phase-0
channel list and zod stubs were written by WS0; WS6 completed them in 0.2.0. The schemas live in
`packages/ipc-contract/src/channels.ts` (`invokeChannels`, `eventChannels`, `DsdudeBridge`, plus the payload schemas
below), and the Electron-free validation helpers in `packages/ipc-contract/src/dispatch.ts`.

## Payload schemas

| Schema | Mirrors | Notes |
|---|---|---|
| `ProjectSchema` | C1 `Project` | The whole in-memory project: JSON files and DSS sources, never images or sounds. `tsc -b` fails if it drifts from C1. |
| `BuildRequestSchema`, `BuildResultSchema`, `BuildPhaseSchema` | C4 `BuildRequest`, `BuildResult`, `BuildPhase` | Linked to C4 at compile time, key sets included (an optional field on one side only fails `tsc -b`). |
| `PlayResultSchema` | C4 `PlayResult` | `emulator` is `{kind, pid}` or null instead of the handle. |
| `SpritePreviewSchema`, `PreviewSpriteOptionsSchema` | C12 `SpritePreview`, `PreviewSpriteOptions` | `indices` is a `Uint8Array`: the only binary payload. |
| `SettingsSchema` (+ `ControlsSchema`) | `settings.json` under userData | Every key has a default. `controls` defaults to the PLAN 6 WS6 Controls mapping. `learnOpened` (0.4.0): the Learn panel has opened once. |
| `DiagnosticSchema` | C9 | Used in every `diagnostics` field. |
| `AssetPathSchema` (0.4.0) | - | A project-relative path (`isSafeRelativePath`: `/` separators, no leading `/`, drive, `:`, `.`/`..` segment or backslash) ending in `.png`, `.wav`, `.mp3`, `.xm`, `.mod`, `.it` or `.s3m`. |
| `TemplateIndexSchema` (0.7.0) | `templates/index.json` (WS7's file) | `{templates: [{id: /^[a-z0-9-]+$/, title, description = "", dir}]}`, at least one; `dir` is a safe folder under `templates/` holding a complete C1 project; listed in wizard order. |
| `LearnPathSchema`, `LearnDocSchema` (0.4.0) | - | `docs/tutorial/...md`, `docs/manual/...md` or `docs/reference/...md`; a document is `{path, title, section}`. |

## Invoke channels (renderer -> main)

| Channel | Request | Response |
|---|---|---|
| `project.open` | `{dir}` | `{project: Project \| null, diagnostics}` (C1 `LoadResult`; null only when project.json is unusable) |
| `project.save` | `{dir, project: Project}` | `{ok: true}` (C1 `save`: writes every JSON/DSS file, never deletes) |
| `project.create` | `{dir, name, template?}` | `{dir}`: creates `<dir>/<name>` from the template (default `empty`), refusing an existing non-empty folder, and sets project.json's `name` and `title` (0.7.0 pins these semantics); returns the new folder |
| `project.templates` (0.7.0) | `{}` | `{templates: [{id, title, description}]}` from `templates/index.json` (`TemplateIndexSchema`); without it a built-in Empty template (plus, in development only, the repo's `samples/*`) |
| `app.info` (0.7.0) | `{}` | `{version, packaged, defaultProjectsDir, oneDriveDirs}` |
| `assets.import` | `{projectDir, kind: sprite\|background\|sound, sourcePath, name}` | `{name, diagnostics}` |
| `assets.preview` | `{projectDir, sprite?, sourcePath?, options?}`: exactly one of `sprite`/`sourcePath`; `sourcePath` needs `options` | `SpritePreview` (C12) |
| `build.play` | C4 `BuildRequest` (incl. `debug`, 0.3.0) | `PlayResult` (`BuildResult` + `emulator`) |
| `build.build`, `build.compileOnly` | C4 `BuildRequest` | C4 `BuildResult` |
| `build.cancel` | `{}` | `{ok: true}` |
| `build.manifest` (0.6.0) | `{projectDir}` | `{manifest}`: the project's `<DSDUDE_HOME>\build\<project-hash>\assets.manifest.json` (C3) through `ManifestSummarySchema` (the fields the meters read, all optional, unknown fields kept), or null before the first build or when unreadable |
| `emulator.stop` | `{}` | `{ok: true}` |
| `emulator.status` | `{}` | `{running, kind, pid}` |
| `emulator.install` | `{kind: melonds\|desmume}` | `{exe}` |
| `settings.get` | `{key}` (a `SettingsSchema` key) | `{value}` |
| `settings.set` | `{key, value}` (value checked against that key's schema) | `{ok: true}` |
| `settings.getAll` (0.2.0) | `{}` | `{settings}` (defaults filled in) |
| `toolchain.status` / `toolchain.install` | `{}` | `{installed, blocksdsVersion, diagnostics}` / `{installed, diagnostics}` |
| `doctor.run` | `{}` | `{checks: [{name, ok, detail, status?}]}`: C10 `dsdude doctor`'s checks; `status` (0.8.0) is `ok`, `warn`, `fail` or `info`, and `ok` is false only for `fail` |
| `project.readFile` (0.4.0) | `{dir, path: AssetPath}` | `{bytes: Uint8Array}` |
| `project.writeFile` (0.4.0) | `{dir, path: AssetPath, bytes: Uint8Array}` | `{ok: true}` (temp file + rename; creates the folder). JSON and DSS files go through `project.save`. |
| `learn.list` (0.4.0) | `{}` | `{docs: [{path, title, section}]}`: tutorial, then manual, then reference; `assets/` folders skipped; title = first `# ` heading, else the file name |
| `learn.read` (0.4.0) | `{path: LearnPath}` | `{path, markdown, images}`: `images` maps each relative image source as written in the markdown to a `data:image/(png\|jpeg\|gif\|webp);base64,` URL; remote images and files outside `docs/` are never included |
| `learn.openAssets` (0.5.0) | `{}` | `{path}`: opens `docs/tutorial/assets/` (under the same root as `learn.*`) in the file manager (Help > Tutorial assets); fails when the folder is missing |
| `dialog.open` (0.2.0) | `{kind: directory\|file, title?, defaultPath?, filters?}` | `{paths}` (empty when cancelled) |

## Event channels (main -> renderer)

| Channel | Payload |
|---|---|
| `build.log` | `{lines}`: new build-output lines (C4 `BuildEvent.log` before phase `running`) |
| `build.progress` | `{phase: BuildPhase, progress}` (0..1) |
| `build.diagnostics` | `{diagnostics}` (C9): cumulative for the current request, so it replaces the previous list |
| `emulator.log` | `{lines}`: `DSD|` lines (C8), the `DSD|PAD|` pad dropped, batched ~30 ms |
| `emulator.exit` | `{code}` (null when killed) |
| `project.changed` | `{paths}` (project-relative, `/` separators) |

## Rules

- The preload exposes only `invoke(channel, request)` and `on(channel, listener)` for the listed channels
  (`DsdudeBridge`) through `contextBridge`, in one self-contained CJS file (sandboxed preload). Listeners never
  receive the `IpcRendererEvent`.
- Main checks the sender first. It must be the main frame of an IDE window on a trusted origin (`app://ide`, the dev
  server, or `file://` in the spike fallback). Main then runs `dispatchInvoke`, which validates the request, calls the
  handler and validates the response. Main validates every event payload before sending it; the renderer validates
  it again in development builds.
- Errors: an invoke rejects. Contract-layer failures carry a `[code]` prefix: `unknown-channel`, `bad-sender`,
  `bad-request`, `bad-response` or `not-implemented`. `parseIpcError` recovers `{code, message}` from Electron's
  wrapped message; handler errors come through as code `failed`.
- Payloads are plain JSON, except for `Uint8Array` where a channel says so (`assets.preview`, `project.readFile`,
  `project.writeFile`).
- Main resolves `project.*File` paths inside the project folder and `learn.*` paths inside the folder that holds
  `docs/` (the repo in development, `resources/` when packaged, or `DSDUDE_DOCS_DIR`'s parent), and refuses
  anything that would leave it.
- Without Electron (the mock host, browser and node tests), `createLocalBridge(handlers)` gives the same bridge with
  the same validation and structured-clone copies.

## How to change me

- T0 (wording, comments): WS6 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new channel, an optional field): minor version bump + CHANGELOG entry in one commit; WS0 reviews within
  24 hours.
- T2 (renaming or removing a channel, a new required field): an ADR co-signed by WS1/WS8, WS6b and WS7.
