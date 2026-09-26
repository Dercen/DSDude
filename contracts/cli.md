# C10: the `dsdude` CLI (draft)

Version: 0.1.0 · Owner: WS1 · Changes: see the tiers in contracts/README.md

Phase-0 draft by WS0; WS1 finalises it (WS8 after `start-ws8`). Source: PLAN.md section 5.2 C10 and section 6 WS1.
Run it as `npx dsdude <command> ...` from a worktree or clone root; `packages/cli` declares the `dsdude` bin
(`src/main.ts`, run by Node 24 type stripping).

## Commands

| Command | What it does | Runs on Linux (cloud) |
|---|---|---|
| `dsdude compile <project> [-o <file.dsdb>]` | Load (C1) + compile (C2) + room budgets; writes the DSDB. | yes |
| `dsdude assets <project>` | Pack assets into the NitroFS folder (C3) with grit/mmutil. | no: exit 2 + E6xx |
| `dsdude build <project>` | compile + assets + runtime + `packRom`; prints the `.nds` path. | no: exit 2 + E6xx |
| `dsdude play <project>` | build, then launch the emulator and stream `DSD|` lines (C8) until it exits or Ctrl+C. | no: exit 2 + E6xx |
| `dsdude screenshot <rom> --frames N [--keys file] --out dir` | Run the ROM headless in py-desmume 0.0.9 (`SDL_VIDEODRIVER=dummy`, `SDL_AUDIODRIVER=dummy`) for N frames; write `top.png` and `bottom.png` into `dir`. | no: exit 2 + E6xx |
| `dsdude toolchain status\|install` | `detectToolchain()` / `installToolchain()` (C4). | `status` reports "missing" |
| `dsdude emulator install\|status <melonds\|desmume>` | `EmulatorManager.ensureInstalled()` and its paths. | no: exit 2 + E6xx |
| `dsdude doctor` | Checks the toolchain, emulators, py-desmume, paths under 250 characters, and warns when `OneDrive.exe` runs and the repo or project is under `%OneDrive%`. | partial |
| `dsdude gen-builtins` | Runs the builtins generator (`tools/gen-builtins.ts`). | yes |

Commands are registered from each package's `cliCommands: CliCommand[]` export (C4, `packages/toolchain/src/api.ts`),
so WS4 (`compile`) and WS5 (`assets`) never edit `packages/cli`. `packages/cli` is the composition root that injects
`compileProject`, `packAssets` and `checkRoomBudgets` into `BuildService`.

## Flags

| Flag | Commands | Meaning |
|---|---|---|
| `--json` | all | Machine-readable output on stdout: one JSON object with `ok`, `diagnostics` (C9 shape) and command-specific fields. Human text goes to stderr. |
| `--runtime <elf>` | build, play | Use this `arm9.elf` instead of `runtime/dist/arm9.elf`. |
| `--skip-compile` | build, play | Reuse the existing `game.dsdb`. |
| `--skip-assets` | build, play | Reuse the existing asset files. |
| `--no-build` | play | Launch the last built ROM. |
| `--emulator melonds\|desmume` | play | Default `melonds`. |
| `--seed N` | compile, build, play | DSDB header RNG seed (C2); 0 = the runtime picks. |
| `--jobs N` | build, play | Runtime build parallelism; default `DSDUDE_MAKE_JOBS`, else 8. |
| `--frames N`, `--keys file`, `--out dir` | screenshot | Frame count; key script; output folder. |

The key-script format for `--keys` is WS1's to define here (draft: one line per frame range, `<from>-<to> <buttons>`).

## Exit codes

- `0` ok (warnings allowed).
- `1` user-input diagnostics: the project has at least one error diagnostic.
- `2` tool or environment failure: a tool, emulator or py-desmume is missing or crashed, a timeout fired, or the
  command cannot run on this platform. Always with an E6xx diagnostic, never a crash or a stack trace.

## Paths

Build output goes to `<DSDUDE_HOME>\build\<project-hash>`, where `<project-hash>` is the first 16 hex digits of the
SHA-256 of the lower-cased absolute project path (PLAN.md section 3.2). `DSDUDE_HOME` defaults to `%LOCALAPPDATA%\DSDude`.

## How to change me

- T0 (wording, examples): WS1 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new command or flag, a new `--json` field): minor version bump + CHANGELOG entry in one commit; WS0 reviews
  within 24 hours.
- T2 (renaming or removing a command or flag, changing an exit code's meaning): an ADR co-signed by WS8 and every
  stream whose smoke tests use it.
