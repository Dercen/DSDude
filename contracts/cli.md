# C10: the `dsdude` CLI

Version: 0.2.0 · Owner: WS1 (WS8 from `start-ws8`) · Changes: see the tiers in contracts/README.md

Phase-0 draft by WS0; WS1 finalises it by CP-C. Source: PLAN.md section 5.2 C10 and section 6 WS1.
Run it as `npx dsdude <command> ...` from a worktree or clone root; `packages/cli` declares the `dsdude` bin
(`src/main.ts`, run by Node 24 type stripping). `dsdude --help` lists the registered commands.

## Commands

| Command | What it does | Runs on Linux (cloud) |
|---|---|---|
| `dsdude compile <project> [-o <file.dsdb>]` | Load (C1) + compile (C2) + room budgets; writes the DSDB. (WS4 registers it.) | yes |
| `dsdude assets <project>` | Pack assets into the NitroFS folder (C3) with grit/mmutil. (WS5 registers it.) | no: exit 2 + E6xx |
| `dsdude build <project>` | compile + assets + runtime + `packRom`; prints the `.nds` path. | no: exit 2 + E6xx |
| `dsdude play <project>` | build, then launch the emulator and stream `DSD|` lines (C8) until it exits, Ctrl+C or `--seconds`. | no: exit 2 + E6xx |
| `dsdude screenshot <rom> --frames N [--keys file] --out dir` | Run the ROM headless in py-desmume 0.0.9 (`SDL_VIDEODRIVER=dummy`, `SDL_AUDIODRIVER=dummy`) for N frames; write `top.png`, `bottom.png` and `screenshot.json` into `dir`. | no: exit 2 + E605 |
| `dsdude toolchain status` | `detectToolchain()` (C4): whether BlocksDS is installed, and every tool path. | reports "missing" (E605) |
| `dsdude toolchain install` | Not in the CLI yet: run `scripts/install-toolchain.ps1`. | no |
| `dsdude emulator install\|status <melonds\|desmume>` | `EmulatorManager.ensureInstalled()` and its path. | no: exit 2 + E6xx |
| `dsdude doctor` | Checks the toolchain, emulators, py-desmume, paths under 250 characters, and warns when `OneDrive.exe` runs and the repo or project is under `%OneDrive%`. (Planned; WS1 task 5 or WS8.) | partial |
| `dsdude gen-builtins` | Runs the builtins generator (`tools/gen-builtins.ts`). (Registered by its owner.) | yes |

Commands are registered from each package's `cliCommands: CliCommand[]` export (C4, `packages/toolchain/src/api.ts`),
so WS4 (`compile`) and WS5 (`assets`) never edit `packages/cli`. `packages/cli` collects `@dsdude/toolchain`'s
commands first, then those of `@dsdude/compiler`, `@dsdude/asset-pipeline` and `@dsdude/dsdb` when they export
`cliCommands`; on a duplicate name the first wins. It is the composition root that injects `compileProject`,
`packAssets` and `checkRoomBudgets` into `BuildService`.

## Projects and plain BlocksDS folders

- A **DSDude project** is a folder with `project.json` (C1).
- A folder without it is a **plain BlocksDS C project**, such as `samples/hello`. `build` and `play` accept it only
  with `--skip-compile --skip-assets` (otherwise E608, exit 2). Then:
  - `<dir>/nitrofs/` is copied to the build folder's `nitrofs/` and packed as the NitroFS root;
  - the ARM9 binary is `--runtime`, else `runtime/dist/arm9.elf`;
  - the icon is `-b C:\msys64\opt\wonderful\thirdparty\blocksds\core\sys\icon.bmp`;
  - the banner is `<folder name>;DSDude;DSDude`.
- The toolchain-ok check is:
  `dsdude build samples/hello --runtime fixtures/runtime/hello/arm9.elf --skip-compile --skip-assets && dsdude play samples/hello --no-build`.

## Flags

| Flag | Commands | Meaning |
|---|---|---|
| `--json` | all | Machine-readable output on stdout: exactly one JSON object with `ok`, `diagnostics` (C9 shape) and the command's fields (below). Human text goes to stderr. |
| `--runtime <elf>` | build, play | Use this `arm9.elf` instead of `runtime/dist/arm9.elf`. |
| `--skip-compile` | build, play | Reuse the existing `game.dsdb`. |
| `--skip-assets` | build, play | Reuse the existing asset files. |
| `--no-build` | play | Launch the last built ROM (`<build folder>/game.nds`); E609 if there is none. |
| `--emulator melonds\|desmume` | play | Default `melonds`. |
| `--seconds N` | play | Stop the emulator gracefully after N seconds (for scripts and tests; 0.2.0). |
| `--seed N` | compile, build, play | DSDB header RNG seed (C2); 0 = the runtime picks. |
| `--jobs N` | build, play | Runtime build parallelism; default `DSDUDE_MAKE_JOBS`, else 8. |
| `--frames N`, `--keys file`, `--out dir` | screenshot | Frame count; key script; output folder. |

`--json` fields per command:

| Command | Fields besides `ok` and `diagnostics` |
|---|---|
| `toolchain status` | `installed`, `blocksdsVersion`, `paths` (C4 `ToolPaths`) |
| `emulator` | `kind`, `installed`, `exe` |
| `build` | `ndsPath`, `timings` |
| `play` | `ndsPath`, `emulator`, `pid`, `exitCode`, `ms`, `log` (the `DSD|` lines, pads dropped) |
| `screenshot` | `top`, `bottom`, `uniform` (`{top, bottom}`: true when that screen is one solid colour), `log` |

Without `--json`, `play` prints each `DSD|` line on stdout as it arrives and everything else on stderr.

### Key scripts (`--keys`), provisional

One line per frame range: `<from>-<to> <buttons>`. Frames are 1-based and inclusive (`<n>` alone is one frame).
Buttons are separated by spaces or commas, from `A B X Y L R START SELECT UP DOWN LEFT RIGHT`, and `#` starts a
comment. Example: `30-35 START`. This becomes the key-script format of `contracts/log-protocol.md` "Host runner"
(WS2) once that section defines one; until then `tools/screenshot.py` implements the draft above.

## Exit codes

- `0` ok (warnings allowed).
- `1` user-input diagnostics: the project has at least one error diagnostic (any source other than `toolchain`).
- `2` tool or environment failure: a tool, emulator or py-desmume is missing or crashed, a timeout fired, the
  command cannot run on this platform, or the arguments are wrong. Always with an E6xx diagnostic or a usage line,
  never a crash or a stack trace.

## Paths

Build output goes to `<DSDUDE_HOME>\build\<project-hash>`, where `<project-hash>` is the first 16 hex digits of the
SHA-256 of the lower-cased absolute project path (PLAN.md section 3.2). `DSDUDE_HOME` defaults to `%LOCALAPPDATA%\DSDude`.
The folder holds `nitrofs\`, `game.nds` and `packrom.json` (C4).

## How to change me

- T0 (wording, examples): WS1 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new command or flag, a new `--json` field): minor version bump + CHANGELOG entry in one commit; WS0 reviews
  within 24 hours.
- T2 (renaming or removing a command or flag, changing an exit code's meaning): an ADR co-signed by WS8 and every
  stream whose smoke tests use it.

## Changes

- 0.2.0 (WS1, 2026-09-25, T1): `play --seconds N`; the plain BlocksDS folder rules; the `--json` fields per
  command; `screenshot.json`; the provisional key-script format. `toolchain install` points to the script for now.
