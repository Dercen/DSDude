/**
 * The symbolic DSDB model (contract C2, contracts/dsdb.md): names instead of indices, so the assembler, the
 * disassembler and the compiler share one shape. `encode()` assigns every index canonically.
 */

export const MAGIC = "DSDB";
export const FORMAT_MAJOR = 0;
export const FORMAT_MINOR = 1;
/**
 * Format minor of a DSDB that carries an extension table (header offset 28, ADR-0006). Files without extensions
 * keep minor 1, so every DSDB written before the table existed stays byte-identical. ADR-pending ADR-0006.
 */
export const FORMAT_MINOR_EXTENSIONS = 2;
/** Header offset of the extension-table offset (the reserved word before ADR-0006). */
export const EXTENSION_OFFSET_AT = 28;
/** Bytes per extension-table entry: {u8[4] tag; u32 offset; u32 size}. */
export const EXTENSION_ENTRY_BYTES = 12;
/** The sprite-geometry extension (ADR-0006): frame size, origin and bbox per ASET sprite. */
export const SPRG = "SPRG";
/** Bytes per SPRG record: u32 asset index, u16 x2 size, s16 x2 origin, s16 x4 bbox. */
export const SPRG_RECORD_BYTES = 20;
export const HEADER_BYTES = 32;
export const SECTION_ENTRY_BYTES = 12;
/** Section tags in file order. Every DSDB has all ten, possibly empty. */
export const SECTIONS = ["STRS", "SYMS", "KONS", "CODE", "FUNC", "GLOB", "OBJS", "ROOM", "ASET", "DBG "] as const;
export type SectionTag = (typeof SECTIONS)[number];

/** Value-cell tags ({u32 tag; s32 payload}). */
export const TAG = { UNDEF: 0, INT: 1, REAL: 2, BOOL: 3, STR: 4, ARR: 5, INST: 6, ASSET: 7 } as const;

/** Asset kinds, the top 8 bits of an ASSET payload (kind << 24 | index). */
export const ASSET_KIND = { sprite: 1, background: 2, sound: 3, music: 4, object: 5, room: 6 } as const;
export type AssetKind = "sprite" | "background" | "sound" | "music";

/** Event kinds in contracts/events.md order; event id = kind << 16 | arg. */
export const EVENT_KINDS = [
  "create",
  "destroy",
  "begin_step",
  "step",
  "end_step",
  "alarm",
  "draw",
  "collision",
  "button_pressed",
  "button_released",
  "button_held",
  "touch_pressed",
  "touch_released",
  "touch_held",
  "global_touch_pressed",
  "global_touch_released",
  "global_touch_held",
  "game_start",
  "game_end",
  "room_start",
  "room_end",
  "animation_end",
  "outside_room",
  "user",
] as const;

/** Button order for button_* events and the btn_* constants. */
export const BUTTONS = ["a", "b", "x", "y", "l", "r", "start", "select", "up", "down", "left", "right"] as const;

export type Const =
  | { kind: "int"; value: number }
  /** Q20.12 raw value (value * 4096). */
  | { kind: "real"; raw: number }
  | { kind: "string"; value: string }
  /** A sprite/background/sound/music asset, an object or a room, by name. */
  | { kind: "asset"; name: string };

/** One operand: a number (register, immediate, jump target index) or a name, or a constant (LOADK). */
export type Operand = number | string | Const;

export interface Instr {
  op: string;
  /** In opcodes.json operand order. Jump targets are absolute instruction indices within the function. */
  args: Operand[];
}

export interface Loc {
  /** First instruction index this location applies to. */
  index: number;
  file: string;
  line: number;
}

export interface Func {
  name: string;
  params: number;
  /** Frame size, <= 64. */
  regs: number;
  code: Instr[];
  locs: Loc[];
}

export interface ObjectDef {
  name: string;
  parent: string | null;
  sprite: string | null;
  visible: boolean;
  screen: "top" | "bottom";
  depth: number;
  slots: { symbol: string; slot: number }[];
  /** Event stem (create, alarm_0, collision_obj_pipe, button_pressed_a, user_3, ...) -> function name. */
  events: { event: string; func: string }[];
}

export interface RoomScreenDef {
  background: string | null;
  viewX: number;
  viewY: number;
}

export interface RoomDef {
  name: string;
  width: number;
  height: number;
  screens: [RoomScreenDef, RoomScreenDef];
  instances: { object: string; x: number; y: number; screen: "top" | "bottom"; creation: string | null }[];
  /** Per-screen asset set (C3): sprites and backgrounds loaded for that screen. */
  sets: [{ sprites: string[]; backgrounds: string[] }, { sprites: string[]; backgrounds: string[] }];
  sounds: string[];
}

/** A sprite's geometry from its sprite.json (ADR-0006): what collisions, drawing and bbox_* need at run time. */
export interface SpriteGeometry {
  /** Frame size in pixels. */
  width: number;
  height: number;
  /** The origin inside a frame: the point placed at the instance's x, y. */
  originX: number;
  originY: number;
  /** The bbox in frame pixels, inclusive. */
  bboxLeft: number;
  bboxTop: number;
  bboxRight: number;
  bboxBottom: number;
}

export interface AssetDef {
  kind: AssetKind;
  name: string;
  /** NitroFS path (e.g. "gfx/spr_bird.grf") or "" for sounds in the soundbank. */
  path: string;
  /** Kind-specific: sprite frame count, soundbank id; 0 otherwise. Refined by C3 (T1). */
  aux: number;
  /** Sprites only: geometry written to the SPRG extension (ADR-0006). All sprites of a module have it, or none. */
  geometry?: SpriteGeometry;
}

export interface DsdbModule {
  seed: number;
  /** Stamped by encode() from the builtins environment; decode() fills it from the file. */
  abiHash?: number;
  globals: string[];
  /** Symbols beyond those the objects' slot tables name (for GETDYN/SETDYN). */
  symbols: string[];
  functions: Func[];
  objects: ObjectDef[];
  rooms: RoomDef[];
  firstRoom: string | null;
  assets: AssetDef[];
}

export function emptyModule(): DsdbModule {
  return { seed: 0, globals: [], symbols: [], functions: [], objects: [], rooms: [], firstRoom: null, assets: [] };
}

/** event stem -> id; `objectIndex` resolves collision targets. */
export function eventId(stem: string, objectIndex: (name: string) => number): number {
  const m = /^(alarm|user)_([0-9]+)$/.exec(stem);
  if (m) return (EVENT_KINDS.indexOf(m[1] as "alarm") << 16) | Number(m[2]);
  const b = /^(button_pressed|button_released|button_held)_([a-z]+)$/.exec(stem);
  if (b) {
    const i = BUTTONS.indexOf(b[2] as "a");
    if (i < 0) throw new Error(`unknown button in event ${stem}`);
    return (EVENT_KINDS.indexOf(b[1] as "button_held") << 16) | i;
  }
  if (stem.startsWith("collision_")) {
    const i = objectIndex(stem.slice("collision_".length));
    if (i < 0) throw new Error(`unknown object in event ${stem}`);
    return (EVENT_KINDS.indexOf("collision") << 16) | i;
  }
  const k = EVENT_KINDS.indexOf(stem as "create");
  if (k < 0 || ["alarm", "user", "collision"].includes(stem)) throw new Error(`unknown event ${stem}`);
  return k << 16;
}

export function eventStem(id: number, objectName: (index: number) => string): string {
  const kind = EVENT_KINDS[id >>> 16];
  const arg = id & 0xffff;
  if (kind === undefined) throw new Error(`unknown event id ${id}`);
  if (kind === "alarm" || kind === "user") return `${kind}_${arg}`;
  if (kind.startsWith("button_")) return `${kind}_${BUTTONS[arg]}`;
  if (kind === "collision") return `collision_${objectName(arg)}`;
  return kind;
}
