# Contracts

The interfaces between the DSDude workstreams. Every contract file carries a version header (Markdown: line 3;
JSON: `"version"`; TypeScript: `CONTRACT_VERSION`) and a "how to change me" section, and has its own section in
`contracts/CHANGELOG.md`. Consumers pin to the version in the CHANGELOG. **If `PLAN.md` and a contract file
disagree, the contract wins** and PLAN.md gets an ADR. `tools/ownership.json` decides who may edit which file.
Source: PLAN.md sections 5 and 7.4.

## Index (C1-C14)

D is the date of the `phase0` tag (see the CLAUDE.md Status block). Versions are as of the tag.

| Id | Contract | Files | Owner after the tag | Version | Frozen |
|---|---|---|---|---|---|
| C1 | Project format | `contracts/project-format.md`, `packages/project-format` | WS0 | 0.1.0 | at the tag |
| C2 | DSDB container, opcodes, builtins | `contracts/dsdb.md` (WS2 + WS4); `contracts/opcodes.json` + `packages/dsdb` (WS4, WS2 co-signs); `contracts/builtins.json` (WS0, append-only; WS7 fills doc/example) | see files | 0.1.0 | container and stable opcodes at the tag; provisional opcodes and new builtins by T1 |
| C3 | Asset pack layout + manifest | `contracts/assetpack.md` | WS5 | **owed** | WS5 writes it on its first day (CP-A, D+3); T1 afterwards |
| C4 | Toolchain API + BuildService | `packages/toolchain/src/api.ts` (+ `MockBuildService`), `contracts/toolchain-api.md` | WS1 (WS8 from `start-ws8`) | `api.ts` 0.1.0; `toolchain-api.md` **owed** | `BuildService` confirmed by WS1 at CP-A (D+3) |
| C5 | IPC channel map | `contracts/ipc.md`, `packages/ipc-contract` | WS6 | 0.1.0 (stubs) | completed by WS6 |
| C6 | Language, events, conformance | `contracts/language.md`, `contracts/events.md` (WS2 co-signs), `fixtures/conformance/` (expected outputs: WS2) | WS4 | 0.1.0 | v0.1 at the tag |
| C7 | Language-service host API | `packages/lang/src/host.ts` | WS4 | **owed** | CP-B (D+7) |
| C8 | Runtime log protocol + runtime artifact | `contracts/log-protocol.md` (WS2), `contracts/runtime-artifact.md` (WS3) | WS2, WS3 | protocol 0.1.0; artifact **owed** | protocol at the tag; artifact with WS3's first `runtime/dist` build |
| C9 | Diagnostics | `contracts/diagnostics.md`, `packages/project-format/src/diagnostics.ts` | WS0 (shape); each producer its range and catalog | 0.1.0 | at the tag |
| C10 | CLI | `contracts/cli.md`, `packages/cli` | WS1 (WS8 from `start-ws8`) | 0.1.0 (draft) | final by WS1 |
| C11 | Platform seam | `runtime/core/include/dsd_platform.h` | WS2 | **owed** | CP-A (D+3) |
| C12 | EditorPanel host API + asset preview API | `apps/ide/src/renderer/panels/api.ts` + `fixtures/ide/mock-host` (WS6); `packages/asset-pipeline/src/preview.ts` (WS5) | WS6, WS5 | preview types 0.1.0; panel API **owed** | panel API + mock-host at CP-A (D+3); preview API at CP-B (D+7) |
| C13 | Runtime limits | `contracts/runtime-limits.json` | WS2 (seeded by WS0) | 0.1.0 | values change by T1 |
| C14 | Phase-0 fixtures | `samples/minimal`, `samples/flappy` v0, `fixtures/bytecode/hello.dsda` + `.dsdb`, `fixtures/assets/`, `fixtures/conformance/` v0 | per path in `tools/ownership.json` | 0.1.0 | the rest comes from the producing streams |

C14 from the streams: conformance programs 6-10 (WS4), `fixtures/bytecode/bench.dsda` (WS2), `samples/hello` +
`fixtures/runtime/hello` + `fixtures/build` (WS1 at `toolchain-ok`), the XM fixture (WS5), `fixtures/ide/mock-host`
(WS6 by CP-A); `fixtures/runtime-core/flappy-nitrofs/` and `fixtures/assets/golden/` are built locally by WS0.

**Owed** (not written in Phase 0; each owner delivers it by its deadline, and a consumer that starts earlier works
against the Phase-0 types and mocks):
- C3 `contracts/assetpack.md`: WS5, on its first day (CP-A, D+3). Until then `AssetManifest` and `RoomAssetSet` in
  `api.ts` are provisional.
- C4 `contracts/toolchain-api.md`: WS1, CP-A (D+3).
- C7 `packages/lang/src/host.ts`: WS4, CP-B (D+7). WS7 uses builtins-only completion until then.
- C8 `contracts/runtime-artifact.md`: WS3, with its first `runtime/dist` build (by M0, D+7).
- C11 `runtime/core/include/dsd_platform.h`: WS2, CP-A (D+3).
- C12 panel API + `fixtures/ide/mock-host`: WS6, CP-A (D+3).

**Late-start freeze rule** (PLAN.md 7.3): a stream that starts after the checkpoint at which one of its interfaces
would freeze freezes it at the first checkpoint at least three working days after its start. Until a late owner
starts, WS0 holds its contract files and merges T1 changes to them (the holding rows in `tools/ownership.json`, which
end at `start-ws<n>`).

## Change tiers (PLAN.md 7.4)

| Tier | What | How |
|---|---|---|
| **T0** | Doc/example text, comments | The owner commits directly with a `contracts/CHANGELOG.md` line. |
| **T1** | Additive: an appended builtin, a new opcode, an optional IPC field, a new limit key | In **one commit**: minor version bump, regenerated outputs (`node tools/gen-*.ts`), updated fixtures, CHANGELOG entry. WS0 reviews within 24 hours at the daily integration. |
| **T2** | Breaking | `docs/adr/NNNN-short-title.md` (context, decision, alternatives, affected streams, migration), co-signed by every affected owner; WS0 drafts the recommended answer, the user decides, WS0 merges. Major version bump. |

- In weeks 1-4 WS0 merges C2, C6 and C11 changes within 24 hours; `ws2-*` and `ws4-*` may merge each other's push
  targets (`docs/status/cloud.md`) between checkpoints.
- `builtins.json` ordinals are append-only. Changing the id, name, kind or signature of a function, variable or
  constant entry changes the ABI hash; doc/example edits and alias/unsupported entries do not. `tools/gen-dsdb.ts`
  regenerates the committed `.dsdb` fixtures in the same commit.
- Never work around a contract silently: write `docs/adr/NNNN-<title>.md` with a proposed answer, mark the local
  assumption `// ADR-pending ADR-NNNN`, and continue. `tools/adr-pending.ts` lists the markers at every checkpoint.
- Generated files (`runtime/gen/**`, `packages/*/src/gen/**`, `docs/reference/**`, `fixtures/**/*.dsdb`) change only
  through their generator, in the commit that changes the input; `npm run check` fails on any byte difference.

## Events (annotated git tags on main; only WS0 creates them)

Rows of `tools/ownership.json` switch on (`from`) and off (`until`) with these tags: `phase0` (end of Phase 0),
`toolchain-ok` (WS1's toolchain gate), `cp-a` (D+3), `cp-b` (= M0, D+7), `cp-c` (= M1, D+14), `m2` (M2 accepted:
the samples pass from WS4 to WS7), and `start-ws2` .. `start-ws8`, `start-ws6b` (tagged just before WS0 tells the
user to launch that stream; `start-ws8` moves WS1's paths to WS8, `start-ws6b` ends WS6's hold on WS6b's paths).
