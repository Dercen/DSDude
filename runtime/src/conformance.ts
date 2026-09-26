/**
 * The DS side of WS2's runtime fixtures (PLAN.md 2.4: the host build is the oracle; C8 "Host runner": host traces
 * and emulator logs compare line for line after dropping DSD|PAD| and DSD|STAT| lines). The case list is read from
 * WS2's runtime/tests/test_programs.c, so the DS check follows WS2's list without a copy.
 */

export type FinalState = "EXITED" | "FAILED" | "RUNNING";

export interface ProgramCase {
  dsdb: string;
  expected: string;
  /** Compare only DSD|LOG| lines (conformance goldens). */
  logOnly: boolean;
  state: FinalState;
  /** Frames the host ran a room game for; 0 for program form. */
  frames: number;
  keys: string | null;
}

/** The CASES table of runtime/tests/test_programs.c. */
export function parseProgramCases(testProgramsC: string): ProgramCase[] {
  const table = /CASES\[\]\s*=\s*\{([\s\S]*?)\n\};/.exec(testProgramsC);
  if (!table) throw new Error("test_programs.c: no CASES table");
  const out: ProgramCase[] = [];
  const re =
    /\{\s*"([^"]+)",\s*"([^"]+)",\s*(true|false),\s*DSD_GAME_(EXITED|FAILED|RUNNING),\s*(\d+),\s*(NULL|"[^"]+")\s*\}/g;
  for (const m of table[1].matchAll(re)) {
    out.push({
      dsdb: m[1],
      expected: m[2],
      logOnly: m[3] === "true",
      state: m[4] as FinalState,
      frames: Number(m[5]),
      keys: m[6] === "NULL" ? null : m[6].slice(1, -1),
    });
  }
  return out;
}

/**
 * A log line as the comparison sees it. DSD|MEM keeps only the core's own figures (inst, arena): the rest are the
 * platform's (C11 dsd_mem_report), which the host reports as 0.
 */
export function normalizeLine(line: string): string {
  if (!line.startsWith("DSD|MEM|")) return line;
  const core = line
    .slice(8)
    .split(",")
    .filter((kv) => kv.startsWith("inst=") || kv.startsWith("arena="));
  return `DSD|MEM|${core.join(",")}`;
}

/** The lines both sides are compared on. */
export function comparable(lines: readonly string[], logOnly: boolean): string[] {
  return lines
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.startsWith("DSD|") && !l.startsWith("DSD|PAD|") && !l.startsWith("DSD|STAT|"))
    .filter((l) => !logOnly || l.startsWith("DSD|LOG|"))
    .map(normalizeLine);
}

/**
 * Compares the DS log with the host's expected output. A game that ended (EXITED/FAILED) must match exactly; a
 * RUNNING one ran longer on the DS than the host's `frames`, so the expected lines must be a prefix of the DS log.
 * Returns null when they agree, else a description of the first difference.
 */
export function compareLogs(ds: readonly string[], expected: readonly string[], c: ProgramCase): string | null {
  const got = comparable(ds, c.logOnly);
  const want = comparable(expected, c.logOnly);
  const n = Math.min(got.length, want.length);
  for (let i = 0; i < n; i++) {
    if (got[i] !== want[i]) return `line ${i + 1}: DS ${JSON.stringify(got[i])}, host ${JSON.stringify(want[i])}`;
  }
  if (got.length < want.length)
    return `DS log ends after ${got.length} lines; host has ${want.length} (next: ${want[n]})`;
  if (c.state !== "RUNNING" && got.length > want.length) {
    return `DS log has ${got.length - want.length} extra lines (first: ${got[n]})`;
  }
  return null;
}
