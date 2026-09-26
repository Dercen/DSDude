# ADR-0008: debug and release arithmetic (a DSDB header flag)

- Status: **accepted** (user, 2026-09-26); proposed by WS2 (number kept). WS4 lands the C2 T1 change (dsdb.md
  flags bit 0, the compiler's `release` option, a `.release` line in `.dsda`, folding per point 4); WS2 then drops
  its `ADR-pending ADR-0008` markers. The C10 `--release` flag for `dsdude compile`/`build` (WS1's paths) waits for
  a WS1 short session or WS8 at CP-C; Play stays debug meanwhile, so nothing is blocked before M2.
- Affects: C2 `contracts/dsdb.md` (WS4 + WS2), the compiler (WS4), C10 `contracts/cli.md` (WS1), the runtime
  core (WS2). Needs WS4's and WS1's co-signatures.

## Context

`contracts/language.md` section 7 and PLAN.md 2.8 say that int32 overflow in `+ - *`, and mixed arithmetic whose
result does not fit Q20.12, raise R520/R521 **in debug builds** and **wrap in release builds**. Nothing says what a
debug or a release build is:

- There is one prebuilt runtime, `runtime/dist/arm9.elf` (`arm9-debug.elf` is the same link with symbols; ndstool
  packs identical bytes from either). So the mode cannot be a runtime build option: it has to travel with the game.
- The DSDB header has a reserved `u16 flags` at offset 22, written as 0 today; the loader ignores it.
- The runtime's `DsdVm.debug` is hard-wired to true, so every game is a debug build.

The question has to be settled before M2 (PLAN.md 8), when games start being exported.

## Decision (proposed)

1. **C2 (T1, dsdb.md minor bump):** header flags bit 0 is `release`. Clear (0) = debug: overflow raises R520/R521.
   Set (1) = release: `+ - *` wrap modulo 2^32 and Q20.12 results wrap to their low 32 bits, as `-fwrapv` and the
   DS do. Every other runtime check stays in both modes: division by zero (R530), the watchdog (R510), recursion
   (R511), wrong kinds of value (R54x), list bounds (R55x), unset variables (R50x), memory (R56x).
2. **Bits 1-15 stay reserved and must be 0.** The loader refuses a file with any of them set, with R581 ("made by a
   newer DSDude", like an unknown format major), so a future flag can never be silently ignored.
3. **Who sets it:** the compiler takes a `release` option (WS4) and writes the bit. `dsdude compile` and
   `dsdude build` take `--release` (C10, T1, WS1); Play and the IDE's Run always build debug. The IDE's Export
   (M6) builds release.
4. **Constant folding follows the flag** (WS4): a folded overflow wraps in release; in debug the compiler either
   leaves the expression unfolded (so the runtime raises R52x on the same line) or reports it at compile time.
   WS4 chooses; the runtime has no view on it.
5. **Tests:** WS2 runs the overflow fixtures in both modes (debug: `DSD|ERR|R520`; release: the wrapped value
   printed). Until WS4's assembler writes the flag (a `.release` line in `.dsda` is one option), the WS2 test sets
   bit 0 in a copy of the fixture's bytes.

## Consequences

- A released game never stops on an arithmetic overflow, matching GameMaker's behaviour in shipped games, while
  Play keeps catching the mistake with the source line.
- No new runtime artifact and no C11 change: the flag is read by the portable core's loader.
- Host traces of a debug and a release build of the same program are identical unless an overflow happens.

## Implementation status (WS2)

The runtime reads bit 0 and refuses unknown bits now (`runtime/core/src/loader.c`, `game.c`, marked
`ADR-pending ADR-0008`); with every current file at flags = 0, nothing changes until the compiler writes the bit.
