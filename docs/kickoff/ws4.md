# WS4 kickoff: DSS language and compiler

You build the DSS compiler in TypeScript: lexer, error-recovering parser, binder, checker with beginner-grade diagnostics, formatter, codegen and a DSDB writer byte-for-byte per contract C2, plus the C7 language-service host API for WS7. WS2's VM runs your `game.dsdb`, so the conformance corpus is your shared truth with WS2. You are a cloud stream (hybrid mode): pure TypeScript, so you run fully as a Claude Code cloud session from the tag.

## Paste this to start

```text
You are workstream **WS4: DSS language and compiler** on DSDude, a GameMaker-like Nintendo DS IDE, running as a Claude Code **cloud session** (Ubuntu VM, no Windows tools).

- **Start:** run `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS4`, then `bash tools/cloud/start.sh` (10-minute timeout). Report failures rather than working around them.
- **Read:** `docs/kickoff/ws4.md` (its "Cloud setup" block replaces the Windows setup, env block and machine facts), `docs/kickoff/README.md` section 8, your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md`, your contract files, and only the `PLAN.md` sections they cite.
- **Paths and pushing:** write only the paths `tools/ownership.json` gives WS4. Your stream line is `ws4-compiler`; push only with `bash tools/cloud/push.sh`, after every green batch.
- **Never:** commit `package-lock.json`, run `npm ci`, edit root config or `vendor/`, or run Windows tools, emulators or Electron.
- **Tests and merges:** run `npm test -w packages/compiler -w packages/lang -w packages/dsdb && npx tsc -b packages/compiler packages/lang packages/dsdb` before each commit, with a timeout on every process. Merge `origin/main` daily, and never rebase once WS0 has merged your commits.
- **Blockers:** if a contract blocks you, write `docs/adr/NNNN-<title>.md`, mark the workaround `// ADR-pending ADR-NNNN`, and continue.
- **Status:** fix open `## Integration feedback` entries in `docs/status/ws4.md` first, and never edit that section. The VM is ephemeral, so your branch and `docs/status/ws4.md` are your only memory: keep the file current and continue from it.

Read packages/compiler/CLAUDE.md, contracts/language.md, contracts/events.md, contracts/dsdb.md, contracts/opcodes.json, contracts/builtins.json, contracts/diagnostics.md, contracts/runtime-limits.json and packages/toolchain/src/api.ts. Operating mode: hybrid (cloud session); the CLAUDE.md Status block is authoritative. Then begin with task 1 under "First tasks" in docs/kickoff/ws4.md.
```

## When this stream starts

- **Hybrid mode (the plan):** cloud session from the `phase0` tag (D, day 2), with WS2 (cloud) and the local WS1 and WS6; WS3 joins at `toolchain-ok`. CP-A D+3, CP-B = M0 (D+7, week 2), CP-C = M1 (D+14, week 3), then weekly; M2 week 4-5. No slot and no hand-off: the session runs to its definition of done.
- **Launch:** WS0 tags `start-ws4`, creates and pushes `ws4-compiler`, registers it in `docs/status/cloud.md` and says "launch WS4 (cloud)".
- **Gate:** `git tag phase0` (WS0). If day 3 ends without the tag, WS0 tags `phase0` on main's last green commit anyway and delivers the missing items as ADRs (section 7.1).
- **Fallbacks** (WS0 records a switch in the CLAUDE.md Status block and re-plans at the next checkpoint):
  - *Standard mode* (GitHub or cloud sessions unavailable for more than a day, every push target refused, or staggering cannot absorb the usage limits): WS4 moves to local slot 3. In `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` run `git fetch origin; git worktree add -B ws4-compiler ..\DSDude-ws4 origin/<push target>`, then the worktree setup of README section 3 (`DSDUDE_HOME` = `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws4\.dsdude`, port base 5140). CP-B = M0 ~D+7-10, CP-C = M1 ~week 4-5; slot 3 passes to WS5 after M1 (~week 5).
  - *Upgraded mode* (after a RAM upgrade): hybrid timing; WS4 may move home the same way.

At the tag you get `language.md` v0.1, `events.md`, the C2 container, `opcodes.json` (29 stable opcodes), `builtins.json` (~90 builtins; `tools/gen-builtins.ts` emits `packages/compiler/src/gen/builtins.ts`), `packages/dsdb` with `hello.dsda` → `hello.dsdb`, conformance v0, both samples v0 and `CompileFn`. Versions: `contracts/CHANGELOG.md`.

## Cloud setup

Canonical procedure: `docs/kickoff/README.md` section 8. **Environment `dsdude-ws4`** (user, once; README section 8): network Custom (default package-manager list plus `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`); variables `DSDUDE_WS=WS4`, `DSDUDE_PORT_BASE=5140`, `DSDUDE_SKIP_ELECTRON=1`, `DSDUDE_MAKE_JOBS=4`; the shared setup script (Node v24.16.0 in `/opt/node24`, `gcc` and `make`, Playwright 1.63.0 Chromium).

**Starting (user), after WS0's "launch WS4 (cloud)":** at claude.ai/code (or the mobile Code tab) choose repository `<user>/dsdude`, branch `ws4-compiler` (or `main` if not offered), environment `dsdude-ws4`, mode **Auto** if offered, else Accept edits; or open `https://claude.ai/code?repositories=<user>/dsdude&environment=dsdude-ws4`. Paste the block above, rename the session `WS4 compiler`, and give WS0 the session URL and the branch the session reports.

**First commands** (every new or resumed session):

```bash
git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WS4
bash tools/cloud/start.sh     # 10-minute tool timeout
```

Repo-local git config is not cloned, hence the first line; `tools/check-ownership.ts` then checks against `origin/main`. `start.sh` checks Node 24 / npm 11, fetches `main` and the tags, adopts `ws4-compiler` (or the push target registered in `docs/status/cloud.md`) without discarding work, runs the lockfile guard, `npm install` and a Linux native-binary smoke test, and prints the versions. If it reports that HEAD and the stream line diverged, note it in `docs/status/ws4.md` and tell the user.

**Linux env block** (set by the SessionStart hook and the environment; no MSYS2/Wonderful block). If a fresh Bash call shows a `node -v` other than v24, run this block and note it in the status file: the hooks run `node tools/check-ownership.ts`, which needs Node 24.

```bash
export PATH=/opt/node24/bin:$PATH
export DSDUDE_HOME=$HOME/.dsdude
export DSDUDE_SKIP_ELECTRON=1 DSDUDE_MAKE_JOBS=4
export DSDUDE_PORT_BASE=5140   # WS4's base; no WS4 test opens a port
```

`DSDUDE_SKIP_ELECTRON=1` makes the root postinstall skip `install-electron`. WS4 has no browser tests and needs no `npx playwright install chromium`.

**Branch and pushing.** WS0 creates `ws4-compiler` from `start-ws4` at launch, and `start.sh` adopts it in every session, whatever the session's own branch is called. Push only with `bash tools/cloud/push.sh`, after every green batch, and never end a turn with unpushed work (idle VMs are reclaimed). `push.sh` refuses commits that touch `package-lock.json` or lack the `DSDude-WS: WS4` trailer, then tries the recorded target, `ws4-compiler`, `claude/ws4-compiler` and the session's branch. On "NEW push target", put ``Cloud push target: `<ref>` `` under the title of `docs/status/ws4.md`, commit, run `push.sh` again and tell the user. Never push `main` or tags, force-push or open PRs.

**Lockfile.** The Windows-generated `package-lock.json` carries the linux-x64 binaries (verified 2026-09-25). Use `npm install`, never `npm ci`; run `git restore package-lock.json` after every install and never stage it. A new dependency is `npm install <pkg>@<exact> -w packages/compiler` (or `lang`/`dsdb`), committing only that `package.json`. If `node tools/check-lockfile.mjs` fails, leave the lockfile alone, write `BLOCKER lockfile` in `docs/status/ws4.md`, push, tell the user, and meanwhile use `npm install --no-save <missing>@<version>` (never `--force`).

**Resume.** Reopen the same session and send "Resume: run `bash tools/cloud/start.sh`, then continue from docs/status/ws4.md." A reclaimed VM keeps the conversation but loses processes and unpushed files. Replace the session only when it is archived or unusable (same environment, the paste block plus "continue from docs/status/ws4.md") and give WS0 the new URL. `/compact` works; `/clear` does not.

## Owned paths and contracts

**Contract versions at the `phase0` tag** (the index with owners and freeze points is `contracts/README.md`; the history is `contracts/CHANGELOG.md`): every Phase-0 contract is **0.1.0** — C1 project format, C2 `dsdb.md` + `opcodes.json` + `builtins.json` (ABI hash `0x0dd9987a`), C5 `ipc.md` stubs, C6 `language.md` + `events.md`, C8 `log-protocol.md`, C9 `diagnostics.md`, C12 `preview.ts` types, C13 `runtime-limits.json`; WS1 has already taken C4 (`api.ts` + `toolchain-api.md`) and C10 `cli.md` to **0.2.0** (T1). Owed, each by its owner: C3 `assetpack.md` (WS5, first day), C7 `host.ts` (WS4, CP-B), C8 `runtime-artifact.md` (WS3, first `runtime/dist` build), C11 `dsd_platform.h` (WS2, CP-A), C12 panel API + mock-host (WS6, CP-A).

**Owned** (`tools/ownership.json`, from the tag): `packages/lang/**`, `packages/compiler/**` (including `src/diagnostics/catalog.ts`), `packages/dsdb/**` (WS2 co-signs changes), `contracts/opcodes.json` (WS2 co-signs), `contracts/language.md`, `contracts/events.md` (WS2 co-signs), `contracts/dsdb.md` (co-owned with WS2), `fixtures/compiler/**`, `fixtures/conformance/**` except `fixtures/conformance/expected/**`, `samples/minimal/**` and `samples/flappy/**` until M2 (then WS7), `docs/status/ws4.md`.

**Not yours:** root config, `package-lock.json` (commit only your package's `package.json`), `packages/cli`, `fixtures/conformance/expected/**` (WS2), `contracts/builtins.json` (WS0), the `## Integration feedback` section of `docs/status/ws4.md` (WS0 appends). `.githooks/pre-commit` runs `tools/check-ownership.ts` (reads `dsdude.ws`); `.githooks/commit-msg` adds the `DSDude-WS: WS4` trailer. WS0's integration re-checks every non-merge commit in `main..origin/<push target>` and refuses the merge on any violation. Generated files (`packages/*/src/gen/**`, `runtime/gen/**`) change only with their generator input. In weeks 1-4, `ws2-*` and `ws4-*` may merge each other's branches; WS2 is also cloud, so fetch and merge its push target from `docs/status/cloud.md` (`git fetch origin '+refs/heads/<target>:refs/remotes/origin/<target>'; git merge origin/<target>`).

| Contract | Files | Role |
|---|---|---|
| C2 DSDB | `packages/dsdb`, `contracts/opcodes.json` | owner (WS2 co-signs) |
| C2 DSDB | `contracts/dsdb.md` | co-owner with WS2 |
| C2 builtins | `contracts/builtins.json` | consumer |
| C6 Language spec | `contracts/language.md`, `contracts/events.md` (WS2 co-signs), `fixtures/conformance/**` except `expected/` | owner |
| C7 Host API | `packages/lang/src/host.ts` | owner, frozen at CP-B |
| C4 | `compileProject` from `@dsdude/compiler` matching `CompileFn`, plus `cliCommands` | implementer |
| C9 Diagnostics | `contracts/diagnostics.md` | consumer; owns `packages/compiler/src/diagnostics/catalog.ts` (E1xx, E2xx except E29x, E3xx, E49x, W0xx) |
| C1, C3, C13 | `contracts/project-format.md`, `contracts/assetpack.md`, `contracts/runtime-limits.json` | consumer |
| C14 | conformance programs 6-10 | producer |

## First tasks

1. **Parser** (section 4): a hand-written lexer and a recursive-descent/Pratt parser with optional semicolons. The parser resynchronises on `;`, statement keywords, `}` and newlines. W032 fires when a line starting with `(` or `[` continues the previous expression. The AST is internal to WS4.
2. **Binder and codegen to `.dsda`.** Locals go to registers; instance slots take the parent layout first, then the union of assigned names. Three-address IR over up to 200 virtual registers, linear scan down to 64. Emit OBJS (sorted (symbolId, slot) table, parent id, ancestor bitset) and ROOMS (per-screen asset sets, section 3.2). Add golden tests against `samples/flappy`.
3. **`compileProject()`** matching `CompileFn`, and `dsdude compile <project> -o <build>/nitrofs/game.dsdb --json` exported through `cliCommands`. `dsdb-dis` already exists as `packages/dsdb`'s bin; add the DSDB writer with ABI hash and DBG table. `compileProject` also returns the per-room asset sets (`roomSets`, C4) for WS5's `checkRoomBudgets`. The `packages/toolchain` owner (WS1, later WS8 or WS0) wires `compileProject` into `BuildService`: at CP-B in hybrid and upgraded mode, as soon as it lands in standard mode.
   - `npx dsdude compile` works only once WS1 has made `packages/cli` register `@dsdude/compiler`'s `cliCommands` and WS0 has merged that. Until it is on `origin/main` (check with `git grep -n @dsdude/compiler origin/main -- packages/cli`), test the command through `cliCommands.find(c => c.name === "compile")!.run([...])` in Vitest; never edit `packages/cli`. If it is still unwired at CP-B, write an ADR to WS1.
4. **C7 `LanguageServiceHost`** in `packages/lang/src/host.ts` by CP-B: `parse`, `symbolsAt`, `completionsAt`, `hover`, `definitionAt` and `format`, over plain data.
5. **Conformance programs 6-10**, placed in the tiers they exercise (v1 strings/arrays, v2 instances/events, v3 `with`/collisions/alarms, v4 rooms/draw). Each section 4 semantics rule needs one fixture. Tier v0-v1 programs use the program form of `contracts/language.md` (one `fixtures/conformance/vN/NN-<name>.dss` of top-level statements, compiled to a DSDB whose FUNC 0 is `__main`); tier v2+ programs are small projects in folders.
6. **Checker**: the 20 beginner mistakes, each with a test (section 6 WS4 list), with messages in `catalog.ts`.
7. **Formatter** (it inserts semicolons), peephole passes (constant folding, fused compare+jump, `ADDI/SUBI/MULI`), and int-specialised opcodes if the M1 gate needs them. At CP-C, below the gate, WS2 adds the reserved opcodes and you emit them when the checker proves both operands are int.

## Definition of done (section 6 WS4)

- The conformance corpus and `samples/*` compile to byte-identical goldens and round-trip through `dsdb-dis`.
- Every conformance tier passes on the host as soon as that tier's runtime feature lands in `dsdude-host`.
- Each of the 20 most common beginner mistakes has a dedicated friendly message with a test: missing closing parenthesis, `=` in if, undefined variable, misspelt builtin, string + number, wrong arity, `draw_sprite` in Step, unknown sprite name, missing closing brace, assignment to a constant, and so on.
- One mistake yields one diagnostic; `samples/*` and `templates/*` produce zero diagnostics; Flappy compiles in < 100 ms warm; no dependency on Monaco, Electron or Node-only APIs (runs in a Web Worker).

Linux green alone is not done: WS0's Windows run of the same tests must pass too.

**Hand-off.** Hybrid: the cloud session runs to its definition of done. samples/minimal and samples/flappy pass to WS7 at M2 (every mode). Standard-mode fallback: hands slot 3 to WS5 after M1 (~week 5), so it can still emit int-specialised opcodes if the M1 gate needs them; later tiers are checked by short WS4 sessions or a cloud session.

## Testing in isolation and verifying without eyes

**Isolation (verbatim):** Disassembly-snapshot goldens (.dss -> .dsda) and diagnostic-snapshot tests need no runtime. Execution goldens arrive tier by tier as WS2's runtime lands them: v0 and v1 by D+7, v2 by ~D+14, v3 by ~D+21-28, v4 by ~D+28-35 (before M2). Until a tier lands, its goldens are disassembly snapshots only.

When a tier lands on `main`, build the host runner from the repo root with `make -f runtime/Makefile.host` (Linux gcc, output in `runtime/build-host/`), run `runtime/build-host/dsdude-host <build>/nitrofs --frames N --trace out.jsonl --seed 1`, and compare with `fixtures/conformance/expected/**` (WS2's; you review them). The cloud session also verifies `npx dsdude compile --json`, `node tools/gen-dsdb.ts` and conformance 6-10 on the Linux host.

**Without eyes:** you run no emulator. At M1 your `hello.dsdb` must print `DSD|READY` and `DSD|LOG|hello` exactly once each on both emulators; before then, check the same `DSD|` lines (C8) in `dsdude-host`'s output. WS0 verifies this locally at integration (the same tests on Windows, `hello.dsdb` on both emulators, the M1 gate with WS3); watch the integration-feedback list in `docs/status/ws4.md`.

## Coordination

- Keep `docs/status/ws4.md` current: progress, tier status of each golden, leftovers, open `ADR-pending` markers, the `Cloud push target:` line under the title, and `start.sh`'s version line at each checkpoint.
- **Tiers (section 7.4).** T0: doc text plus a CHANGELOG line. T1 (additive, e.g. a new opcode): minor version bump, `contracts/CHANGELOG.md` entry, regenerated output (`node tools/gen-opcodes.ts`) and fixtures in one commit, co-signed by WS2. T2 (breaking): ADR co-signed by every affected owner. WS0 merges C2/C6 changes within 24 h in weeks 1-4. New builtins are WS0's; request them by ADR.
- Blockers: an ADR draft plus `// ADR-pending ADR-NNNN` at the workaround.
- **Daily:** `git restore package-lock.json; git fetch origin && git merge origin/main`, then `npm install; git restore package-lock.json`; never rebase once WS0 has merged any of your commits. After each fetch, read the latest `docs/status/checkpoint-N.md` and your feedback list on `origin/main` (`git show origin/main:docs/status/ws4.md`); fix open `IF-` entries first. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading and push; WS0 re-runs the check and appends the resolved line.
- **At a checkpoint** (CP-A/B/C, then weekly): commit, update `docs/status/ws4.md`, push with `push.sh`, then stop touching the branch until the user relays "WS0 merged checkpoint-N. Run `bash tools/cloud/start.sh`, then ..." (README section 5; in the web UI or with `claude -p "<message>" --cloud <session-id>`), and do what the relay says: the VM may have been reclaimed while you waited. CP-B freezes C7 and checks that your goldens match.

## Machine limits and gotchas

- The cloud VM has no Windows tools, emulators, py-desmume or Electron. Never install system packages (setup-script changes go through a WS0 ADR), and leave no background process running.
- Run `vitest run --pool=threads --maxWorkers=2`, never watch mode. Type-check with `tsc -b` (`-b` first; `--noEmit` fails with TS6310).
- Erasable syntax only (no enums, namespaces or parameter properties) and explicit `.ts` relative imports: `npx dsdude` runs the source under Node 24 type stripping. Vitest (esbuild) accepts both, so only the `tsc -b` in your pre-commit test catches them (`CLAUDE.md`, "Code rules").
- Put a timeout on every spawned process, including `dsdude-host` and `make` in tests. Resolve `dsdude-host` vs `dsdude-host.exe` per platform: WS0 runs the same tests on Windows with `mingw32-make -f runtime/Makefile.host test`.
- Linux passes can hide Windows failures (separators, case, CRLF, spawning): use `node:path` and never rely on case-insensitive paths.
- Keep file IO for `dsdude compile` out of the modules a Web Worker imports; `compileProject` works on data.
- Write goldens as Buffers and strip `\r` before comparing. `.dsdb` is binary in `.gitattributes`.
- The DSDB header records the build's RNG seed (`--seed N`; 0 = runtime seed). Variadic builtins use `minArgs`/`maxArgs`.
- Checker rules:
  - W031 applies only to instance touch events and `touch_in_instance(self)` in Top-screen objects; the global `touch_*` builtins are legal everywhere.
  - Alias entries compile with a W lint, and unsupported GML names get a dedicated E2xx. Calling another object's helper is E2xx.
  - The no-sprite/no-Draw lint exempts Visible-off objects (`obj_ctrl`).
  - More than 24 user slots (parents included) is E49x, in the compiler catalog (section 5 C9).
- Messages follow `contracts/diagnostics.md`: what happened, what to do, where. Banned words: instruction, token, identifier, operand, arity, expression, opcode, VRAM, OAM, palette slot.
- `docs/research/04-priorart.md`'s stack VM with Q16.16 is superseded: register machine, Q20.12 (sections 2.8, 3.3).

## References

- `PLAN.md`: 2.7, 2.8, 3.2 (step 5 and room asset sets), 4, 5 (C2, C3, C4, C6, C7, C9, C13), 6 WS4, 7.2, 7.4, 7.5, 8 (M1, M2), 9 (risks 4, 15, 16, 23, 25, 26, 28).
- `docs/kickoff/README.md` section 8 (cloud sessions).
- `docs/research/04-priorart.md`, `docs/research/05-hardware.md`, `docs/research/verification.md` claim 4.
