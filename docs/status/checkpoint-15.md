# Checkpoint 15: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `c150433`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-15. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS1 | local | `ws1-toolchain` | 0 | 39 | **up to date** | no new commits |
| WS4 | cloud | `ws4-compiler@7da53a4` | 5 | 1 | **merged** as `cb9a9e4` | batch: Test Files  85 passed (85); Tests  711 passed (711) |
| WS2 | cloud | `ws2-runtime-core@cd2e295` | 5 | 1 | **merged** as `cb9a9e4` | batch: Test Files  85 passed (85); Tests  711 passed (711) |
| WS3 | local | `ws3-platform` | 7 | 0 | **merged** as `cb9a9e4` | batch: Test Files  85 passed (85); Tests  711 passed (711) |
| WS5 | cloud | `ws5-assets@0af5780` | 1 | 1 | **merged** as `cb9a9e4` | batch: Test Files  85 passed (85); Tests  711 passed (711) |
| WS6 | local | `ws6-ide` | 2 | 0 | **merged** as `cb9a9e4` | batch: Test Files  85 passed (85); Tests  711 passed (711) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS4 | `ws4-compiler@7da53a4` | 1 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@cd2e295` | 1 | merged | mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |
| WS5 | `ws5-assets@0af5780` | 1 | merged | none due yet (inputs not there) | node v24.16.0, |

## Local checks (Windows)

- lockfile regenerated and committed (guard passed)
- npm run check && npm test (Windows): green; Test Files  85 passed (85); Tests  711 passed (711)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- runtime/dist: STALE: the merged core changed its build inputs; WS3 rebuilds dist (WS0 messages WS3)
- npm run test:browser -w apps/ide (headless Chromium): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp15-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 47 samples since 2026-09-26T11:21:08-06:00: minimum available 2995 MB at 2026-09-26T11:23:24; peak commit charge 14.8 GB at 2026-09-26T11:55:57; gate PASS
- ADR-pending inventory: main;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:64, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:527; ws1-toolchain;   ADR-0007: apps/ide/src/shared/controls.ts:57; ws3-platform;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:64, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:514; ws6-ide;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:64, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:514; origin/ws2-runtime-core;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:64, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:527; origin/ws4-compiler;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:64, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:514; origin/ws5-assets;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:64, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:514

## Run log

- fetch: ok
- WS4: merged ws4-compiler@7da53a4 (5 commits)
- WS2: merged ws2-runtime-core@cd2e295 (5 commits)
- WS3: merged ws3-platform (7 commits)
- WS5: merged ws5-assets@0af5780 (1 commits)
- WS6: merged ws6-ide (2 commits)
- runtime/dist is stale after this merge: message WS3 to rebuild it
