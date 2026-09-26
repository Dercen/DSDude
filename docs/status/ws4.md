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
  - ADR-0005 (was 0003; co-signed by WS2): operand kinds `sym`/`bivar`, GETBIX/SETBIX (55-56), GETBIO/SETBIO (57-58), the
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

- **Task 5, conformance programs 6-10: done** (2026-09-26): `fixtures/conformance/v1/06-strings.dss`,
  `v1/07-arrays.dss`, `v2/08-instances/`, `v3/09-with/`, `v4/10-rooms/` (rules 1-7 and the fractional-index rule;
  rule 8 music and the RNG seed rule not yet). Intended outputs are in each file's comments / README.md for WS2's
  `expected/`. All compile with zero diagnostics to goldens in `fixtures/compiler/conformance/`.

- **Task 6, the beginner mistakes: done** (2026-09-26). `src/mistakes.test.ts` runs 25 of them, each giving
  exactly one diagnostic; the reviewed messages are snapshotted in `fixtures/compiler/mistakes.json`. New checks:
  a small type lattice (`src/codegen/types.ts`; it only proves mistakes, "unknown" is accepted everywhere): E310
  text + number, E311 wrong kind of value for a builtin, E312 using a call that gives nothing back, E313 Draw-only
  builtins outside Draw (`allowedEvents`), E314 division by a literal 0, E206 unknown asset names (by closest asset
  or `spr_`/`snd_`/`obj_`/`rm_`/`bg_` prefix). Lints: W031 (touch events and `touch_in_instance(self)` on top-screen
  objects), W040 squaring a position, W041 fractional array index, W042 `div` with a fraction, W043 letters the DS
  font lacks in `draw_text`, W050 empty room, W051 placed object nobody can see (Visible off and Draw exempt), W052
  unused sprite. A parser error on a line that already has a lexer error is dropped (one mistake, one diagnostic).
  - Not yet: `alias`/`unsupported` builtins.json entries (the generated table has none yet; E207 is reserved for
    unsupported GameMaker names once WS0 adds entries and gen-builtins emits them).

- **Checkpoint-3 relay (2026-09-26):** merged `origin/main` (no open IF entries); ADR-0003 references renumbered to
  **ADR-0005** (markers, `contracts/dsdb.md`, `contracts/opcodes.json`, an appended CHANGELOG line).
- **WS4 co-signs WS2's ADR-0006 (sprite geometry in the DSDB, option A), 2026-09-26**, and has implemented its side
  (C2 `dsdb.md` 0.3.0, T1). **ADR-0006 accepted by the user (option A, minor 2 only with extensions); markers
  removed after checkpoint-4.**
  - One clarification: the ADR both bumps the format minor to 2 and promises no byte change for files without SPRG.
    WS4's writer sets minor 2 **only when the file carries an extension table**; files without one keep minor 1 and
    their exact bytes (all 34 committed `.dsdb` fixtures without sprites are unchanged). Loaders accept minor >= 1.
  - `packages/dsdb`: `AssetDef.geometry`, encode/decode of the extension table and `SPRG` (unknown tags skipped),
    `.dsda` `.asset sprite NAME PATH FRAMES origin=X,Y size=W,H bbox=L,T,R,B` (all three or none; every sprite or
    none), tests.
  - Compiler: every project sprite gets its `sprite.json` geometry, so every project DSDB with sprites carries SPRG
    (Flappy, minimal, v3/09 goldens regenerated). `make -f runtime/Makefile.host test` stays green on WS2's current
    loader (115,719 checks).
- push.sh range check fixed by WS0 (`5b09e6c`); the checkpoint-3 batch went out through push.sh after merging main.

- **Checkpoint-4 relay (2026-09-26):** merged `origin/main` (no open IF entries); ADR-0006 markers removed;
  samples/flappy `spr_bird` bbox left 2 -> 1 (from WS5), `fixtures/compiler/samples/flappy.{dsda,dsdb}` regenerated.
  **For WS2:** `flappy.dsdb` changed (dsdb fingerprint `0xcc46e211`), so `runtime/tests/test_programs.c` skips the
  trace check until `fixtures/runtime-core/flappy-trace.fnv` is refreshed; please also re-check that
  `flappy-keys.txt` still scores with the wider bird bbox. Host tests green here (115,765 checks).

- **Helper overrides (events.md section 3) fixed, 2026-09-26:** a call to an object function that a descendant
  overrides now dispatches on `object_index` (GETBI + LOADK @obj + EQ + JMPT per overriding object, then the right
  `CALL`, each branch filling its own defaults). No per-object code copies, so `event_inherited()` keeps its meaning;
  calls with no override are unchanged (no golden moved). **For WS2:** relies on `GETBI object_index` giving an
  object ASSET value that `EQ` compares equal to `LOADK @obj` (language.md: ids compare by numeric value).

- **ADR-0005 accepted (WS0 relay, main f6ecb1f); opcodes promoted to stable, 2026-09-26.** WS4 co-signs WS2's CMPJ
  proposal (compare-and-skip, C = relation 0-5, always followed by a JMP) and takes WS2's three ADR-0005 runtime notes
  into `contracts/dsdb.md` section 5. One T1: `contracts/opcodes.json` 0.3.0 (29-50 and 55-58 stable; 51-54 stay
  reserved) and `contracts/dsdb.md` 0.4.0, outputs regenerated; runtime host tests (115,765 checks) and WS4's tests
  green. WS2 listed these as implemented in docs/status/ws2.md ("With WS4: promote ...").
  - The compiler does not emit ADDI/SUBI/MULI or CMPJ yet: that is task 7's peephole pass, now unblocked.

- **Task 7 peephole code generation, 2026-09-26** (after the checkpoint-6/7 relay: merged `origin/main` 91fc4c9,
  no open IF entries).
  - ADDI/SUBI/MULI: `x + k`, `x - k`, `x * k`, `+= -= *=`, `++`/`--` and the `repeat` counter use the immediate form
    when the right side is an int literal (or a negated one) in -128..127. Fixed-point literals and anything else keep
    ADD/SUB/MUL with a register.
  - CMPJ: a comparison in a jump context (`if`, loops, `&&`/`||`, `?:`) becomes `CMPJ l, r, rel` + `JMP`, testing
    the relation when the jump is taken on false and its negation (== !=, < >=, <= >) when taken on true; `repeat`
    tests `counter > 0` the same way. Comparisons used as values still produce EQ/LT/... results.
  - Effect: a counted `for` loop runs 5 VM steps per iteration instead of 7 (v0/04); Flappy 139 -> 136
    instructions, minimal 43 -> 37. The compiled shapes now match WS2's M1 bench mix (ADD/SUB/MUL, CMPJ + JMP).
  - Goldens regenerated: every conformance program except v0/01 (still byte-identical to the hand-assembled
    `fixtures/bytecode/conformance/v0-01.dsda`), and the Flappy and minimal samples. New code-shape tests in
    `program.test.ts`. `make -f runtime/Makefile.host test` green on the new bytecode (115,876 checks).
  - **For WS2:** `flappy.dsdb` changed again: dsdb fingerprint `0xf4c83269`, trace `0x84a71faf` over 165,966 steps
    (from the host test's note), so `fixtures/runtime-core/flappy-trace.fnv` needs refreshing.

- **Checkpoint-12 relay (WS0, main b47cd2c), 2026-09-26:** merged `origin/main`, no open IF entries.
  - Reviewed WS2's expected logs for programs 06-10 (`fixtures/conformance/expected/v1..v4`, ea6a609): each matches
    the program's intended output line for line; WS2's host test runs all ten compiled programs against them.
  - **Task 7 constant folding done** (`packages/compiler/src/codegen/fold.ts`). It evaluates literal-only
    expressions (and builtin constants a local doesn't shadow) with the runtime's exact rules: int `+ - * div mod`,
    int `/` (int when exact, else Q20.12 truncated, else the int quotient), fixed `+ - *` (truncating), exact int/fixed
    comparisons, string `+ == !=`, bool `! && || == !=`, and `?:` when all three parts fold. It declines everything
    the runtime reports or wraps (int32 overflow, results outside Q20.12, division by zero, `INT_MIN / -1`) and
    anything it would have to re-implement loosely (fixed `/ div mod`, string ordering), so debug builds still raise
    their errors and no checker diagnostic depends on folding. Folded right operands feed ADDI/SUBI/MULI; constant
    conditions become a JMP or nothing.
  - Switch: `fold` in `CompileProjectOptions`/`ProgramOptions`, default off. `compileProject` (C4) and
    `dsdude compile` turn it on; the conformance goldens stay unfolded so the VM runs every operation they test. No
    contract change (C4's `CompileFn` and C10's flags are unchanged). The samples have no constant expressions, so
    no golden moved.
  - Verified against WS2's VM: 6,800 random constant expressions compiled unfolded and folded, both run in
    `dsdude-host --seed 1`, printed identical `DSD|LOG` lines (0 mismatches); the folded build had no arithmetic left.
    Unit tests in `src/fold.test.ts`.
  - Peephole: `a = a <op> x` for a local `a` now writes a's register directly (`a = a * 3` is one `MULI a, a, 3`,
    not `MULI t` + `MOV`); the binary operator reads its left operand in place, evaluates the right into
    temporaries and writes its destination last. Only v0/04's golden moved (`IDIV r3, r3, r5`); host tests green
    (115,906 checks).

- **GameMaker names (builtins.json 0.3.0, WS0 relay main a4276e7), 2026-09-26:** `codegen/gamemaker.ts` rewrites
  each function body (a copy; the language service's tree is untouched) before code generation.
  - Aliases (ids 159-169) compile as their target with the `argMap` arguments only, plus **W060** ("{name} is a
    GameMaker name, so DSDude reads it as {target}.", hint = the entry's note): `keyboard_check(vk_left)` compiles
    byte-for-byte like `button_check(btn_left)`, `instance_create_layer(x, y, layer, obj)` like
    `instance_create(x, y, obj)`.
  - Unsupported names (ids 170-202) are **E207** (message = the entry's message, hint = the manual link) and become
    an error placeholder, so no E201/E202 follows. Exact names match reads, writes (the assignment is dropped) and
    `obj.name`; prefix families (`ds_list_*`) match only calls, so a variable such as `file_name` stays legal.
  - The project's own names win: locals and parameters, user functions, and (for aliases) instance variables the
    project assigns.
  - C7: hover and signature help show an alias as its target, with the note as its doc.
  - Tests: `src/gamemaker.test.ts`, three new beginner mistakes (E207 x2, W060; `fixtures/compiler/mistakes.json`),
    a host hover test; CHANGELOG C9 line for E207/W060. No golden moved.
  - **For WS0:** the prefix entries' messages in builtins.json read "ds_list functions are isn't available ..."
    (ids 189-202: "are isn't"); they surface verbatim in E207, so they need rewording (a T0 doc change on your file).
  - Default parameter values go through the same rewrite when the function is declared (`function f(k = vk_left)`:
    one W060 in the declaring file; an unsupported name there is E207 without a following E307).

- **Conformance programs 11-12 (the last two open rules), 2026-09-26:**
  - `fixtures/conformance/v1/11-random.dss` (the RNG seed rule), compiled with header seed 20260926. On
    `dsdude-host` it prints `true` x7 then `187911 259387 735161 824918 980883`, identical for `--seed` 1, 7 and 99;
    the same program with header seed 0 follows `--seed` instead (checked both ways).
  - `fixtures/conformance/v4/12-music/` (rule 8): one invisible `obj_dj` whose Room Start plays, re-plays, stops
    (twice) and plays `mus_tune` (a copy of `fixtures/assets/tune.xm`), logging `audio_is_playing` after each step.
    Intended output `true true false false true`, then `DSD|EXIT|0`.
  - Goldens: `fixtures/compiler/conformance/v1/11-random.*`, `v4/12-music.*`.
  - **For WS2:** please write `fixtures/conformance/expected/v1/11-random.log` and `v4/12-music.log` and add both to
    the `programs` suite. On the host, 12-music prints `false` five times today: `runtime/host/platform.c`'s
    `dsd_plat_music_active()` is a stub returning false. The rule only shows if the host models music: active after
    `dsd_plat_music_play` until `dsd_plat_music_stop`, ideally counting starts, so a test can see exactly two
    (the second `audio_play_music` must not restart the tune; README.md in the folder says so).

- **For WS0:** `contracts/README.md` still lists C7 as "owed"; `packages/lang/src/host.ts` has been C7 0.1.0 since
  task 4 (its CHANGELOG line is under C7). `packages/compiler/CLAUDE.md`'s contract table is updated to the current
  versions.

- **M1 fallback: int-specialised opcodes (WS0 relay, 2026-09-26; deadline M1 at CP-C, 2026-10-09).**
  - **Proposal for WS2 to co-sign (the same pattern as ADR-0005):** each one mirrors a stable opcode exactly, minus
    the tag checks, so nothing new is decided about results or errors.

    | # | Name | Format | Operands | Meaning |
    |---|---|---|---|---|
    | 51 | ADDII | ABC | A:reg B:reg C:reg | rA = rB + rC |
    | 52 | SUBII | ABC | A:reg B:reg C:reg | rA = rB - rC |
    | 53 | MULII | ABC | A:reg B:reg C:reg | rA = rB * rC |
    | 54 | CMPJII | ABC | A:reg B:reg C:u8 | as CMPJ: relation C (0 ==, 1 !=, 2 <, 3 <=, 4 >, 5 >=); the next word is a JMP, skipped when the relation holds |

    The compiler emits them only when both operands are proved int, so the handlers read the payloads without
    looking at the tags. The result is an int, and int32 overflow behaves exactly as ADD/SUB/MUL do today (R52x in
    a debug build, a wrap to int in a release build). The verifier applies ADD's and CMPJ's operand rules (register
    bounds; C <= 5 and a JMP next for CMPJII). Suggestion, WS2's call: a debug build may assert both tags are int and
    stop with an internal-error R code, to catch a compiler proof bug; a release build never checks.
  - **Rollout (done, see the 0.4.0 entry below):** as soon as WS2 agrees (in docs/status/ws2.md, relayed by WS0), WS4 makes the one T1: opcodes.json
    0.4.0 (51-54 stable with the formats above), dsdb.md 0.5.0, regenerated `runtime/gen/opcodes.h` and
    `packages/*/src/gen`, and a CHANGELOG line. WS2 then flips `OP_CHECKS[...].impl` (the loader keeps answering R582
    until then, so the T1 alone breaks nothing) and adds its `.dsda` fixtures. Once WS2's VM runs them, WS4 turns
    them on in `compileProject`, `dsdude compile` and the goldens.
  - **Done in WS4 meanwhile (off by default, `intOps` in the compile options):**
    - `codegen/intproof.ts`: the proof, sound rather than clever. It covers int literals and constants,
      read-only int builtin variables (room_width, room_height, room_speed, image_number), int-returning
      builtins (floor, ceil, round, sign, irandom, irandom_range, instance_number, string_length, ord,
      array_length), `div` of anything, `+ - * mod` and unary `-` of ints, `?:` of ints, and int locals.
    - Int locals must be definitely assigned: the first `var` has a value and is a top-level statement or a
      top-level `for`'s `var`, and every mention comes after it. Every store must be int (optimistic fixpoint);
      parameters, `/=` and valueless `var` never count.
    - Each rule was checked against the runtime's C (`number.c`, `math.c`, `bivars.c`, `vm.arm.c`), e.g. `div`
      always yields an int and an int overflow wraps to an int in a release build.
    - Emission: `a op b` and `a op= b` use ADDII/SUBII/MULII when both sides are proved int (a small literal still
      takes ADDI/SUBI/MULI, which is one instruction); comparisons in conditions use CMPJII; `repeat`'s counter
      (floored, so always int) uses CMPJII. Tests: `src/intproof.test.ts` (six).

- **Opcodes 0.4.0 / dsdb.md 0.5.0 (T1), 2026-09-26: ADDII/SUBII/MULII/CMPJII (51-54) promoted to stable and
  switched on.** WS2 implemented the handlers and verifier (docs/status/ws2.md, M1 step 7) with the same encoding
  WS4 proposed (ADD/SUB/MUL/CMPJ operands, no tag checks, the same overflow rules), which is the co-signature.
  WS3's melonDS re-bench (relayed by WS0): the II forms take the bench mix from 31.76 to 28.27 cycles/op (35,266 to
  39,629 ops/frame).
  - `compileProject` and `dsdude compile` use `GAME_OPTIONS` (`fold` + `intOps`); the conformance goldens use
    `intOps` without folding, so WS2's VM runs the II forms too (v0/01's check against the hand-assembled fixture
    keeps them off). Goldens regenerated: v0/01, 03, 04, v1/07, 11, v3/09, Flappy. `make -f runtime/Makefile.host
    test` green: 120,002 checks in each of -O2, UBSan and -O0.
  - Flappy gets one II op: nearly all its arithmetic is on instance variables, which the proof does not cover yet.
- **Int proof widened to instance variables and globals (WS0 relay: "keep widening"), 2026-09-26.**
  `intVariables` in `codegen/intproof.ts`: a user instance variable (by name, whichever object holds it) or a
  global is int when every store into it anywhere in the project (every event, function, script and creation code,
  through bare names, `other.`/`obj.` members, `with` bodies and compound assignments) stores a proved int. It is
  solved as one optimistic fixpoint together with each unit's int locals. An element write (`a[i] = v`) counts as a
  non-int store. No definite-assignment rule is needed: an unassigned slot or global stops with R500/R501.
  - Not provable, deliberately: builtin variables such as `x`, `y`, `hspeed` and `vspeed`. The engine writes them
    itself (`x += hspeed` each step, gravity), and their type is "number", so they may hold fractions. Only the
    read-only int ones (room_width, room_height, room_speed, image_number) count. Flappy's arithmetic is almost all
    on these (`vspeed`, `y`), so it keeps its one II op; its only user counter, `global.score += 1`, is already
    ADDI.
  - Goldens: v3/09 and v4/10 gain II ops from instance variables; host tests green (120,002 checks x3).
    Tests: four more in `src/intproof.test.ts`.
  - Also proved: every builtin variable typed int, writable ones included (`depth`: the runtime floors a store to
    int32, bivars.c `to_int`), and `alarm[i]` elements.
  - **For WS0 (builtins.json, changes the ABI hash):** `bbox_left/top/right/bottom` are typed "number", but the
    runtime always returns ints (`bivars.c` `bbox_edge`). Typed int, collision code comparing bbox edges would get
    CMPJII. Nothing sound reaches `x`/`y`: they are fractional by design.

- **ADR-0008 (debug and release arithmetic), WS4's part: dsdb.md 0.6.0 (T1), 2026-09-26** (accepted by the user,
  WS0 relay, main 68ca7da).
  - Header flags bit 0 = release; bits 1-15 reserved, must be 0 (the runtime refuses them with R581, and
    packages/dsdb's decoder does too). `.dsda` has a `.release` line after `.seed`, only in release files.
  - Compiler: a `release` option on `compileProgram` and `compileProjectModule` (absent = debug). `compileProject`
    (C4, Play) stays debug; `dsdude compile --release` is C10, WS1's or WS8's.
  - Folding, ADR point 4, WS4's choice: in debug an overflowing constant stays unfolded, so the runtime raises R52x
    on its line (as before). In release it folds to the low 32 bits of the exact result, as the release runtime
    computes it (`int_result`/`real_result`/`dsd_fx_mul`); division by zero stays a runtime error in both modes.
    An int operand is now scaled to Q.12 in full as the runtime does, and only the result must fit.
  - Checked against WS2's VM: 12,400 random constant expressions (311 overflowing) built as release, unfolded (the
    VM wraps) and folded (the compiler wraps), printed identical lines on `dsdude-host`.
    `fixtures/compiler/release/wrap.{dss,dsda,dsdb}` prints `-2147483648 -2147483648 0 -524287.5 2147483647` in
    release; the same program built for debug stops at line 5 with R520.
  - **For WS2:** the flag is written now, so the `ADR-pending ADR-0008` markers can go.
    `fixtures/compiler/release/wrap.dsdb` is a ready release fixture (its intended output is in the .dss comments).

- **M1 guard for the int-specialised share (WS0 relay: the M1 gate is met only with the II forms, 44,605 vs
  38,631 ops/frame on melonDS), 2026-09-26.**
  - Flappy's Step handlers cannot carry the pin: every arithmetic op and comparison there reads `vspeed`, `y` or
    `sprite_height` (typed "number", fractional by design), so their II share is 0 by soundness, and a pin on them
    would pin nothing.
  - Instead `fixtures/compiler/perf/int-mix/` is a small project whose Step is the bench mix in DSS: int instance
    variables, int locals, a counted loop, comparisons against room_speed and constants. `src/intproof.test.ts`
    requires **every** ADD/SUB/MUL/CMPJ of that Step to be int-specialised (13 II, 0 tag-checked), with its golden.
    It prints the same on `dsdude-host` as a tag-checked build of the same project.
  - `fixtures/compiler/ii-share.json` reports II vs tag-checked per function for every compiled golden (a golden, so
    changes show in review). The test also enforces a corpus floor (`CORPUS_II_FLOOR` = 38 II instructions):
    lowering it takes a deliberate edit, and the reason goes here.
  - Writing the benchmark found a gap, now closed: a local declared inside a loop body (`var cell = ...` in a `for`)
    was never proved int, because only top-level declarations counted. The rule is now "every mention lies in the
    region of a declaration with a value": from the declaration to the end of its statement list (function body,
    `{ }` block, `case` body; a `for`'s `var` also covers the `for`). A list is only entered at its start, so that is
    as sound as before. Two loops that each declare `var i = 0` now both qualify. v1/11 gains II ops (its output is
    unchanged); host tests green (125,079 checks x3).

## Next

- Int-specialised opcodes only if the M1 gate needs them (kickoff task 7; WS2 adds them at CP-C below the gate).

## Goldens (tier status)

- `fixtures/compiler/conformance/v0/*.dsda` + `.dsdb` (all five v0 programs): disassembly snapshots; they execute
  once WS2's VM lands v0 (**WS2: these can replace hand-assembling v0 02-05**).
- `fixtures/compiler/conformance/v1..v4/*.dsda` + `.dsdb` (programs 06-10): disassembly snapshots until each
  tier's runtime lands.
- `fixtures/compiler/samples/{minimal,flappy}.dsda` + `.dsdb` + `.roomsets.json`: disassembly snapshots (tier v2-v4
  features: slots, `with`, alarms, collisions, draw). Flappy compiles in ~6 ms warm (budget 100 ms).
- Regenerate: `DSDUDE_UPDATE_GOLDENS=1 npx vitest run packages/compiler`, then `node tools/gen-dsdb.ts`.

## Open ADR-pending markers


- None. ADR-0005 accepted by the user (WS0 relay, main f6ecb1f); its four markers in
  `packages/compiler/src/codegen/function.ts` are removed.

## Integration feedback
