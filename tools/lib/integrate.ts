// WS0's daily integration (docs/kickoff/ws0.md task 8; PLAN.md 7.3). Run through tools/checkpoint.ps1, which warns
// about OneDrive and restarts a stale memory sampler first. Every spawned process has a timeout.
//   node tools/lib/integrate.ts [--dry-run] [--no-push] [--no-screenshot] [--per-ref] [--local WS2,...] [--only WS1,WS4]
// Batch mode (default): merge every clean ref, then one check+test; on red, redo one ref at a time (--per-ref forces that).
// --dry-run merges on the throwaway `integrate` branch and prints the report, but never moves main, writes files or
// pushes. Integration never needs GitHub: when the fetch fails, local branches are integrated and cloud streams are
// reported as not fetched.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const MIN = 60_000;

interface Stream {
  ws: string;
  branch: string;
  where: "local" | "cloud";
}

/** Dependency order: contract producers first (task 8 step 3). */
export const STREAMS: Stream[] = [
  { ws: "WS1", branch: "ws1-toolchain", where: "local" },
  { ws: "WS8", branch: "ws8-release", where: "local" },
  { ws: "WS4", branch: "ws4-compiler", where: "cloud" },
  { ws: "WS2", branch: "ws2-runtime-core", where: "cloud" },
  { ws: "WS3", branch: "ws3-platform", where: "local" },
  { ws: "WS5", branch: "ws5-assets", where: "cloud" },
  { ws: "WS6", branch: "ws6-ide", where: "local" },
  { ws: "WS6b", branch: "ws6b-editors", where: "cloud" },
  { ws: "WS7", branch: "ws7-learn", where: "cloud" },
];

interface Run {
  code: number | null;
  out: string;
  timedOut: boolean;
}

function run(
  cmd: string,
  args: string[],
  timeout: number,
  opts: { shell?: boolean; env?: NodeJS.ProcessEnv } = {},
): Run {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    timeout,
    maxBuffer: 64 << 20,
    windowsHide: true,
    shell: opts.shell ?? false,
    env: opts.env ?? process.env,
  });
  const timedOut = (r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`, timedOut };
}

const git = (args: string[], timeout = 2 * MIN) => run("git", args, timeout);
const gitOk = (args: string[], timeout?: number): string => {
  const r = git(args, timeout);
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed:\n${r.out}`);
  return r.out.trim();
};
/** npm/npx are .cmd shims on Windows: run them through the shell, as one command line. */
const sh = (line: string, timeout: number) => run(line, [], timeout, { shell: true });
const refExists = (ref: string) => git(["rev-parse", "-q", "--verify", `${ref}^{commit}`]).code === 0;
const firstLines = (s: string, n = 6) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() && !/^\s*(Checked \d+ files|> )/.test(l))
    .slice(-n)
    .join(" / ")
    .slice(0, 600);
const today = () => new Date().toISOString().slice(0, 10);

interface Target {
  stream: Stream;
  ref: string;
  label: string;
  sha: string;
  commits: number;
  behind: number;
  note: string[];
}

interface Outcome {
  target: Target;
  status: "merged" | "refused" | "up to date" | "not fetched" | "missing";
  detail: string;
  mergeSha?: string;
  localOnly: string[];
  versions?: string;
}

/** A stream with new non-merge commits on its ref (tools/lib/watch.ts). */
export interface Pending {
  ws: string;
  ref: string;
  sha: string;
  commits: number;
}

/** Shared by watch.ts and integrate.ts in `.dsdude/watch-state.json`. */
export interface WatchState {
  /** Epoch ms of the last real (non-dry) integration. */
  lastRun?: number;
  /** Stream -> tip sha the last integration merged or refused; the watcher ignores a tip it already tried. */
  attempted: Record<string, string>;
  /** Stream -> tip first seen at `since` (epoch ms); `first` = when the stream first had pending work. */
  seen: Record<string, { sha: string; since: number; first: number }>;
}

const statePath = () => join(root, ".dsdude/watch-state.json");

export function loadState(): WatchState {
  try {
    const s = JSON.parse(readFileSync(statePath(), "utf8")) as Partial<WatchState>;
    return { lastRun: s.lastRun, attempted: s.attempted ?? {}, seen: s.seen ?? {} };
  } catch {
    return { attempted: {}, seen: {} };
  }
}

export function saveState(s: WatchState): void {
  mkdirSync(join(root, ".dsdude"), { recursive: true });
  writeFileSync(statePath(), `${JSON.stringify(s, null, 2)}\n`);
}

interface Feedback {
  ws: string;
  check: string;
  command: string;
  error: string;
  action: string;
  sha: string;
}

/** `- WS4: ...; push target `<ref>`; ...` lines of docs/status/cloud.md. */
export function registryTargets(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of text.matchAll(/^- (WS\w+): .*push target `([^`]+)`/gm)) m.set(x[1], x[2]);
  return m;
}

/** `Cloud push target: `<ref>`` in a status file, with or without a list-item prefix (as lib.sh reads it). */
export function statusPushTarget(text: string): string | null {
  return /^[-* ]*Cloud push target: `([^`]*)`/m.exec(text)?.[1] ?? null;
}

function nextCheckpoint(): number {
  const dir = join(root, "docs/status");
  const ns = readdirSync(dir)
    .map((f) => /^checkpoint-(\d+)\.md$/.exec(f)?.[1])
    .filter((x): x is string => x !== undefined)
    .map(Number);
  return ns.length ? Math.max(...ns) + 1 : 0;
}

function memorySummary(): string {
  const log = join(root, ".dsdude/memsampler.log");
  if (!existsSync(log)) return "memsampler.log missing";
  const last = git(["log", "-1", "--format=%cI", "--", "docs/status/checkpoint-*.md"]).out.trim();
  const since = last ? new Date(last) : new Date(0);
  let min: [number, string] | null = null;
  let peak: [number, string] | null = null;
  let n = 0;
  for (const line of readFileSync(log, "utf8").split(/\r?\n/)) {
    const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d),(\d+),(\d+)$/.exec(line);
    if (!m || new Date(m[1]) < since) continue;
    n++;
    const a = Number(m[2]);
    const c = Number(m[3]);
    if (!min || a < min[0]) min = [a, m[1]];
    if (!peak || c > peak[0]) peak = [c, m[1]];
  }
  if (!min || !peak) return `no samples since ${last || "the start"}`;
  const stale =
    (Date.now() - statSync(log).mtimeMs) / MIN > 5 ? " (log stale: checkpoint.ps1 restarts the sampler)" : "";
  return `${n} samples since ${last || "the start of the log"}: minimum available ${min[0]} MB at ${min[1]}; peak commit charge ${(peak[0] / 2 ** 30).toFixed(1)} GB at ${peak[1]}; gate ${min[0] > 1536 ? "PASS" : "FAIL"}${stale}`;
}

function checkAndTest(): { ok: boolean; step: string; command: string; out: string } {
  const check = sh("npm run check", 10 * MIN);
  if (check.code !== 0)
    return {
      ok: false,
      step: "npm run check",
      command: "npm run check",
      out: check.timedOut ? "timed out after 10 min" : check.out,
    };
  const test = sh("npm test", 15 * MIN);
  if (test.code !== 0)
    return {
      ok: false,
      step: "npm test",
      command: "npm test",
      out: test.timedOut ? "timed out after 15 min" : test.out,
    };
  const summary = /Test Files\s+.*|Tests\s+\d+.*/g;
  return {
    ok: true,
    step: "check+test",
    command: "npm run check && npm test",
    out: (test.out.match(summary) ?? []).join("; "),
  };
}

function main(argv: string[]): number {
  const dry = argv.includes("--dry-run");
  const noPush = dry || argv.includes("--no-push");
  const noShot = argv.includes("--no-screenshot");
  const perRef = argv.includes("--per-ref");
  const listArg = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? (argv[i + 1] ?? "").split(",").filter(Boolean) : [];
  };
  const movedHome = new Set(listArg("--local"));
  const only = new Set(listArg("--only"));

  if (gitOk(["branch", "--show-current"]) !== "main") throw new Error("run the integration from main");
  if (git(["status", "--porcelain", "--untracked-files=no"]).out.trim())
    throw new Error("the working tree has changes: commit or stash them first");

  const N = nextCheckpoint();
  const log: string[] = [];
  const say = (s: string) => {
    log.push(s);
    console.log(s);
  };

  // 1. fetch
  const fetch = git(
    [
      "fetch",
      "--prune",
      "--tags",
      "origin",
      "+refs/heads/ws*:refs/remotes/origin/ws*",
      "+refs/heads/claude/*:refs/remotes/origin/claude/*",
      "+refs/heads/main:refs/remotes/origin/main",
    ],
    3 * MIN,
  );
  const online = fetch.code === 0;
  say(online ? "fetch: ok" : `fetch: FAILED (${firstLines(fetch.out, 2)}); cloud streams are not fetched, push later`);

  // 2. refs
  const registry = registryTargets(readFileSync(join(root, "docs/status/cloud.md"), "utf8"));
  const originRefs = online
    ? git(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/ws*", "refs/remotes/origin/claude/*"])
        .out.split("\n")
        .filter(Boolean)
    : [];
  const targets: Target[] = [];
  const outcomes: Outcome[] = [];
  for (const s of STREAMS) {
    if (only.size && !only.has(s.ws)) continue;
    const local = s.where === "local" || movedHome.has(s.ws);
    let ref: string;
    const note: string[] = [];
    if (local) {
      ref = s.branch;
      if (!refExists(ref)) continue; // not started
    } else {
      const registered = registry.get(s.ws);
      if (!registered) continue; // not launched
      if (!online) {
        outcomes.push({
          target: { stream: s, ref: `origin/${registered}`, label: registered, sha: "-", commits: 0, behind: 0, note },
          status: "not fetched",
          detail: "origin unreachable",
          localOnly: [],
        });
        continue;
      }
      ref = `origin/${registered}`;
      // A new push target: a fetched ref whose status file names itself (task 8 step 2).
      for (const r of originRefs) {
        const name = r.replace(/^origin\//, "");
        if (name === registered) continue;
        const st = git(["show", `${r}:docs/status/${s.ws.toLowerCase()}.md`]);
        if (st.code === 0 && statusPushTarget(st.out) === name)
          note.push(
            `candidate NEW push target \`${name}\` (its status file names it): confirm with the user, then update docs/status/cloud.md`,
          );
      }
      if (!refExists(ref)) {
        outcomes.push({
          target: { stream: s, ref, label: registered, sha: "-", commits: 0, behind: 0, note },
          status: "missing",
          detail: `origin has no ${registered}`,
          localOnly: [],
        });
        continue;
      }
    }
    const sha = gitOk(["rev-parse", ref]);
    const commits = Number(gitOk(["rev-list", "--count", "--no-merges", `main..${ref}`]));
    const behind = Number(gitOk(["rev-list", "--count", `${ref}..main`]));
    targets.push({
      stream: s,
      ref,
      label: local ? s.branch : `${ref.replace(/^origin\//, "")}@${sha.slice(0, 7)}`,
      sha,
      commits,
      behind,
      note,
    });
  }

  // 3.-4. ownership, then merges on the throwaway branch
  const feedback: Feedback[] = [];
  gitOk(["switch", "-C", "integrate", "main"]);
  let lockfileTouched = false;
  try {
    // 3. ownership first; only clean refs are merge candidates
    const candidates: { t: Target; base: Omit<Outcome, "status" | "detail"> }[] = [];
    for (const t of targets) {
      const s = t.stream;
      const versions =
        s.where === "cloud"
          ? (git(["show", `${t.ref}:docs/status/${s.ws.toLowerCase()}.md`]).out.match(/node v\d[^\n`]*/)?.[0] ?? "-")
          : undefined;
      const base: Omit<Outcome, "status" | "detail"> = { target: t, localOnly: [], versions };
      if (t.commits === 0) {
        outcomes.push({ ...base, status: "up to date", detail: "no new commits" });
        continue;
      }
      const own = run(
        process.execPath,
        ["tools/check-ownership.ts", "--range", `main..${t.ref}`, "--stream", s.ws, "--json"],
        3 * MIN,
      );
      if (own.code !== 0) {
        let v: { violations?: { commit?: string; path: string; reason: string }[] } | null = null;
        try {
          v = JSON.parse(own.out);
        } catch {
          v = null;
        }
        if (!v?.violations?.length) {
          // The checker itself failed or timed out: WS0's problem, not the stream's. No IF entry.
          const why = own.timedOut ? "timed out" : `exit ${own.code}: ${firstLines(own.out, 3)}`;
          outcomes.push({
            ...base,
            status: "refused",
            detail: `ownership check could not run (${why}); not merged, no IF entry`,
          });
          say(`${s.ws}: ownership check could not run (${why})`);
        }
        const list = (v?.violations ?? []).map((x) => `${x.commit?.slice(0, 7) ?? ""} ${x.path}: ${x.reason}`);
        outcomes.push({ ...base, status: "refused", detail: `ownership: ${list.slice(0, 5).join("; ")}` });
        feedback.push({
          ws: s.ws,
          check: "ownership",
          command: `node tools/check-ownership.ts --range main..${t.ref} --stream ${s.ws}`,
          error: list.slice(0, 3).join("; "),
          action: "revert or move those changes (they belong to another stream), then push again",
          sha: t.sha,
        });
        continue;
      }
      candidates.push({ t, base });
    }

    // 4. merge. Batch mode (default): merge every candidate, then one check+test; if that is red, start again from
    // main and merge one ref at a time with a check+test after each, to find the culprit.
    const mergeRef = (c: (typeof candidates)[number]): boolean => {
      const { t, base } = c;
      const s = t.stream;
      const msg =
        s.where === "cloud" && !movedHome.has(s.ws) ? `Merge ${s.branch} (cloud ${t.label})` : `Merge ${s.branch}`;
      const merge = git(["merge", "--no-ff", t.ref, "-m", msg], 3 * MIN);
      if (merge.code === 0) {
        const changed = gitOk(["diff", "--name-only", "HEAD^1", "HEAD"]).split("\n");
        if (changed.some((f) => f.endsWith("package.json"))) lockfileTouched = true;
        return true;
      }
      git(["merge", "--abort"]);
      outcomes.push({ ...base, status: "refused", detail: `merge conflict: ${firstLines(merge.out, 3)}` });
      feedback.push({
        ws: s.ws,
        check: "merge",
        command: `git merge --no-ff ${t.ref}`,
        error: firstLines(merge.out, 3),
        action: `merge ${s.where === "cloud" ? "origin/main" : "main"} into your branch (after git restore package-lock.json), resolve the conflict, and ${s.where === "cloud" ? "push" : "commit"}`,
        sha: t.sha,
      });
      return false;
    };
    const install = () => {
      if (!lockfileTouched) return;
      const inst = sh("npm install", 10 * MIN);
      if (inst.code !== 0) say(`npm install: exit ${inst.code} ${firstLines(inst.out, 3)}`);
    };
    let batchGreen: ReturnType<typeof checkAndTest> | null = null;
    const merged: (typeof candidates)[number][] = [];
    if (!perRef && candidates.length > 1) {
      for (const c of candidates) if (mergeRef(c)) merged.push(c);
      install();
      const ct = merged.length ? checkAndTest() : null;
      if (ct?.ok) {
        batchGreen = ct;
        for (const c of merged) {
          outcomes.push({
            ...c.base,
            status: "merged",
            detail: `batch: ${ct.out}`,
            mergeSha: gitOk(["rev-parse", "HEAD"]),
          });
          say(`${c.t.stream.ws}: merged ${c.t.label} (${c.t.commits} commits)`);
        }
      } else if (ct) {
        say(`batch of ${merged.length} merges is red (${ct.step}); merging one at a time`);
        git(["restore", "package-lock.json"]);
        gitOk(["reset", "--hard", "main"]);
        lockfileTouched = false;
      }
    }
    if (!batchGreen) {
      const todo = perRef || candidates.length <= 1 ? candidates : merged;
      for (const c of todo) {
        const { t, base } = c;
        const s = t.stream;
        if (!mergeRef(c)) continue;
        install();
        const ct = checkAndTest();
        if (!ct.ok) {
          git(["restore", "package-lock.json"]);
          gitOk(["reset", "--hard", "HEAD~1"]);
          outcomes.push({ ...base, status: "refused", detail: `${ct.step} red on Windows: ${firstLines(ct.out, 4)}` });
          feedback.push({
            ws: s.ws,
            check: `${ct.step} on Windows after merging`,
            command: ct.command,
            error: firstLines(ct.out, 4),
            action:
              "reproduce with the same command (Windows paths, CRLF and case are the usual causes), fix, and push again",
            sha: t.sha,
          });
          continue;
        }
        batchGreen = ct;
        outcomes.push({ ...base, status: "merged", detail: ct.out, mergeSha: gitOk(["rev-parse", "HEAD"]) });
        say(`${s.ws}: merged ${t.label} (${t.commits} commits)`);
      }
    }

    // 5. lockfile
    const localChecks: string[] = [];
    if (lockfileTouched || git(["status", "--porcelain", "package-lock.json"]).out.trim()) {
      sh("npm install", 10 * MIN);
      const guard = run(process.execPath, ["tools/check-lockfile.mjs"], MIN);
      if (git(["status", "--porcelain", "package-lock.json"]).out.trim()) {
        if (guard.code !== 0) throw new Error(`lockfile guard failed: ${guard.out}`);
        gitOk(["add", "package-lock.json"]);
        gitOk(["commit", "-m", "chore(deps): regenerate lockfile"]);
        localChecks.push("lockfile regenerated and committed (guard passed)");
      }
    }

    // 6. final check + test on the integrated tree (reused when nothing changed since the last green run)
    const final = batchGreen && !localChecks.length ? batchGreen : checkAndTest();
    localChecks.push(
      `npm run check && npm test (Windows): ${final.ok ? `green; ${final.out}` : `RED: ${firstLines(final.out, 4)}`}`,
    );
    if (!final.ok) throw new Error(`the integrated tree is red: ${firstLines(final.out)}`);

    // 7. host goldens with MSYS2 gcc
    if (existsSync(join(root, "runtime/Makefile.host"))) {
      const path = `C:\\msys64\\ucrt64\\bin;${process.env.PATH ?? process.env.Path ?? ""}`;
      const mk = run("mingw32-make", ["-f", "runtime/Makefile.host", "test", "-j4"], 10 * MIN, {
        env: { ...process.env, PATH: path, Path: path },
      });
      const line = `mingw32-make -f runtime/Makefile.host test (MSYS2 gcc): ${mk.code === 0 ? "green" : `RED (exit ${mk.code}${mk.timedOut ? ", timed out" : ""}): ${firstLines(mk.out, 4)}`}`;
      localChecks.push(line);
      const ws2 = outcomes.find((o) => o.target.stream.ws === "WS2" && o.status === "merged");
      if (mk.code !== 0 && ws2)
        feedback.push({
          ws: "WS2",
          check: "host goldens with MSYS2 gcc 15.2",
          command: "mingw32-make -f runtime/Makefile.host test",
          error: firstLines(mk.out, 4),
          action: "make the Linux and MSYS2 builds agree (identical flags; fixed-width types; binary writes)",
          sha: ws2.target.sha,
        });
      if (ws2) ws2.localOnly.push(line);
    } else localChecks.push("host goldens: skipped (no runtime/Makefile.host yet)");

    // 8. dsdude screenshot of samples/hello
    const rom = "fixtures/build/hello/game.nds";
    if (noShot) localChecks.push("screenshot: skipped (--no-screenshot)");
    else if (existsSync(join(root, rom))) {
      const out = join(process.env.DSDUDE_HOME ?? join(root, ".dsdude"), "checkpoint", `cp${N}-hello`);
      rmSync(out, { recursive: true, force: true });
      mkdirSync(out, { recursive: true });
      const shot = sh(`npx dsdude screenshot ${rom} --frames 120 --out "${out}" --json`, 3 * MIN);
      const pngs = ["top.png", "bottom.png"].filter((f) => existsSync(join(out, f)));
      const golden = join(root, "fixtures/build/hello/golden");
      let verdict =
        shot.code === 0 && pngs.length === 2
          ? "PNGs written"
          : `FAILED (exit ${shot.code}): ${firstLines(shot.out, 3)}`;
      if (pngs.length === 2 && existsSync(join(golden, "bottom.png")))
        verdict += ["top.png", "bottom.png"].every((f) =>
          readFileSync(join(out, f)).equals(readFileSync(join(golden, f))),
        )
          ? "; match the golden"
          : "; DIFFER from fixtures/build/hello/golden";
      else if (pngs.length === 2) verdict += "; no golden committed yet (WS1/WS8); WS0 reads the PNGs";
      localChecks.push(`dsdude screenshot samples/hello (${out}): ${verdict}`);
    } else localChecks.push("screenshot: skipped (no fixtures/build/hello/game.nds)");
    for (const o of outcomes.filter((x) => x.status === "merged" && x.target.stream.where === "cloud"))
      if (!o.localOnly.length) o.localOnly.push("none due yet (inputs not there)");

    // switch main forward (never forced)
    gitOk(["switch", "main"]);
    if (!dry) gitOk(["merge", "--ff-only", "integrate"]);
    gitOk(["branch", "-D", "integrate"]);

    // 10.-11. report, feedback, registry
    const adr = run(process.execPath, ["tools/adr-pending.ts"], 2 * MIN).out.trim();
    const report = renderReport(N, outcomes, localChecks, memorySummary(), adr, feedback, online, log);
    if (dry) {
      console.log(`\n----- DRY RUN: checkpoint-${N}.md would be -----\n${report}`);
      return 0;
    }
    writeFileSync(join(root, `docs/status/checkpoint-${N}.md`), report);
    appendFeedback(N, feedback);
    const state = loadState();
    state.lastRun = Date.now();
    for (const o of outcomes) if (o.target.sha !== "-") state.attempted[o.target.stream.ws] = o.target.sha;
    saveState(state);
    updateRegistry(outcomes);
    gitOk(["add", "docs/status"]);
    gitOk(["commit", "-m", `docs(status): checkpoint-${N} integration report`]);

    // 12. lockfile guard, push main + tags, fast-forward cloud stream lines
    if (noPush) console.log("push skipped (--no-push)");
    else if (!online)
      console.log("push skipped: origin unreachable; push later with git push origin main --follow-tags");
    else {
      const guard = run(process.execPath, ["tools/check-lockfile.mjs"], MIN);
      if (guard.code !== 0) throw new Error(`lockfile guard failed before the push: ${guard.out}`);
      gitOk(["push", "origin", "main", "--follow-tags"], 3 * MIN);
      for (const o of outcomes) {
        const s = o.target.stream;
        if (o.status !== "merged" || s.where !== "cloud" || movedHome.has(s.ws)) continue;
        if (o.target.ref === `origin/${s.branch}`) continue;
        const r = git(["push", "origin", `${o.target.sha}:refs/heads/${s.branch}`], 3 * MIN);
        console.log(
          `stream line ${s.branch} -> ${o.target.sha.slice(0, 7)}: ${r.code === 0 ? "ok" : firstLines(r.out, 2)}`,
        );
      }
      console.log("pushed main and tags");
    }
    return 0;
  } finally {
    if (gitOk(["branch", "--show-current"]) === "integrate") {
      git(["merge", "--abort"]);
      git(["reset", "--hard", "HEAD"]);
      gitOk(["switch", "main"]);
    }
    if (refExists("integrate")) git(["branch", "-D", "integrate"]);
  }
}

function renderReport(
  N: number,
  outcomes: Outcome[],
  localChecks: string[],
  memory: string,
  adr: string,
  feedback: Feedback[],
  online: boolean,
  log: string[],
): string {
  const head = gitOk(["rev-parse", "--short", "main"]);
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const rows = outcomes.map(
    (o) =>
      `| ${o.target.stream.ws} | ${o.target.stream.where} | \`${o.target.label}\` | ${o.target.commits} | ${o.target.behind} | **${o.status}**${o.mergeSha ? ` as \`${o.mergeSha.slice(0, 7)}\`` : ""} | ${esc(o.detail)} |`,
  );
  const cloud = outcomes
    .filter((o) => o.target.stream.where === "cloud")
    .map(
      (o) =>
        `| ${o.target.stream.ws} | \`${o.target.label}\` | ${o.target.behind} | ${o.status} | ${esc(o.localOnly.join("; ") || "-")} | ${esc(o.versions ?? "-")} |`,
    );
  const notes = outcomes.flatMap((o) => o.target.note.map((n) => `- ${o.target.stream.ws}: ${n}`));
  return [
    `# Checkpoint ${N}: daily integration (${today()})`,
    "",
    `WS0's integration run (\`tools/checkpoint.ps1\`). \`main\` is at the commit that adds this report, on top of \`${head}\`. Streams whose branch was merged may touch it again${online ? "" : " (origin was unreachable: cloud streams not fetched)"}. Cloud streams: wait for the user's relay "WS0 merged checkpoint-${N}. Run \`bash tools/cloud/start.sh\`, then ...".`,
    "",
    "## Streams",
    "",
    "| Stream | Where | Ref | New commits | Behind main | Result | Detail |",
    "|---|---|---|---|---|---|---|",
    ...(rows.length ? rows : ["| - | - | - | - | - | nothing to integrate | - |"]),
    "",
    "## Cloud streams",
    "",
    "| Stream | Target@sha | Behind main | Merged/refused | Local-only results | Versions (start.sh) |",
    "|---|---|---|---|---|---|",
    ...(cloud.length ? cloud : ["| - | - | - | - | - | - |"]),
    ...(notes.length ? ["", "**Push targets:**", ...notes] : []),
    "",
    "## Local checks (Windows)",
    "",
    ...localChecks.map((l) => `- ${l}`),
    "",
    "## Integration feedback appended",
    "",
    ...(feedback.length
      ? feedback.map((f) => `- ${f.ws}: ${f.check} failed: \`${f.command}\` -> ${f.error}`)
      : ["- none"]),
    "",
    "## Memory and ADR-pending",
    "",
    `- Memory: ${memory}`,
    `- ADR-pending inventory: ${adr.replace(/\n/g, "; ") || "none"}`,
    "",
    "## Run log",
    "",
    ...log.map((l) => `- ${l}`),
    "",
  ].join("\n");
}

/** Appends IF entries at the end of each stream's status file (the heading is added when missing). */
function appendFeedback(N: number, feedback: Feedback[]): void {
  for (const f of feedback) {
    const p = join(root, `docs/status/${f.ws.toLowerCase()}.md`);
    let text = existsSync(p) ? readFileSync(p, "utf8") : `# ${f.ws} status\n`;
    if (!/^## Integration feedback\s*$/m.test(text)) text = `${text.replace(/\n*$/, "\n")}\n## Integration feedback\n`;
    const k = Math.max(0, ...[...text.matchAll(/^- IF-(\d+) /gm)].map((m) => Number(m[1]))) + 1;
    text = `${text.replace(/\n*$/, "\n")}- IF-${k} ${today()} checkpoint-${N} @${f.sha.slice(0, 7)}: ${f.check} failed: \`${f.command}\` -> ${f.error}. Action: ${f.action}.\n`;
    writeFileSync(p, text);
  }
}

/** Records `last merged <sha>` on each merged cloud stream's registry line. */
function updateRegistry(outcomes: Outcome[]): void {
  const p = join(root, "docs/status/cloud.md");
  let text = readFileSync(p, "utf8");
  for (const o of outcomes) {
    if (o.status !== "merged" || o.target.stream.where !== "cloud") continue;
    const re = new RegExp(`^(- ${o.target.stream.ws}: .*last merged )\\S+.*$`, "m");
    text = text.replace(re, `$1${o.target.sha.slice(0, 7)} (${today()})`);
  }
  writeFileSync(p, text);
}

if (import.meta.main) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error(`integrate: ${(err as Error).message}`);
    process.exit(1);
  }
}
