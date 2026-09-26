# Checkpoint 26: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `f2d7f36`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-26. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS1 | local | `ws1-toolchain` | 0 | 139 | **up to date** | no new commits |
| WS4 | cloud | `ws4-compiler@a518f8e` | 0 | 32 | **up to date** | no new commits |
| WS2 | cloud | `ws2-runtime-core@f636475` | 0 | 2 | **up to date** | no new commits |
| WS5 | cloud | `ws5-assets@0af5780` | 0 | 100 | **up to date** | no new commits |
| WS6 | local | `ws6-ide` | 0 | 13 | **up to date** | no new commits |
| WS3 | local | `ws3-platform` | 1 | 0 | **merged** as `f2d7f36` | Test Files  90 passed (90); Tests  746 passed (746) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS4 | `ws4-compiler@a518f8e` | 32 | up to date | - | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@f636475` | 2 | up to date | - | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |
| WS5 | `ws5-assets@0af5780` | 100 | up to date | - | node v24.16.0, |

## Local checks (Windows)

- npm run check && npm test (Windows): green; Test Files  90 passed (90); Tests  746 passed (746)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- runtime/dist: current (check:dist)
- IDE browser tests: skipped (no IDE package changed)
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp26-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 11 samples since 2026-09-26T15:48:15-06:00: minimum available 3215 MB at 2026-09-26T15:51:53; peak commit charge 14.4 GB at 2026-09-26T15:51:53; gate PASS
- ADR-pending inventory: ws1-toolchain;   ADR-0007: apps/ide/src/shared/controls.ts:57; origin/ws4-compiler;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:67, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:536; origin/ws5-assets;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:64, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:514

## Run log

- fetch: ok
- WS3: merged ws3-platform (1 commits)
