# Checkpoint 0: Phase 0 done, `phase0` tag (2026-09-25)

WS0's report for the end of Phase 0. The next report is CP-A (`checkpoint-1.md`, D+3). Mode: **hybrid**, no
fallback. Details: `docs/status/ws0.md`.

## Merged

| Stream | Ref | Commits | Ownership | `npm run check && npm test` (Windows) | Result |
|---|---|---|---|---|---|
| WS1 | `ws1-toolchain` @ `b6f70a4` | 6 (82c3746 .. b6f70a4) | clean (`node tools/check-ownership.ts --range main..ws1-toolchain`) | check green (Biome 153 files, `tsc -b`, generators byte-identical); 27 test files, 106 tests passed | merged as `19c3ce8`; tagged `toolchain-ok` |

WS1's T1 contract changes reviewed and accepted: C4 `api.ts` + `contracts/toolchain-api.md` 0.2.0 (optional
`ToolPaths.arm7Elf/icon/gcc`, `RomHeaderInfo`, `RomInfo.header`) and C10 `contracts/cli.md` 0.2.0. WS0 appended their
CHANGELOG lines (the CHANGELOG did not exist on WS1's branch) and the closing `## Integration feedback` heading of
`docs/status/ws1.md`.

## Tags

- `phase0` on this report's commit: every stream row in `tools/ownership.json` is active from here; WS0's pre-tag rows
  end.
- `toolchain-ok` on `19c3ce8` (WS1's gate, passed 2026-09-25 at `4ddccb5`).
- `start-ws2`, `start-ws4` (cloud, with the stream lines `ws2-runtime-core` and `ws4-compiler` pushed) and `start-ws6`
  (local) follow as the launches happen; `start-ws3` when slot 2 launches.

## Contract versions at the tag

| Contract | Version |
|---|---|
| C1 project format, C2 `dsdb.md` + `opcodes.json` + `builtins.json` (ABI hash `0x0dd9987a`), C5 IPC stubs, C6 `language.md` + `events.md` + conformance v0, C8 `log-protocol.md`, C9 diagnostics, C12 preview types, C13 runtime limits, C14 fixtures | 0.1.0 |
| C4 `api.ts` + `toolchain-api.md`, C10 `cli.md` | 0.2.0 (WS1) |
| C3 `assetpack.md` (WS5, CP-A), C7 `host.ts` (WS4, CP-B), C8 `runtime-artifact.md` (WS3), C11 `dsd_platform.h` (WS2, CP-A), C12 panel API + mock-host (WS6, CP-A) | owed |

## Cloud streams

| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |
|---|---|---|---|---|---|
| (probe) | `dsdude-ws4`, deleted | - | - | - | node v24.16.0, npm 11.13.0, gcc 13.3.0, make 4.3 |

No cloud stream has run yet; WS2 and WS4 launch after this tag.

## Memory, ADRs, feedback

- Memory (`tools/checkpoint.ps1 -MemoryOnly`, sampler since 18:33): minimum available **1095 MB** at 22:33 (during
  WS1's install, with emulators open): gate FAIL over the whole day; since 23:30 the minimum is 2432 MB (PASS). Peak
  commit charge 19.0 GB at 23:10.
- `ADR-pending` markers: none.
- ADRs: ADR-0001 Flappy pipe geometry accepted and applied; ADR-0002 DeSmuME R4 slot-1 profile (WS1) accepted by the
  user after the tag (2026-09-25).
- Integration feedback (`IF-` entries): none.
