# C8: Runtime log protocol

Version: 0.1.0 · Owner: WS2 · Changes: see the tiers in contracts/README.md

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
| `DSD\|MEM\|inst=14/512,arena=40/512,heapfree=1310,snd=120/768,objvram_top=48/128,objvram_bot=12/128,pal16_top=1/16,pal256_top=3/16,pal16_bot=0/16,pal256_bot=1/16,cstack=2/11` | at room start | `key=used/total` pairs; KB unless a count |
| `DSD\|STAT\|fps=60,inst=14,spr_top=9,spr_bot=2,oam_drop=0,aff_drop=0,sfx_drop=0,ops=1820` | once per second | `oam_drop`: instances beyond 128 visible per screen; `aff_drop`: rotated or scaled instances beyond 32 per screen that drew unrotated; `sfx_drop`: effects that found no free channel; `ops`: VM ops in the last frame |
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
`DSD|STAT` line is followed by a flush pad of **>= 5 KB**: at least five `DSD|PAD|` lines of <= 1023 chars each
(e.g. `DSD|PAD|` + 1014 `.` characters). EmulatorManager drops every `DSD|PAD|` line before `onLine`. Other lines
arrive when a later pad pushes them out, or at a graceful stop (`taskkill /PID`, then `/F` after 2 s), which flushes
the buffer.

## Host runner

`dsdude-host` (WS2) prints the same lines to its stdout, without pads (it flushes), so host traces and emulator logs
compare line for line after dropping `DSD|PAD|` and `DSD|STAT` lines.

## How to change me

- T0 (wording, examples): WS2 commits with a `contracts/CHANGELOG.md` line.
- T1 (a new line type, a new `MEM`/`STAT` key): minor version bump + CHANGELOG entry in one commit; WS0 reviews
  within 24 hours. Parsers ignore unknown line types and keys.
- T2 (changing an existing line's fields, the pad rule or the protocol choice): an ADR co-signed by WS1/WS8, WS3 and
  WS6.
