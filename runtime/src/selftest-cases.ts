/**
 * The selftest ROM's checks (docs/kickoff/ws3.md task 3): one headless `dsdude screenshot` run per case, its PNGs
 * against goldens in fixtures/runtime/selftest/golden/, its DSD| log against the patterns below. Key scripts
 * (C8 format, contracts/log-protocol.md) live in fixtures/runtime/selftest/keys/<name>.txt. Boot takes about 30
 * frames, so input starts at frame 49; every press lasts 2 frames so the ROM's once-per-frame scanKeys cannot miss
 * it.
 */

export interface SelftestCase {
  name: string;
  /** Frames to run before the screenshot. */
  frames: number;
  /** Key-script file name under keys/, if any. */
  keys?: string;
  /** Screens compared with the golden. */
  golden: ("top" | "bottom")[];
  /** Each pattern must match at least one line. */
  expect: RegExp[];
  /** Each pattern must match exactly one line. */
  once?: RegExp[];
}

const BOOT_LOG: RegExp[] = [
  /^DSD\|LOG\|selftest: emulator=.+ log=(raw|legacy)$/,
  /^DSD\|LOG\|bg: nitro:\/bg\/bg\.grf screen=0 err=0$/,
  /^DSD\|LOG\|bg: nitro:\/bg\/bg\.grf screen=1 err=0$/,
  /^DSD\|LOG\|grf: nitro:\/gfx\/spr16\.grf screen=0 err=0 bpp=8 frames=3 offset=0 stride=256 upload=ok$/,
  /^DSD\|LOG\|grf: nitro:\/gfx\/spr16\.grf screen=1 err=0 bpp=8 frames=3 offset=0 stride=256 upload=ok$/,
  // The 8x8 4bpp frame is 32 bytes and takes a whole 128-byte slot.
  /^DSD\|LOG\|grf: nitro:\/gfx\/spr8x8\.grf screen=1 err=0 bpp=4 frames=1 offset=768 stride=128 upload=ok$/,
  /^DSD\|LOG\|grf: nitro:\/gfx\/spr64\.grf screen=0 err=0 bpp=8 frames=1 offset=768 stride=4096 upload=ok$/,
  /^DSD\|LOG\|mm: mmInitDefault\(nitro:\/soundbank\.bin\)=ok$/,
  /^DSD\|LOG\|mm: mmLoad\(MOD_SELFTEST\)=0$/,
  /^DSD\|LOG\|mm: mmLoadEffect\(SFX_BLIP\)=0$/,
  /^DSD\|LOG\|mm: mmLoadEffect\(SFX_LOOP\)=0$/,
  /^DSD\|LOG\|mm: mmLoadEffect\(\d+\)=1 \(bad id\)$/,
  /^DSD\|LOG\|mm: mmEffect\(SFX_BLIP\)=[1-9]\d*$/,
  /^DSD\|LOG\|mm: after 60 frames active=1 /,
  /^DSD\|LOG\|nitrofs: read 1048576 B sum=133693440 ok in \d+ us /,
  // C8 text rules: a 300-character line whole, '%' literal, CR dropped and LF splitting the line.
  /^DSD\|LOG\|long300:8(9012345678){29}9$/,
  /^DSD\|LOG\|percent: 100% done %d %s %%$/,
  /^DSD\|LOG\|split: first$/,
  /^DSD\|LOG\|split: second$/,
  // snd: blip 8,840 + loop 6,016 + the module 420 + its sample 84 = 15,360 B (soundbank.bin's own sizes).
  /^DSD\|MEM\|heapfree=\d+,snd=15\/768,objvram_top=5\/128,objvram_bot=1\/128,cstack=\d+\/10$/,
  /^DSD\|STAT\|fps=60,inst=0,spr_top=128,spr_bot=128,oam_drop=0,aff_drop=0,sfx_drop=0,ops=0$/,
];

export const SELFTEST_CASES: SelftestCase[] = [
  {
    name: "boot",
    frames: 120,
    golden: ["top", "bottom"],
    expect: BOOT_LOG,
    once: [/^DSD\|READY\|\d+\.\d+\.\d+\|[0-9a-f]{8}$/, /^DSD\|LOG\|long300:/, /^DSD\|MEM\|/],
  },
  {
    // D-pad then touch: the 8x8 sprite ends where the stylus was.
    name: "input",
    frames: 110,
    keys: "input.txt",
    golden: ["top", "bottom"],
    expect: [
      /^DSD\|LOG\|input: down=RIGHT up=- held=RIGHT$/,
      /^DSD\|LOG\|input: down=- up=RIGHT held=-$/,
      /^DSD\|LOG\|touch: press \d+,\d+$/,
      /^DSD\|LOG\|touch: release \d+,\d+$/,
      /^DSD\|LOG\|input: down=A up=- held=A$/,
      /^DSD\|LOG\|mm: mmEffect\(SFX_BLIP\)=[1-9]\d*$/,
    ],
  },
  {
    // Page 2: n 8 -> 10, then affine.
    name: "scanline",
    frames: 100,
    keys: "scanline.txt",
    golden: ["top", "bottom"],
    expect: [
      /^DSD\|LOG\|scanline: n=9 mode=normal$/,
      /^DSD\|LOG\|scanline: n=10 mode=normal$/,
      /^DSD\|LOG\|scanline: n=10 mode=affine$/,
      /^DSD\|STAT\|fps=60,inst=0,spr_top=10,spr_bot=0,/,
    ],
  },
  {
    name: "error-box",
    frames: 90,
    keys: "error-box.txt",
    golden: ["top", "bottom"],
    expect: [/^DSD\|LOG\|input: down=R up=- held=R$/],
  },
  {
    // Page 4: the boot figures on screen for hardware. The bottom screen shows timings, so only the top is golden.
    name: "results",
    frames: 90,
    keys: "results.txt",
    golden: ["top"],
    expect: [/^DSD\|LOG\|input: down=L up=- held=L$/],
  },
  {
    name: "console",
    frames: 90,
    keys: "console.txt",
    golden: ["top", "bottom"],
    expect: [/^DSD\|LOG\|input: down=SELECT up=- held=SELECT$/],
  },
];

/** Problems with a case's log: patterns never matched, or matched other than once. */
export function checkLog(log: readonly string[], c: Pick<SelftestCase, "expect" | "once">): string[] {
  const out: string[] = [];
  for (const re of c.expect) if (!log.some((l) => re.test(l))) out.push(`no line matches ${re}`);
  for (const re of c.once ?? []) {
    const n = log.filter((l) => re.test(l)).length;
    if (n !== 1) out.push(`${n} lines match ${re} (want exactly 1)`);
  }
  return out;
}
