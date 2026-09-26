# WS0 status: Lead: foundation, contracts, integration

Mode: **hybrid** (no fallback recorded). Schedule position: Phase 0, Day 1 (2026-09-25).

## Day-0 answers (user, 2026-09-25)

- **Location:** stay in place at `C:\Users\zache\OneDrive\Desktop\Projects\DSDude` (no move, no pointer README). OneDrive sync inactive.
- **BlocksDS install consent:** given at WS1's launch by approving its prompts.
- **Mode:** hybrid (local WS0 + WS1/WS3/WS6/WS8 at standard-mode limits; cloud WS2, WS4, WS5, WS7, optional WS6b).
- **Usage limits for ~4 local + 4-5 cloud sessions:** not yet confirmed. WS0 asks again before the tag launches (open question 3).
- **Names:** confirmed: DSDude / DSS (`.dss`) / DSDB.
- **GitHub origin:** https://github.com/Dercen/DSDude.git, private. Claude GitHub App installed: yes.
- **Public releases and the unsigned installer:** decided by M6.
- **Day-0 steps done by the user:** `git init -b main` in place with the shared repo config (`core.autocrlf false`, `core.longpaths true`, `extensions.worktreeConfig true`, `core.hooksPath .githooks`); `mwccarm\` moved to `vendor\mwccarm\` and `dsd-windows-x86_64.exe` to `vendor\dsd\`; first commit `8f8f55d` (planning documents and the minimal `.gitignore`) pushed to `origin/main`.

## Phase 0 checklist

Legend: todo / in progress / done (<sha>).

### Day 1
- Task 1. Line endings and repo hygiene: done (896eb47, pushed)
- Task 2. Monorepo: in progress
  - root `package.json`, `tsconfig.base.json`, solution `tsconfig.json`, `tools/tsconfig.json`, `biome.json`, `vitest.config.ts`: done (see git log)
  - `tools/postinstall.mjs`, `tools/check-lockfile.mjs`: done
  - 14 skeletons (`packages/*`, `apps/ide`, `tools/gen-docs`, `runtime`) with the pinned stack, briefs via `tools/phase0/gen-briefs.ts`: done
  - `LICENSE`, `runtime/LICENSE`, `README.md`: done
  - lockfile (`chore(deps): regenerate lockfile`): done
  - spike 13 (WS0 part): todo
- Task 3. Hooks and governance tools: todo
  - `tools/ownership.json`, `tools/check-ownership.ts` + walk test: todo
  - `.githooks/pre-commit`, `commit-msg`, `pre-push`: todo
  - `tools/adr-pending.ts`, `tools/memsampler.ps1` (started), `tools/checkpoint.ps1` Day-1 part: todo
  - `.claude/settings.json` cloud rules + SessionStart hook: todo
  - spike 1 (`tools/phase0/spike1-hooks.ps1`): todo
  - cloud pieces (`tools/cloud/**`, `docs/status/cloud.md`, status stubs), pushed: todo
  - cloud probe (user runs it): todo
- Task 4. Small contracts, C4 types, project format, samples: todo
  - C9 `diagnostics.md` + `Diagnostic` type, minimal C1 `Project`, C4 `api.ts` + `MockBuildService`, C10 `cli.md`: todo
  - C13 `runtime-limits.json`, C8 `log-protocol.md`, C5 `ipc.md` + `ipc-contract`, C12 `preview.ts`: todo
  - C1 `project-format.md` + schemas + load/save: todo
  - `samples/minimal`, `samples/flappy` v0, ADR-0001: todo

### Day 2
- Task 5. `contracts/language.md` v0.1, `contracts/events.md`: todo
- Task 6. Minimal C2 (`dsdb.md`, `opcodes.json`, `builtins.json`, generators, `packages/dsdb`, `hello.dsda/.dsdb`): todo
- Task 7. Fixtures, conformance v0, contracts README/CHANGELOG, kickoff files, Status block, tag: todo

## Spike results

- Spike 1 (hooks): not run yet.
- Spike 13 (WS0 part: fresh worktree install, `path.txt`, `tsc -b` failure, `DSDUDE_SKIP_ELECTRON`): not run yet.

## Cloud probe

Not run yet. WS0 pushes the task-3 cloud pieces first.

## Open ADRs

None yet.

## Open questions for the user

- Open question 3: do the usage limits cover ~4 local + 4-5 cloud sessions? Needed before the tag launches.
