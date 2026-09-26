/**
 * Key scripts. WS3's fixtures use the one format of contracts/log-protocol.md "Key scripts" (C8 0.2.0: change-point
 * lines `<frame> <spec>`, 0-based, `a+right`, `T<x>,<y>`), which ADR-0003's range format was superseded by. Until
 * WS1 switches tools/screenshot.py over, toRangeScript() translates a C8 script for it: C8 frame f is range frame
 * f + 1 (ADR-0003 counts emulated frames from 1).
 */

const KEYS = new Set(["a", "b", "x", "y", "l", "r", "start", "select", "up", "down", "left", "right"]);

export interface KeyChange {
  frame: number;
  keys: string[];
  touch: [number, number] | null;
}

/** Parses a C8 key script; throws with the line number on a malformed line. */
export function parseKeyScript(text: string): KeyChange[] {
  const out: KeyChange[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const m = /^(\d+)[ \t]+(\S+)$/.exec(line);
    if (!m) throw new Error(`key script line ${i + 1}: want "<frame> <spec>"`);
    const frame = Number(m[1]);
    if (out.length > 0 && frame <= out[out.length - 1].frame)
      throw new Error(`key script line ${i + 1}: frames must increase`);
    const change: KeyChange = { frame, keys: [], touch: null };
    if (m[2] !== "-") {
      for (const part of m[2].split("+")) {
        const t = /^T(\d+),(\d+)$/.exec(part);
        if (t && change.touch === null) change.touch = [Number(t[1]), Number(t[2])];
        else if (KEYS.has(part)) change.keys.push(part);
        else throw new Error(`key script line ${i + 1}: unknown part "${part}"`);
      }
    }
    out.push(change);
  });
  return out;
}

/** The same input as ADR-0003 range lines (`first-last BUTTON...`, `first-last TOUCH x y`). */
export function toRangeScript(changes: readonly KeyChange[], lastFrame: number): string {
  const lines = ["# translated from a C8 key script by runtime/src/keys.ts"];
  changes.forEach((c, i) => {
    const first = c.frame + 1;
    const last = i + 1 < changes.length ? changes[i + 1].frame : lastFrame;
    if (last < first) return;
    if (c.keys.length > 0) lines.push(`${first}-${last} ${c.keys.map((k) => k.toUpperCase()).join(" ")}`);
    if (c.touch) lines.push(`${first}-${last} TOUCH ${c.touch[0]} ${c.touch[1]}`);
  });
  return `${lines.join("\n")}\n`;
}

/** True while tools/screenshot.py still reads ADR-0003 ranges (its parser names "a frame or frame range"). */
export function screenshotUsesRanges(screenshotPy: string): boolean {
  return screenshotPy.includes("frame or frame range");
}
