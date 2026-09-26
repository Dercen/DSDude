/**
 * Live per-screen budgets for the editors' meters (C13 limits): what the room's placed instances cost, computed as
 * the asset pipeline's checkRoomBudgets does (sprite memory = frames x 128-byte-aligned padded frames; one colour set
 * per 16-colour sprite, one 256-colour set per 256-colour sprite), plus the sprite count the DS draws. The build's
 * `assets.manifest.json` figures also cover sprites the room's code creates; `withLastBuild` takes the larger. Pure.
 */
import { LIMITS, objSizeFor, spriteVramBytes } from "@dsdude/asset-pipeline/browser";
import { instanceScreen, type ObjectInfo, type RoomLike, type Screen } from "./room.ts";

/** A sprite's geometry with its colour mode resolved ("auto" becomes what the pipeline builds). */
export interface SpriteCostInput {
  frames: number;
  frameWidth: number;
  frameHeight: number;
  colorMode: "16" | "256";
  /** The manifest's figure, when a build has run. */
  vramBytes?: number;
}

export interface ScreenBudget {
  /** Visible sprite-bearing instances (OAM entries). */
  sprites: number;
  objVramBytes: number;
  obj16Palettes: number;
  obj256Palettes: number;
}

export interface BudgetLimits {
  spritesPerScreen: number;
  objVramBytesPerScreen: number;
  obj16PalettesPerScreen: number;
  obj256PalettesPerScreen: number;
}

/**
 * The C13 limits the meters use. The sprite count is repeated here (the rest come from the pipeline, which repeats
 * them for the same reason: this package stays pure); budget.test.ts fails when they drift from
 * contracts/runtime-limits.json.
 */
export const BUDGET_LIMITS: BudgetLimits = {
  spritesPerScreen: 128,
  objVramBytesPerScreen: LIMITS.objVramBytesPerScreen,
  obj16PalettesPerScreen: LIMITS.obj16PalettesPerScreen,
  obj256PalettesPerScreen: LIMITS.obj256PalettesPerScreen,
};

/** Sprite memory of one sprite (the manifest's figure when known). */
export function spriteBytes(sprite: SpriteCostInput): number {
  return spriteVramBytes({ id: 0, ...sprite });
}

/** The OBJ size a frame pads to, or null when it is bigger than 64x64 (the pipeline refuses it: E401). */
export function paddedFrame(frameWidth: number, frameHeight: number): { width: number; height: number } | null {
  return objSizeFor(frameWidth, frameHeight);
}

/**
 * Each screen's budget from the placed instances: every sprite used on a screen is loaded once (visible or not),
 * and only visible instances take a sprite slot.
 */
export function roomBudgets(
  room: RoomLike,
  objects: ReadonlyMap<string, ObjectInfo>,
  sprites: ReadonlyMap<string, SpriteCostInput>,
): Record<Screen, ScreenBudget> {
  const used: Record<Screen, Set<string>> = { top: new Set(), bottom: new Set() };
  const slots: Record<Screen, number> = { top: 0, bottom: 0 };
  for (const inst of room.instances) {
    const obj = objects.get(inst.object);
    if (!obj?.sprite) continue;
    const screen = instanceScreen(inst, objects);
    used[screen].add(obj.sprite);
    if (obj.visible) slots[screen]++;
  }
  const budget = (screen: Screen): ScreenBudget => {
    const known = [...used[screen]].map((n) => sprites.get(n)).filter((s): s is SpriteCostInput => !!s);
    return {
      sprites: slots[screen],
      objVramBytes: known.reduce((sum, s) => sum + spriteBytes(s), 0),
      obj16Palettes: known.filter((s) => s.colorMode === "16").length,
      obj256Palettes: known.filter((s) => s.colorMode === "256").length,
    };
  };
  return { top: budget("top"), bottom: budget("bottom") };
}

/** The larger of the live figures and the last build's (which include sprites created by code). */
export function withLastBuild(
  live: ScreenBudget,
  built: Partial<Record<"objVramBytes" | "obj16Palettes" | "obj256Palettes", number | null>> | null | undefined,
): ScreenBudget {
  return {
    sprites: live.sprites,
    objVramBytes: Math.max(live.objVramBytes, built?.objVramBytes ?? 0),
    obj16Palettes: Math.max(live.obj16Palettes, built?.obj16Palettes ?? 0),
    obj256Palettes: Math.max(live.obj256Palettes, built?.obj256Palettes ?? 0),
  };
}

export type BudgetLevel = "ok" | "warn" | "over";

export function budgetLevel(used: number, max: number): BudgetLevel {
  return used > max ? "over" : used >= max * 0.9 ? "warn" : "ok";
}
