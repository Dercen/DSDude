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
 * A log line as the comparison sees it. DSD|READY's ABI hash is masked, as WS2's runner does (an append to
 * builtins.json changes it without changing any golden; readyAbi() checks it separately). DSD|MEM keeps only the
 * core's own figures (inst, arena): the rest are the platform's (C11 dsd_mem_report), which the host reports as 0.
 */
export function normalizeLine(line: string): string {
  const ready = /^(DSD\|READY\|[^|]*\|)[0-9a-fA-F]{8}$/.exec(line);
  if (ready) return `${ready[1]}xxxxxxxx`;
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

/** The ABI hash of the first DSD|READY line, or null. */
export function readyAbi(lines: readonly string[]): string | null {
  for (const l of lines) {
    const m = /^DSD\|READY\|[^|]*\|([0-9a-f]{8})\r?$/.exec(l);
    if (m) return m[1];
  }
  return null;
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

// ---- Placeholder sprites --------------------------------------------------------------------------------------
// WS2's fixtures declare sprites (`.asset sprite`) but ship no GRFs: the host runs without them. The DS loads every
// sprite of a room (C11 dsd_plat_sprite_load), so the harness writes a placeholder GRF per sprite with the box and
// frame count the core will ask for.

export interface SpriteAsset {
  /** NitroFS path, e.g. "gfx/spr_box.grf". */
  path: string;
  frames: number;
  /** The frame size from `size=W,H` (default 16x16). */
  width: number;
  height: number;
}

/** The `.asset sprite <name> "<path>" <frames> ... size=W,H` lines of a .dsda. */
export function spriteAssets(dsda: string): SpriteAsset[] {
  const out: SpriteAsset[] = [];
  for (const m of dsda.matchAll(/^\.asset\s+sprite\s+\S+\s+"([^"]+)"\s+(\d+)([^\n]*)$/gm)) {
    const size = /\bsize=(\d+),(\d+)/.exec(m[3]);
    out.push({
      path: m[1],
      frames: Number(m[2]),
      width: size ? Number(size[1]) : 16,
      height: size ? Number(size[2]) : 16,
    });
  }
  return out;
}

// The 12 OBJ sizes in C3's padding order (smallest area first); the smallest one containing a frame is unique.
const OBJ_SIZES: [number, number][] = [
  [8, 8],
  [16, 8],
  [8, 16],
  [16, 16],
  [32, 8],
  [8, 32],
  [32, 16],
  [16, 32],
  [32, 32],
  [64, 32],
  [32, 64],
  [64, 64],
];

/** The OBJ box a frame is padded to (C3 section 3 step 7), or null for a frame over 64 pixels. */
export function objBox(w: number, h: number): [number, number] | null {
  return OBJ_SIZES.find(([bw, bh]) => bw >= w && bh >= h) ?? null;
}

function chunk(tag: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length + (body.length & 1));
  out.set(new TextEncoder().encode(tag), 0);
  new DataView(out.buffer).setUint32(4, body.length, true);
  out.set(body, 8);
  return out;
}

/** An uncompressed GRF chunk body: a u32 header (size << 8, type 0) followed by the data. */
function raw(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + data.length);
  new DataView(out.buffer).setUint32(0, data.length << 8, true);
  out.set(data, 4);
  return out;
}

/**
 * A GRF like grit's 8bpp sprite line writes (HDRX version 2, GFX and PAL chunks, uncompressed): `frames` solid
 * frames of box w x h stacked vertically, colour index 1 (white) on a magenta index 0.
 */
export function placeholderGrf(w: number, h: number, frames: number): Uint8Array {
  const hdr = new Uint8Array(24);
  const dv = new DataView(hdr.buffer);
  dv.setUint16(0, 2, true); // version
  dv.setUint16(2, 8, true); // gfxAttr: 8bpp
  dv.setUint16(8, 256, true); // palAttr: colours
  hdr[10] = 8; // tile width
  hdr[11] = 8; // tile height
  dv.setUint32(16, w, true);
  dv.setUint32(20, h * frames, true);
  const gfx = new Uint8Array(w * h * frames).fill(1);
  const pal = new Uint8Array(512);
  new DataView(pal.buffer).setUint16(0, 0x7c1f, true); // magenta
  new DataView(pal.buffer).setUint16(2, 0x7fff, true); // white
  const body = [new TextEncoder().encode("GRF "), chunk("HDRX", hdr), chunk("GFX ", raw(gfx)), chunk("PAL ", raw(pal))];
  const size = body.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(8 + size);
  out.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(out.buffer).setUint32(4, size, true);
  let at = 8;
  for (const b of body) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}
