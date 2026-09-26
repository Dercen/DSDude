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

## Decisions and notes (for WS0/WS3/WS4 review)
- **Degrees to libnds angles** (`dsd_deg_to_brad`): brad = deg_fx / 45 rounded half away from zero, reduced mod 32768. dsin(30) is exactly 0.5.
- **libnds sin is not exactly odd:** `sinLerp`'s final `>> 3` floors, so dsin(-30) = -2049/4096 (prints `-0.5`). Kept as the DS computes it and pinned in the tests.
- **point_direction's atan2** interpolates over the vendored `TAN_LUT` (16.16) inside one octant, with the diagonal special-cased; accuracy within 0.05 degrees in the tests. libnds `atanLerp` is vendored but not used by the core.
- The core's number formatting divides only unsigned values by the constants 10/100, which cannot reach the guarded division cases.
- The GitHub API (`api.github.com`) answered 403 from this VM; the libnds submodule commit was read with `git clone --filter=blob:none --no-checkout` of blocksds/sdk at `v1.24.0` instead, and the files came from `raw.githubusercontent.com`.

## Needs a local check (WS0, mingw32-make under cmd.exe)
- `mkdir "runtime/build-host"`: relies on cmd.exe accepting a quoted forward-slash path.
- The `test` recipe runs `runtime/build-host/dsdude-tests.exe` by a forward-slash path (make should spawn it directly, without cmd.exe).
- If either fails, an IF entry with the error text is enough; the fix stays inside `runtime/Makefile.host`.

## Next
- Task 2: loader, VM (29 stable opcodes), host platform and `dsdude-host`; the Host runner section (key script + JSONL trace) in `contracts/log-protocol.md` as T1 before CP-A.
- Task 3: `runtime/core/include/dsd_platform.h` (C11) by CP-A (D+3 = 2026-09-28).

## Open ADR-pending markers
- none

## Integration feedback
- IF-1 2026-09-26 checkpoint-2 @2b51ae1: ownership failed: `node tools/check-ownership.ts --range main..origin/ws2-runtime-core --stream WS2` ->  ?: . Action: revert or move those changes (they belong to another stream), then push again.
