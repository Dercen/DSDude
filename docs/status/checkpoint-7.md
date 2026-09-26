# Checkpoint 7: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `d725818`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-7. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS3 | local | `ws3-platform` | 2 | 35 | **merged** as `d725818` | batch: Test Files  72 passed (72); Tests  599 passed (599) |
| WS6 | local | `ws6-ide` | 1 | 31 | **merged** as `d725818` | batch: Test Files  72 passed (72); Tests  599 passed (599) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| - | - | - | - | - | - |

## Local checks (Windows)

- npm run check && npm test (Windows): green; Test Files  72 passed (72); Tests  599 passed (599)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- npm run test:browser -w apps/ide (headless Chromium): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp7-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- none

## Memory and ADR-pending

- Memory: 3 samples since 2026-09-26T09:13:16-06:00: minimum available 2948 MB at 2026-09-26T09:14:15; peak commit charge 14.7 GB at 2026-09-26T09:14:15; gate PASS
- ADR-pending inventory: main;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0004: runtime/platform/ds/src/ds_plat.c:217;   ADR-0003: tools/screenshot.py:11; ws1-toolchain;   ADR-0003: tools/screenshot.py:11; ws3-platform;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_plat.c:217;   ADR-0003: tools/screenshot.py:11; ws6-ide;   ADR-0007: apps/ide/src/shared/controls.ts:57;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; origin/ws2-runtime-core;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; origin/ws4-compiler;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; origin/ws5-assets;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11

## Run log

- fetch: ok
- WS3: merged ws3-platform (2 commits)
- WS6: merged ws6-ide (1 commits)
