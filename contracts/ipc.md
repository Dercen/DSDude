# C5: IPC channel map

Version: 0.1.0 · Owner: WS6 · Changes: see the tiers in contracts/README.md

The typed channels between the IDE's renderer and its main process. Phase-0 channel list and zod stubs by WS0; WS6
owns this file and `packages/ipc-contract` from the tag (WS0 holds them until `start-ws6`) and completes them.
Source: PLAN.md section 5.2 C5. The schemas live in `packages/ipc-contract/src/channels.ts`
(`invokeChannels`, `eventChannels`, `DsdudeBridge`).

## Invoke channels (renderer -> main)

| Channel | Request | Response |
|---|---|---|
| `project.open` | `{dir}` | `{project, diagnostics}` (project payload: stub) |
| `project.save` | `{dir, project}` | `{ok: true}` |
| `project.create` | `{dir, name, template?}` | `{dir}` |
| `assets.import` | `{projectDir, kind: sprite\|background\|sound, sourcePath, name}` | `{name, diagnostics}` |
| `assets.preview` | `{projectDir, sprite}` | stub: C12 `previewSprite` result |
| `build.play`, `build.build`, `build.compileOnly` | C4 `BuildRequest` | C4 `BuildResult` (JSON form) |
| `build.cancel` | `{}` | `{ok: true}` |
| `emulator.stop` | `{}` | `{ok: true}` |
| `emulator.status` | `{}` | `{running, kind, pid}` |
| `emulator.install` | `{kind: melonds\|desmume}` | `{exe}` |
| `settings.get` / `settings.set` | `{key}` / `{key, value}` | `{value}` / `{ok: true}` |
| `toolchain.status` / `toolchain.install` | `{}` | `{installed, blocksdsVersion, diagnostics}` / `{installed, diagnostics}` |
| `doctor.run` | `{}` | `{checks: [{name, ok, detail}]}` |

## Event channels (main -> renderer)

| Channel | Payload |
|---|---|
| `build.log` | `{lines}` |
| `build.progress` | `{phase, progress}` (0..1) |
| `build.diagnostics` | `{diagnostics}` (C9) |
| `emulator.log` | `{lines}`: `DSD|` lines (C8) with the `DSD|PAD|` pad dropped |
| `emulator.exit` | `{code}` |
| `project.changed` | `{paths}` (project-relative) |

## Rules

- The preload exposes only `invoke(channel, request)` and `on(channel, listener)` for the listed channels
  (`DsdudeBridge`), through `contextBridge`, in one self-contained CJS file (sandboxed preload).
- Main validates the sender (the app's own window) and the request schema on every invoke, and the renderer
  validates event payloads in development builds.
- Payloads are plain JSON: no class instances, `Uint8Array` only where a channel says so.

## How to change me

- T0 (wording, comments): WS6 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new channel, an optional field): minor version bump + CHANGELOG entry in one commit; WS0 reviews within
  24 hours.
- T2 (renaming or removing a channel, a new required field): an ADR co-signed by WS1/WS8, WS6b and WS7.
