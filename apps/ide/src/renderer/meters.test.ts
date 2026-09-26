import { resolve } from "node:path";
import { loadProject } from "@dsdude/project-format/node";
import { describe, expect, it } from "vitest";
import { computeMeters, LIMITS, spritesPerScreen } from "./meters.ts";

const flappy = async () => {
  const { project } = await loadProject(resolve(import.meta.dirname, "../../../../samples/flappy"));
  if (!project) throw new Error("flappy");
  return project;
};

describe("meters", () => {
  it("reads C13 limits", () => {
    expect(LIMITS.spritesPerScreen).toBe(128);
    expect(LIMITS.soundRamBytes).toBe(786432);
  });

  it("counts sprite-bearing instances per screen before any build", async () => {
    const project = await flappy();
    const placed = spritesPerScreen(project, project.project.firstRoom);
    const m = computeMeters({ project, manifest: null, stats: null, usage: null, running: false });
    expect(m.map((x) => x.id)).toEqual(["top", "bottom"]);
    expect(m[0]?.text).toBe(`Top: ${placed.top}/128 sprites`);
    expect(m[0]?.tooltip).toContain("after the first build");
    expect(m[0]?.tooltip).toContain("OAM entries");
  });

  it("does not count invisible objects (obj_gap has a sprite but is invisible)", async () => {
    const project = await flappy();
    const room = project.project.firstRoom;
    const before = spritesPerScreen(project, room);
    const r = project.rooms.find((x) => x.name === room);
    r?.instances.push({ object: "obj_gap", x: 0, y: 0 }, { object: "obj_bird", x: 0, y: 0 });
    expect(spritesPerScreen(project, room)).toEqual({ ...before, top: before.top + 1 });
  });

  it("adds colour sets, sprite memory and sound memory from the manifest", async () => {
    const project = await flappy();
    const room = project.project.firstRoom;
    const m = computeMeters({
      project,
      manifest: {
        rooms: {
          [room]: {
            top: { objVramBytes: 1152, obj16Palettes: 2, obj256Palettes: 0, bgPalettes: 0 },
            bottom: { objVramBytes: 0, obj16Palettes: 0 },
            soundRamBytes: 26520,
          },
        },
      },
      stats: null,
      usage: null,
      running: false,
    });
    expect(m.find((x) => x.id === "top")?.text).toMatch(/^Top: \d+\/128 sprites · 2\/16 colour sets$/);
    expect(m.find((x) => x.id === "top")?.tooltip).toContain("OBJ VRAM: 1.1 of 128 KB");
    expect(m.find((x) => x.id === "sound")).toMatchObject({ text: "Sound memory 26/768 KB", level: "ok" });
  });

  it("turns red over a limit and when the running game drops sprites", async () => {
    const project = await flappy();
    const room = project.project.firstRoom;
    const over = computeMeters({
      project,
      manifest: { rooms: { [room]: { top: { obj16Palettes: 17 } } } },
      stats: null,
      usage: null,
      running: false,
    });
    expect(over.find((x) => x.id === "top")?.level).toBe("over");
    const live = computeMeters({
      project,
      manifest: null,
      stats: { spr_top: 128, spr_bot: 3, oam_drop: 4, aff_drop: 1 },
      usage: { snd: { used: 700, total: 768 }, inst: { used: 20, total: 512 } },
      running: true,
    });
    expect(live.find((x) => x.id === "top")).toMatchObject({ text: "Top: 128/128 sprites", level: "warn" });
    expect(live.find((x) => x.id === "oam-drop")).toMatchObject({ text: "4 sprites not drawn", level: "over" });
    expect(live.find((x) => x.id === "aff-drop")).toMatchObject({
      text: "1 turned sprite drawn straight",
      level: "over",
    });
    expect(live.find((x) => x.id === "sound")).toMatchObject({ text: "Sound memory 700/768 KB", level: "warn" });
    expect(live.find((x) => x.id === "instances")?.text).toBe("Instances 20/512");
    // Hardware terms stay in tooltips.
    for (const m of live) expect(m.text).not.toMatch(/OAM|VRAM|affine|palette/i);
  });
});
