import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeFs } from "./node.ts";
import { load, type ProjectFs, save } from "./project.ts";

const repo = resolve(import.meta.dirname, "../../..");

/** In-memory ProjectFs over a path -> text map. */
function memFs(files: Record<string, string> = {}): ProjectFs & { files: Record<string, string> } {
  return {
    files,
    readFile: async (p) => {
      if (!(p in files)) throw new Error(`ENOENT ${p}`);
      return files[p];
    },
    writeFile: async (p, t) => {
      files[p] = t;
    },
    readDir: async (p) => [
      ...new Set(
        Object.keys(files)
          .filter((f) => f.startsWith(`${p}/`))
          .map((f) => f.slice(p.length + 1).split("/")[0]),
      ),
    ],
    exists: async (p) => p in files || Object.keys(files).some((f) => f.startsWith(`${p}/`)),
  };
}

describe.each(["minimal", "flappy"])("samples/%s", (sample) => {
  const dir = resolve(repo, "samples", sample).replaceAll("\\", "/");

  it("loads with no diagnostics", async () => {
    const { project, diagnostics } = await load(nodeFs, dir);
    expect(diagnostics).toEqual([]);
    expect(project?.project.name).toBe(sample);
  });

  it("round-trips byte for byte through save()", async () => {
    const { project } = await load(nodeFs, dir);
    if (!project) throw new Error("no project");
    const out = memFs();
    await save(out, "/out", project);
    expect(Object.keys(out.files).length).toBeGreaterThan(3);
    for (const [p, text] of Object.entries(out.files)) {
      expect(text, p).toBe(await readFile(resolve(dir, p.slice("/out/".length)), "utf8"));
    }
  });
});

describe("flappy v0 shape", () => {
  it("has the section 4 objects, sprites, sounds and room", async () => {
    const { project } = await load(nodeFs, resolve(repo, "samples/flappy"));
    expect(project?.objects.map((o) => o.name)).toEqual(["obj_bird", "obj_ctrl", "obj_gap", "obj_hud", "obj_pipe"]);
    expect(
      project?.sprites.map((s) => [s.name, s.frames, s.frameWidth, s.frameHeight, s.origin.x, s.origin.y]),
    ).toEqual([
      ["spr_bird", 3, 16, 16, 8, 8],
      ["spr_gap", 1, 8, 48, 4, 24],
      ["spr_pipe", 1, 32, 64, 16, 0],
    ]);
    expect(project?.sounds.map((s) => s.name)).toEqual(["snd_flap", "snd_hit", "snd_point"]);
    const bird = project?.objects.find((o) => o.name === "obj_bird");
    expect(Object.keys(bird?.events ?? {}).sort()).toEqual([
      "alarm_0",
      "collision_obj_gap",
      "collision_obj_pipe",
      "create",
      "step",
    ]);
    expect(bird?.functions).toContain("function die()");
    expect(project?.objects.find((o) => o.name === "obj_ctrl")?.events.create).toBe("alarm[0] = 60;\n");
    expect(project?.objects.find((o) => o.name === "obj_gap")?.events.create).toContain("scored = false;");
    expect(project?.rooms[0]).toMatchObject({ name: "rm_game", width: 256, height: 192 });
  });
});

describe("diagnostics", () => {
  const base = {
    "/p/project.json": JSON.stringify({ formatVersion: 0, name: "p", title: "P", firstRoom: "rm", rooms: ["rm"] }),
    "/p/icon.png": "x",
    "/p/rooms/rm/room.json": JSON.stringify({
      width: 256,
      height: 192,
      instances: [{ object: "obj_missing", x: 0, y: 0 }],
    }),
  };
  const codes = async (files: Record<string, string>) =>
    (await load(memFs(files), "/p")).diagnostics.map((d) => d.code);

  it("E290 without project.json", async () => {
    expect(await codes({})).toEqual(["E290"]);
  });
  it("E291 broken JSON, E296 newer format, E292 bad field", async () => {
    expect(await codes({ "/p/project.json": "{" })).toEqual(["E291"]);
    expect(await codes({ "/p/project.json": JSON.stringify({ formatVersion: 9 }) })).toEqual(["E296"]);
    expect(await codes({ ...base, "/p/project.json": JSON.stringify({ formatVersion: 0, name: "p" }) })).toContain(
      "E292",
    );
  });
  it("E294 unknown object, E297 unlisted room, E293 missing sheet, E299 parent loop", async () => {
    expect(await codes(base)).toEqual(["E294"]);
    expect(await codes({ ...base, "/p/rooms/rm2/room.json": JSON.stringify({ width: 1, height: 1 }) })).toContain(
      "E297",
    );
    expect(
      await codes({
        ...base,
        "/p/sprites/spr/sprite.json": JSON.stringify({
          frames: 1,
          frameWidth: 8,
          frameHeight: 8,
          origin: { x: 0, y: 0 },
          bbox: { left: 0, top: 0, right: 7, bottom: 7 },
        }),
      }),
    ).toContain("E293");
    const loop = {
      ...base,
      "/p/objects/a/object.json": JSON.stringify({ parent: "b" }),
      "/p/objects/b/object.json": JSON.stringify({ parent: "a" }),
    };
    expect((await codes(loop)).filter((c) => c === "E299")).toHaveLength(1);
  });
  it("E298 a name used twice", async () => {
    expect(await codes({ ...base, "/p/scripts/rm.dss": "" })).toContain("E298");
  });
});
