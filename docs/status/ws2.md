# WS2 runtime core status

Cloud push target: `ws2-runtime-core`

Cloud session (hybrid mode), environment `dsdude-ws2`, stream line `ws2-runtime-core`.

## Environment
- start.sh (2026-09-26): `node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0`
- Linux gcc check: done in the cloud (gcc 13.3.0 Ubuntu, GNU Make 4.3).
- Test: `make -f runtime/Makefile.host test` builds and runs `runtime/build-host/dsdude-tests` twice (`-O2`, and the UBSan trap variant `-fsanitize=undefined -fsanitize-trap=undefined`).

## Progress
- **Task 1 (values and numbers): done, 2026-09-26.**
  - `runtime/core/include/value.h`: 8-byte cells `{u32 tag; s32 payload}` (static_asserted size and offsets), tag and ASSET-kind constants, constructors, `__builtin_*_overflow` checks for the debug trap.
  - `fixed.h/.c`: the one division path `dsd_div64` (tests den == 0, then den == -1 so INT64_MIN / -1 and INT_MIN / -1 wrap; C99 truncation otherwise) and the DIV_64_32 model `dsd_div64_32` (low 32 bits); Q20.12 mul/div truncating toward zero; floor/ceil/round/trunc; `dsd_isqrt64` and `dsd_sqrtf32` = floor(isqrt((u64)a << 12)); degree `dsin`/`dcos`; octant-LUT `atan2` in degrees; `hypot`.
  - `number.h/.c`: DSS promotion rules on cells for `+ - * / div mod`, unary minus, comparison views (INT/BOOL/INST/ASSET/REAL), floor/ceil/round; statuses `DSD_NUM_OK/OVERFLOW/DIV_ZERO/SQRT_NEG/NOT_NUMBER` for the VM to map to R5xx (overflow only in debug).
  - `numfmt.h/.c`: `string(n)` for ints and Q20.12 (exact value, 2 decimals half away from zero, no `-0`), every language.md example tested.
  - Vendored libnds trig: `runtime/core/src/vendor/trig.c` + `runtime/core/include/vendor/trig_lut.h` from blocksds/libnds `7fd8ccbe781ed48a06fe063a2dcbb69035fa97d3` (the `libs/libnds` submodule of blocksds/sdk tag `v1.24.0`), SPDX Zlib headers kept, provenance and changes recorded at the top of each file. Changes: includes point at `vendor/nds_shim.h`, which supplies the types, `inttof32`, `divf32` through the core's DIV_64_32 model, and renames every exported symbol to `dsd_nds_*` so the DS link cannot clash with libnds's own `trig.o`. Code otherwise unchanged; table checksums pinned in `runtime/tests/test_trig.c`.
  - `runtime/tests/`: C runner (`test_main.c`, `test.h`) with suites fixed (division equivalence against an independent shift-subtract divider: corners + 20,000 seeded random pairs incl. quotients over 32 bits; mul/div; rounding; isqrt sweep), number, numfmt, trig (LUT integrity, dsin/dcos exact at multiples of 90, atan2 exact at multiples of 45 at scales up to 2^40, round-trip tolerance 0.05 degrees, monotonicity). 88,494 checks per variant, both green.
  - `runtime/Makefile.host`: unity builds (one `gcc` call per binary), `EXE` is the only `ifeq`, output dir by a one-level `mkdir "runtime/build-host"` order-only rule.

- **Task 2 (loader, VM, host runner): done for program form, 2026-09-26.** Room games wait for the engine (task 6).
  - `loader.c` (`dsdb.h`): header (magic, major, ABI hash: R581 "This ROM was built for a different DSDude runtime"), section table, every section's records, program-form rules, and a **bytecode verifier** (registers, KONS/GLOB/FUNC indices, jump targets inside the function, CALLN builtin + argument count, callee parameter window, no running off a function's end). Unimplemented opcodes are R582 at load.
  - `vm.arm.c`: computed-goto dispatch (`#pragma GCC optimize("no-gcse", "no-crossjumping")`, `DSD_ITCM_CODE`), the 29 stable opcodes plus provisional `CALL`, int32 fast paths for ADD/SUB/MUL/compares, sliding-window frames (callee r0 = caller rA), callee registers cleared to undefined, 4 KB register stack (`DSD_DTCM_BSS`), 256 call records, a watchdog step count on every instruction (R510 after 200,000 per frame), nested entry for builtins that run script code.
  - `values.c` (equality, printing, kinds), `strings.c` (`dsd_strings.h`: STRS constants in place, dynamic strings in the 192 KB arena; **no collector yet**, see leftovers), `random.c` (xorshift32), `textbuf.c`, `debug.c` (`dsd_log.h`: every C8 line, 1023-byte lines, UTF-8-safe continuation, `|` to `/` in ERR fields; ERR with object/event/file/line from DBG), `game.c` (`game.h`: boot, READY, seed, program form, EXIT), `builtins/` (table from the generated X-macros; math: floor ceil round abs sign frac sqrt min max clamp lerp dsin dcos point_distance point_direction lengthdir_x/y; output: show_debug_message string assert).
  - `runtime/core/diagnostics/catalog.json`: R500-R590 with sub-ranges (errors.h mirrors the numbers).
  - `runtime/host/`: `platform.c` (C11 for the host: files from the NitroFS dir or a `.dsdb` path, stdout or a capture sink, frame-based millis, `--seed`), `keys.c` (key scripts), `main.c` (`dsdude-host`, exit 0/1/2, binary stdout on Windows).
  - **C8 0.2.0 (T1):** "Host runner" section in `contracts/log-protocol.md`: command line, key-script format, JSONL trace schema, `--png-dir` (from v4). CHANGELOG line added; WS0 review due within 24 h.
  - **C11 draft:** `runtime/core/include/dsd_platform.h` 0.1.0-draft (lifecycle, input, files, log + flush, fatal, mem report, sprites/bg/OAM with the shadow-OAM entry and affine sets, UI layer, sound, room-load primitives `dsd_plat_screens_blank` / `dsd_plat_assets_free` / `dsd_plat_sfx_load` / `dsd_plat_music_load`, millis, rng seed, `DSD_ITCM_CODE`/`DSD_DTCM_*` mirroring libnds's section names under `ARM9`). Freezes at CP-A (task 3).
  - Fixtures: v0-02..05 hand-assembled (`fixtures/bytecode/conformance/`), all v0 goldens match; `fixtures/bytecode/hello.out`; `fixtures/bytecode/runtime/` (strings + 9 error programs with full `.out` goldens). All `.dsda` are canonical (`dsdb-dis` round-trips them) and the `.dsdb` come from `node tools/gen-dsdb.ts`.
  - Tests: suites loader (patched hello.dsdb per R58x case), host (C8 line formatting, key scripts, RNG, C13 drift against `contracts/runtime-limits.json`), programs (every fixture against its golden; missing file R584; boot twice gives identical bytes). 89,645 checks per variant.

- **Task 3 (C11): published 0.1.0, 2026-09-26** (freezes at CP-A, 2026-09-28). `runtime/core/include/dsd_platform.h` plus a C11 CHANGELOG entry. Additions over the draft: `DSD_PLATFORM_VERSION`, `dsd_plat_music_active` (audio_is_playing, rule 8), `dsd_plat_bg_load(screen, NULL)` hides BG1. WS3 has not started yet; its first review may still change the header before CP-A.
- **ADR-0003 (proposed):** sprite geometry (frame size, origin, bbox from `sprite.json`) has no path to the runtime today. Proposal: the reserved header word becomes an extension-table offset (C2 T1), first extension `SPRG`. Needs WS4's co-signature (and WS5's review); blocks tier v2 collisions/draw placement (~D+14).

## Decisions and notes (for WS0/WS3/WS4 review)
- **Degrees to libnds angles** (`dsd_deg_to_brad`): brad = deg_fx / 45 rounded half away from zero, reduced mod 32768. dsin(30) is exactly 0.5.
- **libnds sin is not exactly odd:** `sinLerp`'s final `>> 3` floors, so dsin(-30) = -2049/4096 (prints `-0.5`). Kept as the DS computes it and pinned in the tests.
- **point_direction's atan2** interpolates over the vendored `TAN_LUT` (16.16) inside one octant, with the diagonal special-cased; accuracy within 0.05 degrees in the tests. libnds `atanLerp` is vendored but not used by the core.
- **Debug vs release:** `vm->debug` is always true for now (overflow raises R520/R521). A release switch needs a DSDB header flag bit (C2 T1 with WS4) or a runtime build flag; to be settled before M2.
- **Program-form ERR fields:** object empty, event = the function name (documented in C8 0.2.0).
- **`sqrt` returns a REAL** for int arguments too (prints the same; `sqrt(4) == 2` holds).
- **Header names** avoid libc names (`dsd_strings.h`, `dsd_limits.h`, `dsd_random.h`): `-Iruntime/core/include` is searched before the system directories, so a `strings.h` there would hijack glibc's `<string.h>`.
- **For WS3:** the core uses `DSD_ITCM_CODE`/`DSD_DTCM_BSS` from `dsd_platform.h`, active when `ARM9` is defined (BlocksDS's ARM9 builds define it). `vm.arm.c` needs the `*.arm.c` rule. The host runner's `dsd_plat_*` in `runtime/host/platform.c` is a reference for the call order.
- The core's number formatting divides only unsigned values by the constants 10/100, which cannot reach the guarded division cases.
- The GitHub API (`api.github.com`) answered 403 from this VM; the libnds submodule commit was read with `git clone --filter=blob:none --no-checkout` of blocksds/sdk at `v1.24.0` instead, and the files came from `raw.githubusercontent.com`.

## Needs a local check (WS0, mingw32-make under cmd.exe)
- `mkdir "runtime/build-host"`: relies on cmd.exe accepting a quoted forward-slash path.
- The `test` recipe runs `runtime/build-host/dsdude-tests.exe` by a forward-slash path (make should spawn it directly, without cmd.exe).
- `dsdude-host.exe` output must be byte-identical to Linux (`_setmode(_O_BINARY)` on stdout); the `programs` suite compares it through the capture sink either way.
- If any fails, an IF entry with the error text is enough; the fix stays inside WS2's paths.

## Leftovers
- String collector: dynamic strings are freed only at boot (and later at room change). Long-running rooms that build text every frame need the collector planned with arrays (task 4). Note: PLAN 3.3 says "ref-counting plus a mark-sweep pass at room change"; WS2 proposes a tracing collector triggered when the arena fills (roots: registers, globals, instance slots), which costs nothing in the VM's hot path. Internal, not a contract; will be recorded with task 4.
- Builtins not implemented yet raise R582 when called (the loader accepts them).

## Next
- CP-A (2026-09-28): C11 freezes; fold in any WS3 review first.
- Task 4: strings/arrays/heap with the collector, provisional array opcodes (NEWARR/GETIDX/SETIDX/LEN) as WS4 promotes them, v1 goldens (hand-written `fixtures/bytecode/v1-*.dsda` until WS4's programs 6-10 land; ADR if not on main by D+5).
- Task 5: `fixtures/bytecode/bench.dsda`.

## Open ADR-pending markers
- none in code. Open ADR: ADR-0003 (proposed by WS2).

## Integration feedback
