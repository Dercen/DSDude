# Checkpoint 13: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `1a9e200`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-13. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS1 | local | `ws1-toolchain` | 0 | 13 | **up to date** | no new commits |
| WS4 | cloud | `ws4-compiler@e6f3a4a` | 2 | 0 | **merged** as `9b5ffe4` | batch: Test Files  81 passed (81); Tests  672 passed (672) |
| WS2 | cloud | `ws2-runtime-core@ad59008` | 1 | 0 | **merged** as `9b5ffe4` | batch: Test Files  81 passed (81); Tests  672 passed (672) |
| WS3 | local | `ws3-platform` | 2 | 0 | **merged** as `9b5ffe4` | batch: Test Files  81 passed (81); Tests  672 passed (672) |
| WS5 | cloud | `ws5-assets@bc82697` | 4 | 0 | **merged** as `9b5ffe4` | batch: Test Files  81 passed (81); Tests  672 passed (672) |
| WS6 | local | `ws6-ide` | 1 | 0 | **merged** as `9b5ffe4` | batch: Test Files  81 passed (81); Tests  672 passed (672) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS4 | `ws4-compiler@e6f3a4a` | 0 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@ad59008` | 0 | merged | mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |
| WS5 | `ws5-assets@bc82697` | 0 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0; push target: ws5-assets; behind |

## Local checks (Windows)

- lockfile regenerated and committed (guard passed)
- npm run check && npm test (Windows): green; Test Files  81 passed (81); Tests  672 passed (672)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- npm run test:browser -w apps/ide (headless Chromium): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp13-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 21 samples since 2026-09-26T10:49:57-06:00: minimum available 3275 MB at 2026-09-26T10:59:00; peak commit charge 14.8 GB at 2026-09-26T10:59:00; gate PASS
- ADR-pending inventory: main;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:64, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:514; ws1-toolchain;   ADR-0007: apps/ide/src/shared/controls.ts:57; origin/ws2-runtime-core;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:64, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:514

## Run log

- fetch: ok
- WS4: merged ws4-compiler@e6f3a4a (2 commits)
- WS2: merged ws2-runtime-core@ad59008 (1 commits)
- WS3: merged ws3-platform (2 commits)
- WS5: merged ws5-assets@bc82697 (4 commits)
- WS6: merged ws6-ide (1 commits)
