// Event-driven integration trigger (WS0). Polls the stream lines and prints one line and exits when an integration
// is due; WS0 runs it under its Monitor tool and re-arms it after each integration or expiry.
//   node tools/lib/watch.ts [--minutes 28] [--poll 120] [--quiet 10] [--max-wait 45] [--gap 30]
// Due when some stream has work WS0 has not attempted yet (new non-merge commits on its ref, tip not yet attempted),
// and either every such stream has been quiet for --quiet minutes or one has waited --max-wait minutes, and at least
// --gap minutes have passed since the last integration. `.dsdude/integrate-now` (written by WS0 when a local stream
// asks) makes it due at once. State: `.dsdude/watch-state.json`, shared with integrate.ts.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadState, type Pending, registryTargets, STREAMS, saveState, type WatchState } from "./integrate.ts";

const root = resolve(import.meta.dirname, "../..");
const MIN = 60_000;

const git = (args: string[], timeout = 60_000) => {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout, windowsHide: true });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() };
};

/** Streams with new non-merge commits on their ref, and the ref's tip. */
export function pendingStreams(): Pending[] {
  const registry = registryTargets(readFileSync(join(root, "docs/status/cloud.md"), "utf8"));
  const out: Pending[] = [];
  for (const s of STREAMS) {
    const ref = s.where === "local" ? s.branch : registry.has(s.ws) ? `origin/${registry.get(s.ws)}` : null;
    if (!ref) continue;
    const tip = git(["rev-parse", "-q", "--verify", `${ref}^{commit}`]);
    if (!tip.ok) continue;
    const n = git(["rev-list", "--count", "--no-merges", `main..${ref}`]);
    if (n.ok && Number(n.out) > 0) out.push({ ws: s.ws, ref, sha: tip.out, commits: Number(n.out) });
  }
  return out;
}

/** Pure decision: which streams make an integration due now (empty = not due). */
export function due(
  state: WatchState,
  pending: Pending[],
  now: number,
  o: { quietMin: number; maxWaitMin: number; gapMin: number; force: boolean },
): Pending[] {
  const fresh = pending.filter((p) => state.attempted[p.ws] !== p.sha);
  if (!fresh.length) return [];
  if (o.force) return fresh;
  if (now - (state.lastRun ?? 0) < o.gapMin * MIN) return [];
  const since = (p: Pending) => state.seen[p.ws]?.since ?? now;
  const quiet = fresh.every((p) => now - since(p) >= o.quietMin * MIN);
  const waited = fresh.some((p) => now - (state.seen[p.ws]?.first ?? now) >= o.maxWaitMin * MIN);
  return quiet || waited ? fresh : [];
}

function main(argv: string[]): number {
  const num = (flag: string, d: number) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) : d;
  };
  const deadline = Date.now() + num("--minutes", 28) * MIN;
  const poll = num("--poll", 120) * 1000;
  const opts = { quietMin: num("--quiet", 10), maxWaitMin: num("--max-wait", 45), gapMin: num("--gap", 30) };
  const nowFile = join(root, ".dsdude/integrate-now");
  for (;;) {
    git(
      [
        "fetch",
        "--prune",
        "-q",
        "origin",
        "+refs/heads/ws*:refs/remotes/origin/ws*",
        "+refs/heads/main:refs/remotes/origin/main",
      ],
      90_000,
    );
    const state = loadState();
    const now = Date.now();
    const pending = pendingStreams();
    for (const p of pending) {
      const seen = state.seen[p.ws];
      if (!seen || seen.sha !== p.sha) state.seen[p.ws] = { sha: p.sha, since: now, first: seen?.first ?? now };
    }
    for (const ws of Object.keys(state.seen)) if (!pending.some((p) => p.ws === ws)) delete state.seen[ws];
    saveState(state);
    const force = existsSync(nowFile);
    const ready = due(state, pending, now, { ...opts, force });
    if (ready.length) {
      if (force) rmSync(nowFile, { force: true });
      console.log(
        `READY ${ready.map((p) => `${p.ws}(${p.commits}@${p.sha.slice(0, 7)})`).join(" ")}${force ? " (requested)" : ""}`,
      );
      return 0;
    }
    if (Date.now() + poll > deadline) return 0;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, poll);
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
