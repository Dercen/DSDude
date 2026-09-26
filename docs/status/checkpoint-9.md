# Checkpoint 9: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `1539481`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-9. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS1 | local | `ws1-toolchain` | 0 | 18 | **up to date** | no new commits |
| WS4 | cloud | `ws4-compiler@5b8d0cc` | 0 | 1 | **up to date** | no new commits |
| WS2 | cloud | `ws2-runtime-core@dfe8c78` | 2 | 1 | **merged** as `1539481` | batch: Test Files  75 passed (75); Tests  631 passed (631) |
| WS3 | local | `ws3-platform` | 3 | 0 | **merged** as `1539481` | batch: Test Files  75 passed (75); Tests  631 passed (631) |
| WS5 | cloud | `ws5-assets@037001c` | 1 | 1 | **merged** as `1539481` | batch: Test Files  75 passed (75); Tests  631 passed (631) |
| WS6 | local | `ws6-ide` | 1 | 0 | **merged** as `1539481` | batch: Test Files  75 passed (75); Tests  631 passed (631) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS4 | `ws4-compiler@5b8d0cc` | 1 | up to date | - | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@dfe8c78` | 1 | merged | mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |
| WS5 | `ws5-assets@037001c` | 1 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0; push target: ws5-assets; behind |

## Local checks (Windows)

- npm run check && npm test (Windows): green; Test Files  75 passed (75); Tests  631 passed (631)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- npm run test:browser -w apps/ide (headless Chromium): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp9-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 8 samples since 2026-09-26T09:31:57-06:00: minimum available 1806 MB at 2026-09-26T09:33:34; peak commit charge 16.9 GB at 2026-09-26T09:33:34; gate PASS
- ADR-pending inventory: main;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; ws1-toolchain;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0004: runtime/platform/ds/src/ds_plat.c:217;   ADR-0003: tools/screenshot.py:11; ws3-platform;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; ws6-ide;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; origin/ws2-runtime-core;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; origin/ws4-compiler;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; origin/ws5-assets;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11

## Run log

- fetch: ok
- WS2: merged ws2-runtime-core@dfe8c78 (2 commits)
- WS3: merged ws3-platform (3 commits)
- WS5: merged ws5-assets@037001c (1 commits)
- WS6: merged ws6-ide (1 commits)
