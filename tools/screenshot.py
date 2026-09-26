"""Headless DS screenshots for `dsdude screenshot` (C10; PLAN.md 6 WS1, verification.md claim 10).

usage: python tools/screenshot.py <rom> --frames N [--keys file] --out dir

Runs the ROM in py-desmume 0.0.9 for N frames with SDL_VIDEODRIVER=dummy and SDL_AUDIODRIVER=dummy, then writes
top.png and bottom.png (256x192 each) and screenshot.json into dir:
  {"ok": true, "frames": N, "top": "<path>", "bottom": "<path>", "uniform": {"top": bool, "bottom": bool}}
The same JSON is printed on stdout, but libdesmume's own output may interleave with it there: read the file.
`uniform` is true when a screen is a single colour: a hung ROM is detected from the pixels, not is_running().

Key script (--keys, provisional draft of contracts/cli.md until WS2's "Host runner" key format lands):
one line per frame range, `<from>-<to> <buttons>`, frames 1-based and inclusive, buttons separated by spaces or
commas (A B X Y L R START SELECT UP DOWN LEFT RIGHT). `#` starts a comment. Example: `30-35 START`.

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
    """Returns a list of (first_frame, last_frame, [button names])."""
    ranges = []
    with open(path, encoding="utf-8") as f:
        for number, raw in enumerate(f, 1):
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            parts = line.replace(",", " ").split()
            span = parts[0].split("-")
            try:
                first = int(span[0])
                last = int(span[1]) if len(span) > 1 else first
            except ValueError:
                fail(1, f"{path}:{number}: '{parts[0]}' is not a frame range like 30-35")
            if first < 1 or last < first:
                fail(1, f"{path}:{number}: the frame range {parts[0]} is empty or starts before frame 1")
            names = [p.upper() for p in parts[1:]]
            for name in names:
                if name not in BUTTONS:
                    fail(1, f"{path}:{number}: unknown button '{name}' (use {' '.join(BUTTONS)})")
            ranges.append((first, last, names))
    return ranges


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
        for frame in range(1, args.frames + 1):
            want = set()
            for first, last, names in ranges:
                if first <= frame <= last:
                    want.update(names)
            for name in held - want:
                emu.input.keypad_rm_key(keymask(getattr(Keys, "KEY_" + name)))
            for name in want - held:
                emu.input.keypad_add_key(keymask(getattr(Keys, "KEY_" + name)))
            held = want
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
