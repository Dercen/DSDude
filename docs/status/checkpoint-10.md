# Checkpoint 10: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `b5585e9`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-10. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS1 | local | `ws1-toolchain` | 0 | 31 | **up to date** | no new commits |
| WS4 | cloud | `ws4-compiler@5b8d0cc` | 0 | 14 | **up to date** | no new commits |
| WS3 | local | `ws3-platform` | 0 | 0 | **up to date** | no new commits |
| WS2 | cloud | `ws2-runtime-core@43f77d3` | 1 | 0 | **merged** as `b5585e9` | batch: Test Files  75 passed (75); Tests  634 passed (634) |
| WS5 | cloud | `ws5-assets@28a732c` | 1 | 0 | **merged** as `b5585e9` | batch: Test Files  75 passed (75); Tests  634 passed (634) |
| WS6 | local | `ws6-ide` | 2 | 11 | **merged** as `b5585e9` | batch: Test Files  75 passed (75); Tests  634 passed (634) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS4 | `ws4-compiler@5b8d0cc` | 14 | up to date | - | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@43f77d3` | 0 | merged | mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |
| WS5 | `ws5-assets@28a732c` | 0 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0; push target: ws5-assets; behind |

## Local checks (Windows)

- npm run check && npm test (Windows): green; Test Files  75 passed (75); Tests  634 passed (634)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- npm run test:browser -w apps/ide (headless Chromium): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp10-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 6 samples since 2026-09-26T09:40:16-06:00: minimum available 2395 MB at 2026-09-26T09:41:42; peak commit charge 16.2 GB at 2026-09-26T09:41:42; gate PASS
- ADR-pending inventory: main;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; ws1-toolchain;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0004: runtime/platform/ds/src/ds_plat.c:217;   ADR-0003: tools/screenshot.py:11; ws3-platform;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; ws6-ide;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; origin/ws2-runtime-core;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; origin/ws4-compiler;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; origin/ws5-assets;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11

## Run log

- fetch: ok
- WS2: merged ws2-runtime-core@43f77d3 (1 commits)
- WS5: merged ws5-assets@28a732c (1 commits)
- WS6: merged ws6-ide (2 commits)
