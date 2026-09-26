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

- **Task 2, codegen: done** (2026-09-26).
  - Program form: `compileProgram()` (`src/program.ts`); per-function code generator `src/codegen/function.ts`.
    Locals get fixed registers, temporaries a stack above them (a single-pass allocation; the PLAN's IR + linear
    scan is only needed for frames over 64 registers, which report E492). `v0/01-arith` compiles byte-identically to
    WS0's hand-assembled `fixtures/bytecode/conformance/v0-01.dsda`.
  - Projects: `compileProjectModule()` / `compileProject()` (`src/project.ts`, C4 `CompileFn` shape): event-name
    checks (E308/E309), object functions (inherited; another object's helper is E205), scripts, room creation code,
    slot layouts (parent first, then own assigned names sorted; E491 over 24), `with` (target's slots inside, `other`
    = outer self), collision `other` slots, dynamic names (GETDYN/SETDYN) for scripts, `with (all)` and a parent
    reading a child's variable, OBJS/ROOM/ASET, per-screen room asset sets (placed objects, `instance_create`
    closure, scripts called, `draw_set_screen` = both screens) returned as C4 `roomSets`.
  - FUNC names: events `<obj>__<stem>`, object functions `<obj>__fn_<name>`, creation code `<room>__inst_<i>`,
    scripts by their own name.
  - ADR-0003 (proposed, needs WS2): operand kinds `sym`/`bivar`, GETBIX/SETBIX (55-56), GETBIO/SETBIO (57-58), the
    `with` loop shape, NEWARR/SETIDX meaning. opcodes.json and dsdb.md 0.2.0 (T1), packages/dsdb supports them.
  - Catalog: E201-E205, E208, E301-E309, E491-E494.
  - ASET paths (`gfx/<name>.grf`, `bg/<name>.grf`, sounds `""`) and `aux` follow the provisional C4 AssetManifest
    until WS5's C3 (`contracts/assetpack.md`).

## Next

- Task 3: `dsdude compile` in `cliCommands`, DBG/ABI writer checks (done by `encode`), `compileProject` wiring note
  for WS1 (CP-B).
- Task 4: C7 `LanguageServiceHost` in `packages/lang/src/host.ts` (by CP-B).
- Leftovers: object functions bind statically (an inherited parent event calls the parent's helper even when a
  child overrides it; events.md section 3 says the child's wins); constant folding (task 7).

## Goldens (tier status)

- `fixtures/compiler/conformance/v0/*.dsda` + `.dsdb` (all five v0 programs): disassembly snapshots; they execute
  once WS2's VM lands v0 (**WS2: these can replace hand-assembling v0 02-05**).
- `fixtures/compiler/samples/{minimal,flappy}.dsda` + `.dsdb` + `.roomsets.json`: disassembly snapshots (tier v2-v4
  features: slots, `with`, alarms, collisions, draw). Flappy compiles in ~6 ms warm (budget 100 ms).
- Regenerate: `DSDUDE_UPDATE_GOLDENS=1 npx vitest run packages/compiler`, then `node tools/gen-dsdb.ts`.

## Open ADR-pending markers

- `ADR-pending ADR-0003` in `packages/compiler/src/codegen/function.ts` (GETDYN/SETDYN, GETBI*, WITH*): until WS2
  co-signs ADR-0003.

## Integration feedback
