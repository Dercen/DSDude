# Checkpoint 21: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `7e3a47b`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-21. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS6 | local | `ws6-ide` | 1 | 11 | **merged** as `7e3a47b` | Test Files  89 passed (89); Tests  742 passed (742) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| - | - | - | - | - | - |

## Local checks (Windows)

- npm run check && npm test (Windows): green; Test Files  89 passed (89); Tests  742 passed (742)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- runtime/dist: current (check:dist)
- npm run test:browser -w apps/ide (headless Chromium): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp21-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 3 samples since 2026-09-26T13:34:21-06:00: minimum available 3380 MB at 2026-09-26T13:35:36; peak commit charge 14.5 GB at 2026-09-26T13:35:36; gate PASS
- ADR-pending inventory: ws1-toolchain;   ADR-0007: apps/ide/src/shared/controls.ts:57; ws6-ide;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:67, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:536; origin/ws4-compiler;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:67, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:536; origin/ws5-assets;   ADR-0008: runtime/core/include/dsdb.h:25, runtime/core/src/game.c:64, runtime/core/src/loader.c:84, runtime/tests/test_programs.c:514

## Run log

- fetch: ok
- WS6: merged ws6-ide (1 commits)
