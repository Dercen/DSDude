/**
 * The budget path end to end with WS4's real compiler: packAssets -> compileProject (C4 CompileFn, which returns the
 * room asset sets) -> checkRoomBudgets. Catches drift between the compiler's RoomAssetSet output and the budgets.
 * `@dsdude/compiler` is a devDependency used only here.
 */
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { compileProject } from "@dsdude/compiler";
import type { Project } from "@dsdude/project-format";
import { loadProject } from "@dsdude/project-format/node";
import { describe, expect, it } from "vitest";
import { checkRoomBudgets } from "../budgets.ts";
import type { AssetPackManifest, RoomFigures } from "../manifest.ts";
import { addSprite, copySample, FAKE_SAMPLE_BYTES, fakeTools, tempDir, writeJson } from "../testing/fake-tools.ts";
import { packAssets } from "./pack.ts";

async function load(dir: string): Promise<Project> {
  const { project, diagnostics } = await loadProject(dir);
  if (project === null) throw new Error(JSON.stringify(diagnostics));
  return project;
}

/** packAssets with fake tools, then the real compiler, then checkRoomBudgets. */
async function packCompileBudget(dir: string) {
  const project = await load(dir);
  const tools = fakeTools(tempDir());
  const packed = await packAssets(project, tools.paths, tempDir(), { runTool: tools.run });
  const compiled = compileProject(project, packed.manifest);
  const budgets = checkRoomBudgets(packed.manifest, compiled.roomSets);
  const rooms = (budgets.manifest as AssetPackManifest).rooms as Record<string, RoomFigures>;
  return { packed, compiled, budgets, rooms };
}

describe("budgets over the compiler's room sets", () => {
  it("totals samples/flappy's rm_game: three 16-colour sprites on the top screen, three sounds", async () => {
    const { packed, compiled, budgets, rooms } = await packCompileBudget(copySample("samples/flappy"));
    expect(packed.diagnostics).toEqual([]);
    expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(budgets.diagnostics).toEqual([]);
    const { spr_bird, spr_gap, spr_pipe } = packed.manifest.sprites;
    expect(rooms.rm_game?.top).toEqual({
      objVramBytes: (spr_bird?.vramBytes ?? 0) + (spr_gap?.vramBytes ?? 0) + (spr_pipe?.vramBytes ?? 0),
      obj16Palettes: 3,
      obj256Palettes: 0,
      bgPalettes: 0,
      bgVramBytes: 0,
    });
    const SOUNDS = 3;
    expect(rooms.rm_game?.soundRamBytes).toBe(SOUNDS * FAKE_SAMPLE_BYTES);
  });

  it("reports E414 when a room places more 16-colour sprites on one screen than the DS has colour sets", async () => {
    // samples/minimal plus 17 objects, each with its own one-colour (so 16-colour) sprite, all placed in rm_main.
    const dir = copySample("samples/minimal");
    const COUNT = 17;
    const SIDE = 8;
    const room = path.join(dir, "rooms", "rm_main", "room.json");
    const roomJson = JSON.parse(readFileSync(room, "utf8")) as {
      instances: { object: string; x: number; y: number }[];
    };
    for (let i = 0; i < COUNT; i++) {
      addSprite(dir, `spr_dot${i}`, 1, SIDE, SIDE);
      writeJson(path.join(dir, "objects", `obj_dot${i}`, "object.json"), {
        sprite: `spr_dot${i}`,
        parent: null,
        visible: true,
        depth: 0,
        screen: "top",
      });
      roomJson.instances.push({ object: `obj_dot${i}`, x: i * SIDE, y: 0 });
    }
    writeJson(room, roomJson);
    const { budgets, rooms } = await packCompileBudget(dir);
    const PLAYER_AND_DOTS = COUNT + 1;
    expect(rooms.rm_main?.top.obj16Palettes).toBe(PLAYER_AND_DOTS);
    expect(budgets.diagnostics.map((d) => [d.code, d.file, d.message])).toEqual([
      [
        "E414",
        "rooms/rm_main/room.json",
        `rm_main needs ${PLAYER_AND_DOTS} colour sets for 16-colour sprites on the top screen, but the DS has 16.`,
      ],
    ]);
  });
});
