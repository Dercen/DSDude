# Checkpoint 8: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `25dbb82`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-8. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS1 | local | `ws1-toolchain` | 0 | 1 | **up to date** | no new commits |
| WS4 | cloud | `ws4-compiler@1655274` | 1 | 3 | **merged** as `25dbb82` | batch: Test Files  75 passed (75); Tests  625 passed (625) |
| WS2 | cloud | `ws2-runtime-core@ea6a609` | 2 | 3 | **merged** as `25dbb82` | batch: Test Files  75 passed (75); Tests  625 passed (625) |
| WS3 | local | `ws3-platform` | 2 | 3 | **merged** as `25dbb82` | batch: Test Files  75 passed (75); Tests  625 passed (625) |
| WS5 | cloud | `ws5-assets@3bbe1f8` | 1 | 2 | **merged** as `25dbb82` | batch: Test Files  75 passed (75); Tests  625 passed (625) |
| WS6 | local | `ws6-ide` | 3 | 2 | **merged** as `25dbb82` | batch: Test Files  75 passed (75); Tests  625 passed (625) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS4 | `ws4-compiler@1655274` | 3 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@ea6a609` | 3 | merged | mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |
| WS5 | `ws5-assets@3bbe1f8` | 2 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0; push target: ws5-assets; behind |

## Local checks (Windows)

- npm run check && npm test (Windows): green; Test Files  75 passed (75); Tests  625 passed (625)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- npm run test:browser -w apps/ide (headless Chromium): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp8-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 15 samples since 2026-09-26T09:16:56-06:00: minimum available 1385 MB at 2026-09-26T09:25:26; peak commit charge 16.7 GB at 2026-09-26T09:25:26; gate FAIL
- ADR-pending inventory: main;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; ws1-toolchain;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0004: runtime/platform/ds/src/ds_plat.c:217;   ADR-0003: tools/screenshot.py:11; ws3-platform;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0003: tools/screenshot.py:11; ws6-ide;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0004: runtime/platform/ds/src/ds_plat.c:217;   ADR-0003: tools/screenshot.py:11; origin/ws2-runtime-core;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0004: runtime/platform/ds/src/ds_plat.c:217;   ADR-0003: tools/screenshot.py:11; origin/ws4-compiler;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0004: runtime/platform/ds/src/ds_plat.c:217;   ADR-0003: tools/screenshot.py:11; origin/ws5-assets;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0004: runtime/platform/ds/src/ds_plat.c:217;   ADR-0003: tools/screenshot.py:11

## Run log

- fetch: ok
- WS4: merged ws4-compiler@1655274 (1 commits)
- WS2: merged ws2-runtime-core@ea6a609 (2 commits)
- WS3: merged ws3-platform (2 commits)
- WS5: merged ws5-assets@3bbe1f8 (1 commits)
- WS6: merged ws6-ide (3 commits)
