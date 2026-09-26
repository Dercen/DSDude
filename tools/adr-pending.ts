// Inventory of `ADR-pending ADR-NNNN` markers (PLAN.md 7.4; prose that only mentions the phrase is ignored) across main, every local ws* branch and every cloud
// push target registered in docs/status/cloud.md (falling back to all origin/ws* and origin/claude/* refs).
// Usage: node tools/adr-pending.ts [--json]
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 64 << 20 });
  } catch (err) {
    // git grep exits 1 when nothing matches
    return (err as { stdout?: string }).stdout ?? "";
  }
}

/** Push targets from the registry lines: - WS4: environment `dsdude-ws4`; ...; push target `<ref>`; ... */
export function registryTargets(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^- WS\w+: .*push target `([^`]+)`/gm)) out.push(m[1]);
  return out;
}

export interface Marker {
  ref: string;
  adr: string;
  file: string;
  line: number;
  text: string;
}

export function parseGrep(ref: string, out: string): Marker[] {
  const markers: Marker[] = [];
  for (const l of out.split("\n")) {
    // <ref>:<file>:<line>:<text>
    if (!l.startsWith(`${ref}:`)) continue;
    const rest = l.slice(ref.length + 1);
    const m = /^(.*?):(\d+):(.*)$/.exec(rest);
    if (!m) continue;
    for (const a of m[3].matchAll(/ADR-pending\s+(ADR-\d{4})/g))
      markers.push({ ref, adr: a[1], file: m[1], line: Number(m[2]), text: m[3].trim() });
  }
  return markers;
}

function refs(): string[] {
  const local = git(["for-each-ref", "--format=%(refname:short)", "refs/heads/ws*"]).split("\n").filter(Boolean);
  const reg = resolve(root, "docs/status/cloud.md");
  let cloud = existsSync(reg) ? registryTargets(readFileSync(reg, "utf8")).map((t) => `origin/${t}`) : [];
  if (!cloud.length)
    cloud = git([
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/remotes/origin/ws*",
      "refs/remotes/origin/claude/*",
    ])
      .split("\n")
      .filter(Boolean);
  const exists = (r: string) => git(["rev-parse", "-q", "--verify", `${r}^{commit}`]).trim() !== "";
  return ["main", ...local, ...cloud].filter((r, i, a) => a.indexOf(r) === i && exists(r));
}

function main(): void {
  const markers = refs().flatMap((ref) =>
    parseGrep(
      ref,
      git([
        "grep",
        "-n",
        "ADR-pending",
        ref,
        "--",
        ".",
        ":(exclude)docs/**",
        ":(exclude)PLAN.md",
        ":(exclude)CLAUDE.md",
        ":(exclude)tools/adr-pending*",
      ]),
    ),
  );
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(markers, null, 2));
    return;
  }
  if (!markers.length) {
    console.log("ADR-pending: none");
    return;
  }
  for (const [ref, ms] of groupBy(markers, (m) => m.ref)) {
    console.log(ref);
    for (const [adr, list] of groupBy(ms, (m) => m.adr))
      console.log(`  ${adr}: ${list.map((m) => `${m.file}:${m.line}`).join(", ")}`);
  }
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) out.set(key(it), [...(out.get(key(it)) ?? []), it]);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
