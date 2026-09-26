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

- **Task 3, `compileProject` + `dsdude compile`: done** (2026-09-26).
  - `compileProject` (C4 `CompileFn`) returns the DSDB (ABI hash, DBG table via `@dsdude/dsdb` `encode`) and
    `roomSets`; `compileProjectModule` adds options (`seed`) and the module.
  - `cliCommands` exports `compile` (`src/cli.ts`): `dsdude compile <project> [-o <file.dsdb>] [--seed N] [--json]`,
    default output `<DSDUDE_HOME>/build/<project-hash>/nitrofs/game.dsdb`, reads `<build>/assets.manifest.json`
    when present. `packages/cli` already registers it: `npx dsdude compile samples/flappy --json` works on Linux and
    writes the golden bytes; `dsdb-dis` round-trips them.
  - **For WS1 (cli.md is yours):** `compile --json` fields besides `ok`/`diagnostics`: `output`, `bytes`,
    `roomSets`, `ms` (please add the row, T1). `compile` does not run room budgets yet: `checkRoomBudgets` is WS5's
    and not on main; BuildService calls it after `compileProject` anyway.
  - Worker safety is a test (`src/worker-safe.test.ts`): nothing statically reachable from `src/index.ts` imports
    a Node API; the CLI imports Node modules dynamically.

- **Task 4, C7 `LanguageServiceHost`: done, 0.1.0** (2026-09-26; freezes at CP-B).
  - `packages/lang/src/host.ts`: `createLanguageServiceHost()`; plain data only (UTF-16 offsets into LF text,
    C9 diagnostics). Methods: `setProject(Project | null)`, `setFile`, `getFile`, `parse(text, file)` (syntax
    diagnostics + classified tokens), `check(file)` (full compiler diagnostics), `symbolsAt`, `completionsAt`
    (members after `x.`, globals after `global.`), `hover`, `definitionAt`, `referencesAt`, `signatureAt`,
    `documentSymbols`, `foldingRanges`, `format`.
  - Beyond PLAN's six methods, it adds what WS7's kickoff lists (references, signature help, outline, folding,
    per-file checks). Builtin docs stay WS7's (builtins.json); user functions carry the comment above them as `doc`.
  - Implementation in the compiler: `src/analysis.ts` (resolution identical to codegen), `src/format.ts`
    (line-preserving formatter: indentation, spacing, semicolons; keeps aligned columns; leaves code with syntax
    errors unchanged; idempotent; every sample and conformance file is already formatted),
    `src/project-index.ts` (passes 1-3 shared by compileProject and the host).
  - **For WS0:** `contracts/README.md` still lists C7 as owed; it is 0.1.0 now (CHANGELOG line added).

## Next

- Task 5: conformance programs 6-10; task 6: the 20 beginner mistakes; task 7: peephole passes (formatter done).
- Leftovers: object functions bind statically (an inherited parent event calls the parent's helper even when a
  child overrides it; events.md section 3 says the child's wins); constant folding (task 7).

## Goldens (tier status)

- `fixtures/compiler/conformance/v0/*.dsda` + `.dsdb` (all five v0 programs): disassembly snapshots; they execute
  once WS2's VM lands v0 (**WS2: these can replace hand-assembling v0 02-05**).
- `fixtures/compiler/samples/{minimal,flappy}.dsda` + `.dsdb` + `.roomsets.json`: disassembly snapshots (tier v2-v4
  features: slots, `with`, alarms, collisions, draw). Flappy compiles in ~6 ms warm (budget 100 ms).
- Regenerate: `DSDUDE_UPDATE_GOLDENS=1 npx vitest run packages/compiler`, then `node tools/gen-dsdb.ts`.

## push.sh and the daily merge (for WS0)

- 2026-09-26: after `git merge origin/main` (which brings WS0's `b23a325 chore(deps): regenerate lockfile`),
  `bash tools/cloud/push.sh` refuses with "b23a325 changes package-lock.json: revert it": it checks every non-merge
  commit in `origin/ws4-compiler..HEAD`, which now includes main's own commits. WS4 dropped the (unpushed) merge and
  pushed without it; `ws4-compiler` stays based on `phase0` + checkpoint-1's merge until push.sh excludes
  `origin/main` from the range (e.g. `git rev-list --no-merges HEAD ^origin/$T ^origin/main`). Merging main by hand
  showed no conflicts and all WS4 tests green.

## ADR number collision (for WS0)

- Two ADRs are numbered 0003: WS1's `docs/adr/0003-key-script-format.md` (on main) and WS4's
  `docs/adr/0003-provisional-opcode-operands.md` (on `ws4-compiler`, written the same day). Only WS0 renumbers ADRs,
  so WS4 left both files as they are. Please renumber the opcode one (0004 suggested); WS4 then updates its
  `ADR-pending` markers and appends a CHANGELOG line. Until then "ADR-0003" in `packages/compiler`,
  `packages/dsdb`, `contracts/opcodes.json` and `contracts/dsdb.md` means the opcode-operands ADR.

## Open ADR-pending markers

- `ADR-pending ADR-0003` in `packages/compiler/src/codegen/function.ts` (GETDYN/SETDYN, GETBI*, WITH*): until WS2
  co-signs ADR-0003.

## Integration feedback
