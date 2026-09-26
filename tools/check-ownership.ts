// Path-ownership check (PLAN.md 3.4, docs/kickoff/ws0.md task 3). One module, two uses:
//   node tools/check-ownership.ts                         staged files (pre-commit), stream from dsdude.ws
//   node tools/check-ownership.ts --range main..<ref> [--stream WSn] [--json]
//                                                         every non-merge commit in the range (integration);
//                                                         stream from each commit's DSDude-WS trailer, else --stream
// ownership.json is read from main's HEAD (origin/main in a cloud session or when there is no local main).
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export interface Row {
  owner: string;
  paths: string[];
  except?: string[];
  from?: string;
  until?: string;
  note?: string;
}

export interface SharedRule {
  path: string;
  rule: "append-only" | "create-only" | "doc-example-fields";
  streams: string[];
  from?: string;
}

export interface GeneratedRule {
  paths: string[];
  generator: string;
  inputs: string[];
}

export interface Ownership {
  rows: Row[];
  statusFiles: { heading: string; streams: string[] };
  sharedRules: SharedRule[];
  generated: GeneratedRule[];
}

export interface Change {
  /** A added, M modified, D deleted (renames are split into D + A). */
  status: "A" | "M" | "D";
  path: string;
}

export interface Violation {
  path: string;
  stream: string;
  reason: string;
  commit?: string;
}

/** Content of a path before and after the change; null when absent. */
export type ContentFn = (path: string) => { before: string | null; after: string | null };

const cache = new Map<string, RegExp>();
export function globToRegExp(glob: string): RegExp {
  let re = cache.get(glob);
  if (re) return re;
  let src = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      // "**/" matches zero or more whole segments; a trailing "**" matches everything below.
      if (glob[i + 2] === "/") {
        src += "(?:.*/)?";
        i += 2;
      } else {
        src += ".*";
        i += 1;
      }
    } else if (c === "*") src += "[^/]*";
    else if (c === "?") src += "[^/]";
    else src += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  re = new RegExp(`^${src}$`);
  cache.set(glob, re);
  return re;
}

export const matches = (glob: string, path: string): boolean => globToRegExp(glob).test(path);

export function isActive(row: { from?: string; until?: string }, tagExists: (t: string) => boolean): boolean {
  return (row.from === undefined || tagExists(row.from)) && (row.until === undefined || !tagExists(row.until));
}

export function rowMatches(row: Row, path: string): boolean {
  return row.paths.some((g) => matches(g, path)) && !(row.except ?? []).some((g) => matches(g, path));
}

/** Streams whose active rows match `path` (status files and generated paths are handled separately). */
export function ownersOf(path: string, own: Ownership, tagExists: (t: string) => boolean): string[] {
  const out = new Set<string>();
  for (const row of own.rows) if (isActive(row, tagExists) && rowMatches(row, path)) out.add(row.owner);
  return [...out];
}

/** The stream whose own status file this is ("docs/status/ws6b.md" -> "WS6b"), or null. */
export function statusFileStream(path: string, own: Ownership): string | null {
  const m = /^docs\/status\/(ws\w+)\.md$/.exec(path);
  if (!m) return null;
  return own.statusFiles.streams.find((s) => s.toLowerCase() === m[1]) ?? null;
}

export function isGenerated(path: string, own: Ownership): GeneratedRule | undefined {
  return own.generated.find((g) => g.paths.some((p) => matches(p, path)));
}

const lines = (s: string | null): string[] => (s === null ? [] : s.replace(/\r/g, "").split("\n"));

/** true when `after` only adds lines to `before` (every old line survives, in order). */
export function onlyAddsLines(before: string | null, after: string | null): boolean {
  if (before === null) return true;
  if (after === null) return false;
  const a = lines(after);
  let i = 0;
  for (const l of lines(before)) {
    while (i < a.length && a[i] !== l) i++;
    if (i === a.length) return false;
    i++;
  }
  return true;
}

/** The status file's integration-feedback section (heading to end), or "" when there is no heading. */
export function feedbackSection(text: string | null, heading: string): string {
  if (text === null) return "";
  const t = text.replace(/\r/g, "");
  const i = t.search(new RegExp(`^${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"));
  return i < 0 ? "" : t.slice(i);
}

function onlyDocExampleChanged(before: string | null, after: string | null): string | null {
  if (before === null || after === null) return "WS7 may not create or delete builtins.json";
  let b: { entries?: Record<string, unknown>[] };
  let a: { entries?: Record<string, unknown>[] };
  try {
    b = JSON.parse(before);
    a = JSON.parse(after);
  } catch {
    return "builtins.json is not valid JSON";
  }
  const strip = (o: Record<string, unknown>) => {
    const { doc: _d, example: _e, ...rest } = o;
    return JSON.stringify(rest);
  };
  const { entries: be = [], ...bTop } = b;
  const { entries: ae = [], ...aTop } = a;
  if (JSON.stringify(bTop) !== JSON.stringify(aTop)) return "WS7 changed a top-level field of builtins.json";
  if (be.length !== ae.length) return "WS7 added or removed builtins.json entries";
  for (let i = 0; i < be.length; i++)
    if (strip(be[i]) !== strip(ae[i])) return `WS7 changed a field other than doc/example in entry ${i}`;
  return null;
}

/** Checks one commit's (or the index's) changes for `stream`. */
export function checkChanges(
  stream: string,
  changes: Change[],
  own: Ownership,
  tagExists: (t: string) => boolean,
  content: ContentFn,
): Violation[] {
  const violations: Violation[] = [];
  const changed = new Set(changes.map((c) => c.path));
  const heading = own.statusFiles.heading;
  for (const { path, status } of changes) {
    const fail = (reason: string) => violations.push({ path, stream, reason });
    if (ownersOf(path, own, tagExists).includes(stream)) continue;

    const gen = isGenerated(path, own);
    if (gen) {
      const inputs = gen.inputs.map((i) => (i === "<sibling .dsda>" ? path.replace(/\.dsdb$/, ".dsda") : i));
      if ([...changed].some((c) => c !== path && inputs.some((i) => matches(i, c)))) continue;
      fail(`generated by ${gen.generator}: change it only together with one of its inputs (${gen.inputs.join(", ")})`);
      continue;
    }

    const statusOwner = statusFileStream(path, own);
    if (statusOwner !== null) {
      const { before, after } = content(path);
      if (statusOwner === stream) {
        if (statusOwner !== "WS1" && !tagExists("phase0")) fail("stream status files start at the phase0 tag");
        else if (feedbackSection(before, heading) !== feedbackSection(after, heading))
          fail(`only WS0 writes the '${heading}' section; keep your text above it`);
        continue;
      }
      if (stream === "WS0") {
        const above = (t: string | null) => {
          const s = (t ?? "").replace(/\r/g, "");
          return s.slice(0, s.length - feedbackSection(t, heading).length).trimEnd();
        };
        if (before !== null && onlyAddsLines(before, after) && above(before) === above(after)) continue;
        fail(`WS0 may only append to the '${heading}' section of another stream's status file`);
        continue;
      }
      fail(`${path} belongs to ${statusOwner}`);
      continue;
    }

    const shared = own.sharedRules.find(
      (r) => matches(r.path, path) && r.streams.includes(stream) && isActive(r, tagExists),
    );
    if (shared) {
      const { before, after } = content(path);
      if (shared.rule === "append-only") {
        if (status !== "D" && before !== null && onlyAddsLines(before, after)) continue;
        fail(`${path} is append-only: existing lines never change`);
      } else if (shared.rule === "create-only") {
        if (status === "A") continue;
        fail("any stream may create a new ADR; only WS0 edits, renumbers or closes existing ones");
      } else {
        const err = onlyDocExampleChanged(before, after);
        if (err === null) continue;
        fail(err);
      }
      continue;
    }

    const owners = ownersOf(path, own, tagExists);
    fail(owners.length ? `owned by ${owners.join(", ")}` : "no active row in tools/ownership.json owns this path");
  }
  return violations;
}

// ---------------------------------------------------------------------------------------------------------
// git plumbing (CLI only)

function git(args: string[], opts: { allowFail?: boolean } = {}): string | null {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
      maxBuffer: 256 << 20,
    });
  } catch (err) {
    if (opts.allowFail) return null;
    throw err;
  }
}

const tagCache = new Map<string, boolean>();
/** Cached: tags do not change during one run, and a git spawn per row per path took minutes on large commits. */
export function gitTagExists(tag: string): boolean {
  let hit = tagCache.get(tag);
  if (hit === undefined) {
    hit = git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { allowFail: true }) !== null;
    tagCache.set(tag, hit);
  }
  return hit;
}

/** ownership.json at main's HEAD (origin/main in a cloud session or without a local main); null if absent. */
export function loadOwnership(): { own: Ownership | null; ref: string } {
  const hasMain = git(["rev-parse", "-q", "--verify", "refs/heads/main"], { allowFail: true }) !== null;
  const ref = process.env.CLAUDE_CODE_REMOTE === "true" || !hasMain ? "origin/main" : "main";
  const text = git(["show", `${ref}:tools/ownership.json`], { allowFail: true });
  return { own: text === null ? null : (JSON.parse(text) as Ownership), ref };
}

function parseNameStatus(out: string): Change[] {
  const parts = out.split("\0").filter((p) => p !== "");
  const changes: Change[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const s = parts[i][0];
    changes.push({ status: s === "A" ? "A" : s === "D" ? "D" : "M", path: parts[i + 1] });
  }
  return changes;
}

const show = (spec: string): string | null => git(["show", spec], { allowFail: true });

function currentStream(): string | null {
  const v =
    git(["config", "--worktree", "--get", "dsdude.ws"], { allowFail: true }) ??
    git(["config", "--get", "dsdude.ws"], { allowFail: true });
  return v === null ? null : v.trim() || null;
}

function main(argv: string[]): number {
  const { own, ref } = loadOwnership();
  if (own === null) {
    console.warn(`check-ownership: ${ref} has no tools/ownership.json yet; allowing everything`);
    return 0;
  }
  const json = argv.includes("--json");
  const rangeAt = argv.indexOf("--range");
  const streamAt = argv.indexOf("--stream");
  const fallback = streamAt >= 0 ? argv[streamAt + 1] : currentStream();
  const violations: Violation[] = [];

  if (rangeAt < 0) {
    if (!fallback) {
      console.error("check-ownership: dsdude.ws is not set. Run: git config --worktree dsdude.ws WSn");
      return 1;
    }
    const hasHead = git(["rev-parse", "-q", "--verify", "HEAD"], { allowFail: true }) !== null;
    const changes = parseNameStatus(git(["diff", "--cached", "--name-status", "-z", "--no-renames"]) ?? "");
    violations.push(
      ...checkChanges(fallback, changes, own, gitTagExists, (p) => ({
        before: hasHead ? show(`HEAD:${p}`) : null,
        after: show(`:${p}`),
      })),
    );
  } else {
    const range = argv[rangeAt + 1];
    const commits = (git(["rev-list", "--no-merges", "--reverse", range]) ?? "").split("\n").filter(Boolean);
    for (const c of commits) {
      const body = git(["log", "-1", "--format=%B", c]) ?? "";
      const trailer = /^DSDude-WS:\s*(\S+)\s*$/m.exec(body)?.[1];
      const stream = trailer ?? fallback;
      if (!stream) {
        violations.push({
          path: "",
          stream: "?",
          reason: "commit has no DSDude-WS trailer and no --stream was given",
          commit: c,
        });
        continue;
      }
      const changes = parseNameStatus(
        git(["diff-tree", "--no-commit-id", "-r", "--root", "--name-status", "-z", "--no-renames", c]) ?? "",
      );
      for (const v of checkChanges(stream, changes, own, gitTagExists, (p) => ({
        before: show(`${c}^:${p}`),
        after: show(`${c}:${p}`),
      })))
        violations.push({ ...v, commit: c });
    }
  }

  if (json) console.log(JSON.stringify({ ok: violations.length === 0, ownershipRef: ref, violations }, null, 2));
  else if (violations.length) {
    console.error(`check-ownership: ${violations.length} path(s) outside your rows (tools/ownership.json at ${ref}):`);
    for (const v of violations)
      console.error(`  ${v.commit ? `${v.commit.slice(0, 10)} ` : ""}${v.stream} ${v.path}: ${v.reason}`);
  }
  return violations.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename))
  process.exit(main(process.argv.slice(2)));
