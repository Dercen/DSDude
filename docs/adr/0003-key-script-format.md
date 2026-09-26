# ADR-0003: One key-script format for `dsdude screenshot --keys` and `dsdude-host`

- Status: **proposed** (WS1, 2026-09-26). WS0 numbers, merges and closes it (renumber if 0003 is taken).
- Affected streams: WS2 (owns `contracts/log-protocol.md` "Host runner" and `dsdude-host`), WS1/WS8 (`--keys` in
  C10, `tools/screenshot.py`), WS7 (tutorial tests), WS6 (a future recorded-input feature).
- Sources: `docs/kickoff/ws1.md` task 3, `contracts/cli.md` "Key scripts", `contracts/log-protocol.md` "Host
  runner".

## Context

`dsdude screenshot --keys file` must use "the key-script format of `contracts/log-protocol.md`, Host runner" (WS2).
That section does not define one yet (checked on `main` and on `origin/ws2-runtime-core`, 2026-09-26), and WS2 is a
cloud stream that has not pushed. Headless tests of games need scripted input now: WS3's selftest logs touch input
(M0), and the Flappy screenshots need START and A presses.

## Decision (recommended)

WS2 adds a "Key scripts" subsection under "Host runner" (a T1 change to C8) with this format, and `dsdude-host`
reads it:

```
# comment to the end of the line
<frames> <button>...          buttons held on those frames
<frames> TOUCH <x> <y>         the bottom screen touched at (x, y), x 0-255, y 0-191
```

- `<frames>` is `N` or `N-M`: 1-based, inclusive. Frame N is the Nth emulated frame (the Nth `cycle()` in
  py-desmume, the Nth frame of the host loop), and the input applies while that frame runs.
- Buttons are `A B X Y L R START SELECT UP DOWN LEFT RIGHT`, separated by spaces or commas and matched
  case-insensitively.
- A button is held on every frame some line lists it, and released otherwise. Overlapping lines add up. When
  several `TOUCH` lines cover one frame, the last line wins. The screen is released on frames no `TOUCH` line covers.
- Frames after the last line have no input. Lines may come in any order.
- An error names the file, the line and the problem (bad range, unknown button, coordinates off screen).
  `dsdude screenshot` then exits 2 with E631.

Example: press START on frames 30-35, flap on 90 and 120, tap the middle of the bottom screen at 200.

```
30-35 START
90 A
120 A
200 TOUCH 128 96
```

Measured in py-desmume with the SDK's `input/touch_input` (which reads input every frame; `key_input` reads it only
every 10th frame, so it misses short presses):
- a one-frame `100 TOUCH 128 96` is read by the ROM;
- its console change first shows in the screenshot taken after frame 102: the picture trails the input by two frames;
- the touch reads back as (129, 97) after libnds's calibration.

Tests should therefore screenshot a few frames after the input they check.

## Consequences

- `tools/screenshot.py` implements this now, marked `ADR-pending ADR-0003`; the marker goes when WS2's subsection
  lands with the same rules.
- Keeping one format means a host trace and an emulator screenshot of the same game can use the same input file.

## Alternatives

- A per-frame bitmask (one hex word per frame): compact for recordings, unreadable for hand-written tests.
- JSON: verbose for the common "press START at frame 30" case, and no comments.
