import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RoomJsonSchema } from "@dsdude/project-format";
import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { edit } from "./history.ts";
import {
  clampView,
  deleteInstances,
  drawOrder,
  eraseCells,
  hitTest,
  instanceBox,
  instanceScreen,
  instancesIn,
  moveInstances,
  type ObjectInfo,
  paintCells,
  placeInstance,
  type RoomLike,
  type SpriteInfo,
  setView,
  snap,
  spritesPerScreen,
} from "./room.ts";

const objects = new Map<string, ObjectInfo>([
  ["obj_bird", { name: "obj_bird", sprite: "spr_bird", screen: "top", visible: true, depth: 0 }],
  ["obj_pipe", { name: "obj_pipe", sprite: "spr_pipe", screen: "top", visible: true, depth: 10 }],
  ["obj_wall", { name: "obj_wall", sprite: "spr_wall", screen: "top", visible: false, depth: 0 }],
  ["obj_ctrl", { name: "obj_ctrl", sprite: null, screen: "bottom", visible: true, depth: 0 }],
]);
const sprites = new Map<string, SpriteInfo>([
  ["spr_bird", { name: "spr_bird", frameWidth: 16, frameHeight: 16, origin: { x: 8, y: 8 } }],
  ["spr_pipe", { name: "spr_pipe", frameWidth: 32, frameHeight: 64, origin: { x: 0, y: 0 } }],
  ["spr_wall", { name: "spr_wall", frameWidth: 16, frameHeight: 16, origin: { x: 0, y: 0 } }],
]);

function room(): RoomLike {
  return RoomJsonSchema.parse({ width: 512, height: 256, instances: [] }) as RoomLike;
}

describe("room core", () => {
  it("places, moves and deletes instances; screen stored only when it differs from the object's", () => {
    const r = produce(room(), (d) => {
      placeInstance(d, objects, "obj_bird", 64.4, 96, "top");
      placeInstance(d, objects, "obj_bird", 10, 10, "bottom");
      placeInstance(d, objects, "obj_ctrl", 0, 0, "bottom");
    });
    expect(r.instances).toEqual([
      { object: "obj_bird", x: 64, y: 96 },
      { object: "obj_bird", x: 10, y: 10, screen: "bottom" },
      { object: "obj_ctrl", x: 0, y: 0 },
    ]);
    expect(instanceScreen(r.instances[2] as never, objects)).toBe("bottom");
    const moved = produce(r, (d) => moveInstances(d, [0, 1], 5, -2));
    expect(moved.instances.slice(0, 2).map((i) => [i.x, i.y])).toEqual([
      [69, 94],
      [15, 8],
    ]);
    expect(produce(r, (d) => deleteInstances(d, [2, 0, 2])).instances).toEqual([r.instances[1]]);
  });

  it("hit-tests the topmost instance by depth, using sprite origins and markers", () => {
    const r = produce(room(), (d) => {
      placeInstance(d, objects, "obj_bird", 16, 16, "top"); // box 8..24
      placeInstance(d, objects, "obj_pipe", 0, 0, "top"); // box 0..32 x 0..64, depth 10 (behind)
      placeInstance(d, objects, "obj_ctrl", 100, 100, "bottom"); // marker 100..116
    });
    expect(instanceBox(r.instances[0] as never, objects, sprites)).toEqual({ x: 8, y: 8, width: 16, height: 16 });
    expect(drawOrder(r, objects, "top")).toEqual([1, 0]);
    expect(hitTest(r, objects, sprites, "top", 10, 10)).toBe(0);
    expect(hitTest(r, objects, sprites, "top", 30, 50)).toBe(1);
    expect(hitTest(r, objects, sprites, "top", 100, 100)).toBe(-1);
    expect(hitTest(r, objects, sprites, "bottom", 105, 110)).toBe(2);
    expect(instancesIn(r, objects, sprites, "top", { x: 20, y: 20, width: 5, height: 5 })).toEqual([1, 0]);
  });

  it("paints walls on grid cells without duplicates and erases them", () => {
    const r = produce(room(), (d) => {
      const added = paintCells(
        d,
        objects,
        "obj_wall",
        "top",
        [
          [3, 3],
          [15, 15],
          [16, 0],
          [40, 17],
          [600, 0],
        ],
        16,
      );
      expect(added).toBe(3);
    });
    expect(r.instances.map((i) => [i.x, i.y])).toEqual([
      [0, 0],
      [16, 0],
      [32, 16],
    ]);
    const again = produce(r, (d) => {
      expect(paintCells(d, objects, "obj_wall", "top", [[1, 1]], 16)).toBe(0);
    });
    expect(again).toBe(r);
    const erased = produce(r, (d) => {
      expect(eraseCells(d, objects, "obj_wall", "top", [[20, 5]], 16)).toBe(1);
    });
    expect(erased.instances.map((i) => [i.x, i.y])).toEqual([
      [0, 0],
      [32, 16],
    ]);
    expect(snap(31, 16)).toBe(16);
    expect(snap(12.6, 1)).toBe(13);
  });

  it("keeps views inside the room", () => {
    expect(clampView({ width: 512, height: 256 }, 400, -5)).toEqual([256, 0]);
    expect(clampView({ width: 256, height: 192 }, 10, 10)).toEqual([0, 0]);
    const r = produce(room(), (d) => setView(d, "bottom", 300, 100));
    expect(r.screens.bottom).toMatchObject({ viewX: 256, viewY: 64 });
  });

  it("counts sprites per screen: visible, sprite-bearing instances only", () => {
    const r = produce(room(), (d) => {
      for (let i = 0; i < 129; i++) placeInstance(d, objects, "obj_bird", i, 0, "top");
      placeInstance(d, objects, "obj_wall", 0, 0, "top");
      placeInstance(d, objects, "obj_ctrl", 0, 0, "bottom");
      placeInstance(d, objects, "obj_pipe", 0, 0, "bottom");
    });
    expect(spritesPerScreen(r, objects)).toEqual({ top: 129, bottom: 1 });
  });

  it("round-trips samples/flappy's room.json through the schema after edits and undo", () => {
    const raw = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../../../samples/flappy/rooms/rm_game/room.json"), "utf8"),
    );
    const parsed = RoomJsonSchema.parse(raw) as RoomLike;
    const e = edit(parsed, (d) => {
      placeInstance(d, objects, "obj_pipe", 200, 0, "top");
      moveInstances(d, [0], 8, 0);
    });
    expect(RoomJsonSchema.parse(e.next)).toEqual(e.next);
    const back = e.undo(e.next);
    expect(back).toEqual(parsed);
    expect(JSON.parse(JSON.stringify(RoomJsonSchema.parse(back)))).toEqual(RoomJsonSchema.parse(raw));
  });
});
