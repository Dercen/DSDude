# Checkpoint 28: CP-A (D+3, 2026-09-28)

WS0's CP-A review (PLAN 7.3) on top of the event-driven integration. `main` is at the commit that adds this report,
on top of `checkpoint-27` (every stream merged, all green: 90 test files, 748 tests; MSYS2 host goldens; `runtime/dist`
current). **Status: draft for the user's approval.** On approval WS0 tags `cp-a`, then `start-ws7`, and launches WS7.

## Streams at CP-A

| Stream | Where | State | Since checkpoint-0 |
|---|---|---|---|
| WS1 toolchain | local slot 1 | paused at its DoD (2026-09-26) | build driver, Play, both emulators, `dsdude build` of real ROMs; leftovers go to WS8 at CP-C (samples' golden PNGs, exporting runTool/toolRunDiagnostics for WS5, C10 `--release` for ADR-0008) |
| WS2 runtime core | cloud | idle, all merged (77b47d8) | portable core, host goldens (125k checks per build), M1 VM steps 1-12 |
| WS3 platform | local slot 2 | idle, all merged | DS platform layer, `runtime/dist`, selftest and bench ROMs, the hardware sets, conformance:ds 46/46 |
| WS4 compiler | cloud | at its DoD, all merged (cee173b) | tasks 1-7: parser, codegen, `compileProject`, C7 0.1.0, conformance 6-10, the beginner mistakes, folding and II emission |
| WS5 assets | cloud | at its DoD (0af5780, launched early) | the asset pipeline and C3 0.2.0; one DoD item is WS0's (the py-desmume golden in `fixtures/assets/golden/`) |
| WS6 IDE | local slot 3 | small fixes only until this merge | IDE shell, Play/Debug, rebinding (ADR-0007), and task 7: sprite, room (PixiJS, 60 fps), background and sound editors with live meters |
| WS6b | - | will not launch (user, 2026-09-26) | WS6 built the editors |
| WS7 learn | cloud | launches after this checkpoint | - |

## CP-A checklist (PLAN 7.3)

- **Contract friction review and T2 ADRs.** ADR-0001 to ADR-0008 are all closed:
  - accepted: 0001, 0002, 0005, 0006, 0007, 0008;
  - 0003 was superseded by C8's `--input` format;
  - 0004 was resolved by C11 0.2.0/0.3.0.

  No T2 change is open. There were 77 contract commits since `phase0`, all T0/T1 and reviewed at integration. The ABI
  hash moved once (`0x0dd9987a` -> `0xf1d376bb`, the c_* colours; WS2's goldens were made hash-independent first).
  The friction seen:
  - CHANGELOG merge conflicts, fixed with the union merge driver;
  - a hard-coded ABI hash in WS2's tests;
  - push.sh counting WS0's lockfile commits as the stream's.

  All three are fixed.
- **Freezes (from now, any change beyond T0 text needs an ADR co-signed by owner and consumers):**
  - C11 `runtime/core/include/dsd_platform.h` **0.3.0** (WS2);
  - C12 panel API **0.1.0** (`apps/ide/src/renderer/panels/api.ts`) + `fixtures/ide/mock-host` (WS6);
  - C4 `BuildService` in `packages/toolchain/src/api.ts` **0.6.0**. WS1 is paused at its DoD, so WS0 confirms it
    on WS1's behalf; WS8 inherits it.

  The contract index `contracts/README.md` is rewritten with every CP-A version.
- **Ownership table vs reality.** Every merged non-merge commit passed the per-commit check against
  `tools/ownership.json`: 27 integration runs, and no ownership refusal except IF-1 on WS2, a checker timeout that has since
  been fixed. Deviations from the table, all recorded:
  - WS6 holds WS6b's paths (`start-ws6b` is never tagged);
  - WS5 started early at `start-ws5`.
- **Launches (hybrid):** WS5 is already running (launched early on 2026-09-26). WS7 launches now; see
  "WS7 launch" below.
- **Next freezes (CP-B = M0, 2026-10-02):**
  - C7 `LanguageServiceHost` 0.1.0 (WS4);
  - C12 preview API 0.2.0 (WS5).

## Contract versions at CP-A

C1 0.1.0; C2 dsdb 0.6.0 / opcodes 0.4.0 / builtins 0.3.0 (ABI `0xf1d376bb`); C3 0.2.0; C4 0.6.0; C5 0.10.0; C6 0.1.0;
C7 0.1.0; C8 log protocol 0.3.0 / runtime artifact 0.3.0; C9 0.1.0; C10 0.5.0; C11 0.3.0; C12 panel 0.1.0 / preview
0.2.0; C13 0.3.0; C14 0.1.0. Owed: only C10 `--release` (ADR-0008), for WS1 or WS8.

## Milestone progress (ahead of schedule)

- **M1 VM gate (formal call at CP-C, 2026-10-09): met on melonDS early.**
  - The II mix runs at 25.11 cycles/op = 44,605 ops/frame (gate 44,000); the tag-checked mix at 29.00 / 38,631.
  - It counts because WS4 emits the II ops wherever the checker proves ints.
  - ITCM 15,376 B of 24 KB; DTCM 4,332 of 4,608 B. Details in `docs/status/ws0.md` "M1 VM gate".
- **Hardware (original 3DS via TWiLight Menu++, DSi mode):**
  - flappy, hello and numeric pass (spike 12 matches line for line);
  - the error box is readable;
  - the scanline limit was measured: 2178 OBJ line cycles draw fully, 2208 drops, so C13 now warns at 2048;
  - NitroFS and maxmod pass.
- **Hardware problems still open:**
  - In TWiLight's DS mode the ROMs stop with R584 (NitroFS). WS3 has built an R584 box that names the failing step.
  - The DS-mode calibration of the M1 figure waits for the user's photos of hardware set 2. Set 3 (current VM) is
    built but held back.
- **M0 (CP-B):** IDE Play and the selftest ROM work.
  - `dsdude build samples/minimal` and `samples/flappy` produce ROMs that run at 60 fps in both emulators and on the 3DS.
  - The WS6 editor round-trip rebuilds flappy's room byte-identically.

## Local checks for CP-A (Windows)

- `npm run check && npm test`: green at checkpoint-27 (90 files, 748 tests); MSYS2 host goldens green; check:dist
  current; IDE browser tests green (checkpoint-22 onwards).
- **WS6 Playwright e2e (`npm run test:e2e -w apps/ide`, Electron): PENDING.** It needs mains power; the laptop was
  on battery at the review. WS0 runs it before tagging `cp-a` and adds the result here.
- `dsdude screenshot samples/hello`: PNGs written at every run (no golden yet; WS1/WS8 leftover).

## Memory and ADR-pending

- Memory since 2026-09-25: minimum available 224 MB (2026-09-26 07:06, the two killed integrations before the
  single-worker fix); peak commit charge 19.0 GB (2026-09-25 23:10). Since checkpoint-16 the minimum has stayed at
  1,990 MB or more. **Gate: FAIL over the whole window, PASS since the fixes.** No new local instance is due anyway:
  WS7 runs in the cloud.
- ADR-pending markers: none on `main`. The only markers are on stale branches that have not merged main yet:
  ADR-0007 on `ws1-toolchain`, ADR-0008 on `ws5-assets`. Both ADRs are closed.

## WS7 launch (after approval)

WS0 will:
1. tag `cp-a`, then `start-ws7`;
2. push `main`, the tags and the `ws7-learn` line (= `main`);
3. add the registry line in `docs/status/cloud.md`.

The launch notes (Learn link formats, `templates/index.json`, the TODO(WS7) builtins, hardware facts, C13) are in
`docs/kickoff/ws7.md` section 11.

The user will:
1. create the environment `dsdude-ws7` as described in `docs/kickoff/ws7.md` section 3:
   - network Custom: the defaults plus `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`;
   - variables `DSDUDE_WS=WS7`, `DSDUDE_PORT_BASE=5180`, `DSDUDE_SKIP_ELECTRON=1`, `DSDUDE_MAKE_JOBS=4`;
   - the shared setup script;
2. open the session on `ws7-learn` in Auto mode and paste section 1;
3. name the session `WS7 learn` and send WS0 the URL.

## For the user to decide

1. Approve this report. WS0 then runs the e2e suite (on mains power), tags `cp-a` and `start-ws7`, and pushes.
2. Create `dsdude-ws7` and start WS7, per the steps above.
3. The usage-limits question: 4 cloud sessions (WS2, WS4, WS5, WS7), of which WS4 and WS5 sit at their DoD and use
   little. There has been no sign of limits so far.
