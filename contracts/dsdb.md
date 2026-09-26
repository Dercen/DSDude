# C2: DSDB bytecode container

Version: 0.5.0 · Owner: WS2 + WS4 · Changes: see the tiers in contracts/README.md

DSDB is the compiled form of a DSS game: one file, `game.dsdb`, at the NitroFS root (C3), loaded by the runtime VM.
Written by WS0 in Phase 0; from the `phase0` tag WS2 and WS4 co-own this file (either may commit; the other
co-signs). The opcodes are in `contracts/opcodes.json` (WS4, WS2 co-signs) and the builtins in
`contracts/builtins.json` (WS0, append-only). The reference implementation is `packages/dsdb` (`encode`, `decode`,
`assemble`, `disassemble`; bins `dsdb-asm` and `dsdb-dis`). Source: PLAN.md sections 2.3, 2.8, 3.3, 4 and 5.2 C2.

**Frozen at the tag:** the header, the section table and every section layout below, the 8-byte cells holding
32-bit handles, the calling convention, event ids, and the `.dsda` grammar. Provisional opcodes are promoted later by
T1 (`opcodes.json`).

## 1. Conventions

- All integers are **little-endian**. `u8/u16/u32` are unsigned, `s16/s32` two's complement.
- Every section starts on a 4-byte boundary; padding bytes are 0.
- Payloads are 32-bit **handles** (pool indices, arena offsets), never pointers, so the host (64-bit) and the DS
  (32-bit) read the same file the same way (PLAN.md 2.4).
- A string index is an index into STRS; a function index into FUNC; an object index into OBJS; a room index into
  ROOM; an asset index into ASET. `-1` (0xFFFFFFFF) means "none" wherever a field says so.

## 2. Header (32 bytes) and section table

| Offset | Type | Field |
|---|---|---|
| 0 | u8[4] | magic `DSDB` |
| 4 | u16 | format major = 0 (the loader refuses any other major) |
| 6 | u16 | format minor: 1, or 2 when the file has an extension table (ADR-0006); loaders accept any minor >= 1 |
| 8 | u32 | ABI hash (section 9) |
| 12 | u32 | RNG seed: 0 = the runtime calls `dsd_plat_rng_seed()`; non-zero always wins (`--seed N`, C11) |
| 16 | u32 | file size in bytes |
| 20 | u16 | section count = 10 |
| 22 | u16 | flags = 0 (reserved) |
| 24 | u32 | first room index; 0xFFFFFFFF in a program-form DSDB |
| 28 | u32 | extension table offset (ADR-0006): 0 = none; else the 4-aligned file offset of the table (section 4) |

At offset 32: 10 entries of 12 bytes, `{u8[4] tag; u32 offset; u32 size}`, with offsets from the start of the file,
in this fixed order. Every DSDB has all ten sections, possibly with a count of 0.

| Tag | Content |
|---|---|
| `STRS` | string pool |
| `SYMS` | symbol table (instance-variable names for dynamic slots) |
| `KONS` | constant pool (LOADK) |
| `CODE` | instruction words |
| `FUNC` | functions |
| `GLOB` | global variables (`global.x`) |
| `OBJS` | objects |
| `ROOM` | rooms (PLAN's "ROOMS") |
| `ASET` | assets (PLAN's "ASSETS") |
| `DBG ` | line table (tag ends with a space) |

`KONS` is the one section PLAN.md's list did not name: LOADK needs numbers beyond LOADI's 16 bits and string
constants, and keeping them in a pool of ready-made cells lets the VM copy a cell instead of decoding it.

## 3. Values: 8-byte cells

A value is `{u32 tag; s32 payload}`.

| Tag | Name | Payload |
|---|---|---|
| 0 | UNDEF | 0 |
| 1 | INT | int32 |
| 2 | REAL | Q20.12 fixed point (value x 4096) |
| 3 | BOOL | 0 or 1 |
| 4 | STR | a string handle (in a file: a STRS index) |
| 5 | ARR | an array handle |
| 6 | INST | an instance id |
| 7 | ASSET | `kind << 24 | index`: kind 1 sprite, 2 background, 3 sound, 4 music (index into ASET), 5 object (OBJS), 6 room (ROOM) |

Numbers follow `contracts/language.md` (int32 + Q20.12, PLAN.md 2.8). Asset ids print as their index.

## 4. Sections

**STRS.** `u32 count; u32 offset[count]` (from the start of the section), then one record per string:
`u16 byteLength; u8 utf8[byteLength]; u8 0;` padded to 4 bytes. Strings are **sorted by UTF-8 bytes** (code-point
order) and unique, so the pool is canonical whatever order a writer met them in. It holds every function, global,
symbol, object, room and asset name, every asset path, every string constant and every DBG file name.

**SYMS.** `u32 count; u32 nameStr[count]`, sorted by name. Symbol id = position.

**KONS.** `u32 count;` then `count` cells `{u32 tag; s32 payload}` of tag INT, REAL, STR or ASSET, **unique and
sorted by (tag, payload)**. LOADK's Bx indexes it (so at most 65,536 constants).

**CODE.** `u32 count; u32 word[count]`: all functions' instructions back to back.

**FUNC.** `u32 count;` then 16-byte records `{u32 nameStr; u32 codeStart; u32 codeLength; u8 params; u8 regs;
u16 flags = 0}`. `codeStart` is an instruction index into CODE. `regs` <= 64. Function order is the writer's
(`.func` order in `.dsda`); in a program-form DSDB, FUNC 0 is `__main`.

**GLOB.** `u32 count; u32 nameStr[count]`, sorted by name. Global slot = position (GETGLOB/SETGLOB Bx). Built-in
globals (`room`, `view_x`, ...) are builtin variables, not GLOB entries.

**OBJS.** `u32 count; u32 offset[count]` (from the start of the section), then per object:

| Type | Field |
|---|---|
| u32 | nameStr |
| s32 | parent object index or -1 |
| s32 | sprite asset index or -1 |
| u8, u8, s16 | visible (0/1), screen (0 top, 1 bottom), depth |
| u16, u16 | slotCount, eventCount |
| u32[ceil(count/32)] | ancestor bitset: bit j set when object j is this object or one of its ancestors |
| slotCount x {u32 symbolId; u32 slot} | the object's slot table, **sorted by symbolId** (parent layout first, then the union of assigned names; <= 24 user slots) |
| eventCount x {u32 eventId; u32 func} | event handlers, **sorted by eventId** |

`inst.var` on a runtime id and GETDYN/SETDYN binary-search the slot table by symbol id, then fall back to the
8-entry overflow map; reading a slot never assigned raises R50x (language.md rule 1). A missing event is looked up
on the parent chain (rule 2).

**ROOM.** `u32 count; u32 offset[count]`, then per room:

| Type | Field |
|---|---|
| u32 | nameStr |
| u16, u16 | width, height |
| 2 x {s32 background; s32 viewX; s32 viewY} | top, then bottom screen; background = asset index or -1 |
| u32 | instanceCount |
| instanceCount x {u32 object; s32 x; s32 y; u8 screen; u8 pad; u16 pad; s32 creationFunc} | placed instances; creationFunc = function index or -1 |
| 2 x {u16 spriteCount; u16 backgroundCount; u32 assetIndex[spriteCount + backgroundCount]} | per-screen asset set (C3), top then bottom |
| u16 soundCount; u16 pad; u32 assetIndex[soundCount] | sounds and music loaded before Room Start |

The header's first-room field picks the room the game starts in; ROOM order is `project.json`'s `rooms` order.

**ASET.** `u32 count;` then 16-byte entries `{u8 kind (1 sprite, 2 background, 3 sound, 4 music); u8 pad; u16 pad;
u32 nameStr; u32 pathStr; u32 aux}`. `path` is the NitroFS path (`gfx/spr_bird.grf`, `bg/...grf`), `""` for sounds,
which live in `soundbank.bin`; `aux` is the sprite's frame count or the sound's soundbank id (read from mmutil's
`soundbank.h`, C3). The exact meaning of `aux` may be refined by WS5's C3 as a T1 change.

**DBG .** `u32 count;` then `{u32 codeIndex; u32 fileStr; u32 line}` sorted by codeIndex: each entry covers the
instructions from its codeIndex up to the next entry. Files are project-relative with `/`. R5xx errors use it for
`DSD|ERR|...|<file>|<line>|...` (C8).

**Extensions** (ADR-0006, accepted; 0.3.0). When the header word at offset 28 is non-zero, it points past the ten
sections to `u32 count;` then `count` entries `{u8[4] tag; u32 offset; u32 size}` sorted by tag, each body 4-aligned
after the table. Loaders skip tags they do not know. Writers add the table only when there is something to put in
it, so a DSDB without extensions keeps minor 1 and its exact bytes.

- **`SPRG`** (sprite geometry): `u32 count;` then one 20-byte record per ASET sprite entry, sorted by asset index:
  `{u32 assetIndex; u16 frameWidth, frameHeight; s16 originX, originY; s16 bboxLeft, bboxTop, bboxRight,
  bboxBottom}`, from `sprite.json` (bbox inclusive, in frame pixels). Either every sprite has a record or the file
  has no `SPRG`. The runtime uses it for placement, collisions, `bbox_*`, touch and Outside Room.

## 5. Instructions

32-bit little-endian words: **op = bits 0-7, A = 8-15, B = 16-23, C = 24-31**; `Bx` = bits 16-31 unsigned, `sBx` =
bits 16-31 signed. `contracts/opcodes.json` gives each opcode's number, status and operands as `field:kind`:

| Kind | Meaning | `.dsda` text |
|---|---|---|
| `reg` | register in the current frame (< the function's `regs`) | `r5` |
| `u8`, `s8`, `u16`, `s16` | immediate | `3`, `-2` |
| `bool` | 0/1 | `true`, `false` |
| `k` | KONS index | a literal: `100000`, `1.5`, `"text"`, `@spr_bird` |
| `label` | signed instruction offset, relative to the **next** instruction (`AsBx`) | a label, `L0` |
| `builtin` | dense runtime index of a builtin function (C) | the builtin's name |
| `global` | GLOB index (Bx) | the global's name |
| `func` | FUNC index (Bx) | the function's name |
| `sym` | SYMS index (C, 8 bits; ADR-0005) | the symbol's name |
| `bivar` | dense builtin-variable index (`DSD_BUILTIN_VARS` order; ADR-0005) | the variable's name |

**The stable opcodes** (0.5.0): numbers 0-28 (HALT, MOV, LOADK, LOADI, LOADB, LOADUNDEF, ADD, SUB, MUL, DIV, IDIV,
MOD, NEG, EQ, NE, LT, LE, GT, GE, NOT, JMP, JMPT, JMPF, CALLN, RET, CONCAT, TOSTR, GETGLOB, SETGLOB), 29-50 (CALL,
ADDI/SUBI/MULI, CMPJ, GETSLOT/SETSLOT(O), GETDYN/SETDYN, GETBI/SETBI, WITHBEGIN/WITHNEXT/WITHEND,
NEWARR/GETIDX/SETIDX/LEN, TOINT/TOFIXED), 51-54 (the int-specialised ADDII/SUBII/MULII/CMPJII, PLAN.md 8's M1
fallback, 0.5.0) and 55-58 (GETBIX/SETBIX, GETBIO/SETBIO), with the operands of ADR-0005.

- **CMPJ A B C** compares rA with rB by relation C (0 `==`, 1 `!=`, 2 `<`, 3 `<=`, 4 `>`, 5 `>=`, with the meaning of
  EQ..GE) and must be followed by a JMP (the loader checks): the JMP is skipped when the relation holds and taken
  otherwise, so `while (i < n)` is `CMPJ i, n, 2; JMP Lend`.
- **ADDII/SUBII/MULII A B C** and **CMPJII A B C** have exactly the operands and meaning of ADD/SUB/MUL and CMPJ, for
  operands the compiler has proved to be ints (its int proof: packages/compiler/src/codegen/intproof.ts). The VM reads
  the payloads without checking tags, so a wrong emission can only give a wrong number, never an unsafe memory
  access. The result is an int; int32 overflow behaves as in ADD/SUB/MUL (R520 in a debug build, a wrap in a release
  build). The loader checks them like ADD and CMPJ (register bounds; for CMPJII C <= 5 and a JMP next).
- Instance slots and globals start in a "never assigned" state inside the runtime (not `undefined`): GETSLOT,
  GETDYN and GETGLOB of one raise R500/R501 (language.md rule 1). GETDYN/GETBIO on `noone`, or on an object with no
  instance, raise R5xx; on `all` they read the first instance.
- WITHBEGIN leaves an opaque loop handle in rA; code between WITHBEGIN and WITHEND never writes rA.

Decisions, each with its reason:
- **CALL calls a DSS function by FUNC index** (`CALL A Bx`): user functions are known at compile time, so an index
  avoids any name lookup at run time.
- **CALLN calls a builtin with an explicit argument count** (`CALLN A B C`: arguments in rA..rA+B-1, B = argc, result
  in rA, C = the builtin's dense runtime index): variadic builtins (`choose`, `min`, `max`) need the count, and a
  dense index that `tools/gen-builtins.ts` assigns (function entries in id order, emitted in
  `runtime/gen/builtins_table.h`) keeps C in 8 bits while `builtins.json` ordinals grow past 255.
- **Jumps use a signed 16-bit instruction offset** (`AsBx`, relative to the next instruction): +-32K instructions is
  far beyond any one event, and relative offsets keep functions relocatable.
- **Event ids are `kind:8 | arg:16`** stored as `kind << 16 | arg` in a u32: one sortable number per handler, with
  room for alarm/user/button indices and collision targets.

## 6. Calling convention and frames

- Registers are 8-byte cells in a 4 KB register stack (512 cells). Each function's frame is `regs` <= 64 registers
  wide; `r0..r(params-1)` hold its parameters (the compiler fills defaults, so the count is always `params`).
- **CALL A Bx**: the callee's frame starts at the caller's `rA` (a sliding window): its parameters are the caller's
  `rA..rA+params-1`, and its result lands in the caller's `rA`. `self` and `other` carry over.
- **CALLN A B C**: calls the builtin with `B` arguments in `rA..rA+B-1`; the result (undefined for `void`) goes to
  `rA`.
- **RET A B**: returns `rA` when B = 1, undefined when B = 0.
- Call depth is bounded by the register stack; overflowing it is a friendly R5xx error.
- **Events** are 0-parameter functions run with `self` = the instance. **Creation code** is a 0-parameter function
  run after the instance's Create event.
- **HALT** stops the VM at once (the runtime then prints `DSD|EXIT|0`).
- The per-frame watchdog stops a script after 200,000 instructions with R510 (PLAN.md 2.8).

**Program form** (conformance tiers v0-v1, `contracts/language.md`): no OBJS or ROOM entries, first room
0xFFFFFFFF, FUNC 0 named `__main`. After `DSD|READY` the runtime calls `__main` once, prints `DSD|EXIT|0`, and the
host runner exits (`--frames` is ignored).

## 7. Event ids

`eventId = kind << 16 | arg`, with kinds numbered in `contracts/events.md` order:

| Kind | Event | arg |
|---|---|---|
| 0-4 | create, destroy, begin_step, step, end_step | 0 |
| 5 | alarm_N | N (0-7) |
| 6 | draw | 0 |
| 7 | collision_OBJ | the target's object index |
| 8, 9, 10 | button_pressed_B, button_released_B, button_held_B | button index: a 0, b 1, x 2, y 3, l 4, r 5, start 6, select 7, up 8, down 9, left 10, right 11 (the `btn_*` constant values) |
| 11, 12, 13 | touch_pressed, touch_released, touch_held | 0 |
| 14, 15, 16 | global_touch_pressed, global_touch_released, global_touch_held | 0 |
| 17, 18 | game_start, game_end | 0 |
| 19, 20 | room_start, room_end | 0 |
| 21 | animation_end | 0 |
| 22 | outside_room | 0 |
| 23 | user_N | N (0-7) |

## 8. The `.dsda` text form

A `.dsda` file is line-based UTF-8. `;` starts a comment (outside strings); commas and blanks separate tokens;
strings are JSON-escaped in double quotes. It **names builtins, functions and globals and never contains the ABI hash
or numeric builtin ids**: the assembler stamps them from `contracts/builtins.json` and `contracts/opcodes.json`.

```
file      := ".dsda 0.1" NL [".seed" INT NL] { toplevel }
toplevel  := ".global" NAME | ".symbol" NAME
           | ".asset" ("sprite"|"background"|"sound"|"music") NAME STRING INT [GEOMETRY]
           | func | object | room | ".first" NAME
func      := ".func" NAME PARAMS REGS NL { LABEL ":" | ".loc" STRING LINE | OPCODE operands } ".end"
object    := ".object" NAME "sprite="(NAME|-) "parent="(NAME|-) "visible="(0|1) "screen="(top|bottom) "depth="INT NL
             { ".slot" NAME INT | ".event" EVENTSTEM NAME } ".end"
room      := ".room" NAME WIDTH HEIGHT NL
             { ".screen" (top|bottom) (NAME|-) VIEWX VIEWY
             | ".instance" OBJECT X Y (top|bottom) (FUNC|-)
             | ".set" (top|bottom) LIST LIST | ".sounds" LIST } ".end"
LIST      := "-" | NAME { "+" NAME }
GEOMETRY  := "origin="X","Y "size="W","H "bbox="L","T","R","B     (* sprites only; written as SPRG, ADR-0006 *)
```

Operands are written as in the table in section 5. Fixed-point constants are written as exact decimals with a point
(`1.5`, `0.199951171875`); an inexact decimal such as `0.2` is rounded half away from zero to the nearest 1/4096.

**Canonical form** (what `dsdb-dis` prints; `dis(asm(x)) == x` for canonical `x`): the header, `.seed`, `.global`
and `.symbol` lines sorted by UTF-8 bytes (`.symbol` only for symbols no slot table names), `.asset` lines in ASET
order, then a blank line before each `.func` (FUNC order), `.object` (OBJS order), `.room` (ROOM order) and
`.first`. Instructions are indented 4 spaces, labels 2 (`  L0:`), labels are numbered `L0, L1, ...` by target
position, `.loc` lines appear where a new DBG entry starts, slots are sorted by symbol and events by event id, and
the file ends with one LF. Every committed `fixtures/**/*.dsdb` is generated from its sibling `.dsda` by
`node tools/gen-dsdb.ts`, and `npm run check` requires byte-identical output.

## 9. ABI hash

The header's ABI hash is **FNV-1a 32** (offset basis 0x811C9DC5, prime 0x01000193) over the UTF-8 bytes of these
lines, one per `builtins.json` entry of kind `function`, `variable` or `constant`, in `id` order, joined with LF (no
final LF):

```
id|name|kind|paramTypes|minArgs|maxArgs|returns|scope|value
```

- function: `paramTypes` = the params' types joined with `,`; `minArgs`, `maxArgs` decimal; `returns`; `scope` and
  `value` empty. Example: `50|floor|function|number|1|1|int||`.
- variable: `paramTypes`, `minArgs`, `maxArgs` empty; `returns` = the variable's `type`; `scope` = `instance` or
  `global`; `value` empty. Example: `112|alarm|variable||||int|instance|`.
- constant: the four middle fields empty except `returns` = the constant's `type`; `value` decimal. Example:
  `142|noone|constant||||instance||-4`.

Param names, `doc`, `example`, `category`, `allowedEvents`, `pure`, `since`, `readonly` and `arrayLength` are
excluded, and so are `alias` and `unsupported` entries, which never reach the runtime: compiler-only appends and
WS7's doc fills never invalidate bytecode. `runtime/gen/builtins_table.h` carries the runtime's hash as
`DSD_ABI_HASH`; the loader refuses a DSDB whose hash differs, with *"This ROM was built for a different DSDude
runtime"*. The 0.1.0 table's hash is `0x0dd9987a`.

## 10. Types

The closed type list used by `builtins.json` params, returns and variables: `number`, `int`, `string`, `bool`,
`any`, `array`, `instance`, `object`, `sprite`, `sound`, `room`, `background`, `button`, `screen`, `color`, `void`.
`int` is a number the runtime guarantees whole; `object`, `sprite`, `sound`, `room`, `background` are ASSET values;
`button`, `screen` and `color` are ints from their constants.

## How to change me

- T0 (wording, examples, clarifications that change no byte): WS2 or WS4 commits with a `contracts/CHANGELOG.md`
  line; the other co-signs at integration.
- T1 (a new section field in reserved space, a new flag bit, a new operand kind for a promoted opcode): minor version
  bump, `packages/dsdb` and `tools/gen-*.ts` updated, fixtures regenerated, CHANGELOG entry, all in one commit, with
  the other co-owner's sign-off.
- T2 (anything that changes the bytes of an existing valid DSDB, the calling convention, event ids or the `.dsda`
  grammar): an ADR co-signed by WS2 and WS4 (and WS7 for the grammar), and the format major bumps.
