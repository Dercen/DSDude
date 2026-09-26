# Launching DSDude's workstreams

This folder holds one kickoff file per workstream (`ws0.md` .. `ws8.md`, plus `ws6b.md`). Each is the brief and first prompt for one Claude Code instance, local or in the cloud. This README is for you, the human who launches them.

**Architecture in one line:** an Electron/TypeScript IDE compiles DSS scripts to DSDB bytecode, ndstool repacks it with the converted assets into NitroFS beside a prebuilt BlocksDS runtime ELF (the VM), and Play boots the `.nds` in melonDS.

The repo is this folder, `C:\Users\zache\OneDrive\Desktop\Projects\DSDude`, and it stays here (your decision of 2026-09-25; Desktop is OneDrive-redirected, but nothing syncs). WS0 finalises the kickoff files on Phase 0 day 2. Bare section numbers (1-8) refer to this README; `PLAN.md` sections are written "PLAN x.y". Section 8 is the canonical cloud-session procedure.

## 1. Before you start: Day 0

Allow about 90 minutes, plus ~30 minutes for the install.

1. **Record your answers.** Settled on 2026-09-25: location (stay in place), mode (hybrid, section 2) and names (DSDude / DSS `.dss` / DSDB). Still open in PLAN section 10:
   - 1, BlocksDS install consent: given by launching WS1 and approving its prompts;
   - 2, GitHub: step 3;
   - 3, usage limits: before the tag, confirm that your Claude plan covers ~4 local + 4-5 cloud sessions at once;
   - 4-6: by M5/M6.

   Fill in the Day-0 answers line of the WS0 start prompt (`ws0.md`, "Paste this to start") before pasting it.
2. **Initialise the repo in place** in Windows PowerShell 5.1:

   ```powershell
   Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude
   if (Test-Path .git) { throw 'Already a git repo: stop and ask WS0' }
   git init -b main
   git config core.autocrlf false; git config core.longpaths true
   git config extensions.worktreeConfig true; git config core.hooksPath .githooks
   # Minimal .gitignore BEFORE the first commit (LF, ASCII). WS0 replaces it on Day 1 and keeps vendor/* ignored.
   $ignore = 'vendor/*', '!vendor/README.md', '/mwccarm/', '/dsd-windows-x86_64.exe', '.claude/settings.local.json',
             'node_modules/', '.dsdude/', '/dist/', '/build/',
             '*.nds', '*.elf', '!/fixtures/**/*.nds', '!/fixtures/**/*.elf', '!/runtime/dist/*.elf'
   Set-Content -Path .gitignore -Encoding ascii -NoNewline -Value (($ignore -join "`n") + "`n")
   New-Item -ItemType Directory -Force vendor\dsd -ErrorAction Stop | Out-Null
   Move-Item mwccarm vendor\mwccarm -ErrorAction Stop
   Move-Item dsd-windows-x86_64.exe vendor\dsd\ -ErrorAction Stop
   if ((Test-Path mwccarm) -or (Test-Path dsd-windows-x86_64.exe) -or -not (Test-Path vendor\mwccarm\1.2\license.dat) -or -not (Test-Path vendor\dsd\dsd-windows-x86_64.exe)) { throw 'vendor move incomplete: close programs using these files and rerun the two Move-Item lines' }
   git add .gitignore PLAN.md CLAUDE.md docs
   git commit -m 'Day 0: planning documents and .gitignore'
   if (git ls-files vendor) { throw 'vendor/ is tracked: do not push' }
   git status --short --ignored vendor   # expect only '!!' lines
   ```

   The first commit already ignores `vendor/`, whose proprietary `mwccarm` must never reach GitHub. The root-level `/mwccarm/` and `/dsd-windows-x86_64.exe` lines are a second line of defence in case a move fails, and `.claude/settings.local.json` holds each instance's own "don't ask again" answers. `/dist/` and `/build/` are root-anchored because `runtime/dist/**` and `fixtures/build/**` are tracked.
3. **Create the private GitHub repo.** This is your action; no instance does it. Pick one route:

   ```powershell
   # Route A, browser (gh is not installed): github.com/new -> dsdude, Private, no README/license/.gitignore
   git remote add origin https://github.com/<user>/dsdude.git
   git push -u origin main            # Git Credential Manager signs you in once
   # Route B, GitHub CLI (open a new PowerShell window after winget)
   winget install --id GitHub.cli -e
   # in the new window:
   Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude
   gh auth login --hostname github.com --git-protocol https --web
   gh repo create dsdude --private --source . --remote origin --push
   # Both routes: confirm no vendor/ file is anywhere in GitHub's history
   git fetch origin; if (git log --format= --name-only origin/main -- vendor ':(exclude)vendor/README.md') { throw 'vendor/ is on GitHub: delete the repo' }
   ```

   Then install the **Claude GitHub App** at `https://github.com/apps/claude/installations/new`, with **Only select repositories** set to `dsdude` (GitHub offers no narrower permissions). Without the App, cloud sessions cannot clone the repo: `/web-setup` alone makes `claude --cloud` upload a bundle.
4. **Set up cloud sessions** (Day 0 or 1). Sign in at claude.ai/code, authorise GitHub, and create the environments `dsdude-ws2`, `-ws4`, `-ws5`, `-ws7` and `-ws6b` (section 8).
5. **Close Discord and Creative Cloud.** Keep at most one browser tab, on claude.ai/code, to steer cloud sessions (or use the mobile Code tab or the CLI).
6. **Launch WS0, then WS1** (section 3). Answer WS0's permission prompts until its first commit brings `.claude/settings.json` (the shared allowlist), and stay present for WS1's install: ~177 MB download, ~591 MB under `C:\msys64\opt\wonderful`, no UAC prompt, and your MSYS2 packages untouched. The same session installs py-desmume 0.0.9 with `pip --user` for headless screenshots. Approve its prompts, and confirm that melonDS shows the `bg_regular_nitrofs` example's background.
7. **Days 1-2:** WS0 builds Phase 0 and pushes the cloud repo pieces. You approve its work at the end of each day.
   - On Day 1, open the probe session WS0 asks for (environment `dsdude-ws4`, branch `main`, mode Auto), paste its probe prompt, and relay the results.
   - Phase 0 ends with `git tag phase0`, which needs a green probe or a recorded fallback. WS1's `toolchain-ok` lands on day 1-3.

## 2. Operating modes

**Hybrid mode is the plan** (your choice of 2026-09-25). Streams that need Windows tools run locally; the rest are Claude Code cloud sessions on the GitHub repo, using no local RAM. The local side keeps today's (11.3 GB) standard-mode limits:
- at most 4 local instances, including WS0;
- one Electron dev IDE and one emulator window, machine-wide;
- the memory gate: launch only if the minimum available memory since the last checkpoint stayed above 1.5 GB (`tools/checkpoint.ps1` reports it).

Weeks count from the `phase0` tag (D).

| Where | Streams (start trigger) | Why there |
|---|---|---|
| Local | WS0 on `main` (Day 0); WS1 in slot 1 (hour zero); WS3 in slot 2 (`toolchain-ok`, not before the tag); WS6 in slot 3 (tag); WS8 in slot 1 after WS1 (CP-C) | Windows tools: MSYS2, BlocksDS, emulators, py-desmume, Electron, NSIS |
| Cloud | WS2, WS4 (tag); WS5, WS7 (CP-A); WS6b (CP-B, optional) | Linux gcc and pure TypeScript; WS0 runs their local-only checks |

**Hybrid calendar:**

| When | Slot 1 | Slot 2 | Slot 3 | Cloud | Local / cloud |
|---|---|---|---|---|---|
| Day 0 | WS1 | - | - | probe on Day 1 | 2 / 0 |
| Tag D (day 2) | WS1 | waits for `toolchain-ok` | WS6 | WS2, WS4 | 3 / 2 |
| `toolchain-ok` (day 1-3) | WS1 | WS3 | WS6 | WS2, WS4 | 4 / 2 |
| CP-A (D+3) | WS1 | WS3 | WS6 | + WS5, WS7 | 4 / 4 |
| CP-B = M0 (D+7) | WS1 | WS3 | WS6 | + WS6b | 4 / 5 |
| CP-C = M1 (D+14) | WS8 | WS3 | WS6 | unchanged | 4 / 4-5 |
| Later | WS8 | free after WS3's DoD, for short local fix sessions | WS6 | streams end at their DoD | max 4 / 5 |

Hybrid follows upgraded mode for its milestone criteria, its checkpoints (CP-A D+3, CP-B D+7, CP-C D+14, then weekly), its freezes and its ownership events.

**Usage limits.** The peak is ~4 local + 4-5 cloud sessions on one plan (question 3). If limits bite, drop WS6b first. After that, WS7 and WS5 wait for a free cloud slot.

**Fallbacks** (PLAN 7.2). If GitHub or cloud sessions are down for more than a day, every push target is refused, or staggering cannot absorb the usage limits, WS0 records a switch to **standard mode** (three local slots, release ~week 16-20) in the CLAUDE.md Status block and re-plans at the next checkpoint. Cloud streams then continue locally with `git fetch origin; git worktree add -B wsN-<name> ..\DSDude-wsN origin/<push target>` plus the section 3 setup. After a RAM upgrade to 32 GB (2 x 16 GB DDR4-3200 SO-DIMM), **upgraded mode** allows 8 local instances and one emulator per worktree, and cloud streams may move home the same way.

## 3. Launching an instance

**Local streams.** Use one PowerShell window per instance, because the env block lives only in that window. Each local `wsN.md` has a Setup section with these commands and the env block already filled in.

**WS0** stays in the repo root on `main`: `Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude`, then `git config --worktree dsdude.ws WS0`, then paste the env block (`DSDUDE_HOME` = `C:\Users\zache\OneDrive\Desktop\Projects\DSDude\.dsdude`, port base 5100), then `claude`.

**WS1, WS3, WS6 and WS8** get sibling worktrees:

```powershell
# Run in PowerShell. <n> = 1, 3, 6 or 8 (any stream in a fallback); <name> = the branch suffix from the PLAN.md section 7.5 table (e.g. ws3-platform -> <name> = platform)
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude
git worktree add ..\DSDude-ws<n> -b ws<n>-<name>
Set-Location C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws<n>
git config --worktree dsdude.ws WS<n>
# paste the per-instance env block here (PLAN.md section 7.5) with DSDUDE_HOME = C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws<n>\.dsdude and this stream's DSDUDE_PORT_BASE
if (Test-Path package.json) { npm install }   # absent at WS1's hour zero; never npm ci in worktrees
claude
```

Keep this order: the env block goes in before `claude` starts, and `claude` is always the last line.

Port bases: WS1 5110, WS3 5130, WS6 5160, WS8 5190. The env block also sets `DSDUDE_MAKE_JOBS=4`, the MSYS2/Wonderful variables and PATH. The root path is 47 characters, so keep build paths under 250 (`core.longpaths` is on).

When `claude` starts, paste the "Paste this to start" block from `wsN.md` as your first message.

- **Day 0:** there is no `package.json` yet, so WS0 and WS1 skip `npm install`. WS1 runs it after WS0's Day-1 monorepo lands on `main`. The first `npm install` in a worktree downloads Electron and takes a few minutes.
- **WS1 → WS8 at CP-C:** after WS0 merges WS1's last work and tags `start-ws8`, close WS1's window. Then start WS8 in `C:\Users\zache\OneDrive\Desktop\Projects\DSDude-ws8` with its own env block.

**Cloud streams (WS2, WS4, WS5, WS7, WS6b).** These need no PowerShell env block: the environment and the SessionStart hook set the Linux env (section 8).

1. WS0 says "launch WSn (cloud)" after tagging `start-wsN` and pushing `main`, the tags and `wsN-<name>`.
2. At claude.ai/code (or the mobile Code tab), choose:
   - repository `<user>/dsdude`;
   - branch `wsN-<name>`, or `main` if it is not offered (`start.sh` adopts the stream line);
   - environment `dsdude-wsN`;
   - mode **Auto** if offered, else Accept edits.

   You can also open `https://claude.ai/code?repositories=<user>/dsdude&environment=dsdude-wsN`.
3. Paste the "Paste this to start" block from `wsN.md`, and rename the session `WSn <name>` (e.g. `WS4 compiler`).
4. Give WS0 the session URL and the branch the session reports, for `docs/status/cloud.md`.

WS0 tells you when each stream is due (section 2 calendar), after tagging `start-wsN` and, for local streams, checking the memory gate.

## 4. The streams

Start triggers are in section 2.

| Stream | What it builds | Where | Kickoff |
|---|---|---|---|
| WS0 Lead | Monorepo, hooks, contracts, fixtures; daily integration of local and cloud branches | Local, `main`, persistent | [ws0.md](ws0.md) |
| WS1 Toolchain and Play | BlocksDS install, `dsdude` CLI, BuildService, emulator launch | Local, slot 1 until CP-C | [ws1.md](ws1.md) |
| WS2 Runtime core | Portable C VM and engine, `dsdude-host` | Cloud, `ws2-runtime-core` | [ws2.md](ws2.md) |
| WS3 DS platform | libnds/maxmod layer, selftest ROM, `arm9.elf` | Local, slot 2 | [ws3.md](ws3.md) |
| WS4 Compiler | DSS parser, checker, codegen, DSDB | Cloud, `ws4-compiler` | [ws4.md](ws4.md) |
| WS5 Assets | PNG/WAV to GRF/soundbank; budgets, previews | Cloud, `ws5-assets` | [ws5.md](ws5.md) |
| WS6 IDE shell | Electron shell, Play, Output, Problems, object editor (plus the visual editors unless WS6b runs) | Local, slot 3, to release | [ws6.md](ws6.md) |
| WS6b Editors | Sprite, room and background editors; sound panel | Cloud, `ws6b-editors`, optional | [ws6b.md](ws6b.md) |
| WS7 Learn | Language service, Monaco glue, docs, tutorial, templates | Cloud, `ws7-learn`, headless first | [ws7.md](ws7.md) |
| WS8 Release | e2e, CI, installer, licences; inherits WS1's paths | Local, slot 1 from CP-C | [ws8.md](ws8.md) |

## 5. Your daily routine (about 1-2 hours)

- **Read WS0's report** in `docs/status/checkpoint-N.md`, and approve it or send it back. It covers merges, tests, the memory summary, open `ADR-pending` markers, and a "Cloud streams" table (target@sha, commits behind `main`, merged or refused, local-only results, and the Node/npm/gcc versions start.sh recorded). Checkpoints (CP-A/B/C, then weekly) are two-hour reviews.
- **Watch the cloud sessions** in claude.ai/code or the mobile Code tab. Answer their questions, and pass WS0 what they report: a new push target, `BLOCKER lockfile`, a diverged line or refused pushes. After a checkpoint merge, send each waiting session this relay, in the web UI or with `claude -p "<message>" --cloud <session-id>`:

  > WS0 merged checkpoint-N. Run `bash tools/cloud/start.sh`, then `git restore package-lock.json; git fetch origin && git merge origin/main; npm install; git restore package-lock.json`. Read docs/status/checkpoint-N.md and your open IF- entries, fix those first, then continue from docs/status/wsN.md.

  The session's VM may have been reclaimed while it waited, so the relay restarts it from scratch.
- **Follow the integration feedback.** WS0 appends each failure that only a local run finds (real grit/mmutil, MSYS2 gcc, the DS build of the core, emulators, Electron) as an `IF-<k>` entry under `## Integration feedback` in the owning stream's `docs/status/wsN.md`. Streams fix open entries first; WS0 closes them with `- IF-<k> resolved by <sha>`. Nudge any session whose entry survives a checkpoint.
- **Decide ADRs.** Each `docs/adr/NNNN-*.md` comes with WS0's recommended answer. Only T2 (breaking) contract changes need you.
- **Be the eyes and hands.** Instances check their work through `DSD|` log lines and `dsdude screenshot` PNGs. They ask you only when a screenshot is ambiguous. Install consent, the flashcart and the M5 tester are yours.
- **Answer permission prompts with care.**
  - Never approve `pacman`/`wf-pacman` after the `phase0` tag.
  - In cloud sessions, refuse `npm ci`, force-pushes, pushes of `main` or tags, staging `package-lock.json`, and edits to `vendor/` or root config.
- **Watch memory.** Check the gate before each local launch, and don't run your own emulator or dev IDE while local streams test. `Get-Process electron, melonDS, DeSmuME* -ErrorAction SilentlyContinue` shows what is open.

## 6. Milestones

Hybrid dates, counted in weeks from the `phase0` tag. The fallback column lists standard / upgraded dates.

| Milestone | Hybrid | Fallback | What you will see |
|---|---|---|---|
| M0 Hello from Play | Week 2 | 2 / 2 | `dsdude play samples/hello` opens melonDS and `DSD\|LOG\|hello` arrives live; Stop leaves no orphan. Hybrid also needs IDE Play and the selftest ROM (the standard fallback's M0 is CLI-only). |
| M1 First bytecode on the DS | Week 3 | 4-5 / 3 | `hello.dsdb` prints once on both emulators; the VM benchmark reaches >= 35,000 typed ops per frame (>= 44,000 as measured on melonDS unless a hardware run calibrates it). |
| M2 Sprite moves via CLI | Week 4-5 | 7-8 / 4-5 | The D-pad moves the `samples/minimal` sprite at 60 fps. |
| M3 IDE Play end to end | Week 6-7 | 11-12 / 6 | Live diagnostics in the editor; Flappy plays from the IDE in under 3 s warm. |
| M4 Feature-complete 0.1 | Week 8-9 | 14-16 / 8 | All editors and the Learn panel; 300 instances at 60 fps. |
| M5 A beginner builds Flappy Bird | Week 10-11 | 15-17 / 9-10 | Your 12-15-year-old tester finishes the tutorial unaided (target 30 min, fail above 60). |
| M6 Release 0.1 | Week 12-14 | 16-20 / 12 | The installer works offline on a clean Windows 11 VM. |

## 7. When something goes wrong

**The install fails.** Most failures are silent:
- `0xC0000135` from ndstool, grit or mmutil means `C:\msys64\opt\wonderful\bin` is missing from PATH.
- `gcc` exiting 1 with no message means `C:\msys64\ucrt64\bin` is missing from PATH.
- "No targets specified" from make means `CHERE_INVOKING=1` was not set.

If the tarball route itself fails, plan B is the Inno installer:

`wf-bootstrap-windows-x86_64.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CURRENTUSER /DIR=C:\msys64 /LOG=<file>`

It runs `pacman -Sy make` on your MSYS2, so it needs your OK. The devkitPro route (plan C) needs an ADR (PLAN section 2.1).

**The tag slips.** If day 3 ends without the tag, WS0 tags `phase0` on main's last green commit anyway, so the ownership rows activate. It lists the missing items in `docs/status/ws0.md` and `contracts/README.md` and delivers each as an ADR (ADR-0002 onward) within 48 hours. You then launch the streams due at the tag.

**Memory pressure** shows up as timeouts, heavy paging, or Claude Code killing commands. Close IDEs, emulators and background apps, and launch nothing local until the gate recovers. At a checkpoint, you can restart a long-context instance with the same prompt, since `docs/status/wsN.md` keeps its state. If the pressure persists, pause the least urgent local stream at a commit, or upgrade to 32 GB.

**OneDrive sync comes back.** `dsdude doctor` and `tools/checkpoint.ps1` warn when `OneDrive.exe` runs and the repo is under `%OneDrive%`. If the warning appears, pause the instances and turn Desktop sync off, or `node_modules`, `.git` and `.dsdude` will lock.

**A stream is blocked on a contract.** It should write `docs/adr/NNNN-<title>.md`, mark its workaround `// ADR-pending ADR-NNNN`, and carry on. If it asks you in chat instead, tell it to do exactly that.

**A cloud session ended.** Reopen it and send "Resume: run `bash tools/cloud/start.sh`, then continue from docs/status/wsN.md." A reclaimed VM keeps the conversation but loses its processes and unpushed work. Replace a session only when it is archived or unusable: same environment, the paste block plus "continue from docs/status/wsN.md", and the new URL to WS0. `/compact` works; `/clear` does not.

**`start.sh` fails.** `Node 24 / npm 11 missing` means the environment's setup script failed. A failed Chromium download (WS7, WS6b) means the Custom network list lacks `cdn.playwright.dev` or `playwright.download.prss.microsoft.com`. Fix either in the environment (section 8). A diverged stream line goes to WS0.

**A native binary is missing after `npm install` in the cloud.** Either `start.sh`'s smoke test fails, or it prints `LOCKFILE GUARD FAILED`.
- **Cause:** the lockfile was rebuilt over an existing `node_modules`, which drops Linux entries such as the 11 `@tailwindcss/oxide-*` ones.
- **The session** leaves the lockfile alone, writes `BLOCKER lockfile` in its status file, and pushes. Meanwhile it runs `npm install --no-save <missing>@<version>` (e.g. `@tailwindcss/oxide-linux-x64-gnu@4.3.3`), never `--force`.
- **Tell WS0.** It rebuilds the lockfile on Windows, deleting every `node_modules` first, and pushes it.

**A push is rejected.** A cloud session can push only to its own working branch; other names get HTTP 403.
- `tools/cloud/push.sh` falls back from the recorded target to `wsN-<name>`, then `claude/wsN-<name>`, then the session's own branch. Pass any newly recorded `Cloud push target:` to WS0 for `docs/status/cloud.md`.
- `push.sh` also refuses commits that touch `package-lock.json` (revert them) or lack the trailer (`git commit --amend --no-edit --trailer 'DSDude-WS: WSn'`).
- If every target is refused, check the Claude GitHub App's access to `dsdude`. After a day, the standard fallback applies. Never force-push.

**`package-lock.json` conflicts.** Only WS0 commits the lockfile: it regenerates it on Windows with `npm install` while the file exists, runs `node tools/check-lockfile.mjs`, and commits `chore(deps): regenerate lockfile`.
- Streams commit only their `package.json`, and run `git restore package-lock.json` before every merge of `main` (`origin/main` in the cloud).
- On a lockfile conflict, take main's copy with `git checkout --theirs package-lock.json`, `git add` it and finish the merge; the hooks let merge commits through. Then run `npm install` and `git restore package-lock.json`.

Never rebase a branch once WS0 has merged any of its commits.

## 8. Cloud sessions

This is the canonical procedure for the cloud streams WS2, WS4, WS5, WS7 and the optional WS6b. `CLAUDE.md`, PLAN 7.5 (its short form) and every cloud kickoff's "Cloud setup" block point here. **(Pn)** marks an item that the Day-1 probe confirms (8.1); the procedures work for every probe outcome.

### 8.1 One-time setup (you, Day 0-1)

1. Sign in at claude.ai/code and authorize GitHub.
2. Create five environments (cloud icon > Add cloud environment): `dsdude-ws2`, `-ws4`, `-ws5`, `-ws7`, `-ws6b`.
   - **Network: Full.** The Day-1 probe (2026-09-25) found both Playwright hosts blocked by the proxy (403, "no rule or allowlist entry") under the first network setting, and `npx playwright install chromium` passing under Full. Use Full for all five environments. (The original plan was Custom: the default package-manager list plus `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`.)
   - **Variables** (no secrets, because every user of the environment can read them): `DSDUDE_WS=WS4`, `DSDUDE_PORT_BASE=5140`, `DSDUDE_SKIP_ELECTRON=1`, `DSDUDE_MAKE_JOBS=4`, with the stream's own values. The WS/port pairs are WS2/5120, WS4/5140, WS5/5150, WS7/5180 and WS6b/5170.
   - **Setup script,** the same in all five. It runs as root once per cache, must exit 0 within about 5 minutes, and re-runs after edits, host changes or about 7 days.
     ```bash
     #!/bin/bash
     set -euo pipefail
     V=v24.16.0   # same as this machine; ships npm 11
     if [ ! -x /opt/node24/bin/node ]; then
       mkdir -p /opt/node24
       curl -fsSL "https://nodejs.org/dist/$V/node-$V-linux-x64.tar.xz" | tar -xJ -C /opt/node24 --strip-components=1
     fi
     command -v gcc >/dev/null && command -v make >/dev/null || { apt-get update && apt-get install -y gcc make; }
     PATH=/opt/node24/bin:$PATH npx -y playwright@1.63.0 install --with-deps chromium || true
     exit 0
     ```
3. **Probe (Day 1, before the tag).** Once WS0 has pushed the 8.2 pieces, open one session (environment `dsdude-ws4`, branch `main`, mode Auto) and paste the probe prompt WS0 gives you (it is in `docs/kickoff/ws0.md` task 3 and PLAN 7.1). It confirms the (Pn) items. If its step 3 fails, the cloud streams due at the tag wait under the fallback rule (section 2).

### 8.2 Repo pieces (WS0, Day 1, pushed before the probe; all WS0-owned)

- **`.claude/settings.json`** (the shared allowlist and the `npm ci` deny rule come in WS0's task 1; task 3 adds the cloud parts):
  - a SessionStart hook (`startup|resume`) that runs `node tools/cloud/session-start.mjs`;
  - allow rules for `bash tools/cloud/*`, `make -f runtime/Makefile.host *`, `runtime/build-host/dsdude-host *`, `./runtime/build-host/dsdude-host *`, `timeout *`, `node tools/*`, `npx playwright install chromium`, `git fetch *`, `git merge origin/*`, `git restore package-lock.json`, `git config core.hooksPath .githooks`, `git config core.autocrlf false` and `git config dsdude.ws *`.
- **`tools/cloud/session-start.mjs`** is plain JS, so Node 22 runs it, and it never fails.
  - It exits at once unless `CLAUDE_CODE_REMOTE=true`, so it is silent on Windows.
  - It appends `export PATH=/opt/node24/bin:$PATH` and `export DSDUDE_HOME=$HOME/.dsdude` to `$CLAUDE_ENV_FILE`.
  - If `DSDUDE_WS` is set, it runs the three git config commands of 8.4.
- **Scripts:**
  - `tools/cloud/lib.sh`, `start.sh` and `push.sh` (reference versions in 8.4 and 8.5), committed LF with `--chmod=+x`;
  - `tools/check-lockfile.mjs`;
  - `tools/postinstall.mjs` as the root `postinstall`: it runs `install-electron` unless `DSDUDE_SKIP_ELECTRON=1` (Electron 42+ has no postinstall of its own).
- **`tools/check-ownership.ts`** uses `origin/main` when `CLAUDE_CODE_REMOTE=true` or when there is no local `main`.
- **Hooks:**
  - `.githooks/commit-msg` adds the trailer with `git interpret-trailers --in-place --if-exists doNothing --trailer "DSDude-WS: WSn"`, and runs the lockfile guard when the lockfile is staged.
  - `.githooks/pre-push` refuses any pushed commit that adds a file under `vendor/` (other than `vendor/README.md`) or any `mwccarm/`, `license.dat` or `dsd-*.exe` path, anywhere in the pushed history.
- **`docs/status/cloud.md`** is the registry, one line per stream: ``- WS4: environment `dsdude-ws4`; session <url>; push target `<ref>`; started <date>; last merged <sha>``.
- **Status files:** WS0 creates `docs/status/wsN.md` stubs for WS2-WS8 and WS6b (a title plus the closing `## Integration feedback` heading). WS1 creates `docs/status/ws1.md` at hour zero without the heading, and WS0 appends it on `main` right after its first merge of `ws1-toolchain`.

### 8.3 Launching cloud stream WSn (you)

1. WS0 says "launch WSn (cloud)" once it has tagged `start-wsN` and pushed `main`, the tags and the stream line `wsN-<name>`.
2. At claude.ai/code (or the mobile Code tab), choose:
   - repository `<user>/dsdude`;
   - branch `wsN-<name>`, or `main` if the selector does not offer it (start.sh adopts the stream line; P8);
   - environment `dsdude-wsN`;
   - mode **Auto** if offered, else Accept edits.

   A pre-filled link also works: `https://claude.ai/code?repositories=<user>/dsdude&environment=dsdude-wsN`.
3. Paste the "Paste this to start" block from `docs/kickoff/wsN.md` (the 8.8 block plus the stream's second paragraph) and rename the session `WSn <name>`, where `<name>` is the branch suffix (e.g. `WS4 compiler`).
4. Give WS0 the session URL and the branch the session reports.

### 8.4 First commands and the Linux env

```bash
git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WSn
bash tools/cloud/start.sh     # 10-minute tool timeout
```

A fresh clone has no `extensions.worktreeConfig`, so `git config --worktree dsdude.ws` reads this local value. The reference implementation:

```bash
# tools/cloud/lib.sh (sourced by start.sh and push.sh)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
# a single-branch clone fetches only its own branch: make a plain `git fetch origin` update origin/main and its tags too
git config --get-all remote.origin.fetch | grep -qxF '+refs/heads/main:refs/remotes/origin/main' || git config --add remote.origin.fetch '+refs/heads/main:refs/remotes/origin/main'
WS=$(git config dsdude.ws || true)
case "$WS" in WS2) BR=ws2-runtime-core;; WS4) BR=ws4-compiler;; WS5) BR=ws5-assets;;
  WS7) BR=ws7-learn;; WS6b) BR=ws6b-editors;; *) echo "dsdude.ws='$WS': run the git config line first"; exit 1;; esac
S="docs/status/${WS,,}.md"
T=$(sed -n 's/^[-* ]*Cloud push target: `\([^`]*\)`.*$/\1/p' "$S" 2>/dev/null | head -1 || true)
export PATH=/opt/node24/bin:$PATH DSDUDE_HOME=${DSDUDE_HOME:-$HOME/.dsdude} DSDUDE_SKIP_ELECTRON=1

# tools/cloud/start.sh
. tools/cloud/lib.sh
[[ $(node -v) == v24.* && $(npm -v) == 11.* ]] || { echo 'Node 24 / npm 11 missing: check the setup script'; exit 1; }
mkdir -p "$DSDUDE_HOME"; git restore package-lock.json 2>/dev/null || true
# 1. history, tags, main, the stream line and WS0's registered target (clone depth and refs are undocumented)
[ "$(git rev-parse --is-shallow-repository)" = true ] && git fetch --unshallow origin
git fetch --tags origin '+refs/heads/main:refs/remotes/origin/main'
R=$(git show origin/main:docs/status/cloud.md 2>/dev/null | sed -n "s/^- $WS: .*push target \`\([^\`]*\)\`.*/\1/p" || true)
L=; for b in $BR $R; do git ls-remote --exit-code --heads origin "$b" >/dev/null && git fetch origin "+refs/heads/$b:refs/remotes/origin/$b" && L=origin/$b; done
# 2. adopt the stream line without ever discarding stream work
if [ -n "$L" ] && [ -z "$(git status --porcelain --untracked-files=no)" ]; then
  if git merge-base --is-ancestor HEAD "$L"; then git merge --ff-only "$L"
  elif git merge-base --is-ancestor "$L" HEAD; then :
  elif [ -z "$(git rev-list origin/main..HEAD)" ]; then git reset --hard "$L"
  else echo "HEAD and $L diverged: note it in $S and tell the user"; exit 1; fi
fi
# 3. lockfile guard; install (never npm ci); never keep a lockfile change
node tools/check-lockfile.mjs || { echo 'LOCKFILE GUARD FAILED: README 8.9'; exit 1; }
npm install
git diff --quiet -- package-lock.json || { echo 'npm rewrote the lockfile on Linux: restored; note it in the status file'; git restore package-lock.json; }
# 4. Linux native binaries from the Windows-generated lockfile
npx biome --version && npx tsc --version
node -e "const r=require('node:module').createRequire(require('node:path').resolve('apps/ide/package.json'));r('esbuild').transformSync('');for(const m of ['rollup','lightningcss','@tailwindcss/oxide'])r(m);console.log('native ok')"
case "$WS" in WS2|WS4) gcc --version | sed -n 1p; make --version | sed -n 1p;; WS7|WS6b) npx playwright install chromium;; esac
# 5. versions, position, and what WS0 last reported
C=$(git ls-tree --name-only origin/main docs/status/ | grep -E '/checkpoint-[0-9]+\.md$' | sort -V | tail -1 || true)
O=$(git show "origin/main:$S" 2>/dev/null | sed -n '/^## Integration feedback/,$p' | awk '/^- IF-[0-9]+ resolved by/{r[$2]=1;next} /^- IF-[0-9]+ /{o[$2]=1} END{for(k in o) if(!r[k]) n++; print n+0}' || true)
echo "node $(node -v), npm $(npm -v); push target: ${T:-none yet}; behind origin/main by $(git rev-list --count HEAD..origin/main); latest checkpoint: ${C:-none}; open IF entries: ${O:-0}"
```

The `|| true` on the last two assignments matters: under `set -euo pipefail`, a failed pipeline in an assignment ends the script, and before the first checkpoint (for example in the probe) there is no `checkpoint-N.md` to find.

**Linux env block.** The hook and the environment provide these. There is no MSYS2/Wonderful block. If a fresh Bash call shows a `node -v` other than v24, run the block and note it in the status file.

```bash
export PATH=/opt/node24/bin:$PATH
export DSDUDE_HOME=$HOME/.dsdude
export DSDUDE_SKIP_ELECTRON=1 DSDUDE_MAKE_JOBS=4
export DSDUDE_PORT_BASE=5180   # the stream's base; only the WS7 (5180) and WS6b (5170) browser tests use it
```

### 8.5 Pushing

**Verified.** The official docs say a session can push only to its current working branch. Interactive sessions auto-create `claude/<adjective>-<surname>-<hash>` branches, and users report HTTP 403 for any other name. Whether a chosen `claude/*` name works is undocumented (P1).

**Design.**
- The canonical stream line stays `wsN-<name>`, and WS0 creates it at launch.
- `push.sh` tries these targets in order: the recorded target, `wsN-<name>`, `claude/wsN-<name>`, then the session's own branch. A new target gets recorded, so each stream has one target at a time.
- Stop-hook pushes to other branches are ignored.

```bash
# tools/cloud/push.sh
. tools/cloud/lib.sh
git restore package-lock.json 2>/dev/null || true
node tools/check-lockfile.mjs
B=origin/main; [ -n "$T" ] && git rev-parse -q --verify "origin/$T" >/dev/null && B=origin/$T
for c in $(git rev-list --no-merges "$B..HEAD"); do
  grep -qx package-lock.json <<<"$(git diff-tree --no-commit-id --name-only -r "$c")" && { echo "$c changes package-lock.json: revert it"; exit 1; }
  grep -q '^DSDude-WS: ' <<<"$(git log -1 --format=%B "$c")" || { echo "$c lacks the trailer: git commit --amend --no-edit --trailer 'DSDude-WS: $WS'"; exit 1; }
done
for t in $T $BR claude/$BR $(git branch --show-current); do
  if git push origin "HEAD:refs/heads/$t"; then
    [ "$t" = "$T" ] || echo "NEW push target: put 'Cloud push target: \`$t\`' under the title of $S, commit, run push.sh again, tell the user"
    exit 0
  fi
done
echo 'every push target was refused: tell the user'; exit 1
```

`lib.sh` accepts the `Cloud push target:` line with or without a list-item prefix (`- `), and so does WS0's `tools/checkpoint.ps1`.

### 8.6 Daily work, checkpoints, resume

- **Commits.** Make small commits, run the Linux test (8.10) before each, and push every green batch. Never end a turn with unpushed work: idle VMs are reclaimed (P9). If the Stop-hook reminder arrives while tests are red, fix or revert first.
- **Daily merge:** `git restore package-lock.json; git fetch origin && git merge origin/main`, then `npm install; git restore package-lock.json`. Never rebase once WS0 has merged. A ws2/ws4 cross-merge merges the other stream's push target (from `docs/status/cloud.md`): `git fetch origin '+refs/heads/<target>:refs/remotes/origin/<target>'`, then `git merge origin/<target>`.
- **Feedback.** After each fetch, read `docs/status/checkpoint-N.md` and your own `## Integration feedback` section on `origin/main` (`git show origin/main:<path>`). Fix open `IF-` entries first. After fixing one, add `IF-<k> fixed in <sha>` to your progress notes above the heading and push; WS0 re-runs the check and appends the resolved line.
- **Checkpoint.** Commit, update the status file (including start.sh's version line), push, and wait until you receive the relay of section 5 ("WS0 merged checkpoint-N. Run `bash tools/cloud/start.sh`, then ..."). Then do what it says: the VM may have been reclaimed while you waited.
- **Resume.**
  - Reopen the same session and send "Resume: run `bash tools/cloud/start.sh`, then continue from docs/status/wsN.md." A reclaimed VM keeps the conversation but loses processes and unpushed files.
  - Replace a session only when it is archived or unusable: use the same environment, the kickoff's paste block and "continue from docs/status/wsN.md", and give WS0 the new URL.
  - `/compact` works; `/clear` does not.

### 8.7 A cloud session never

- edits `vendor/` or root config;
- stages or deletes `package-lock.json`, or runs `npm ci`;
- runs Windows tools, emulators, py-desmume or Electron;
- installs system packages (setup-script changes go through a WS0 ADR);
- pushes other than via `push.sh`, pushes `main` or tags, or force-pushes;
- opens PRs;
- stores secrets in variables;
- leaves background processes running.

### 8.8 Cloud paste block

This block is the first paragraph of each cloud kickoff's "Paste this to start" block. The second paragraph keeps the stream's reading list and first task, with "Operating mode: hybrid (cloud session)".

> You are workstream **WSn: <name>** on DSDude, a GameMaker-like Nintendo DS IDE, running as a Claude Code **cloud session** (Ubuntu VM, no Windows tools).
>
> - **Start:** run `git config core.hooksPath .githooks; git config core.autocrlf false; git config dsdude.ws WSn`, then `bash tools/cloud/start.sh` (10-minute timeout). Report failures rather than working around them.
> - **Read:** `docs/kickoff/wsN.md` (its "Cloud setup" block replaces the Windows setup, env block and machine facts), `docs/kickoff/README.md` section 8, your package's `CLAUDE.md`, `contracts/README.md`, `contracts/CHANGELOG.md`, your contract files, and only the `PLAN.md` sections they cite.
> - **Paths and pushing:** write only the paths `tools/ownership.json` gives WSn. Your stream line is `wsN-<name>`; push only with `bash tools/cloud/push.sh`, after every green batch.
> - **Never:** commit `package-lock.json`, run `npm ci`, edit root config or `vendor/`, or run Windows tools, emulators or Electron.
> - **Tests and merges:** run `<Linux test command>` before each commit, with a timeout on every process. Merge `origin/main` daily, and never rebase once WS0 has merged your commits.
> - **Blockers:** if a contract blocks you, write `docs/adr/NNNN-<title>.md`, mark the workaround `// ADR-pending ADR-NNNN`, and continue.
> - **Status:** fix open `## Integration feedback` entries in `docs/status/wsN.md` first, and never edit that section. The VM is ephemeral, so your branch and `docs/status/wsN.md` are your only memory: keep the file current and continue from it.

### 8.9 Lockfile (cloud side)

WS0 generates `package-lock.json` on Windows, and the cloud clones install from it on Linux. Verified 2026-09-25 with npm 11.13 and Node 24.16, with Linux simulated through `--os/--cpu/--libc` because WSL is absent (P6): a clean Windows lockfile records the linux-x64 glibc variant of every native family (rollup, esbuild, biome, TS 7, tailwind oxide, lightningcss, `@napi-rs/lzma`). A lockfile deleted while `node_modules` exists comes back without 11 `@tailwindcss/oxide-*` entries, which breaks Tailwind on Linux for good. WS0's regeneration rules are in PLAN 3.4 (Rules > Lockfile).

1. **Cloud installs:** `npm install`, never `npm ci`, because the shared settings deny `npm ci` and a stream's own `package.json` edits would break it. Restore the lockfile after every install. A new dependency is `npm install <pkg>@<exact> -w <own package>`, and only that `package.json` is committed.
2. **If the guard (`node tools/check-lockfile.mjs`) fails in the cloud:**
   - leave the lockfile alone;
   - write `BLOCKER lockfile` in the status file, push it, and tell the user;
   - meanwhile install the missing binary with `npm install --no-save <missing>@<version>` (e.g. `@tailwindcss/oxide-linux-x64-gnu@4.3.3`), never `--force`.

### 8.10 Per-stream notes

Each cloud kickoff's "Cloud setup" block names its environment, stream line and port base, its Linux test command, its row below, and this section. Linux green alone is never done: WS0 runs the right-hand column at every integration.

| Stream | Linux test before commit | Cloud verifies | Verified locally on Windows |
|---|---|---|---|
| WS2 | `make -f runtime/Makefile.host test` | Ubuntu gcc build of `runtime/build-host/dsdude-host`; conformance tiers, deterministic `--seed` traces, UBSan trap; goldens in `fixtures/conformance/expected/**` | WS0: `mingw32-make -f runtime/Makefile.host test` (gcc 15.2) on the same goldens, which is the DoD's cross-compiler identity check; builds `fixtures/runtime-core/flappy-nitrofs/` with local grit/mmutil (a WS0 row for that folder). WS3: the DS compile of the core, spikes 12 and 14, the M1 benchmark |
| WS4 | `npm test -w packages/compiler -w packages/lang -w packages/dsdb`, then `npx tsc -b packages/compiler packages/lang packages/dsdb` | goldens, `npx dsdude compile --json`, `node tools/gen-dsdb.ts`, conformance 6-10 on the Linux host | WS0: the same tests; `hello.dsdb` on both emulators and the M1 gate (with WS3) |
| WS5 | `npm test -w packages/asset-pipeline` | decode, quantizer, stitch, manifest, preview, budgets, E4xx, cache; tool tests print `skipped: no ToolPaths` | WS0: the same tests with real grit/mmutil, `npx dsdude assets samples/flappy`, GRF/soundbank identity, XM fixture, the py-desmume golden in `fixtures/assets/golden/` (a WS0 row). WS3: both sides of spike 11 |
| WS7 | `npm test -w packages/language-service -w packages/monaco-dss -w tools/gen-docs`, then `npx tsc -b packages/language-service packages/monaco-dss tools/gen-docs` | gen-docs, manual, templates, Monarch and completion in headless Chromium (ports 5181-5189) | WS6: the glue in the Electron IDE at checkpoints. WS0/WS8: the M4 template screenshots and the M5 tutorial |
| WS6b | `npm test -w packages/editor-core` (plus `-w apps/ide` for view changes) | editor cores; mock-host views in browser tests (ports 5171-5179); 60 fps checks report only (software WebGL) | WS6: editors in the shell and the 60 fps checks |

The `tsc -b` step catches syntax that Node 24's type stripping rejects when `npx dsdude` loads the package (enums, namespaces, parameter properties; `CLAUDE.md`, "Code rules"). WS2's `runtime/Makefile.host` rules are in `docs/kickoff/ws2.md`.
