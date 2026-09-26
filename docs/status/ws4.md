# WS4 DSS language + compiler status

Cloud push target: `ws4-compiler`

Mode: **hybrid**, cloud session (environment `dsdude-ws4`), launched 2026-09-26 from `start-ws4`.
start.sh (2026-09-26): node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green.

## Progress

- **Task 1, parser: done** (2026-09-26).
  - `packages/compiler/src/syntax/`: hand-written lexer (`lexer.ts`), AST (`ast.ts`, internal to WS4), recursive
    descent + precedence-climbing parser (`parser.ts`) with optional semicolons, resync on `;`, statement keywords,
    `}` and new lines, W030 (`=` read as `==` in conditions and nested values) and W032.
  - Recovery: one mistake yields one diagnostic (tested for every E1xx code). Missing closers are reported once and
    treated as present; a `function` inside a block reports E103 at the innermost open `{`; GameMaker operators
    (`&`, `|`, `<<`, `??`, `%=`, ...) are reported once (E122) and replaced by the nearest DSS operator.
  - `packages/compiler/src/diagnostics/`: `catalog.ts` (E101-E129, W030, W032; banned-word test) and `report.ts`
    (Reporter + LineMap, C9 shape via `makeDiagnostic`).
  - Every `samples/**/*.dss` and `fixtures/conformance/**/*.dss` parses with zero diagnostics (test).
  - language.md T0 clarifications (CHANGELOG): strings close on their own line; a `return` value starts on the
    `return`'s line.
- **Package layout change:** `@dsdude/compiler` holds the whole front end (it owns the C9 catalog, which the parser
  needs), and `@dsdude/lang` (C7 `host.ts`) now depends on `@dsdude/compiler`, not the reverse. Both `package.json`s
  changed. **WS0: please regenerate `package-lock.json`** (the workspace entries for `packages/compiler` and
  `packages/lang` are stale; nothing else changes).

- **Task 2, codegen: in progress.**
  - Program form done (2026-09-26): `compileProgram()` (`src/program.ts`) and the per-function code generator
    (`src/codegen/function.ts`). Locals get fixed registers, temporaries a stack above them (a single-pass
    allocation; the PLAN's IR + linear scan is only needed for frames over 64 registers, which report E492).
  - `v0/01-arith` compiles byte-identically to WS0's hand-assembled `fixtures/bytecode/conformance/v0-01.dsda`.
  - New catalog entries: E201-E204, E301-E307, E492, E493 (did-you-mean via `src/diagnostics/suggest.ts`).

## Next

- ADR-0003 (provisional opcode operands: `sym`/`bivar` operand kinds, GETBIX/SETBIX/GETBIO/SETBIO), then project
  codegen: slot layouts, OBJS, events, `with`, ROOMS with per-screen asset sets, ASET; goldens for `samples/*`.

## Goldens (tier status)

- `fixtures/compiler/conformance/v0/*.dsda` + `.dsdb` (all five v0 programs; `.dsdb` from `node tools/gen-dsdb.ts`):
  disassembly snapshots; they execute once WS2's VM lands v0 (**WS2: these can replace hand-assembling v0 02-05**).
- Regenerate: `DSDUDE_UPDATE_GOLDENS=1 npx vitest run packages/compiler`, then `node tools/gen-dsdb.ts`.

## Open ADR-pending markers

- None.

## Integration feedback
