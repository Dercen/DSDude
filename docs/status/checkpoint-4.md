# Checkpoint 4: daily integration (2026-09-26)

WS0's integration run (`tools/checkpoint.ps1`). `main` is at the commit that adds this report, on top of `f4b27af`. Streams whose branch was merged may touch it again. Cloud streams: wait for the user's relay "WS0 merged checkpoint-4. Run `bash tools/cloud/start.sh`, then ...".

## Streams

| Stream | Where | Ref | New commits | Behind main | Result | Detail |
|---|---|---|---|---|---|---|
| WS1 | local | `ws1-toolchain` | 0 | 41 | **up to date** | no new commits |
| WS5 | cloud | `ws5-assets@83d3eed` | 5 | 2 | **refused** | merge conflict: Auto-merging contracts/CHANGELOG.md / CONFLICT (content): Merge conflict in contracts/CHANGELOG.md / Automatic merge failed; fix conflicts and then commit the result. |
| WS4 | cloud | `ws4-compiler@8cbe933` | 10 | 2 | **merged** as `aa0a13d` | batch: Test Files  58 passed (58); Tests  477 passed (477) |
| WS2 | cloud | `ws2-runtime-core@3172853` | 14 | 2 | **merged** as `aa0a13d` | batch: Test Files  58 passed (58); Tests  477 passed (477) |
| WS3 | local | `ws3-platform` | 2 | 36 | **merged** as `aa0a13d` | batch: Test Files  58 passed (58); Tests  477 passed (477) |
| WS6 | local | `ws6-ide` | 2 | 17 | **merged** as `aa0a13d` | batch: Test Files  58 passed (58); Tests  477 passed (477) |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| WS5 | `ws5-assets@83d3eed` | 2 | refused | - | node v24.16.0, npm 11.13.0; push target: ws5-assets; behind origin/main |
| WS4 | `ws4-compiler@8cbe933` | 2 | merged | none due yet (inputs not there) | node v24.16.0, npm 11.13.0, gcc 13.3.0, GNU Make 4.3; lockfile guard green. |
| WS2 | `ws2-runtime-core@3172853` | 2 | merged | mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green | node v24.16.0, npm 11.13.0; push target: none yet; behind origin/main by 0; latest checkpoint: docs/status/checkpoint-0.md; open IF entries: 0 |

## Local checks (Windows)

- lockfile regenerated and committed (guard passed)
- npm run check && npm test (Windows): green; Test Files  58 passed (58); Tests  477 passed (477)
- mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): green
- dsdude screenshot samples/hello (C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude\checkpoint\cp4-hello): PNGs written; no golden committed yet (WS1/WS8); WS0 reads the PNGs

## Integration feedback appended

- WS5: merge failed: `git merge --no-ff origin/ws5-assets` -> Auto-merging contracts/CHANGELOG.md / CONFLICT (content): Merge conflict in contracts/CHANGELOG.md / Automatic merge failed; fix conflicts and then commit the result.

## Memory and ADR-pending

- Memory: 28 samples since 2026-09-26T08:06:36-06:00: minimum available 2634 MB at 2026-09-26T08:20:20; peak commit charge 15.0 GB at 2026-09-26T08:20:20; gate PASS
- ADR-pending inventory: main;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; ws1-toolchain;   ADR-0003: tools/screenshot.py:11; ws3-platform;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:12, runtime/platform/ds/src/main.c:34;   ADR-0003: tools/screenshot.py:11; ws6-ide;   ADR-0003: packages/compiler/src/codegen/function.ts:460, packages/compiler/src/codegen/function.ts:654, packages/compiler/src/codegen/function.ts:690, packages/compiler/src/codegen/function.ts:713, tools/screenshot.py:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26; origin/ws2-runtime-core;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26;   ADR-0003: tools/screenshot.py:11; origin/ws4-compiler;   ADR-0005: packages/compiler/src/codegen/function.ts:462, packages/compiler/src/codegen/function.ts:657, packages/compiler/src/codegen/function.ts:693, packages/compiler/src/codegen/function.ts:716;   ADR-0006: packages/compiler/src/project.ts:598, packages/dsdb/src/encode.ts:368, packages/dsdb/src/model.ts:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26;   ADR-0003: tools/screenshot.py:11; origin/ws5-assets;   ADR-0003: packages/compiler/src/codegen/function.ts:460, packages/compiler/src/codegen/function.ts:654, packages/compiler/src/codegen/function.ts:690, packages/compiler/src/codegen/function.ts:713, tools/screenshot.py:11;   ADR-0004: runtime/platform/ds/src/ds_boot_stub.c:3, runtime/platform/ds/src/ds_boot_stub.h:3, runtime/platform/ds/src/ds_platform.h:11, runtime/platform/ds/src/main.c:26

## Run log

- fetch: ok
- WS4: merged ws4-compiler@8cbe933 (10 commits)
- WS2: merged ws2-runtime-core@3172853 (14 commits)
- WS3: merged ws3-platform (2 commits)
- WS6: merged ws6-ide (2 commits)
