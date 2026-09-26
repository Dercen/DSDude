/**
 * `checkRoomBudgets` (C4 `CheckRoomBudgetsFn`, C3 section 9): totals each room's sprite memory, colour sets,
 * backgrounds and sound memory per screen from the compiler's room asset sets, adds the figures to the manifest as
 * `rooms`, and reports overflows as E413-E417. BuildService calls it after compileProject. Pure TypeScript.
 *
 * It accepts any C4 `AssetManifest`, including the provisional one BuildService builds for compileOnly before the
 * first pack: figures the manifest lacks are derived from what it has (sprite memory from the frame geometry), or
 * count as 0 (background and sound sizes).
 */
import type { Diagnostic } from "@dsdude/project-format";
import type { AssetManifest, RoomAssetSet } from "@dsdude/toolchain";
import { frameBytes, objSizeFor, roundUp } from "./image/objsize.ts";
import { LIMITS } from "./limits.ts";
import type { RoomFigures, ScreenFigures } from "./manifest.ts";
import { type Problem, toDiagnostic } from "./problems.ts";

type ManifestSprite = AssetManifest["sprites"][string] & { vramBytes?: number; colors?: number };
type ManifestSized = { vramBytes?: number; ramBytes?: number };

/** How many names a hint lists at most. */
const HINT_NAMES = 3;
/** The two screens, in the order figures and diagnostics use them. */
const SCREENS = ["top", "bottom"] as const;

/** Sprite memory of one sprite: the C3 figure, else frames x the 128-byte-aligned padded frame size. */
export function spriteVramBytes(sprite: ManifestSprite): number {
  if (sprite.vramBytes !== undefined) return sprite.vramBytes;
  const size = objSizeFor(sprite.frameWidth, sprite.frameHeight);
  if (size === null) return 0; // E401 already stops the build for such a sprite.
  return sprite.frames * roundUp(frameBytes(size.width, size.height, sprite.colorMode), LIMITS.objVramAlignBytes);
}

/** Joins names for a hint: "a", "a or b", "a, b or c" (with `last` as the final word). */
export function nameList(names: readonly string[], last = "or"): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${last} ${names[names.length - 1]}`;
}

/** Unique names in first-seen order. */
function unique(names: readonly string[]): string[] {
  return [...new Set(names)];
}

/** The `n` names with the largest `size`, ties in name order. */
function largest(names: readonly string[], size: (name: string) => number, n = HINT_NAMES): string[] {
  return [...names].sort((a, b) => size(b) - size(a) || (a < b ? -1 : a > b ? 1 : 0)).slice(0, n);
}

/** Figures and problems for one screen of one room. */
function screenFigures(
  manifest: AssetManifest,
  sprites: readonly string[],
  backgrounds: readonly string[],
  screen: string,
): { figures: ScreenFigures; problems: Problem[] } {
  const known = sprites.filter((n) => manifest.sprites[n] !== undefined);
  const spriteOf = (n: string) => manifest.sprites[n] as ManifestSprite;
  const vram = (n: string) => spriteVramBytes(spriteOf(n));
  const bgs = backgrounds.filter((n) => manifest.backgrounds[n] !== undefined);
  const bgVram = (n: string) => (manifest.backgrounds[n] as ManifestSized).vramBytes ?? 0;
  const pal16 = known.filter((n) => spriteOf(n).colorMode === "16");
  const pal256 = known.filter((n) => spriteOf(n).colorMode === "256");
  const figures: ScreenFigures = {
    objVramBytes: known.reduce((sum, n) => sum + vram(n), 0),
    obj16Palettes: pal16.length,
    obj256Palettes: pal256.length,
    bgPalettes: bgs.length,
    bgVramBytes: bgs.reduce((sum, n) => sum + bgVram(n), 0),
  };
  const problems: Problem[] = [];
  if (figures.objVramBytes > LIMITS.objVramBytesPerScreen) {
    const list = nameList(largest(known, vram), "and");
    problems.push({
      code: "E413",
      args: { bytes: figures.objVramBytes, screen, max: LIMITS.objVramBytesPerScreen, list },
    });
  }
  if (pal16.length > LIMITS.obj16PalettesPerScreen) {
    const over = pal16.length - LIMITS.obj16PalettesPerScreen;
    const list = nameList(pal16.slice(0, Math.max(over, 1)));
    problems.push({ code: "E414", args: { count: pal16.length, screen, max: LIMITS.obj16PalettesPerScreen, list } });
  }
  if (pal256.length > LIMITS.obj256PalettesPerScreen) {
    // The easiest sprites to move to the 16-colour sets are those with the fewest colours.
    const over = pal256.length - LIMITS.obj256PalettesPerScreen;
    const colours = (n: string) => -(spriteOf(n).colors ?? 0);
    const MIN_SUGGESTIONS = 2;
    const list = nameList(largest(pal256, colours, Math.max(over, MIN_SUGGESTIONS)));
    problems.push({ code: "E415", args: { count: pal256.length, screen, max: LIMITS.obj256PalettesPerScreen, list } });
  }
  if (bgs.length > LIMITS.bg256PaletteSlotsPerScreen) {
    const list = nameList(bgs, "and");
    problems.push({ code: "E416", args: { count: bgs.length, screen, max: LIMITS.bg256PaletteSlotsPerScreen, list } });
  }
  return { figures, problems };
}

/** C4 `checkRoomBudgets`: the manifest with `rooms` added, and E413-E417 for every overflow. */
export function checkRoomBudgets(
  manifest: AssetManifest,
  roomSets: RoomAssetSet[],
): { manifest: AssetManifest; diagnostics: Diagnostic[] } {
  const rooms: Record<string, RoomFigures> = {};
  const diagnostics: Diagnostic[] = [];
  for (const set of roomSets) {
    const file = `rooms/${set.room}/room.json`;
    const perScreen = SCREENS.map((screen) =>
      screenFigures(manifest, unique(set.screens[screen].sprites), unique(set.screens[screen].backgrounds), screen),
    );
    const sounds = unique(set.sounds).filter((n) => manifest.sounds[n] !== undefined);
    const ram = (n: string) => (manifest.sounds[n] as ManifestSized).ramBytes ?? 0;
    const soundRamBytes = sounds.reduce((sum, n) => sum + ram(n), 0);
    const problems = perScreen.flatMap((s) => s.problems);
    if (soundRamBytes > LIMITS.soundRamBytes) {
      const list = nameList(largest(sounds, ram), "and");
      problems.push({ code: "E417", args: { bytes: soundRamBytes, max: LIMITS.soundRamBytes, list } });
    }
    for (const p of problems) diagnostics.push(toDiagnostic(p, set.room, file));
    const [top, bottom] = perScreen.map((s) => s.figures) as [ScreenFigures, ScreenFigures];
    rooms[set.room] = { top, bottom, soundRamBytes };
  }
  return { manifest: { ...manifest, rooms } as AssetManifest, diagnostics };
}
