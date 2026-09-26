/**
 * DSDB binary encode/decode (contract C2, byte layout in contracts/dsdb.md). Table-driven by the generated
 * opcode table. Canonical: STRS, SYMS and GLOB are sorted by UTF-8 bytes and KONS by (tag, payload), so the
 * same module always encodes to the same bytes whatever order the writer used.
 */
import type { BuiltinsEnv } from "./abi.ts";
import { OPCODES, type OpcodeInfo } from "./gen/opcodes.ts";
import {
  ASSET_KIND,
  type AssetKind,
  type Const,
  type DsdbModule,
  EXTENSION_ENTRY_BYTES,
  EXTENSION_OFFSET_AT,
  eventId,
  eventStem,
  FLAG_RELEASE,
  FLAGS_KNOWN,
  FORMAT_MAJOR,
  FORMAT_MINOR,
  FORMAT_MINOR_EXTENSIONS,
  type Func,
  type Instr,
  MAGIC,
  type Operand,
  SECTION_ENTRY_BYTES,
  SECTIONS,
  SPRG,
  TAG,
} from "./model.ts";

const byName = new Map(OPCODES.map((o) => [o.name, o]));
const byNumber = new Map(OPCODES.map((o) => [o.number, o]));
const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder("utf-8", { fatal: true });

export class DsdbError extends Error {}
const fail = (msg: string): never => {
  throw new DsdbError(msg);
};

export const compareUtf8 = (a: string, b: string): number => {
  const x = utf8.encode(a);
  const y = utf8.encode(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
};

const sortedUnique = (xs: Iterable<string>): string[] => [...new Set(xs)].sort(compareUtf8);

class Writer {
  bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  u16(v: number) {
    this.u8(v);
    this.u8(v >>> 8);
  }
  u32(v: number) {
    this.u16(v & 0xffff);
    this.u16(v >>> 16);
  }
  align4() {
    while (this.bytes.length % 4) this.u8(0);
  }
  get length() {
    return this.bytes.length;
  }
  patch32(at: number, v: number) {
    for (let i = 0; i < 4; i++) this.bytes[at + i] = (v >>> (8 * i)) & 0xff;
  }
}

class Reader {
  readonly v: DataView;
  pos: number;
  constructor(bytes: Uint8Array, pos = 0) {
    this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = pos;
  }
  u8() {
    return this.v.getUint8(this.pos++);
  }
  u16() {
    const x = this.v.getUint16(this.pos, true);
    this.pos += 2;
    return x;
  }
  s16() {
    const x = this.v.getInt16(this.pos, true);
    this.pos += 2;
    return x;
  }
  u32() {
    const x = this.v.getUint32(this.pos, true);
    this.pos += 4;
    return x;
  }
  s32() {
    const x = this.v.getInt32(this.pos, true);
    this.pos += 4;
    return x;
  }
}

const opInfo = (name: string): OpcodeInfo => byName.get(name) ?? fail(`unknown opcode ${name}`);
const operandSpec = (op: OpcodeInfo) => op.operands.map((o) => o.split(":") as [string, string]);

function range(v: number, lo: number, hi: number, what: string): number {
  if (!Number.isInteger(v) || v < lo || v > hi) fail(`${what} ${v} is outside ${lo}..${hi}`);
  return v;
}

const assetKindCode = (k: AssetKind | "object" | "room"): number => ASSET_KIND[k];

/** Encodes a module; the ABI hash comes from `env`. */
export function encode(m: DsdbModule, env: BuiltinsEnv): Uint8Array {
  const funcIndex = new Map(m.functions.map((f, i) => [f.name, i]));
  const objIndex = new Map(m.objects.map((o, i) => [o.name, i]));
  const roomIndex = new Map(m.rooms.map((r, i) => [r.name, i]));
  const assetIndex = new Map(m.assets.map((a, i) => [a.name, i]));
  if (funcIndex.size !== m.functions.length) fail("duplicate function name");
  if (objIndex.size !== m.objects.length) fail("duplicate object name");
  const need = <T>(map: Map<string, T>, name: string, what: string): T =>
    map.get(name) ?? fail(`unknown ${what} ${name}`);

  // Globals, symbols and constants referenced by code.
  const globalNames = new Set(m.globals);
  const symbolNames = new Set(m.symbols);
  const consts: Const[] = [];
  for (const f of m.functions)
    for (const ins of f.code) {
      const spec = operandSpec(opInfo(ins.op));
      if (spec.length !== ins.args.length) fail(`${f.name}: ${ins.op} takes ${spec.length} operands`);
      spec.forEach(([, kind], i) => {
        if (kind === "global") globalNames.add(ins.args[i] as string);
        if (kind === "sym") symbolNames.add(ins.args[i] as string);
        if (kind === "k") consts.push(ins.args[i] as Const);
      });
    }
  const globals = sortedUnique(globalNames);
  const symbols = sortedUnique([...symbolNames, ...m.objects.flatMap((o) => o.slots.map((s) => s.symbol))]);

  const strings = sortedUnique([
    ...m.functions.map((f) => f.name),
    ...globals,
    ...symbols,
    ...consts.filter((c) => c.kind === "string").map((c) => (c as { value: string }).value),
    ...m.objects.map((o) => o.name),
    ...m.rooms.map((r) => r.name),
    ...m.assets.flatMap((a) => [a.name, a.path]),
    ...m.functions.flatMap((f) => f.locs.map((l) => l.file)),
  ]);
  const strIndex = new Map(strings.map((s, i) => [s, i]));
  const str = (s: string) => need(strIndex, s, "string");
  const symIndex = new Map(symbols.map((s, i) => [s, i]));
  const globIndex = new Map(globals.map((s, i) => [s, i]));

  const assetRef = (name: string): number => {
    const a = assetIndex.get(name);
    if (a !== undefined) return ((assetKindCode(m.assets[a].kind) << 24) | a) >>> 0;
    const o = objIndex.get(name);
    if (o !== undefined) return ((ASSET_KIND.object << 24) | o) >>> 0;
    const r = roomIndex.get(name);
    if (r !== undefined) return ((ASSET_KIND.room << 24) | r) >>> 0;
    return fail(`unknown asset, object or room ${name}`);
  };
  const cell = (c: Const): [number, number] => {
    switch (c.kind) {
      case "int":
        return [TAG.INT, range(c.value, -0x80000000, 0x7fffffff, "int constant")];
      case "real":
        return [TAG.REAL, range(c.raw, -0x80000000, 0x7fffffff, "fixed constant")];
      case "string":
        return [TAG.STR, str(c.value)];
      case "asset":
        return [TAG.ASSET, assetRef(c.name) | 0];
    }
  };
  const cellKey = ([t, p]: [number, number]) => `${t}:${p}`;
  const kons = [...new Map(consts.map((c) => [cellKey(cell(c)), cell(c)])).values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1],
  );
  const konsIndex = new Map(kons.map((c, i) => [cellKey(c), i]));

  // CODE and DBG
  const words: number[] = [];
  const funcs: { name: number; start: number; len: number; params: number; regs: number }[] = [];
  const dbg: [number, number, number][] = [];
  for (const f of m.functions) {
    range(f.regs, 0, 64, `${f.name}: regs`);
    range(f.params, 0, f.regs, `${f.name}: params`);
    const start = words.length;
    f.code.forEach((ins, pc) => {
      words.push(
        encodeInstr(ins, pc, f, { env, konsIndex, cellKey: (c) => cellKey(cell(c)), globIndex, funcIndex, symIndex }),
      );
    });
    for (const l of f.locs) dbg.push([start + l.index, str(l.file), l.line]);
    funcs.push({ name: str(f.name), start, len: f.code.length, params: f.params, regs: f.regs });
  }

  const sec: Record<string, Writer> = {};
  for (const t of SECTIONS) sec[t] = new Writer();

  // STRS: count, offsets, then {u16 len, bytes, NUL} records aligned to 4
  {
    const w = sec.STRS;
    w.u32(strings.length);
    const offAt = w.length;
    for (let i = 0; i < strings.length; i++) w.u32(0);
    strings.forEach((s, i) => {
      w.patch32(offAt + i * 4, w.length);
      const b = utf8.encode(s);
      if (b.length > 0xffff) fail("string longer than 65535 bytes");
      w.u16(b.length);
      for (const x of b) w.u8(x);
      w.u8(0);
      w.align4();
    });
  }
  sec.SYMS.u32(symbols.length);
  for (const s of symbols) sec.SYMS.u32(str(s));
  sec.KONS.u32(kons.length);
  for (const [t, p] of kons) {
    sec.KONS.u32(t);
    sec.KONS.u32(p);
  }
  sec.CODE.u32(words.length);
  for (const x of words) sec.CODE.u32(x);
  sec.FUNC.u32(funcs.length);
  for (const f of funcs) {
    sec.FUNC.u32(f.name);
    sec.FUNC.u32(f.start);
    sec.FUNC.u32(f.len);
    sec.FUNC.u8(f.params);
    sec.FUNC.u8(f.regs);
    sec.FUNC.u16(0);
  }
  sec.GLOB.u32(globals.length);
  for (const g of globals) sec.GLOB.u32(str(g));

  // OBJS
  {
    const w = sec.OBJS;
    const n = m.objects.length;
    w.u32(n);
    const offAt = w.length;
    for (let i = 0; i < n; i++) w.u32(0);
    const words32 = Math.ceil(n / 32);
    m.objects.forEach((o, i) => {
      w.patch32(offAt + i * 4, w.length);
      w.u32(str(o.name));
      w.u32(o.parent === null ? -1 : need(objIndex, o.parent, "object"));
      if (o.sprite !== null && m.assets[need(assetIndex, o.sprite, "sprite")].kind !== "sprite")
        fail(`${o.sprite} is not a sprite`);
      w.u32(o.sprite === null ? -1 : need(assetIndex, o.sprite, "sprite"));
      w.u8(o.visible ? 1 : 0);
      w.u8(o.screen === "bottom" ? 1 : 0);
      w.u16(range(o.depth, -32768, 32767, `${o.name}: depth`) & 0xffff);
      w.u16(o.slots.length);
      w.u16(o.events.length);
      const bits = new Array<number>(words32).fill(0);
      const seen = new Set<string>();
      for (let cur: string | null = o.name; cur !== null; cur = m.objects[need(objIndex, cur, "object")].parent) {
        if (seen.has(cur)) fail(`parent loop at ${cur}`);
        seen.add(cur);
        const j = need(objIndex, cur, "object");
        bits[j >>> 5] |= 1 << (j & 31);
      }
      for (const b of bits) w.u32(b);
      const slots = o.slots
        .map((s) => [need(symIndex, s.symbol, "symbol"), range(s.slot, 0, 255, `${o.name}: slot`)] as const)
        .sort((a, b) => a[0] - b[0]);
      for (const [s, slot] of slots) {
        w.u32(s);
        w.u32(slot);
      }
      const events = o.events
        .map((e) => [eventId(e.event, (x) => objIndex.get(x) ?? -1), need(funcIndex, e.func, "function")] as const)
        .sort((a, b) => a[0] - b[0]);
      for (const [id, fn] of events) {
        w.u32(id);
        w.u32(fn);
      }
    });
  }

  // ROOM
  {
    const w = sec.ROOM;
    w.u32(m.rooms.length);
    const offAt = w.length;
    for (let i = 0; i < m.rooms.length; i++) w.u32(0);
    const ref = (name: string | null) => (name === null ? -1 : need(assetIndex, name, "asset"));
    m.rooms.forEach((r, i) => {
      w.patch32(offAt + i * 4, w.length);
      w.u32(str(r.name));
      w.u16(range(r.width, 1, 0xffff, "room width"));
      w.u16(range(r.height, 1, 0xffff, "room height"));
      for (const s of r.screens) {
        w.u32(ref(s.background));
        w.u32(s.viewX);
        w.u32(s.viewY);
      }
      w.u32(r.instances.length);
      for (const inst of r.instances) {
        w.u32(need(objIndex, inst.object, "object"));
        w.u32(inst.x);
        w.u32(inst.y);
        w.u8(inst.screen === "bottom" ? 1 : 0);
        w.u8(0);
        w.u16(0);
        w.u32(inst.creation === null ? -1 : need(funcIndex, inst.creation, "function"));
      }
      for (const s of r.sets) {
        w.u16(s.sprites.length);
        w.u16(s.backgrounds.length);
        for (const a of [...s.sprites, ...s.backgrounds]) w.u32(need(assetIndex, a, "asset"));
      }
      w.u16(r.sounds.length);
      w.u16(0);
      for (const a of r.sounds) w.u32(need(assetIndex, a, "asset"));
    });
  }

  sec.ASET.u32(m.assets.length);
  for (const a of m.assets) {
    sec.ASET.u8(assetKindCode(a.kind));
    sec.ASET.u8(0);
    sec.ASET.u16(0);
    sec.ASET.u32(str(a.name));
    sec.ASET.u32(str(a.path));
    sec.ASET.u32(a.aux);
  }
  sec["DBG "].u32(dbg.length);
  for (const [c, f, l] of dbg.sort((a, b) => a[0] - b[0])) {
    sec["DBG "].u32(c);
    sec["DBG "].u32(f);
    sec["DBG "].u32(l);
  }

  // Header + section table + sections
  const out = new Writer();
  for (const ch of MAGIC) out.u8(ch.charCodeAt(0));
  out.u16(FORMAT_MAJOR);
  out.u16(FORMAT_MINOR);
  out.u32(env.abiHash);
  out.u32(m.seed >>> 0);
  const sizeAt = out.length;
  out.u32(0);
  out.u16(SECTIONS.length);
  out.u16(m.release === true ? FLAG_RELEASE : 0); // flags (ADR-0008): only bit 0 is defined
  out.u32(m.firstRoom === null ? 0xffffffff : need(roomIndex, m.firstRoom, "room"));
  out.u32(0);
  const tableAt = out.length;
  for (let i = 0; i < SECTIONS.length * SECTION_ENTRY_BYTES; i++) out.u8(0);
  SECTIONS.forEach((t, i) => {
    out.align4();
    const at = out.length;
    for (let c = 0; c < 4; c++) out.bytes[tableAt + i * SECTION_ENTRY_BYTES + c] = t.charCodeAt(c);
    out.patch32(tableAt + i * SECTION_ENTRY_BYTES + 4, at);
    out.patch32(tableAt + i * SECTION_ENTRY_BYTES + 8, sec[t].length);
    for (const b of sec[t].bytes) out.u8(b);
  });
  out.align4();
  const sprg = spriteGeometry(m);
  if (sprg !== null) {
    // ADR-0006: the extension table follows the ten sections; its offset takes the reserved word.
    out.patch32(EXTENSION_OFFSET_AT, out.length);
    out.bytes[6] = FORMAT_MINOR_EXTENSIONS & 0xff;
    out.bytes[7] = FORMAT_MINOR_EXTENSIONS >>> 8;
    const extensions = [{ tag: SPRG, body: sprg }];
    out.u32(extensions.length);
    const entriesAt = out.length;
    for (let i = 0; i < extensions.length * EXTENSION_ENTRY_BYTES; i++) out.u8(0);
    extensions.forEach((x, i) => {
      out.align4();
      const at = entriesAt + i * EXTENSION_ENTRY_BYTES;
      for (let c = 0; c < 4; c++) out.bytes[at + c] = x.tag.charCodeAt(c);
      out.patch32(at + 4, out.length);
      out.patch32(at + 8, x.body.length);
      for (const b of x.body.bytes) out.u8(b);
    });
    out.align4();
  }
  out.patch32(sizeAt, out.length);
  return Uint8Array.from(out.bytes);
}

/**
 * The SPRG extension body (ADR-0006): `u32 count` then one 20-byte record per ASET sprite, by asset index.
 * Null when no sprite carries geometry; an error when only some do.
 */
function spriteGeometry(m: DsdbModule): Writer | null {
  const sprites = m.assets.map((a, index) => ({ a, index })).filter(({ a }) => a.kind === "sprite");
  for (const a of m.assets)
    if (a.kind !== "sprite" && a.geometry !== undefined) fail(`${a.name}: only sprites have geometry`);
  const withGeometry = sprites.filter(({ a }) => a.geometry !== undefined);
  if (withGeometry.length === 0) return null;
  if (withGeometry.length !== sprites.length)
    fail("either every sprite has geometry (origin, size, bbox) or none does");
  const w = new Writer();
  w.u32(sprites.length);
  for (const { a, index } of sprites) {
    const g = a.geometry as NonNullable<typeof a.geometry>;
    w.u32(index);
    w.u16(range(g.width, 1, 0xffff, `${a.name}: width`));
    w.u16(range(g.height, 1, 0xffff, `${a.name}: height`));
    for (const [v, what] of [
      [g.originX, "origin x"],
      [g.originY, "origin y"],
      [g.bboxLeft, "bbox left"],
      [g.bboxTop, "bbox top"],
      [g.bboxRight, "bbox right"],
      [g.bboxBottom, "bbox bottom"],
    ] as const)
      w.u16(range(v, -0x8000, 0x7fff, `${a.name}: ${what}`) & 0xffff);
  }
  return w;
}

interface EncodeCtx {
  env: BuiltinsEnv;
  konsIndex: Map<string, number>;
  cellKey: (c: Const) => string;
  globIndex: Map<string, number>;
  funcIndex: Map<string, number>;
  symIndex: Map<string, number>;
}

function encodeInstr(ins: Instr, pc: number, f: Func, ctx: EncodeCtx): number {
  const op = opInfo(ins.op);
  if (op.status === "reserved") fail(`${f.name}: ${ins.op} is reserved`);
  let word = op.number;
  for (const [i, [field, kind]] of operandSpec(op).entries()) {
    const a = ins.args[i];
    let v: number;
    switch (kind) {
      case "reg":
        v = range(a as number, 0, f.regs - 1, `${f.name}@${pc}: register`);
        break;
      case "u8":
        v = range(a as number, 0, 255, `${f.name}@${pc}: operand`);
        break;
      case "s8":
        v = range(a as number, -128, 127, `${f.name}@${pc}: operand`) & 0xff;
        break;
      case "u16":
        v = range(a as number, 0, 0xffff, `${f.name}@${pc}: operand`);
        break;
      case "s16":
        v = range(a as number, -32768, 32767, `${f.name}@${pc}: immediate`) & 0xffff;
        break;
      case "bool":
        v = a ? 1 : 0;
        break;
      case "label":
        v = range((a as number) - (pc + 1), -32768, 32767, `${f.name}@${pc}: jump`) & 0xffff;
        if ((a as number) < 0 || (a as number) > f.code.length) fail(`${f.name}@${pc}: jump outside the function`);
        break;
      case "k":
        v = ctx.konsIndex.get(ctx.cellKey(a as Const)) ?? fail("constant");
        range(v, 0, 0xffff, "constant index");
        break;
      case "builtin":
        v = ctx.env.functionIndex.get(a as string) ?? fail(`${f.name}@${pc}: unknown builtin ${a}`);
        break;
      case "global":
        v = ctx.globIndex.get(a as string) ?? fail(`unknown global ${a}`);
        break;
      case "func":
        v = ctx.funcIndex.get(a as string) ?? fail(`${f.name}@${pc}: unknown function ${a}`);
        break;
      case "sym":
        v = ctx.symIndex.get(a as string) ?? fail(`${f.name}@${pc}: unknown symbol ${a}`);
        break;
      case "bivar":
        v = ctx.env.variableIndex.get(a as string) ?? fail(`${f.name}@${pc}: unknown builtin variable ${a}`);
        break;
      default:
        return fail(`operand kind ${kind}`);
    }
    // Names resolved to indices must still fit their field: 8 bits for A/B/C, 16 for Bx.
    range(v, 0, field === "Bx" || field === "sBx" ? 0xffff : 0xff, `${f.name}@${pc}: ${kind} index`);
    const shift = { A: 8, B: 16, C: 24, Bx: 16, sBx: 16 }[field] ?? fail(`field ${field}`);
    word |= v << shift;
  }
  return word >>> 0;
}

/** Decodes a DSDB. Refuses a file whose ABI hash differs from `env`'s (the runtime's rule). */
export function decode(bytes: Uint8Array, env: BuiltinsEnv): DsdbModule {
  const r = new Reader(bytes);
  const magic = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8());
  if (magic !== MAGIC) fail("not a DSDB file (bad magic)");
  const major = r.u16();
  const minor = r.u16();
  if (minor < FORMAT_MINOR) fail(`DSDB format ${major}.${minor} is older than ${FORMAT_MAJOR}.${FORMAT_MINOR}`);
  if (major !== FORMAT_MAJOR) fail(`DSDB format ${major}.x; this reader handles ${FORMAT_MAJOR}.x`);
  const hash = r.u32();
  if (hash !== env.abiHash)
    fail(`ABI hash ${hash.toString(16)} does not match builtins.json (${env.abiHash.toString(16)})`);
  const seed = r.u32();
  const size = r.u32();
  if (size !== bytes.length) fail(`header size ${size} but file has ${bytes.length} bytes`);
  const nsec = r.u16();
  const flags = r.u16();
  // The runtime's rule (ADR-0008): a reserved flag bit means a newer format this reader must not guess at.
  if ((flags & ~FLAGS_KNOWN) !== 0)
    fail(`header flags 0x${flags.toString(16)} use reserved bits (made by a newer DSDude)`);
  const first = r.u32();
  const extOffset = r.u32();
  const at: Record<string, number> = {};
  for (let i = 0; i < nsec; i++) {
    const tag = String.fromCharCode(r.u8(), r.u8(), r.u8(), r.u8());
    at[tag] = r.u32();
    r.u32();
  }
  const S = (t: string) => new Reader(bytes, at[t] ?? fail(`missing section ${t}`));

  const strs: string[] = [];
  {
    const s = S("STRS");
    const base = s.pos;
    const n = s.u32();
    for (let i = 0; i < n; i++) {
      const o = new Reader(bytes, base + s.u32());
      const len = o.u16();
      strs.push(fromUtf8.decode(bytes.subarray(o.pos, o.pos + len)));
    }
  }
  const list = (t: string) => {
    const s = S(t);
    return Array.from({ length: s.u32() }, () => strs[s.u32()]);
  };
  const symbols = list("SYMS");
  const globals = list("GLOB");
  const kons: [number, number][] = [];
  {
    const s = S("KONS");
    const n = s.u32();
    for (let i = 0; i < n; i++) kons.push([s.u32(), s.s32()]);
  }
  const words: number[] = [];
  {
    const s = S("CODE");
    const n = s.u32();
    for (let i = 0; i < n; i++) words.push(s.u32());
  }
  const assets: DsdbModule["assets"] = [];
  {
    const s = S("ASET");
    const n = s.u32();
    const kinds = ["", "sprite", "background", "sound", "music"] as const;
    for (let i = 0; i < n; i++) {
      const k = s.u8();
      s.u8();
      s.u16();
      assets.push({
        kind: (kinds[k] || fail(`asset kind ${k}`)) as AssetKind,
        name: strs[s.u32()],
        path: strs[s.u32()],
        aux: s.u32(),
      });
    }
    // Extensions (ADR-0006): unknown tags are skipped; SPRG gives sprites their geometry.
    if (extOffset !== 0) {
      const e = new Reader(bytes, extOffset);
      const count = e.u32();
      for (let i = 0; i < count; i++) {
        const tag = String.fromCharCode(e.u8(), e.u8(), e.u8(), e.u8());
        const offset = e.u32();
        e.u32();
        if (tag !== SPRG) continue;
        const g = new Reader(bytes, offset);
        const n = g.u32();
        for (let k = 0; k < n; k++) {
          const asset = assets[g.u32()] ?? fail("SPRG names a missing asset");
          const s16 = () => (g.u16() << 16) >> 16;
          asset.geometry = {
            width: g.u16(),
            height: g.u16(),
            originX: s16(),
            originY: s16(),
            bboxLeft: s16(),
            bboxTop: s16(),
            bboxRight: s16(),
            bboxBottom: s16(),
          };
        }
      }
    }
  }
  const fheads: { name: string; start: number; len: number; params: number; regs: number }[] = [];
  {
    const s = S("FUNC");
    const n = s.u32();
    for (let i = 0; i < n; i++) {
      const name = strs[s.u32()];
      const start = s.u32();
      const len = s.u32();
      const params = s.u8();
      const regs = s.u8();
      s.u16();
      fheads.push({ name, start, len, params, regs });
    }
  }
  const dbg: [number, string, number][] = [];
  {
    const s = S("DBG ");
    const n = s.u32();
    for (let i = 0; i < n; i++) dbg.push([s.u32(), strs[s.u32()], s.u32()]);
  }

  // Objects and rooms first need their names for ASSET constants and collision events.
  const objOffsets: number[] = [];
  {
    const s = S("OBJS");
    const base = s.pos;
    const n = s.u32();
    for (let i = 0; i < n; i++) objOffsets.push(base + s.u32());
  }
  const objNames = objOffsets.map((o) => strs[new Reader(bytes, o).u32()]);
  const roomOffsets: number[] = [];
  {
    const s = S("ROOM");
    const base = s.pos;
    const n = s.u32();
    for (let i = 0; i < n; i++) roomOffsets.push(base + s.u32());
  }
  const roomNames = roomOffsets.map((o) => strs[new Reader(bytes, o).u32()]);

  const constOf = ([t, p]: [number, number]): Const => {
    if (t === TAG.INT) return { kind: "int", value: p };
    if (t === TAG.REAL) return { kind: "real", raw: p };
    if (t === TAG.STR) return { kind: "string", value: strs[p] };
    if (t === TAG.ASSET) {
      const k = (p >>> 24) & 0xff;
      const i = p & 0xffffff;
      const name = k === ASSET_KIND.object ? objNames[i] : k === ASSET_KIND.room ? roomNames[i] : assets[i]?.name;
      return { kind: "asset", name: name ?? fail(`bad asset constant ${p}`) };
    }
    return fail(`constant tag ${t}`);
  };

  const functions: Func[] = fheads.map((h) => ({
    name: h.name,
    params: h.params,
    regs: h.regs,
    code: words
      .slice(h.start, h.start + h.len)
      .map((w, pc) => decodeInstr(w, pc, { env, kons, constOf, globals, symbols, fheads })),
    locs: dbg
      .filter(([c]) => c >= h.start && c < h.start + h.len)
      .map(([c, file, line]) => ({ index: c - h.start, file, line })),
  }));

  const objects: DsdbModule["objects"] = objOffsets.map((off) => {
    const s = new Reader(bytes, off);
    const name = strs[s.u32()];
    const parent = s.s32();
    const sprite = s.s32();
    const visible = s.u8() === 1;
    const screen = s.u8() === 1 ? "bottom" : "top";
    const depth = s.s16();
    const nslots = s.u16();
    const nevents = s.u16();
    s.pos += 4 * Math.ceil(objOffsets.length / 32);
    const slots = Array.from({ length: nslots }, () => ({ symbol: symbols[s.u32()], slot: s.u32() }));
    const events = Array.from({ length: nevents }, () => ({
      event: eventStem(s.u32(), (i) => objNames[i]),
      func: fheads[s.u32()].name,
    }));
    return {
      name,
      parent: parent < 0 ? null : objNames[parent],
      sprite: sprite < 0 ? null : assets[sprite].name,
      visible,
      screen,
      depth,
      slots,
      events,
    };
  });
  const rooms: DsdbModule["rooms"] = roomOffsets.map((off) => {
    const s = new Reader(bytes, off);
    const name = strs[s.u32()];
    const width = s.u16();
    const height = s.u16();
    const screen = () => {
      const bg = s.s32();
      return { background: bg < 0 ? null : assets[bg].name, viewX: s.s32(), viewY: s.s32() };
    };
    const screens: [ReturnType<typeof screen>, ReturnType<typeof screen>] = [screen(), screen()];
    const n = s.u32();
    const instances = Array.from({ length: n }, () => {
      const object = objNames[s.u32()];
      const x = s.s32();
      const y = s.s32();
      const scr = s.u8() === 1 ? ("bottom" as const) : ("top" as const);
      s.u8();
      s.u16();
      const c = s.s32();
      return { object, x, y, screen: scr, creation: c < 0 ? null : fheads[c].name };
    });
    const set = () => {
      const ns = s.u16();
      const nb = s.u16();
      return {
        sprites: Array.from({ length: ns }, () => assets[s.u32()].name),
        backgrounds: Array.from({ length: nb }, () => assets[s.u32()].name),
      };
    };
    const sets: [ReturnType<typeof set>, ReturnType<typeof set>] = [set(), set()];
    const nsnd = s.u16();
    s.u16();
    const sounds = Array.from({ length: nsnd }, () => assets[s.u32()].name);
    return { name, width, height, screens, instances, sets, sounds };
  });

  const used = new Set(objects.flatMap((o) => o.slots.map((x) => x.symbol)));
  return {
    seed,
    ...((flags & FLAG_RELEASE) !== 0 ? { release: true } : {}),
    abiHash: hash,
    globals,
    symbols: symbols.filter((x) => !used.has(x)),
    functions,
    objects,
    rooms,
    firstRoom: first === 0xffffffff ? null : roomNames[first],
    assets,
  };
}

interface DecodeCtx {
  env: BuiltinsEnv;
  kons: [number, number][];
  constOf: (c: [number, number]) => Const;
  globals: string[];
  symbols: string[];
  fheads: { name: string }[];
}

function decodeInstr(w: number, pc: number, ctx: DecodeCtx): Instr {
  const op = byNumber.get(w & 0xff) ?? fail(`unknown opcode number ${w & 0xff}`);
  const args: Operand[] = operandSpec(op).map(([field, kind]) => {
    const raw =
      field === "A"
        ? (w >>> 8) & 0xff
        : field === "B"
          ? (w >>> 16) & 0xff
          : field === "C"
            ? (w >>> 24) & 0xff
            : (w >>> 16) & 0xffff;
    switch (kind) {
      case "s8":
        return (raw << 24) >> 24;
      case "s16":
        return (raw << 16) >> 16;
      case "label":
        return pc + 1 + ((raw << 16) >> 16);
      case "bool":
        return raw ? 1 : 0;
      case "k":
        return ctx.constOf(ctx.kons[raw] ?? fail(`constant index ${raw}`));
      case "builtin":
        return ctx.env.functions[raw] ?? fail(`builtin index ${raw}`);
      case "global":
        return ctx.globals[raw] ?? fail(`global index ${raw}`);
      case "func":
        return ctx.fheads[raw]?.name ?? fail(`function index ${raw}`);
      case "sym":
        return ctx.symbols[raw] ?? fail(`symbol index ${raw}`);
      case "bivar":
        return ctx.env.variables[raw] ?? fail(`builtin variable index ${raw}`);
      default:
        return raw;
    }
  });
  return { op: op.name, args };
}
