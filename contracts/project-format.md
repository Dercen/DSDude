# C1: Project format

Version: 0.1.0 · Owner: WS0 · Changes: see the tiers in contracts/README.md

A DSDude project is a folder of JSON files, PNG/WAV/module assets and `.dss` sources. The zod schemas and the
loader live in `packages/project-format` (`src/schema.ts`, `src/project.ts`); this file is the human-readable spec.
Source: PLAN.md section 5.2 C1. `formatVersion` is **0** (the first format; migrations start with the first change
after it).

## Layout

```
<project>/
  project.json
  icon.png                         any PNG; the pipeline quantises it to 32x32, <= 15 colours + transparent
  sprites/<name>/sprite.json       + sheet.png (horizontal strip of frames)
  backgrounds/<name>/background.json + <file> (default background.png)
  sounds/<name>/sound.json         + <file>: .wav/.mp3 effects, .xm/.mod/.it/.s3m music
  objects/<name>/object.json       + <event>.dss per event (contracts/events.md) + optional functions.dss
  rooms/<name>/room.json
  scripts/<name>.dss               global functions
```

**Names.** Every sprite, background, sound, object, room and script name is a DSS name: ASCII letters, digits and
`_`, starting with a letter or `_`, at most 63 characters (`^[A-Za-z_][A-Za-z0-9_]{0,62}$`). All six kinds share
one namespace (E298). The folder name is the name.

## Files

All JSON files are written as `JSON.stringify(value, null, 2)` plus a final LF, with fields in the order below.
Fields marked "default" may be omitted when reading; `save()` always writes them.

**`project.json`**

| Field | Type | Notes |
|---|---|---|
| `formatVersion` | `0` | a newer number is E296 |
| `name` | name | the project's short name |
| `title` | string, 1-127 | shown in the DS menu |
| `subtitle` | string <= 127, default `""` | |
| `author` | string <= 127, default `""` | |
| `gamecode` | `"####"`, default | fixed in 0.1: melonDS treats a two-ELF ROM with its ARM9 at 0x4000 as homebrew by this code; hidden in Game Settings |
| `icon` | path, default `"icon.png"` | project-relative |
| `firstRoom` | room name | must be in `rooms` |
| `rooms` | room names, >= 1 | room order (`room_goto_next/previous`); lists every folder in `rooms/` exactly once (E297) |

**`sprites/<name>/sprite.json`**

| Field | Type | Notes |
|---|---|---|
| `frames` | int >= 1 | frames in `sheet.png`, left to right |
| `frameWidth`, `frameHeight` | int >= 1 | one frame's size |
| `origin` | `{x, y}` ints | new imports: the frame centre |
| `bbox` | `{left, top, right, bottom}` ints >= 0, inclusive | new imports: the opaque bounds |
| `colorMode` | `"auto"` \| `"16"` \| `"256"`, default `"auto"` | |
| `transparent` | `"alpha"` \| `"#rrggbb"`, default `"alpha"` | |

Import defaults: the frame count is editable in the import dialog (with an animated preview), and an image whose
size is exactly one OBJ size imports as one frame.

**`backgrounds/<name>/background.json`**: `{file}` (default `"background.png"`).

**`sounds/<name>/sound.json`**: `{kind: "effect" | "music", file}`. mp3 as music is an E4xx from the asset pipeline
(PLAN.md 2.9).

**`objects/<name>/object.json`**

| Field | Type | Default |
|---|---|---|
| `sprite` | sprite name \| null | null |
| `parent` | object name \| null | null (a parent loop is E299) |
| `visible` | bool | true |
| `depth` | int | 0 |
| `screen` | `"top"` \| `"bottom"` | `"top"` |

Every other `*.dss` file in the folder is an event, keyed by its stem (`create`, `step`, `collision_obj_pipe`, ...;
the valid stems are in `contracts/events.md`, checked by the compiler). `functions.dss` holds object-scoped
functions.

**`rooms/<name>/room.json`**

| Field | Type | Default |
|---|---|---|
| `width`, `height` | int >= 1 | |
| `layout` | `"separate"` | `"separate"` (the only 0.1 value; `"stacked"` is reserved for v1.1) |
| `screens.top`, `screens.bottom` | `{background: name \| null, viewX: int, viewY: int}` | `{null, 0, 0}` |
| `instances` | `[{object, x, y, screen?, creationCode?}]` | `[]`; `screen` defaults to the object's screen |

## The in-memory Project and the API

```ts
import { load, save, type Project, type ProjectFs } from "@dsdude/project-format";   // browser-safe
import { loadProject, saveProject, nodeFs } from "@dsdude/project-format/node";      // Node adapter
```

- `load(fs, dir) -> {project, diagnostics}`. `project` is null only when `project.json` is missing or unusable;
  otherwise broken resources are left out and reported. Resource lists are sorted by name (code point), except
  `rooms`, which follow `project.json`.
- `Project = {dir, project, sprites, backgrounds, sounds, objects, rooms, scripts}`: each resource is its JSON
  fields plus `name`; objects add `events` (stem -> source) and `functions` (source or null); scripts are
  `{name, source}`.
- `save(fs, dir, project)` writes every JSON and `.dss` file in canonical form; `load` then `save` reproduces a
  canonical project byte for byte. It never deletes files and never writes images or sounds.
- `ProjectFs = {readFile, writeFile, readDir, exists}` over UTF-8 text with `/` paths; `writeFile` creates folders.

Diagnostics use C9 (`contracts/diagnostics.md`), codes E290-E299 from
`packages/project-format/src/diagnostics/catalog.ts`.

## How to change me

- T0 (wording, comments): WS0 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new optional field with a default, a new resource kind that old projects simply lack): minor version bump
  + CHANGELOG entry; `formatVersion` stays.
- T2 (anything an existing project would fail or read differently): an ADR, a `formatVersion` bump and a migration
  in `packages/project-format`, co-signed by WS4, WS5, WS6 and WS7.
