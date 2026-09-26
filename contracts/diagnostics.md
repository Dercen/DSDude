# C9: Diagnostics

Version: 0.1.0 · Owner: WS0 · Changes: see the tiers in contracts/README.md

One shape for every problem DSDude reports: compiler, assets, build, runtime and the project loader. WS0 owns the
shape; each producer owns its code range and its catalog. Source: PLAN.md section 5.2 C9.

## Shape

```json
{
  "severity": "error",
  "code": "E101",
  "message": "The line ends before the ( on column 4 is closed.",
  "hint": "Add a ) before the end of the line.",
  "file": "objects/obj_bird/step.dss",
  "line": 3,
  "col": 4,
  "endLine": 3,
  "endCol": 9,
  "source": "compiler"
}
```

| Field | Type | Meaning |
|---|---|---|
| `severity` | `"error"` \| `"warning"` \| `"info"` | `error` blocks Play; `warning` (W0xx) does not; `info` is advice. |
| `code` | string | One code from the ranges below. |
| `message` | string | What happened (template below). |
| `hint` | string \| null | What to do; null when the message already says it. |
| `file` | string \| null | Project-relative, `/` separators. null when not tied to a file. |
| `line`, `col` | int >= 1 \| null | Start, 1-based. |
| `endLine`, `endCol` | int >= 1 \| null | Inclusive end; null means a single position. |
| `source` | `"project"` \| `"compiler"` \| `"assets"` \| `"toolchain"` \| `"runtime"` | The producer. |

The TypeScript form (`Diagnostic`, `Severity`, `DiagnosticSchema` in zod, `CatalogEntry`, `makeDiagnostic`) lives in
`packages/project-format/src/diagnostics.ts` and is exported from `@dsdude/project-format`. Every producer imports it
from there. Runtime `DSD|ERR|<code>|...` lines (C8) are converted into this shape by EmulatorManager's consumers.

## Code ranges and catalogs

| Range | Meaning | Catalog (owner) |
|---|---|---|
| E1xx | syntax | `packages/compiler/src/diagnostics/catalog.ts` (WS4) |
| E2xx except E290-E299 | names and assets, including unsupported GML names (C2) | `packages/compiler/src/diagnostics/catalog.ts` (WS4) |
| E290-E299 | project-file problems found by `project-format` | `packages/project-format/src/diagnostics/catalog.ts` (WS0) |
| E3xx | types, arity, event misuse | `packages/compiler/src/diagnostics/catalog.ts` (WS4) |
| E4xx except E490-E499 | hardware and asset limits | `packages/asset-pipeline/src/diagnostics/catalog.ts` (WS5) |
| E490-E499 | hardware limits the compiler detects (e.g. more than 24 user slots) | `packages/compiler/src/diagnostics/catalog.ts` (WS4) |
| E6xx | build and toolchain | `packages/toolchain/src/diagnostics/catalog.ts` (WS1, then WS8) |
| W0xx | lints | `packages/compiler/src/diagnostics/catalog.ts` (WS4) |
| R5xx | runtime | `runtime/core/diagnostics/catalog.json` (WS2; the runtime's messages follow it) |

Each catalog entry is `{code, severity, title, message, hint}` (`CatalogEntry`); `{name}` placeholders are filled by
the producer. `tools/gen-docs` (WS7) renders every entry of the five catalogs into `docs/reference/errors.md`.

## Rules

- **One mistake yields one diagnostic.** A missing `)` is one E1xx, not a cascade; a producer that cannot recover
  stops reporting in that region.
- **Message template:** what happened / what to do / where. The message says what happened; the hint says what to
  do; `file`/`line`/`col` say where. Write for a 12-year-old.
- **Banned words** in messages and hints: instruction, token, identifier, operand, arity, expression, opcode, VRAM,
  OAM, palette slot. Say "name", "value", "sprite memory", "colours" instead.
- **Codes are shown after the message, as a link** to the reference page (`E101` -> `docs/reference/errors.md#e101`),
  never before it.
- Runtime examples use the same voice: R510 is "obj_x / Step never finished: a loop there seems to run forever".
- Unsupported GML names get a dedicated E2xx message with a manual link, not a did-you-mean (C2): "image_alpha isn't
  available on the DS in DSDude 0.1. Try visible = false or a second sprite."

## Lints (W0xx, WS4)

Besides the lints the language spec names (W030 `=` in a condition, W032 a line starting with `(` or `[`, W04x
fractional array index, non-ASCII text passed to `draw_text`):
- a room with no instances on either screen;
- a placed object with no sprite and no Draw event. Objects with Visible off are exempt: that is the usual controller
  pattern (Flappy's `obj_ctrl`);
- an unused sprite.

A Monaco code action applies the did-you-mean fix. A failed Play shows a toast "Fix 1 problem to play" and focuses
the Problems panel.

## How to change me

- T0 (wording, examples, a new catalog entry inside a producer's own range): the owner of that text commits with a
  `contracts/CHANGELOG.md` line.
- T1 (a new optional field, a new `source` value, a new sub-range carved out for a producer): minor version bump +
  CHANGELOG entry; WS0 reviews within 24 hours.
- T2 (renaming or removing a field, changing a range's owner or meaning): an ADR co-signed by every producer
  (WS1/WS8, WS2, WS4, WS5) and WS6/WS7 as consumers.
