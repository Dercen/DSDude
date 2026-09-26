/**
 * The `.dsda` text form (contract C2, grammar in contracts/dsdb.md): assemble() parses it into the symbolic
 * model, disassemble() prints the canonical form, so dis(asm(text)) === text for canonical input.
 * `.dsda` names builtins and never holds the ABI hash or numeric builtin ids: encode() stamps them.
 */
import type { BuiltinsEnv } from "./abi.ts";
import { compareUtf8, DsdbError, decode, encode } from "./encode.ts";
import { OPCODES } from "./gen/opcodes.ts";
import {
  type AssetDef,
  type AssetKind,
  type Const,
  type DsdbModule,
  emptyModule,
  FORMAT_MAJOR,
  FORMAT_MINOR,
  type Func,
  type ObjectDef,
  type Operand,
  type RoomDef,
  type SpriteGeometry,
} from "./model.ts";

const VERSION = `${FORMAT_MAJOR}.${FORMAT_MINOR}`;
const opsByName = new Map(OPCODES.map((o) => [o.name, o]));
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Splits a line into tokens: quoted strings stay whole, commas separate, `;` starts a comment. */
function tokenize(line: string, lineNo: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i];
    if (c === ";") break;
    if (c === " " || c === "\t" || c === ",") {
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j += line[j] === "\\" ? 2 : 1;
      if (j >= line.length) throw new DsdbError(`line ${lineNo}: unterminated string`);
      out.push(line.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < line.length && !" \t,;".includes(line[j])) j++;
    out.push(line.slice(i, j));
    i = j;
  }
  return out;
}

/**
 * Parses a sprite's optional `origin=X,Y size=W,H bbox=L,T,R,B` fields (ADR-0006). The tokenizer splits on commas,
 * so each `key=first` token is followed by the rest of its numbers. All three fields, or none.
 */
function parseGeometry(tokens: string[], where: string): SpriteGeometry | null {
  if (tokens.length === 0) return null;
  const fields = new Map<string, number[]>();
  let current: number[] | null = null;
  for (const tok of tokens) {
    const kv = /^(origin|size|bbox)=(-?[0-9]+)$/.exec(tok);
    if (kv !== null) {
      current = [Number(kv[2])];
      fields.set(kv[1] as string, current);
    } else if (/^-?[0-9]+$/.test(tok) && current !== null) current.push(Number(tok));
    else throw new DsdbError(`${where}: unexpected ${tok} after the asset`);
  }
  const origin = fields.get("origin");
  const size = fields.get("size");
  const bbox = fields.get("bbox");
  if (origin?.length !== 2 || size?.length !== 2 || bbox?.length !== 4)
    throw new DsdbError(`${where}: a sprite needs all of origin=X,Y size=W,H bbox=L,T,R,B`);
  const [originX, originY] = origin as [number, number];
  const [width, height] = size as [number, number];
  const [bboxLeft, bboxTop, bboxRight, bboxBottom] = bbox as [number, number, number, number];
  return { width, height, originX, originY, bboxLeft, bboxTop, bboxRight, bboxBottom };
}

/** Parses a decimal fraction to Q20.12, rounding half away from zero. */
export function parseFixed(text: string): number {
  const m = /^(-?)([0-9]+)\.([0-9]+)$/.exec(text);
  if (!m) throw new DsdbError(`bad fixed-point literal ${text}`);
  const scale = 10n ** BigInt(m[3].length);
  const num = (BigInt(m[2]) * scale + BigInt(m[3])) * 4096n;
  let raw = num / scale;
  if ((num % scale) * 2n >= scale) raw += 1n;
  const v = Number(m[1] ? -raw : raw);
  if (v < -0x80000000 || v > 0x7fffffff) throw new DsdbError(`fixed-point literal ${text} is out of range`);
  return v;
}

/** Prints a Q20.12 raw value as its exact decimal, always with a point ("2.0", "0.10009765625"). */
export function formatFixed(raw: number): string {
  const neg = raw < 0;
  const a = BigInt(Math.abs(raw));
  const whole = a / 4096n;
  const frac = ((a % 4096n) * 244140625n).toString().padStart(12, "0").replace(/0+$/, "") || "0";
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

function parseConst(tok: string, where: string): Const {
  if (tok.startsWith('"')) return { kind: "string", value: JSON.parse(tok) as string };
  if (tok.startsWith("@") && NAME.test(tok.slice(1))) return { kind: "asset", name: tok.slice(1) };
  if (/^-?[0-9]+$/.test(tok)) return { kind: "int", value: Number(tok) };
  if (/^-?[0-9]+\.[0-9]+$/.test(tok)) return { kind: "real", raw: parseFixed(tok) };
  throw new DsdbError(`${where}: bad constant ${tok}`);
}

function formatConst(c: Const): string {
  switch (c.kind) {
    case "int":
      return String(c.value);
    case "real":
      return formatFixed(c.raw);
    case "string":
      return JSON.stringify(c.value);
    case "asset":
      return `@${c.name}`;
  }
}

const orDash = (s: string | null) => s ?? "-";
const dash = (s: string): string | null => (s === "-" ? null : s);
const list = (s: string): string[] => (s === "-" ? [] : s.split("+"));
const screenIdx = (s: string, where: string): 0 | 1 =>
  s === "top"
    ? 0
    : s === "bottom"
      ? 1
      : (() => {
          throw new DsdbError(`${where}: screen must be top or bottom`);
        })();

export function assemble(text: string): DsdbModule {
  const m = emptyModule();
  const lines = text.replace(/\r/g, "").split("\n");
  let func:
    | (Func & { labels: Map<string, number>; pending: { ins: number; arg: number; label: string; line: number }[] })
    | null = null;
  let obj: ObjectDef | null = null;
  let room: RoomDef | null = null;
  let sawHeader = false;

  const int = (t: string | undefined, where: string): number => {
    if (t === undefined || !/^-?[0-9]+$/.test(t))
      throw new DsdbError(`${where}: expected a number, got ${t ?? "nothing"}`);
    return Number(t);
  };
  const name = (t: string | undefined, where: string): string => {
    if (t === undefined || !NAME.test(t)) throw new DsdbError(`${where}: expected a name, got ${t ?? "nothing"}`);
    return t;
  };

  lines.forEach((raw, i) => {
    const where = `line ${i + 1}`;
    const t = tokenize(raw, i + 1);
    if (!t.length) return;
    const [head, ...rest] = t;
    if (!sawHeader) {
      if (head !== ".dsda" || rest[0] !== VERSION)
        throw new DsdbError(`${where}: a .dsda file starts with ".dsda ${VERSION}"`);
      sawHeader = true;
      return;
    }
    if (func) {
      if (head === ".end") {
        for (const p of func.pending) {
          const target = func.labels.get(p.label);
          if (target === undefined) throw new DsdbError(`line ${p.line}: unknown label ${p.label}`);
          func.code[p.ins].args[p.arg] = target;
        }
        const { labels: _l, pending: _p, ...f } = func;
        m.functions.push(f);
        func = null;
        return;
      }
      if (head.endsWith(":") && rest.length === 0) {
        const label = name(head.slice(0, -1), where);
        if (func.labels.has(label)) throw new DsdbError(`${where}: label ${label} defined twice`);
        func.labels.set(label, func.code.length);
        return;
      }
      if (head === ".loc") {
        func.locs.push({
          index: func.code.length,
          file: JSON.parse(rest[0] ?? '""') as string,
          line: int(rest[1], where),
        });
        return;
      }
      const op = opsByName.get(head);
      if (!op) throw new DsdbError(`${where}: unknown instruction ${head}`);
      const kinds = op.operands.map((o) => o.split(":")[1]);
      if (rest.length !== kinds.length) throw new DsdbError(`${where}: ${head} takes ${kinds.length} operand(s)`);
      const args: Operand[] = kinds.map((k, n) => {
        const tok = rest[n];
        switch (k) {
          case "reg": {
            const r = /^r([0-9]+)$/.exec(tok);
            if (!r) throw new DsdbError(`${where}: expected a register, got ${tok}`);
            return Number(r[1]);
          }
          case "bool":
            if (tok !== "true" && tok !== "false") throw new DsdbError(`${where}: expected true or false`);
            return tok === "true" ? 1 : 0;
          case "k":
            return parseConst(tok, where);
          case "label":
            func?.pending.push({ ins: func.code.length, arg: n, label: name(tok, where), line: i + 1 });
            return 0;
          case "builtin":
          case "global":
          case "func":
          case "sym":
          case "bivar":
            return name(tok, where);
          default:
            return int(tok, where);
        }
      });
      func.code.push({ op: head, args });
      return;
    }
    if (obj) {
      if (head === ".end") {
        m.objects.push(obj);
        obj = null;
      } else if (head === ".slot") obj.slots.push({ symbol: name(rest[0], where), slot: int(rest[1], where) });
      else if (head === ".event") obj.events.push({ event: rest[0] ?? "", func: name(rest[1], where) });
      else throw new DsdbError(`${where}: unexpected ${head} inside .object`);
      return;
    }
    if (room) {
      if (head === ".end") {
        m.rooms.push(room);
        room = null;
      } else if (head === ".screen") {
        room.screens[screenIdx(rest[0], where)] = {
          background: dash(rest[1] ?? "-"),
          viewX: int(rest[2], where),
          viewY: int(rest[3], where),
        };
      } else if (head === ".instance") {
        room.instances.push({
          object: name(rest[0], where),
          x: int(rest[1], where),
          y: int(rest[2], where),
          screen: screenIdx(rest[3], where) ? "bottom" : "top",
          creation: dash(rest[4] ?? "-"),
        });
      } else if (head === ".set") {
        room.sets[screenIdx(rest[0], where)] = { sprites: list(rest[1] ?? "-"), backgrounds: list(rest[2] ?? "-") };
      } else if (head === ".sounds") room.sounds = list(rest[0] ?? "-");
      else throw new DsdbError(`${where}: unexpected ${head} inside .room`);
      return;
    }
    switch (head) {
      case ".seed":
        m.seed = int(rest[0], where);
        return;
      case ".global":
        m.globals.push(name(rest[0], where));
        return;
      case ".symbol":
        m.symbols.push(name(rest[0], where));
        return;
      case ".asset": {
        const kind = rest[0] as AssetKind;
        if (!["sprite", "background", "sound", "music"].includes(kind))
          throw new DsdbError(`${where}: bad asset kind ${kind}`);
        const asset: AssetDef = {
          kind,
          name: name(rest[1], where),
          path: JSON.parse(rest[2] ?? '""') as string,
          aux: int(rest[3], where),
        };
        const geometry = parseGeometry(rest.slice(4), where);
        if (geometry !== null) {
          if (kind !== "sprite") throw new DsdbError(`${where}: only sprites have origin, size and bbox`);
          asset.geometry = geometry;
        }
        m.assets.push(asset);
        return;
      }
      case ".func":
        func = {
          name: name(rest[0], where),
          params: int(rest[1], where),
          regs: int(rest[2], where),
          code: [],
          locs: [],
          labels: new Map(),
          pending: [],
        };
        return;
      case ".object": {
        const kv = Object.fromEntries(rest.slice(1).map((x) => x.split("=") as [string, string]));
        obj = {
          name: name(rest[0], where),
          sprite: dash(kv.sprite ?? "-"),
          parent: dash(kv.parent ?? "-"),
          visible: kv.visible !== "0",
          screen: screenIdx(kv.screen ?? "top", where) ? "bottom" : "top",
          depth: int(kv.depth ?? "0", where),
          slots: [],
          events: [],
        };
        return;
      }
      case ".room":
        room = {
          name: name(rest[0], where),
          width: int(rest[1], where),
          height: int(rest[2], where),
          screens: [
            { background: null, viewX: 0, viewY: 0 },
            { background: null, viewX: 0, viewY: 0 },
          ],
          instances: [],
          sets: [
            { sprites: [], backgrounds: [] },
            { sprites: [], backgrounds: [] },
          ],
          sounds: [],
        };
        return;
      case ".first":
        m.firstRoom = name(rest[0], where);
        return;
      default:
        throw new DsdbError(`${where}: unexpected ${head}`);
    }
  });
  if (!sawHeader) throw new DsdbError(`empty file: a .dsda file starts with ".dsda ${VERSION}"`);
  if (func || obj || room) throw new DsdbError("missing .end at the end of the file");
  return m;
}

/** Prints the canonical `.dsda` form of a module. */
export function disassemble(m: DsdbModule): string {
  const out: string[] = [`.dsda ${VERSION}`, `.seed ${m.seed >>> 0}`];
  for (const g of [...new Set(m.globals)].sort(compareUtf8)) out.push(`.global ${g}`);
  for (const s of [...new Set(m.symbols)].sort(compareUtf8)) out.push(`.symbol ${s}`);
  for (const a of m.assets) {
    const g = a.geometry;
    const geometry =
      g === undefined
        ? ""
        : ` origin=${g.originX},${g.originY} size=${g.width},${g.height} bbox=${g.bboxLeft},${g.bboxTop},${g.bboxRight},${g.bboxBottom}`;
    out.push(`.asset ${a.kind} ${a.name} ${JSON.stringify(a.path)} ${a.aux}${geometry}`);
  }
  for (const f of m.functions) {
    out.push("", `.func ${f.name} ${f.params} ${f.regs}`);
    const op = (n: string) =>
      opsByName.get(n) ??
      (() => {
        throw new DsdbError(`unknown opcode ${n}`);
      })();
    const targets = new Set<number>();
    for (const ins of f.code)
      op(ins.op).operands.forEach((o, n) => {
        if (o.endsWith(":label")) targets.add(ins.args[n] as number);
      });
    const labelOf = new Map([...targets].sort((a, b) => a - b).map((t, n) => [t, `L${n}`]));
    const locAt = new Map(f.locs.map((l) => [l.index, l]));
    for (let pc = 0; pc <= f.code.length; pc++) {
      const label = labelOf.get(pc);
      if (label) out.push(`  ${label}:`);
      const loc = locAt.get(pc);
      if (loc && pc < f.code.length) out.push(`    .loc ${JSON.stringify(loc.file)} ${loc.line}`);
      if (pc === f.code.length) break;
      const ins = f.code[pc];
      const kinds = op(ins.op).operands.map((o) => o.split(":")[1]);
      const args = ins.args.map((a, n) => {
        switch (kinds[n]) {
          case "reg":
            return `r${a}`;
          case "bool":
            return a ? "true" : "false";
          case "k":
            return formatConst(a as Const);
          case "label":
            return labelOf.get(a as number) as string;
          default:
            return String(a);
        }
      });
      out.push(`    ${ins.op}${args.length ? ` ${args.join(", ")}` : ""}`);
    }
    out.push(".end");
  }
  for (const o of m.objects) {
    out.push(
      "",
      `.object ${o.name} sprite=${orDash(o.sprite)} parent=${orDash(o.parent)} visible=${o.visible ? 1 : 0} screen=${o.screen} depth=${o.depth}`,
    );
    for (const s of o.slots) out.push(`    .slot ${s.symbol} ${s.slot}`);
    for (const e of o.events) out.push(`    .event ${e.event} ${e.func}`);
    out.push(".end");
  }
  const plus = (xs: string[]) => (xs.length ? xs.join("+") : "-");
  for (const r of m.rooms) {
    out.push("", `.room ${r.name} ${r.width} ${r.height}`);
    r.screens.forEach((s, n) => {
      out.push(`    .screen ${n ? "bottom" : "top"} ${orDash(s.background)} ${s.viewX} ${s.viewY}`);
    });
    for (const i of r.instances) out.push(`    .instance ${i.object} ${i.x} ${i.y} ${i.screen} ${orDash(i.creation)}`);
    r.sets.forEach((s, n) => {
      out.push(`    .set ${n ? "bottom" : "top"} ${plus(s.sprites)} ${plus(s.backgrounds)}`);
    });
    out.push(`    .sounds ${plus(r.sounds)}`);
    out.push(".end");
  }
  if (m.firstRoom !== null) out.push("", `.first ${m.firstRoom}`);
  return `${out.join("\n")}\n`;
}

/** .dsda text -> DSDB bytes. */
export const assembleToBytes = (text: string, env: BuiltinsEnv): Uint8Array => encode(assemble(text), env);
/** DSDB bytes -> canonical .dsda text. */
export const disassembleBytes = (bytes: Uint8Array, env: BuiltinsEnv): string => disassemble(decode(bytes, env));
