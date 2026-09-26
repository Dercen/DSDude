# C8: Runtime log protocol

Version: 0.3.0 · Owner: WS2 · Changes: see the tiers in contracts/README.md

How the runtime reports to the IDE and the CLI: text lines on the emulator's stdout, captured through a pipe by
EmulatorManager (C4). Phase-0 draft by WS0; WS2 owns it from the tag (WS0 holds it until `start-ws2`). The runtime
artifact half of C8 is `contracts/runtime-artifact.md` (WS3). Source: PLAN.md sections 2.6, 3.2 and 5.2 C8;
`docs/research/verification.md` claim 6.

## Lines

Every line starts with `DSD|`, has `|`-separated fields and ends with `\n`. Parsers accept `\r\n`.

| Line | When | Fields |
|---|---|---|
| `DSD\|READY\|<version>\|<abihash>` | once, after boot and the DSDB loaded | runtime semver; the runtime's ABI hash as 8 lowercase hex digits (C2) |
| `DSD\|LOG\|<text>` | `show_debug_message` and runtime notes | free text (rules below) |
| `DSD\|ERR\|<code>\|<object>\|<event>\|<file>\|<line>\|<message>` | a runtime error (the game stops) | R5xx code (C9); object and event names; project-relative DSS file; 1-based line (0 if unknown); message in the C9 voice |
| `DSD\|MEM\|inst=14/512,arena=40/512,heapfree=1310,snd=120/768,objvram_top=48/128,objvram_bot=12/128,pal16_top=1/16,pal256_top=3/16,pal16_bot=0/16,pal256_bot=1/16,cstack=2/11,predecode=10/256` | at room start (after Room Start) | `key=used/total` pairs; KB unless a count; `inst` counts instance blocks in use; `predecode` (0.3.0) is the pre-decoded code's KB against C13 `predecodeBytes` (8-byte cells, rounded up), 0 when the module runs on the plain dispatch (over the budget, allocation failed, or dsdude-host's `DSD_PLAIN_DISPATCH=1`); both paths print otherwise identical output |
| `DSD\|STAT\|fps=60,inst=14,spr_top=9,spr_bot=2,oam_drop=0,aff_drop=0,sfx_drop=0,ops=1820` | once per second: every 60th frame | `spr_top`/`spr_bot`: sprites shown per screen in the last frame; `oam_drop`: draws beyond 128 visible per screen in the last frame (on both screens together); `aff_drop`: rotated or scaled draws beyond 32 per screen that drew unrotated in the last frame; `sfx_drop`: effects that found no free channel; `ops`: VM ops in the last frame |
| `DSD\|PAD\|...` | after READY, ERR and STAT | flush pad (below); parsers drop it |
| `DSD\|EXIT\|<code>` | the game ends (`game_end()`, the end of a program-form `__main`) | integer exit code, 0 = normal |

Fields never contain `|` or a newline: the runtime replaces `|` inside a field with `/`. Only `LOG` text and the
last `ERR` field (`message`) may contain `|`, because they are the last field of their line.

`LOG` and `ERR` text:
- An embedded newline in `LOG` or `ERR` text starts a new `DSD|LOG|` line for the rest of the text.
- `\r` is dropped.
- Text longer than one line allows (1023 chars in total, prefix included) continues on further `DSD|LOG|` lines.

In a program-form DSDB (C2: no OBJS/ROOMS, FUNC 0 = `__main`), the runtime prints `DSD|READY`, calls `__main` once,
prints `DSD|EXIT|0` and stops; the host runner then exits.

## Printing

- Every line goes through **exactly one** protocol, chosen at boot from the emulator ID string at `0x04FFFA00`:
  - ID starts with `melonDS` or `no$gba`: the line, with its own `\n`, is written to `0x04FFFA10` (raw, <= 1023
    chars).
  - Otherwise (DeSmuME, hardware): the line is copied into a writable RAM stub carrying the legacy signature
    `mov r12,r12; b; .hword 0x6464` (BlocksDS `debugprint.s`; the Thumb form is fine).

  melonDS's interpreter also prints the legacy signature, so printing through both would duplicate every line.
- `DSD|` lines never use libnds `nocashMessage()` (it writes `0x04FFFA14`: no newline, 120-char truncation).
- Lines, pad lines included, are formatted in one **static main-RAM buffer** (melonDS reads it through the ARM9 bus,
  which does not map DTCM) and are **<= 1023 chars** including the prefix.

## Flush pad

Both emulators block-buffer stdout on a pipe in ~4 KB blocks and never flush. So every `DSD|READY`, `DSD|ERR` and
`DSD|STAT` line is followed by a flush pad of **>= 5120 bytes**: at least six `DSD|PAD|` lines of <= 1023 chars each
(e.g. `DSD|PAD|` + 1014 `.` characters; five such lines are only 5,115 characters plus their newlines, so six).
EmulatorManager drops every `DSD|PAD|` line before `onLine`. Other lines arrive when a later pad pushes them out,
or at a graceful stop (`taskkill /PID`, then `/F` after 2 s), which flushes the buffer.

## Host runner

`dsdude-host` (WS2; `runtime/build-host/dsdude-host`, `.exe` on Windows) runs the portable core headless. It is
the execution oracle for the compiler (WS4) and the DS port (WS3):

```
dsdude-host <nitrofs-dir | game.dsdb> [--frames N] [--input keys.txt] [--trace out.jsonl] [--png-dir dir] [--seed N]
```

- `<nitrofs-dir>` is a build's NitroFS root (`game.dsdb`, `gfx/`, `bg/`, `soundbank.bin`; C3). A path ending in
  `.dsdb` is served as `game.dsdb` with no other files, which is how program-form fixtures run.
- **stdout** carries the same lines as the emulators, LF-only on every host, without `DSD|PAD|` lines (the host
  flushes instead). Host output and emulator logs compare line for line after dropping `DSD|PAD|` and `DSD|STAT`
  lines. Nothing else is written to stdout; usage and file problems go to stderr.
- **Exit status:** 0 when the game ended (`DSD|EXIT`) or ran its `--frames`; 1 after a runtime error (`DSD|ERR`); 2
  for a usage or file error (stderr names it).
- `--seed N` is what the platform's `dsd_plat_rng_seed()` returns; a non-zero DSDB header seed still wins (C2,
  C11). Every scripted run passes it.
- `--frames N` runs N frames of a room game. A program-form DSDB runs `__main` once and ignores it.
- In `DSD|ERR`, a field with no value is empty: program form has no object, so its errors read
  `DSD|ERR|R530||__main|<file>|<line>|<message>`, the event field holding the function; load errors read
  `DSD|ERR|R58x|||game.dsdb|0|<message>`.

### Key scripts (`--input`)

One line per change of input, `<frame> <spec>`, with frames (0-based) strictly increasing; the input holds from that
frame until the next line, and nothing is held before the first line. `spec` is `-` (nothing held, stylus up) or
`+`-joined parts: key names (`a b x y l r start select up down left right`, the `btn_*` names without `btn_`) and at
most one touch `T<x>,<y>` in bottom-screen pixels (x 0-255, y 0-191). Blank lines and lines starting with `#` are
ignored; spaces or tabs separate the two fields; CRLF is accepted. A malformed line is a usage error (exit 2) that
names its line number. WS1's `dsdude screenshot --keys` reads the same format.

```
# flap, fly right, tap the screen
0 -
30 a
32 a+right
40 T128,96
41 -
```

### Traces (`--trace`)

JSON Lines, written with LF endings: **one object per frame**, emitted when the frame has ended (after its Draw
events and, when one was pending, the room change), with the keys in exactly this order and **integers only** (no floats, no strings), so traces compare byte for byte:

```
{"frame":0,"keys":1,"touch":0,"tx":0,"ty":0,"room":0,"rng":270369,"ops":532,"inst":[[100001,0,65536,40960,0,3,0,1,0]]}
```

| Key | Value |
|---|---|
| `frame` | 0-based frame index |
| `keys` | buttons held this frame: bit n is the button whose `btn_*` constant is n |
| `touch`, `tx`, `ty` | 1 and the stylus position while touching, else `0,0,0` |
| `room` | ROOM index at the end of the frame (after a pending room change took effect) |
| `rng` | xorshift32 state at the end of the frame (unsigned) |
| `ops` | VM steps run this frame (the watchdog's count) |
| `inst` | live instances in creation order, each `[id, object, x, y, screen, sprite, image, visible, depth]` |

In `inst`, `object` is the OBJS index, `x`, `y` and `image` (`image_index`) are Q20.12 raw values (value x 4096,
whatever the script's representation), `sprite` is the ASET index or -1, `screen` 0 top / 1 bottom, `visible` 0/1.
A program-form DSDB runs no frames, so its trace file is empty. New keys are T1 and only ever appended at the end of
the object; consumers compare whole lines.

### Screens (`--png-dir`)

From tier v4 (rooms and draw): after the last frame, the runner writes that frame's screens as `top.png` and
`bottom.png` (256x192, 8-bit RGB) into the directory, creating it if needed; the same frame `dsdude screenshot
--frames N` captures on an emulator. A program-form game runs no frames and writes none. The screens are composed
as the DS shows them in 0.1, back to front: the backdrop (black), the room background (BG1, scrolled by the view,
wrapping at its 256/512 size; colour index 0 is transparent), the sprites (the core's shadow OAM, entry 0 in front;
affine entries sample from the centre of their double-size area as the DS does), and the UI layer (BG0: the 8x8
font of `runtime/data/font8x8.bin` and solid cells, in the 16 UI colours). Colours are RGB555 widened as
`c8 = c5 << 3 | c5 >> 2`, so compare emulator screenshots after reducing both to RGB555 (`c8 >> 3`). Sprites and
backgrounds come from the GRFs in the NitroFS directory; with a `game.dsdb` root there are none, and each sprite
draws as a 1-pixel magenta (RGB555 31, 0, 31) outline of its OBJ box instead.

## How to change me

- T0 (wording, examples): WS2 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new line type, a new `MEM`/`STAT` key): minor version bump + CHANGELOG entry in one commit; WS0 reviews
  within 24 hours. Parsers ignore unknown line types and keys.
- T2 (changing an existing line's fields, the pad rule or the protocol choice): an ADR co-signed by WS1/WS8, WS3 and
  WS6.
