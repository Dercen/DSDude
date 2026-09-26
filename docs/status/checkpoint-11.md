# Checkpoint 11: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `a2570e4`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-11. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS4 | cloud | `ws4-compiler@5b8d0cc` | 0 | 23 | **up to date** | no new commits |
| WS2 | cloud | `ws2-runtime-core@43f77d3` | 0 | 7 | **up to date** | no new commits |
| WS3 | local | `ws3-platform` | 0 | 9 | **up to date** | no new commits |
| WS5 | cloud | `ws5-assets@28a732c` | 0 | 8 | **up to date** | no new commits |
| WS1 | local | `ws1-toolchain` | 4 | 0 | **merged** as `a2570e4` | batch: Test Files  78 passed (78); Tests  648 passed (648) |
| WS6 | local | `ws6-ide` | 1 | 0 | **merged** as `a2570e4` | batch: Test Files  78 passed (78); Tests  648 passed (648) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS4 | `ws4-compiler@5b8d0cc` | 23 | up to date | - | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@43f77d3` | 7 | up to date | - | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |
| WS5 | `ws5-assets@28a732c` | 8 | up to date | - | node v24.16.0, npm 11.13.0; push target: ws5-assets; behind |

## Local checks (Windows)

- npm run check && npm test (Windows): green; Test Files  78 passed (78); Tests  648 passed (648)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- npm run test:browser -w apps/ide (headless Chromium): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp11-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 8 samples since 2026-09-26T09:46:09-06:00: minimum available 2583 MB at 2026-09-26T09:51:52; peak commit charge 16.2 GB at 2026-09-26T09:51:52; gate PASS
- ADR-pending inventory: main;   ADR-0007: apps/ide/src/shared/controls.ts:57; ws1-toolchain;   ADR-0007: apps/ide/src/shared/controls.ts:57; ws3-platform;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; ws6-ide;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; origin/ws2-runtime-core;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; origin/ws4-compiler;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; origin/ws5-assets;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11

## Run log

- fetch: ok
- WS1: merged ws1-toolchain (4 commits)
- WS6: merged ws6-ide (1 commits)
