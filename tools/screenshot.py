"""Headless DS screenshots for `dsdude screenshot` (C10; PLAN.md 6 WS1, verification.md claim 10).

usage: python tools/screenshot.py <rom> --frames N [--keys file] --out dir

Runs the ROM in py-desmume 0.0.9 for N frames with SDL_VIDEODRIVER=dummy and SDL_AUDIODRIVER=dummy, then writes
top.png and bottom.png (256x192 each) and screenshot.json into dir:
  {"ok": true, "frames": N, "top": "<path>", "bottom": "<path>", "uniform": {"top": bool, "bottom": bool}}
The same JSON is printed on stdout, but libdesmume's own output may interleave with it there: read the file.
`uniform` is true when a screen is a single colour: a hung ROM is detected from the pixels, not is_running().

Key script (--keys): the one format of contracts/log-protocol.md "Key scripts (--input)" (C8 0.2.0), which
dsdude-host reads too. One line per change of input, `<frame> <spec>`, frames 0-based and strictly increasing; the
input holds from that frame until the next line, and nothing is held before the first line. `spec` is `-` (nothing
held, stylus up) or `+`-joined parts: key names (a b x y l r start select up down left right) and at most one touch
`T<x>,<y>` in bottom-screen pixels (x 0-255, y 0-191). Blank lines and lines starting with `#` are ignored.
Example: `30 start`, `31 -`, `90 T128,96`, `91 -`. Frame f is the (f+1)th cycle(). The screenshot after frame N shows
the input of frame N-2 at the earliest (measured with the SDK's touch_input; ADR-0003), so screenshot a few frames
after the input you check.

Exit codes: 0 ok; 1 bad arguments or key script; 2 py-desmume missing or the ROM could not run.
Only ROMs built with BlocksDS boot in py-desmume.
"""

import argparse
import json
import os
import re
import sys

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

# Key names in btn_* order (C6); py-desmume's are the same, upper-case, after KEY_.
KEYS = ("a", "b", "x", "y", "l", "r", "start", "select", "up", "down", "left", "right")
LINE = re.compile(r"[ \t]*(\d+)[ \t]+(.*?)[ \t]*")
TOUCH = re.compile(r"T(\d+),(\d+)")


def fail(code, message):
    print(json.dumps({"ok": False, "error": message}))
    print(message, file=sys.stderr)
    sys.exit(code)


def parse_spec(spec):
    """(set of key names, (x, y) or None) for a C8 spec, or None when it is malformed."""
    if spec == "-":
        return set(), None
    keys = set()
    touch = None
    for part in spec.split("+"):
        m = TOUCH.fullmatch(part)
        if m and touch is None and int(m.group(1)) <= 255 and int(m.group(2)) <= 191:
            touch = (int(m.group(1)), int(m.group(2)))
        elif part in KEYS:
            keys.add(part)
        else:
            return None
    return keys, touch


def parse_keys(path):
    """Returns the changes as a list of (frame, set of key names, (x, y) or None), frames increasing."""
    changes = []
    try:
        with open(path, encoding="utf-8", newline="") as f:
            text = f.read()
    except OSError as e:
        fail(1, f"The key script {path} could not be read: {e.strerror}")
    for number, raw in enumerate(text.split("\n"), 1):
        where = f"{path}:{number}"
        line = raw[:-1] if raw.endswith("\r") else raw
        if line.strip(" \t") == "" or line.lstrip(" \t").startswith("#"):
            continue
        m = LINE.fullmatch(line)
        if not m:
            fail(1, f"{where}: want '<frame> <keys>', like 30 a+right or 40 T128,96")
        frame = int(m.group(1))
        if changes and frame <= changes[-1][0]:
            fail(1, f"{where}: frame numbers must increase from line to line")
        parsed = parse_spec(m.group(2))
        if parsed is None:
            fail(1, f"{where}: keys must be '-' or names like a+right, with T<x>,<y> for touch (x 0-255, y 0-191)")
        changes.append((frame, parsed[0], parsed[1]))
    return changes


def input_for(changes, frame):
    """The keys held and the touch point (or None) on one 0-based frame: the last change at or before it."""
    held, touch = set(), None
    for first, keys, point in changes:
        if first > frame:
            break
        held, touch = keys, point
    return held, touch


def is_uniform(image):
    return image.getextrema() is not None and all(lo == hi for lo, hi in image.getextrema())


def main():
    parser = argparse.ArgumentParser(description="Headless DS screenshots through py-desmume.")
    parser.add_argument("rom")
    parser.add_argument("--frames", type=int, required=True)
    parser.add_argument("--keys")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    if args.frames < 1:
        fail(1, "--frames must be at least 1")
    if not os.path.isfile(args.rom):
        fail(1, f"The ROM {args.rom} does not exist.")
    changes = parse_keys(args.keys) if args.keys else []

    try:
        from desmume.controls import Keys, keymask
        from desmume.emulator import DeSmuME
    except ImportError as e:
        fail(2, f"py-desmume is not installed ({e}). Run: python -m pip install --user py-desmume==0.0.9")

    emu = DeSmuME()
    try:
        try:
            emu.open(os.path.abspath(args.rom))
        except RuntimeError as e:
            fail(2, f"py-desmume could not open {args.rom}: {e}")
        held = set()
        touching = None
        for frame in range(args.frames):
            want, touch = input_for(changes, frame)
            for name in held - want:
                emu.input.keypad_rm_key(keymask(getattr(Keys, "KEY_" + name.upper())))
            for name in want - held:
                emu.input.keypad_add_key(keymask(getattr(Keys, "KEY_" + name.upper())))
            held = want
            if touch != touching:
                if touch is None:
                    emu.input.touch_release()
                else:
                    emu.input.touch_set_pos(*touch)
                touching = touch
            emu.cycle(with_joystick=False)

        image = emu.screenshot()
        os.makedirs(args.out, exist_ok=True)
        top_path = os.path.join(args.out, "top.png")
        bottom_path = os.path.join(args.out, "bottom.png")
        top = image.crop((0, 0, 256, 192))
        bottom = image.crop((0, 192, 256, 384))
        top.save(top_path)
        bottom.save(bottom_path)
        result = json.dumps(
            {
                "ok": True,
                "frames": args.frames,
                "top": os.path.abspath(top_path),
                "bottom": os.path.abspath(bottom_path),
                "uniform": {"top": is_uniform(top), "bottom": is_uniform(bottom)},
            }
        )
        # libdesmume block-buffers its own stdout (emulator chatter and the ROM's DSD| lines), so a line printed here
        # can land inside one of its lines: callers read screenshot.json instead.
        with open(os.path.join(args.out, "screenshot.json"), "w", encoding="utf-8") as f:
            f.write(result + "\n")
        print(result, flush=True)
    finally:
        emu.destroy()


if __name__ == "__main__":
    main()
