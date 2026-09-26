"""Headless DS screenshots for `dsdude screenshot` (C10; PLAN.md 6 WS1, verification.md claim 10).

usage: python tools/screenshot.py <rom> --frames N [--keys file] --out dir

Runs the ROM in py-desmume 0.0.9 for N frames with SDL_VIDEODRIVER=dummy and SDL_AUDIODRIVER=dummy, then writes
top.png and bottom.png (256x192 each) and screenshot.json into dir:
  {"ok": true, "frames": N, "top": "<path>", "bottom": "<path>", "uniform": {"top": bool, "bottom": bool}}
The same JSON is printed on stdout, but libdesmume's own output may interleave with it there: read the file.
`uniform` is true when a screen is a single colour: a hung ROM is detected from the pixels, not is_running().

Key script (--keys; ADR-pending ADR-0003 until WS2's "Host runner" section of contracts/log-protocol.md lands):
  <frames> <button>...        buttons held on those frames (A B X Y L R START SELECT UP DOWN LEFT RIGHT)
  <frames> TOUCH <x> <y>      the bottom screen touched at (x, y), x 0-255, y 0-191
<frames> is N or N-M, 1-based and inclusive: frame N is the Nth cycle(). Buttons are separated by spaces or commas.
A button is held on every frame some line lists it; overlapping lines add up. When several TOUCH lines cover a
frame the last line wins; the screen is released on frames no TOUCH line covers. `#` starts a comment.
Example: `30-35 START` then `200 TOUCH 128 96`. The screenshot after frame N shows the input of frame N-2 at the
earliest (measured with the SDK's touch_input), so screenshot a few frames after the input you check.

Exit codes: 0 ok; 1 bad arguments or key script; 2 py-desmume missing or the ROM could not run.
Only ROMs built with BlocksDS boot in py-desmume.
"""

import argparse
import json
import os
import sys

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

BUTTONS = ("A", "B", "SELECT", "START", "RIGHT", "LEFT", "UP", "DOWN", "R", "L", "X", "Y")


def fail(code, message):
    print(json.dumps({"ok": False, "error": message}))
    print(message, file=sys.stderr)
    sys.exit(code)


def parse_keys(path):
    """Returns a list of (first_frame, last_frame, [button names], (x, y) or None), in file order."""
    ranges = []
    try:
        f = open(path, encoding="utf-8")
    except OSError as e:
        fail(1, f"The key script {path} could not be read: {e.strerror}")
    with f:
        for number, raw in enumerate(f, 1):
            where = f"{path}:{number}"
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            parts = line.replace(",", " ").split()
            span = parts[0].split("-")
            if len(span) > 2 or not all(s.isdigit() for s in span):
                fail(1, f"{where}: '{parts[0]}' is not a frame or frame range like 30 or 30-35")
            first = int(span[0])
            last = int(span[-1])
            if first < 1 or last < first:
                fail(1, f"{where}: the frame range {parts[0]} is empty or starts before frame 1")
            names = [p.upper() for p in parts[1:]]
            if not names:
                fail(1, f"{where}: say which buttons to press, or TOUCH x y")
            touch = None
            if names[0] == "TOUCH":
                if len(names) != 3 or not (names[1].isdigit() and names[2].isdigit()):
                    fail(1, f"{where}: TOUCH needs two numbers, like TOUCH 128 96")
                x, y = int(names[1]), int(names[2])
                if x > 255 or y > 191:
                    fail(1, f"{where}: TOUCH {x} {y} is off the bottom screen (x 0-255, y 0-191)")
                touch, names = (x, y), []
            for name in names:
                if name not in BUTTONS:
                    fail(1, f"{where}: unknown button '{name}' (use {' '.join(BUTTONS)} or TOUCH x y)")
            ranges.append((first, last, names, touch))
    return ranges


def input_for(ranges, frame):
    """The buttons held and the touch point (or None) on one frame."""
    buttons = set()
    touch = None
    for first, last, names, point in ranges:
        if first <= frame <= last:
            buttons.update(names)
            if point is not None:
                touch = point
    return buttons, touch


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
    ranges = parse_keys(args.keys) if args.keys else []

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
        for frame in range(1, args.frames + 1):
            want, touch = input_for(ranges, frame)
            for name in held - want:
                emu.input.keypad_rm_key(keymask(getattr(Keys, "KEY_" + name)))
            for name in want - held:
                emu.input.keypad_add_key(keymask(getattr(Keys, "KEY_" + name)))
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
