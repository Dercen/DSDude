# SPDX-License-Identifier: Zlib
#
# Makes the selftest ROM's NitroFS assets (docs/kickoff/ws3.md task 3; spikes 10 and 11) with the installed
# BlocksDS 1.24.0 grit and mmutil and the PLAN.md 2.9 command lines. Local Windows machine only.
#
#   python runtime/selftest/make_assets.py
#
# Inputs:  fixtures/assets/{sprite16x16x3.png, background256x192.png, blip.wav} (C14), plus generated ones.
# Outputs: fixtures/runtime/selftest/src/*        indexed PNGs, loop.wav and selftest.xm fed to grit/mmutil
#          fixtures/runtime/selftest/nitrofs/*    the ROM's NitroFS root (GRFs, soundbank.bin, big.bin)
#          fixtures/runtime/selftest/commands.txt every command line run, with exit codes and tool versions
#          runtime/selftest/source/soundbank.h    mmutil's header (ids for the selftest)
# Every spawned tool gets a timeout. Needs Pillow (in the same user site as py-desmume).

import os
import shutil
import struct
import subprocess
import sys
import zlib

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(ROOT, "fixtures", "assets")
OUT = os.path.join(ROOT, "fixtures", "runtime", "selftest")
SRC = os.path.join(OUT, "src")
NITRO = os.path.join(OUT, "nitrofs")
HEADER = os.path.join(HERE, "source", "soundbank.h")

WONDERFUL_BIN = r"C:\msys64\opt\wonderful\bin"
TOOLS = r"C:\msys64\opt\wonderful\thirdparty\blocksds\core\tools"
GRIT = os.path.join(TOOLS, "grit", "grit.exe")
MMUTIL = os.path.join(TOOLS, "mmutil", "mmutil.exe")
TIMEOUT_S = 120

MAGENTA = (255, 0, 255)
BIG_BYTES = 1024 * 1024

log_lines = []


def rel(p):
    return os.path.relpath(p, ROOT).replace("\\", "/")


def run(args, cwd):
    """Runs a console tool with the Wonderful bin first on PATH (else 0xC0000135) and a timeout."""
    env = dict(os.environ)
    key = next((k for k in env if k.upper() == "PATH"), "PATH")
    env[key] = WONDERFUL_BIN + os.pathsep + env.get(key, "")
    shown = " ".join([os.path.basename(args[0])] + [a.replace(ROOT + os.sep, "").replace("\\", "/") for a in args[1:]])
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    p = subprocess.run(args, cwd=cwd, env=env, capture_output=True, text=True, timeout=TIMEOUT_S, creationflags=flags)
    log_lines.append(f"(cwd {rel(cwd)}) {shown}\n  -> exit {p.returncode}")
    if p.returncode != 0:
        sys.exit(f"{shown} failed ({p.returncode}):\n{p.stdout}\n{p.stderr}")
    return p


def rgba_pixels(im):
    raw = im.convert("RGBA").tobytes()
    return [tuple(raw[i : i + 4]) for i in range(0, len(raw), 4)]


def indexed(pixels, size, name, max_colors):
    """An indexed PNG: magenta at index 0 (transparent), opaque colours from index 1 in first-seen order."""
    w, h = size
    palette = [MAGENTA]
    data = bytearray()
    for px in pixels:
        if px[3] < 128:
            data.append(0)
            continue
        rgb = px[:3]
        if rgb not in palette:
            palette.append(rgb)
        data.append(palette.index(rgb))
    if len(palette) > max_colors:
        sys.exit(f"{name}: {len(palette)} colours, more than {max_colors}")
    im = Image.frombytes("P", (w, h), bytes(data))
    flat = [c for rgb in palette for c in rgb]
    im.putpalette(flat + [0] * (768 - len(flat)))
    path = os.path.join(SRC, name)
    im.save(path, optimize=False)
    return path


def sprite_sheet():
    """fixtures/assets/sprite16x16x3.png has its 3 frames side by side; grit wants them stacked (2.9)."""
    im = Image.open(os.path.join(ASSETS, "sprite16x16x3.png")).convert("RGBA")
    fw, fh = 16, 16
    frames = im.width // fw
    sheet = Image.new("RGBA", (fw, fh * frames))
    for i in range(frames):
        sheet.paste(im.crop((i * fw, 0, (i + 1) * fw, fh)), (0, i * fh))
    return indexed(rgba_pixels(sheet), sheet.size, "spr16.png", 256)


def small_sprite():
    """One 8x8 frame with 3 opaque colours: the 4bpp (-gB4 -pn16) case, padded to 128 bytes in OBJ VRAM."""
    px = []
    for y in range(8):
        for x in range(8):
            if x in (0, 7) or y in (0, 7):
                px.append((255, 255, 0, 255))
            elif (x + y) % 2 == 0:
                px.append((0, 200, 255, 255))
            elif x in (3, 4) and y in (3, 4):
                px.append((255, 255, 255, 255))
            else:
                px.append((0, 0, 0, 0))
    return indexed(px, (8, 8), "spr8x8.png", 16)


def big_sprite():
    """64x64 ring for the scanline page: 64x64 is the widest OBJ, so it loads the OBJ line budget fastest."""
    px = []
    for y in range(64):
        for x in range(64):
            d2 = (x - 31.5) ** 2 + (y - 31.5) ** 2
            if d2 < 30**2 and d2 > 18**2:
                px.append((255, 128 + (x * 2), 64, 255))
            elif d2 <= 18**2:
                px.append((40, 40, 160, 255))
            else:
                px.append((0, 0, 0, 0))
    return indexed(px, (64, 64), "spr64.png", 256)


def background():
    im = Image.open(os.path.join(ASSETS, "background256x192.png")).convert("RGBA")
    return indexed(rgba_pixels(im), im.size, "bg.png", 256)


def loop_wav():
    """Spike 11: mono 16-bit 22050 Hz, only fmt/smpl/data chunks, a loop of >= 16 samples (2.9)."""
    rate, period, periods = 22050, 50, 40  # 441 Hz square-ish tone, loop over the last 20 periods
    n = period * periods
    samples = []
    for i in range(n):
        phase = i % period
        samples.append(8000 if phase < period // 2 else -8000)
    data = struct.pack(f"<{n}h", *samples)
    fmt = struct.pack("<HHIIHH", 1, 1, rate, rate * 2, 2, 16)
    loop_start, loop_end = period * 20, n - 1
    smpl = struct.pack("<9I", 0, 0, 1_000_000_000 // rate, 60, 0, 0, 0, 1, 0)
    smpl += struct.pack("<6I", 0, 0, loop_start, loop_end, 0, 0)
    body = b"WAVE"
    for tag, chunk in ((b"fmt ", fmt), (b"smpl", smpl), (b"data", data)):
        body += tag + struct.pack("<I", len(chunk)) + chunk
    path = os.path.join(SRC, "loop.wav")
    with open(path, "wb") as f:
        f.write(b"RIFF" + struct.pack("<I", len(body)) + body)
    return path


def xm_module():
    """Spike 11: a minimal FastTracker 2 XM (v0104): 2 channels, 1 pattern of 64 rows, 1 instrument with one
    looped 8-bit sample. Written here because WS5's XM fixture is not on main yet."""
    channels, rows = 2, 64
    header = b"Extended Module: " + b"DSDude selftest".ljust(20, b"\0") + b"\x1a" + b"DSDude make_assets".ljust(20, b"\0")
    header += struct.pack("<H", 0x0104)
    order = bytes([0]) + bytes(255)
    header += struct.pack("<I", 276) + struct.pack("<8H", 1, 0, channels, 1, 1, 1, 6, 125) + order

    # Pattern: an arpeggio C-4 E-4 G-4 C-5 on channel 0 every 4 rows, a bass C-3 on channel 1 every 16 rows.
    notes = [49, 53, 56, 61]  # XM note numbers: 1 = C-0, so C-4 = 49
    packed = bytearray()
    for r in range(rows):
        for ch in range(channels):
            note = 0
            if ch == 0 and r % 4 == 0:
                note = notes[(r // 4) % 4]
            if ch == 1 and r % 16 == 0:
                note = 37
            if note:
                packed += bytes([0x80 | 0x01 | 0x02, note, 1])  # note + instrument
            else:
                packed += bytes([0x80])  # empty
    pattern = struct.pack("<IBHH", 9, 0, rows, len(packed)) + packed

    # Instrument: size 263 (the common FT2 layout), one sample, keymap all 0, no envelopes.
    sample_len = 64
    wave = bytes((64 if i < 32 else -64) & 0xFF for i in range(sample_len))
    delta, prev = bytearray(), 0
    for b in wave:
        v = b if b < 128 else b - 256
        delta.append((v - prev) & 0xFF)
        prev = v
    inst = b"tone".ljust(22, b"\0") + struct.pack("<BH", 0, 1)
    inst += struct.pack("<I", 40) + bytes(96) + bytes(48) + bytes(48) + bytes(14) + struct.pack("<H", 0)
    inst = struct.pack("<I", 263) + inst
    inst = inst.ljust(263, b"\0")
    # Sample header: loop the whole sample forward, volume 48, relative note +12 (a 64-byte loop sounds low).
    shdr = struct.pack("<IIIBbBBbB", sample_len, 0, sample_len, 48, 0, 1, 128, 12, 0) + b"square".ljust(22, b"\0")
    path = os.path.join(SRC, "selftest.xm")
    with open(path, "wb") as f:
        f.write(header + pattern + inst + shdr + bytes(delta))
    return path


def big_file():
    """1 MB for the timed NitroFS read: byte i = (i * 7 + (i >> 8)) & 0xFF (compresses well in git)."""
    data = bytes(((i * 7 + (i >> 8)) & 0xFF) for i in range(BIG_BYTES))
    with open(os.path.join(NITRO, "big.bin"), "wb") as f:
        f.write(data)
    return sum(data) & 0xFFFFFFFF


def grit(png, out, bpp4=False, bg=False):
    """PLAN.md 2.9 lines. cwd = the output folder, so -o is a bare name and the .grf lands there."""
    os.makedirs(os.path.dirname(out), exist_ok=True)
    stem = os.path.basename(out)
    target = out + ".grf"
    if os.path.exists(target):
        os.remove(target)
    if bg:
        args = [GRIT, png, "-gB8", "-gt", "-m", "-mLs", "-mRtf", "-gTFF00FF", "-ftr", "-fh!", "-W1", "-o" + stem]
    elif bpp4:
        args = [GRIT, png, "-gB4", "-pn16", "-gt", "-gTFF00FF", "-m!", "-ftr", "-fh!", "-W1", "-o" + stem]
    else:
        args = [GRIT, png, "-gB8", "-gt", "-gTFF00FF", "-m!", "-ftr", "-fh!", "-W1", "-o" + stem]
    run(args, os.path.dirname(out))
    if not os.path.exists(target):
        sys.exit(f"grit wrote no {target}")


def mmutil(inputs):
    """2.9: WAVs sorted by name, then modules; attached -o/-h; cwd a writable build dir (mm_*_tmp.*)."""
    bank = os.path.join(NITRO, "soundbank.bin")
    for p in (bank, HEADER):
        if os.path.exists(p):
            os.remove(p)
    work = os.path.join(OUT, "mmwork")
    os.makedirs(work, exist_ok=True)
    try:
        run([MMUTIL, *inputs, "-d", "-o" + bank, "-h" + HEADER], work)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    for p in (bank, HEADER):
        if not os.path.exists(p):
            sys.exit(f"mmutil wrote no {p}")
    # mmutil writes CRLF; the repo stores LF (.gitattributes), so a re-run leaves no diff.
    with open(HEADER, "rb") as f:
        text = f.read().replace(b"\r\n", b"\n")
    with open(HEADER, "wb") as f:
        f.write(text)


def main():
    for d in (SRC, NITRO):
        if os.path.isdir(d):
            shutil.rmtree(d)
        os.makedirs(d)
    os.makedirs(os.path.dirname(HEADER), exist_ok=True)

    grit(sprite_sheet(), os.path.join(NITRO, "gfx", "spr16"))
    grit(small_sprite(), os.path.join(NITRO, "gfx", "spr8x8"), bpp4=True)
    grit(big_sprite(), os.path.join(NITRO, "gfx", "spr64"))
    grit(background(), os.path.join(NITRO, "bg", "bg"), bg=True)

    blip = os.path.join(SRC, "blip.wav")
    shutil.copyfile(os.path.join(ASSETS, "blip.wav"), blip)
    waves = sorted([blip, loop_wav()], key=os.path.basename)
    mmutil(waves + [xm_module()])

    total = big_file()
    version = run([MMUTIL, "-V"], OUT).stdout.strip()

    with open(os.path.join(OUT, "commands.txt"), "w", newline="\n") as f:
        f.write("# Written by runtime/selftest/make_assets.py; do not edit.\n")
        f.write(f"# mmutil -V: {version}\n")
        f.write(f"# big.bin: {BIG_BYTES} bytes, byte sum (u32) = {total}\n")
        for line in log_lines:
            f.write(line + "\n")
    print("\n".join(log_lines))
    print(f"mmutil -V: {version}; big.bin sum {total}")


if __name__ == "__main__":
    main()
