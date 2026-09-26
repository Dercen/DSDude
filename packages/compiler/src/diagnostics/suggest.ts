/** Did-you-mean suggestions for unknown names (contracts/diagnostics.md; PLAN.md 6 WS4 checker). */

/** Longest distance still worth suggesting, as a fraction of the name's length (1 edit per 3 letters). */
const LETTERS_PER_EDIT = 3;
/** Every name may be off by at least this many edits. */
const MIN_EDITS = 1;

/** Levenshtein distance between two strings (insert, delete, substitute; each costs 1). */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row.push(Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + cost));
    }
    prev = row;
  }
  return prev[b.length] as number;
}

/**
 * The closest candidate to `name`, or null when nothing is close enough. Ties go to the candidate that sorts
 * first, so suggestions are deterministic. Case differences cost nothing extra beyond their edits.
 */
export function suggest(name: string, candidates: Iterable<string>): string | null {
  const limit = Math.max(MIN_EDITS, Math.floor(name.length / LETTERS_PER_EDIT));
  let best: string | null = null;
  let bestDistance = limit + 1;
  for (const c of candidates) {
    if (c === name) continue;
    const d = Math.min(editDistance(name, c), editDistance(name.toLowerCase(), c.toLowerCase()));
    if (d < bestDistance || (d === bestDistance && best !== null && c < best)) {
      best = c;
      bestDistance = d;
    }
  }
  return bestDistance <= limit ? best : null;
}

/** Formats a suggestion for the `{suggestion}` placeholder at the start of a hint: "Did you mean x? " or "". */
export function suggestionText(best: string | null, call = false): string {
  return best === null ? "" : `Did you mean ${best}${call ? "()" : ""}? `;
}
