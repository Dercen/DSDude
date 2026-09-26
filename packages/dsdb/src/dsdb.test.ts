import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { abiHash, abiLine, type BuiltinsFile, builtinsEnv, fnv1a32 } from "./abi.ts";
import { assemble, disassemble, formatFixed, parseFixed } from "./asm.ts";
import { decode, encode } from "./encode.ts";
import { OPCODES } from "./gen/opcodes.ts";
import { eventId, eventStem } from "./model.ts";

const repo = resolve(import.meta.dirname, "../../..");
const builtins = JSON.parse(readFileSync(resolve(repo, "contracts/builtins.json"), "utf8")) as BuiltinsFile;
const env = builtinsEnv(builtins);
const roundTrip = (text: string) => disassemble(decode(encode(assemble(text), env), env));

const PROJECT = `.dsda 0.1
.seed 7
.global score
.symbol spare
.asset sprite spr_bird "gfx/spr_bird.grf" 3
.asset sprite spr_pipe "gfx/spr_pipe.grf" 1
.asset sound snd_flap "" 0

.func obj_bird_create 0 2
    .loc "objects/obj_bird/create.dss" 2
    LOADK r0, 0.199951171875
    LOADI r1, 0
    SETGLOB r1, score
    RET r0, 0
.end

.func obj_bird_step 0 3
    .loc "objects/obj_bird/step.dss" 1
    LOADI r0, 10
  L0:
    LOADI r1, 0
    GT r2, r0, r1
    JMPF r2, L1
    LOADI r1, 1
    SUB r0, r0, r1
    JMP L0
  L1:
    LOADK r1, @obj_pipe
    LOADK r2, @snd_flap
    LOADK r1, -100000
    LOADK r1, "Score: \\"x\\""
    CALLN r1, 1, show_debug_message
    RET r0, 0
.end

.func obj_ctrl_alarm_0 0 1
    LOADK r0, @rm_game
    RET r0, 1
.end

.object obj_bird sprite=spr_bird parent=- visible=1 screen=top depth=0
    .slot alive 1
    .slot flap_power 0
    .event create obj_bird_create
    .event step obj_bird_step
    .event collision_obj_pipe obj_bird_step
.end

.object obj_pipe sprite=spr_pipe parent=obj_bird visible=1 screen=bottom depth=-5
.end

.object obj_ctrl sprite=- parent=- visible=0 screen=top depth=0
    .event alarm_0 obj_ctrl_alarm_0
    .event button_pressed_a obj_ctrl_alarm_0
    .event user_3 obj_ctrl_alarm_0
.end

.room rm_game 256 192
    .screen top - 0 0
    .screen bottom - 0 8
    .instance obj_bird 64 96 top -
    .instance obj_ctrl 0 0 top obj_ctrl_alarm_0
    .set top spr_bird+spr_pipe -
    .set bottom - -
    .sounds snd_flap
.end

.first rm_game
`;

describe("hello.dsda", () => {
  const text = readFileSync(resolve(repo, "fixtures/bytecode/hello.dsda"), "utf8");
  const bytes = new Uint8Array(readFileSync(resolve(repo, "fixtures/bytecode/hello.dsdb")));

  it("assembles to the committed hello.dsdb and disassembles back byte for byte", () => {
    expect(Buffer.from(encode(assemble(text), env)).equals(Buffer.from(bytes))).toBe(true);
    expect(disassemble(decode(bytes, env))).toBe(text);
  });

  it("uses only stable opcodes and is a program-form DSDB", () => {
    const m = decode(bytes, env);
    const stable = new Set(OPCODES.filter((o) => o.status === "stable").map((o) => o.name));
    expect(m.functions[0].name).toBe("__main");
    expect(m.functions.flatMap((f) => f.code).every((i) => stable.has(i.op))).toBe(true);
    expect(m.objects).toEqual([]);
    expect(m.rooms).toEqual([]);
    expect(m.firstRoom).toBeNull();
  });

  it("has the header of contracts/dsdb.md", () => {
    const v = new DataView(bytes.buffer, bytes.byteOffset);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("DSDB");
    expect(v.getUint16(4, true)).toBe(0);
    expect(v.getUint16(6, true)).toBe(1);
    expect(v.getUint32(8, true)).toBe(env.abiHash);
    expect(v.getUint32(16, true)).toBe(bytes.length);
    expect(v.getUint16(20, true)).toBe(10);
    expect(v.getUint32(24, true)).toBe(0xffffffff);
  });
});

describe("conformance v0-01 (hand-assembled)", () => {
  const text = readFileSync(resolve(repo, "fixtures/bytecode/conformance/v0-01.dsda"), "utf8");
  const bytes = new Uint8Array(readFileSync(resolve(repo, "fixtures/bytecode/conformance/v0-01.dsdb")));

  it("assembles with stable opcodes only and round-trips byte for byte", () => {
    const stable = new Set(OPCODES.filter((o) => o.status === "stable").map((o) => o.name));
    const m = assemble(text);
    expect(m.functions.flatMap((f) => f.code).every((i) => stable.has(i.op))).toBe(true);
    expect(Buffer.from(encode(m, env)).equals(Buffer.from(bytes))).toBe(true);
    expect(disassemble(decode(bytes, env))).toBe(text);
  });
});

describe("CLIs", () => {
  const run = (cli: string, ...args: string[]) =>
    spawnSync(process.execPath, [resolve(import.meta.dirname, cli), ...args], {
      cwd: repo,
      encoding: "utf8",
      timeout: 30_000,
    });

  it("dsdb-dis prints to stdout without -o, and dsdb-asm writes -o", () => {
    const dis = run("cli-dis.ts", "fixtures/bytecode/hello.dsdb");
    expect(dis.status).toBe(0);
    expect(dis.stdout).toBe(readFileSync(resolve(repo, "fixtures/bytecode/hello.dsda"), "utf8"));
    const out = resolve(tmpdir(), `dsdb-cli-${process.pid}.dsdb`);
    const asm = run("cli-asm.ts", "fixtures/bytecode/hello.dsda", "-o", out);
    expect(asm.status).toBe(0);
    expect(readFileSync(out).equals(readFileSync(resolve(repo, "fixtures/bytecode/hello.dsdb")))).toBe(true);
    rmSync(out, { force: true });
    expect(run("cli-asm.ts", "fixtures/bytecode/hello.dsda").status).toBe(2);
  });
});

describe("project-form round trip", () => {
  it("dis(decode(encode(asm(text)))) === text", () => {
    expect(roundTrip(PROJECT)).toBe(PROJECT);
  });

  it("encode(decode(bytes)) === bytes", () => {
    const bytes = encode(assemble(PROJECT), env);
    expect(Buffer.from(encode(decode(bytes, env), env)).equals(Buffer.from(bytes))).toBe(true);
  });

  it("is canonical whatever order globals and slots are written in", () => {
    const shuffled = PROJECT.replace(".global score\n", "").replace(
      "    .slot alive 1\n    .slot flap_power 0\n",
      "    .slot flap_power 0\n    .slot alive 1\n",
    );
    expect(Buffer.from(encode(assemble(shuffled), env)).equals(Buffer.from(encode(assemble(PROJECT), env)))).toBe(true);
  });
});

describe("errors", () => {
  const fn = (body: string) => `.dsda 0.1\n.seed 0\n\n.func f 0 2\n${body}\n.end\n`;
  const enc = (t: string) => () => encode(assemble(t), env);
  it("rejects unknown builtins, missing operands, bad registers and unknown labels", () => {
    expect(enc(fn("    CALLN r0, 0, no_such_builtin"))).toThrow(/unknown builtin/);
    // Opcodes 0.4.0 has no reserved numbers left (51-54 are stable); ADDII now needs its three registers.
    expect(enc(fn("    ADDII r0, r1, r1\n    RET r0, 0"))).not.toThrow();
    expect(enc(fn("    ADDII"))).toThrow();
    expect(enc(fn("    MOV r0, r2"))).toThrow(/register/);
    expect(() => assemble(fn("    JMP nowhere"))).toThrow(/unknown label/);
    expect(() => assemble(".dsda 9.9\n")).toThrow(/starts with/);
  });
  it("writes .release as header flags bit 0 and round-trips it (ADR-0008)", () => {
    /** Header offset of the u16 flags. */
    const FLAGS_AT = 22;
    const debug = fn("    RET r0, 0");
    const release = debug.replace(".seed 0\n", ".seed 0\n.release\n");
    const flags = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset).getUint16(FLAGS_AT, true);
    expect(flags(encode(assemble(debug), env))).toBe(0);
    const bytes = encode(assemble(release), env);
    expect(flags(bytes)).toBe(1);
    expect(disassemble(decode(bytes, env))).toBe(release);
    expect(disassemble(assemble(debug))).toBe(debug);
    // Bits 1-15 are reserved: a reader refuses them, like the runtime's loader (R581).
    const future = bytes.slice();
    new DataView(future.buffer).setUint16(FLAGS_AT, 0x3, true);
    expect(() => decode(future, env)).toThrow(/reserved bits/);
    expect(() => assemble(release.replace(".release", ".release 1"))).toThrow(/takes nothing/);
  });
  it("refuses a DSDB with another ABI hash", () => {
    const bytes = encode(assemble(fn("    RET r0, 0")), env);
    expect(() => decode(bytes, { ...env, abiHash: env.abiHash ^ 1 })).toThrow(/ABI hash/);
  });
});

describe("ABI hash", () => {
  it("is FNV-1a 32 over the canonical lines", () => {
    expect(fnv1a32(new TextEncoder().encode(""))).toBe(0x811c9dc5);
    expect(fnv1a32(new TextEncoder().encode("a"))).toBe(0xe40c292c);
    const floor = builtins.entries.find((e) => e.name === "floor");
    expect(floor && abiLine(floor)).toBe(`${floor?.id}|floor|function|number|1|1|int||`);
    const alarm = builtins.entries.find((e) => e.name === "alarm");
    expect(alarm && abiLine(alarm)).toBe(`${alarm?.id}|alarm|variable||||int|instance|`);
    const noone = builtins.entries.find((e) => e.name === "noone");
    expect(noone && abiLine(noone)).toBe(`${noone?.id}|noone|constant||||instance||-4`);
  });
  it("ignores doc/example and alias/unsupported entries", () => {
    const edited = builtins.entries.map((e) => ({ ...e, doc: "x", example: "y" }));
    const appended = [...builtins.entries, { id: 9999, name: "image_alpha", kind: "unsupported" as const }];
    expect(abiHash(edited)).toBe(env.abiHash);
    expect(abiHash(appended)).toBe(env.abiHash);
    const renamed = builtins.entries.map((e) => (e.name === "floor" ? { ...e, name: "flr" } : e));
    expect(abiHash(renamed)).not.toBe(env.abiHash);
  });
});

describe("helpers", () => {
  it("formats and parses Q20.12 exactly", () => {
    expect(formatFixed(6144)).toBe("1.5");
    expect(formatFixed(8192)).toBe("2.0");
    expect(formatFixed(-410)).toBe("-0.10009765625");
    expect(parseFixed("0.1")).toBe(410);
    expect(parseFixed("-1.5")).toBe(-6144);
    expect(parseFixed(formatFixed(12345))).toBe(12345);
  });
  it("maps event stems to kind << 16 | arg and back", () => {
    const objs = ["obj_a", "obj_b"];
    const idx = (n: string) => objs.indexOf(n);
    for (const s of ["create", "step", "alarm_7", "collision_obj_b", "button_held_select", "user_0", "outside_room"])
      expect(eventStem(eventId(s, idx), (i) => objs[i])).toBe(s);
    expect(eventId("alarm_2", idx)).toBe((5 << 16) | 2);
    expect(() => eventId("jump", idx)).toThrow();
  });
});

describe("ADR-0005 operand kinds: sym and bivar", () => {
  const TEXT = `.dsda 0.1
.seed 0
.symbol score

.func f 0 3
    LOADI r1, -2
    GETDYN r0, r1, score
    SETDYN r0, r1, score
    GETBI r0, x
    SETBI r0, room_width
    LOADI r2, 0
    GETBIX r0, alarm, r2
    SETBIX r0, alarm, r2
    GETBIO r0, r1, vspeed
    SETBIO r0, r1, hspeed
    RET r0, 0
.end
`;

  it("round-trips symbols and builtin variables by name", () => {
    expect(roundTrip(TEXT)).toBe(TEXT);
  });

  it("encodes a symbol as its SYMS index and a builtin variable as its dense index", () => {
    const bytes = encode(assemble(TEXT), env);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Section table entry 3 is CODE: {tag, offset, size}; its first word is the count, then the instructions.
    const codeOffset = view.getUint32(32 + 3 * 12 + 4, true);
    const word = (pc: number) => view.getUint32(codeOffset + 4 + pc * 4, true);
    expect(word(1) >>> 24).toBe(0); // GETDYN C = symbol 0 ("score", the only symbol)
    expect(word(3) >>> 16).toBe(env.variableIndex.get("x")); // GETBI Bx = dense index of x
    expect((word(6) >>> 16) & 0xff).toBe(env.variableIndex.get("alarm")); // GETBIX B = dense index of alarm
    expect(env.variableIndex.get("id")).toBe(0);
  });

  it("refuses unknown names", () => {
    expect(() => encode(assemble(TEXT.replace("GETBI r0, x", "GETBI r0, nope")), env)).toThrow(
      /unknown builtin variable nope/,
    );
  });
});

describe("ADR-0006 sprite geometry (SPRG extension)", () => {
  const TEXT = `.dsda 0.1
.seed 0
.asset sprite spr_bird "gfx/spr_bird.grf" 3 origin=8,8 size=16,16 bbox=2,3,15,13
.asset sprite spr_pipe "gfx/spr_pipe.grf" 1 origin=0,-4 size=32,64 bbox=0,0,31,63
.asset sound snd_flap "" 0

.func f 0 1
    RET r0, 0
.end
`;
  const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

  it("round-trips origin, size and bbox", () => {
    expect(roundTrip(TEXT)).toBe(TEXT);
  });

  it("writes the extension table after the sections, with format minor 2", () => {
    const bytes = encode(assemble(TEXT), env);
    const v = view(bytes);
    expect(v.getUint16(6, true)).toBe(2);
    const ext = v.getUint32(28, true);
    expect(ext).toBeGreaterThan(32);
    expect(ext % 4).toBe(0);
    expect(v.getUint32(ext, true)).toBe(1);
    expect(String.fromCharCode(...bytes.subarray(ext + 4, ext + 8))).toBe("SPRG");
    const body = v.getUint32(ext + 8, true);
    expect(v.getUint32(ext + 12, true)).toBe(4 + 2 * 20);
    expect(v.getUint32(body, true)).toBe(2);
    // Second record: asset 1 (spr_pipe), 32x64, origin (0,-4).
    const rec = body + 4 + 20;
    expect([
      v.getUint32(rec, true),
      v.getUint16(rec + 4, true),
      v.getUint16(rec + 6, true),
      v.getInt16(rec + 10, true),
    ]).toEqual([1, 32, 64, -4]);
    expect(v.getUint32(16, true)).toBe(bytes.length);
  });

  it("leaves files without geometry byte-identical (minor 1, reserved word 0)", () => {
    const plain = encode(assemble(TEXT.replace(/ origin=[^\n]*/g, "")), env);
    expect(view(plain).getUint16(6, true)).toBe(1);
    expect(view(plain).getUint32(28, true)).toBe(0);
  });

  it("skips extension tags it does not know", () => {
    const bytes = encode(assemble(TEXT), env);
    const ext = view(bytes).getUint32(28, true);
    bytes.set([88, 88, 88, 88], ext + 4);
    expect(decode(bytes, env).assets[0]?.geometry).toBeUndefined();
  });

  it("refuses geometry on some sprites only, or on a sound", () => {
    expect(() => encode(assemble(TEXT.replace(/ origin=0,-4[^\n]*/, "")), env)).toThrow(/every sprite/);
    expect(() => assemble(TEXT.replace('"" 0', '"" 0 origin=0,0 size=1,1 bbox=0,0,0,0'))).toThrow(/only sprites/);
    expect(() => assemble(TEXT.replace(" size=16,16", ""))).toThrow(/needs all of/);
  });
});
