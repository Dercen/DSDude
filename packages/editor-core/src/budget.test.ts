import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkRoomBudgets } from "@dsdude/asset-pipeline/browser";
import { RoomJsonSchema } from "@dsdude/project-format";
import { produce } from "immer";
import { describe, expect, it } from "vitest";
import {
  BUDGET_LIMITS,
  budgetLevel,
  paddedFrame,
  roomBudgets,
  type SpriteCostInput,
  spriteBytes,
  withLastBuild,
} from "./budget.ts";
import { type ObjectInfo, placeInstance, type RoomLike } from "./room.ts";

const objects = new Map<string, ObjectInfo>([
  ["obj_bird", { name: "obj_bird", sprite: "spr_bird", screen: "top", visible: true, depth: 0 }],
  ["obj_pipe", { name: "obj_pipe", sprite: "spr_pipe", screen: "top", visible: true, depth: 0 }],
  ["obj_wall", { name: "obj_wall", sprite: "spr_wall", screen: "top", visible: false, depth: 0 }],
  ["obj_ctrl", { name: "obj_ctrl", sprite: null, screen: "top", visible: true, depth: 0 }],
]);
const sprites = new Map<string, SpriteCostInput>([
  ["spr_bird", { frames: 3, frameWidth: 16, frameHeight: 16, colorMode: "16" }],
  ["spr_pipe", { frames: 1, frameWidth: 32, frameHeight: 64, colorMode: "256" }],
  ["spr_wall", { frames: 1, frameWidth: 20, frameHeight: 20, colorMode: "16" }],
]);

function room(): RoomLike {
  return produce(RoomJsonSchema.parse({ width: 512, height: 256 }) as RoomLike, (d) => {
    for (let i = 0; i < 5; i++) placeInstance(d, objects, "obj_bird", i * 16, 0, "top");
    placeInstance(d, objects, "obj_pipe", 0, 0, "top");
    placeInstance(d, objects, "obj_wall", 0, 0, "top");
    placeInstance(d, objects, "obj_ctrl", 0, 0, "top");
    placeInstance(d, objects, "obj_pipe", 0, 0, "bottom");
  });
}

describe("room budgets", () => {
  it("uses the C13 limits of contracts/runtime-limits.json", () => {
    const c13 = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../../../contracts/runtime-limits.json"), "utf8"),
    ) as { limits: Record<string, number> };
    for (const [key, value] of Object.entries(BUDGET_LIMITS)) expect([key, value]).toEqual([key, c13.limits[key]]);
  });

  it("match the pipeline's checkRoomBudgets for the same sprites; invisible objects load but take no slot", () => {
    const live = roomBudgets(room(), objects, sprites);
    const manifest = {
      sprites: Object.fromEntries([...sprites].map(([name, s], id) => [name, { id, file: `${name}.png`, ...s }])),
      backgrounds: {},
      sounds: {},
    };
    const set = {
      room: "rm",
      screens: {
        top: { sprites: ["spr_bird", "spr_pipe", "spr_wall"], backgrounds: [] },
        bottom: { sprites: ["spr_pipe"], backgrounds: [] },
      },
      sounds: [],
    };
    type Rooms = { rooms?: Record<string, Record<"top" | "bottom", Record<string, number>>> };
    const built = (checkRoomBudgets(manifest as never, [set] as never).manifest as Rooms).rooms?.rm;
    expect(built).toBeDefined();
    for (const screen of ["top", "bottom"] as const)
      expect(live[screen]).toMatchObject({
        objVramBytes: built?.[screen].objVramBytes,
        obj16Palettes: built?.[screen].obj16Palettes,
        obj256Palettes: built?.[screen].obj256Palettes,
      });
    expect(live.top.sprites).toBe(6); // 5 birds + 1 pipe; the wall is invisible, obj_ctrl has no sprite
    expect(live.bottom.sprites).toBe(1);
    // 3 frames of 16x16 at 4bpp (128 bytes each, already aligned).
    expect(spriteBytes({ frames: 3, frameWidth: 16, frameHeight: 16, colorMode: "16" })).toBe(384);
    expect(paddedFrame(20, 20)).toEqual({ width: 32, height: 32 });
    expect(paddedFrame(80, 16)).toBeNull();
  });

  it("takes the larger of the live and last-build figures, and grades them", () => {
    const live = roomBudgets(room(), objects, sprites).top;
    const merged = withLastBuild(live, { objVramBytes: 1, obj16Palettes: 7, obj256Palettes: null });
    expect(merged).toEqual({ ...live, obj16Palettes: 7 });
    expect(withLastBuild(live, null)).toEqual(live);
    expect([budgetLevel(10, 16), budgetLevel(15, 16), budgetLevel(17, 16)]).toEqual(["ok", "warn", "over"]);
  });
});
