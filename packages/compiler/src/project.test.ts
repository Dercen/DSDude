import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { assemble, decode, disassemble, encode } from "@dsdude/dsdb";
import type { Project, RoomResource } from "@dsdude/project-format";
import { loadProject } from "@dsdude/project-format/node";
import type { AssetManifest } from "@dsdude/toolchain";
import { describe, expect, it } from "vitest";
import { COMPILER_BUILTINS_ENV } from "./codegen/abi.ts";
import { goldenText, REPO_ROOT, readBytes, UPDATING_GOLDENS } from "./golden.ts";
import { compileProject, compileProjectModule } from "./project.ts";
import { makeProject } from "./testing.ts";

/** An empty provisional manifest (C4): the compiler falls back to sprite.json frame counts. */
const MANIFEST: AssetManifest = { provisional: true, sprites: {}, backgrounds: {}, sounds: {} };

/** Samples that must compile with zero diagnostics to byte-identical goldens (PLAN.md 6 WS4 definition of done). */
const SAMPLES = ["minimal", "flappy"];

/** Warm compile budget for Flappy (PLAN.md 6 WS4: "Flappy compiles in < 100 ms warm"). */
const FLAPPY_WARM_MS = 100;

function compile(p: Project) {
  const r = compileProjectModule(p, MANIFEST);
  return { ...r, codes: r.diagnostics.map((d) => d.code), dsda: r.module === null ? "" : disassemble(r.module) };
}

describe("compileProject: the samples", () => {
  for (const name of SAMPLES) {
    it(`compiles samples/${name} with zero diagnostics to its goldens`, async () => {
      const loaded = await loadProject(join(REPO_ROOT, "samples", name));
      expect(loaded.diagnostics).toEqual([]);
      // Games compile with constant folding, as compileProject does.
      const r = compileProjectModule(loaded.project as Project, MANIFEST, { fold: true });
      expect(r.diagnostics).toEqual([]);
      const dsda = disassemble(r.module as NonNullable<typeof r.module>);
      const golden = `fixtures/compiler/samples/${name}.dsda`;
      expect(dsda).toBe(goldenText(golden, dsda));
      expect(r.dsdb).toEqual(encode(assemble(dsda), COMPILER_BUILTINS_ENV));
      expect(disassemble(decode(r.dsdb, COMPILER_BUILTINS_ENV))).toBe(dsda);
      if (!UPDATING_GOLDENS) expect(r.dsdb).toEqual(readBytes(golden.replace(/\.dsda$/, ".dsdb")));
      const sets = `${JSON.stringify(r.roomSets, null, 2)}\n`;
      expect(sets).toBe(goldenText(`fixtures/compiler/samples/${name}.roomsets.json`, sets));
    });
  }

  it("compiles Flappy in under 100 ms warm", async () => {
    const loaded = await loadProject(join(REPO_ROOT, "samples", "flappy"));
    const project = loaded.project as Project;
    compileProject(project, MANIFEST);
    const start = performance.now();
    compileProject(project, MANIFEST);
    expect(performance.now() - start).toBeLessThan(FLAPPY_WARM_MS);
  });
});

/** Project-form conformance programs (tiers v2-v4, language.md section 1): every folder with a project.json. */
const PROJECT_TIERS = ["v2", "v3", "v4"];
const conformanceProjects: [string, string][] = PROJECT_TIERS.flatMap((tier) => {
  const dir = join(REPO_ROOT, "fixtures", "conformance", tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => existsSync(join(dir, n, "project.json")))
    .sort()
    .map((n): [string, string] => [tier, n]);
});

describe("compileProject: the conformance projects", () => {
  for (const [tier, name] of conformanceProjects)
    it(`compiles ${tier}/${name} with zero diagnostics to its golden`, async () => {
      const loaded = await loadProject(join(REPO_ROOT, "fixtures", "conformance", tier, name));
      expect(loaded.diagnostics).toEqual([]);
      const r = compileProjectModule(loaded.project as Project, MANIFEST);
      expect(r.diagnostics).toEqual([]);
      const dsda = disassemble(r.module as NonNullable<typeof r.module>);
      const golden = `fixtures/compiler/conformance/${tier}/${name}.dsda`;
      expect(dsda).toBe(goldenText(golden, dsda));
      expect(disassemble(decode(r.dsdb, COMPILER_BUILTINS_ENV))).toBe(dsda);
      if (!UPDATING_GOLDENS) expect(r.dsdb).toEqual(readBytes(golden.replace(/\.dsda$/, ".dsdb")));
    });
});

describe("compileProject: instance variables", () => {
  it("lays out slots parent first, then the child's own names sorted", () => {
    const r = compile(
      makeProject({
        obj_base: { events: { create: "hp = 3\nname = 1" } },
        obj_kid: { parent: "obj_base", events: { create: "zeta = 1\nalpha = 2\nhp = 5" } },
      }),
    );
    expect(r.codes).toEqual([]);
    expect(r.dsda).toContain(
      ".object obj_kid sprite=- parent=obj_base visible=0 screen=top depth=0\n    .slot alpha 2\n    .slot hp 0\n    .slot name 1\n    .slot zeta 3\n",
    );
  });

  it("reads a variable only a child assigns by name, and reports one nobody assigns", () => {
    const ok = compile(
      makeProject({
        obj_base: { events: { step: "x = speed_mult" } },
        obj_kid: { parent: "obj_base", events: { create: "speed_mult = 2" } },
      }),
    );
    expect(ok.codes).toEqual([]);
    expect(ok.dsda).toContain("GETDYN r1, r2, speed_mult".replace("r1, r2", "r0, r1"));
    const bad = compile(
      makeProject({ obj_a: { events: { step: "x = spead" } }, obj_b: { events: { create: "speed = 1" } } }),
    );
    expect(bad.codes).toEqual(["E202"]);
  });

  it("gives with-bodies the target's slots and other the outer instance", () => {
    const r = compile(
      makeProject({
        obj_a: { events: { create: "power = 1\nwith (obj_b) { hits = other.power }" } },
        obj_b: { events: { step: "hits += 1" } },
      }),
    );
    expect(r.codes).toEqual([]);
    expect(r.dsda).toContain("GETSLOTO r1, 0\n    SETSLOT r1, 0");
  });

  it("uses other's slots in collision events", () => {
    const r = compile(
      makeProject({
        obj_a: { events: { collision_obj_b: "other.hit = true" } },
        obj_b: { events: { create: "hit = false" } },
      }),
    );
    expect(r.codes).toEqual([]);
    expect(r.dsda).toContain("SETSLOTO r0, 0");
  });

  it("reaches builtin variables of other instances with GETBIO/SETBIO and names with GETDYN/SETDYN", () => {
    const r = compile(
      makeProject({
        obj_a: { events: { step: "obj_b.x = other.y\nvar i = instance_find(obj_b, 0)\ni.score = 1" } },
        obj_b: {},
      }),
    );
    expect(r.codes).toEqual([]);
    expect(r.dsda).toContain("GETBIO");
    expect(r.dsda).toContain("SETBIO");
    expect(r.dsda).toContain("SETDYN");
    expect(r.dsda).toContain(".symbol score");
  });

  it("reports more than 24 slots (E491)", () => {
    const create = Array.from({ length: 25 }, (_, i) => `v${i} = ${i}`).join("\n");
    expect(compile(makeProject({ obj_a: { events: { create } } })).codes).toEqual(["E491"]);
  });
});

describe("compileProject: functions and events", () => {
  it("calls inherited object functions and scripts; another object's helper is E205", () => {
    const p = makeProject(
      {
        obj_base: { functions: "function hurt(n = 1) { hp -= n }", events: { create: "hp = 3" } },
        obj_kid: { parent: "obj_base", events: { step: "hurt()\nboom(2)" } },
        obj_other: { events: { step: "hurt()" } },
      },
      { scripts: { util: "function boom(n) { return n * 2 }" } },
    );
    const r = compile(p);
    expect(r.codes).toEqual(["E205"]);
    expect(r.diagnostics[0]?.message).toBe("hurt() is a helper of obj_base, so obj_other can't use it.");
    p.objects = p.objects.filter((o) => o.name !== "obj_other");
    const room = p.rooms[0] as RoomResource;
    room.instances = room.instances.filter((i) => i.object !== "obj_other");
    const ok = compile(p);
    expect(ok.codes).toEqual([]);
    expect(ok.dsda).toContain("CALL r0, obj_base__fn_hurt");
    expect(ok.dsda).toContain("CALL r0, boom");
  });

  it("dispatches a parent's call to a helper a child overrides (events.md section 3)", () => {
    const r = compile(
      makeProject({
        obj_base: { functions: "function speak() {\n    show_debug_message(1);\n}\n", events: { step: "speak();\n" } },
        obj_kid: { parent: "obj_base", functions: "function speak(loud = 2) {\n    show_debug_message(loud);\n}\n" },
        obj_grandkid: { parent: "obj_kid" },
      }),
    );
    expect(r.codes).toEqual([]);
    const step = r.dsda.slice(
      r.dsda.indexOf(".func obj_base__step"),
      r.dsda.indexOf(".end", r.dsda.indexOf(".func obj_base__step")),
    );
    expect(step).toContain("GETBI r1, object_index");
    expect(step).toContain("LOADK r2, @obj_grandkid");
    expect(step).toContain("LOADK r2, @obj_kid");
    expect(step).toContain("CALL r0, obj_base__fn_speak");
    // The override takes one more parameter: its default is filled in its own branch.
    expect(step).toMatch(/LOADI r0, 2\n {4}CALL r0, obj_kid__fn_speak/);
    // The child's own code needs no dispatch: nothing below obj_kid overrides speak again.
    expect(
      compile(makeProject({ obj_a: { functions: "function f() {}\n", events: { step: "f();\n" } } })).dsda,
    ).not.toContain("object_index");
  });

  it("checks event file names (E308, E309)", () => {
    expect(compile(makeProject({ obj_a: { events: { stepp: "x = 1" } } })).codes).toEqual(["E308"]);
    expect(compile(makeProject({ obj_a: { events: { collision_obj_zz: "x = 1" } } })).codes).toEqual(["E309"]);
    expect(
      compile(makeProject({ obj_a: { events: { button_pressed_start: "x = 1", alarm_7: "x = 2", user_3: "x = 3" } } }))
        .codes,
    ).toEqual([]);
  });

  it("orders events by event id and names them object__stem", () => {
    const r = compile(makeProject({ obj_a: { events: { draw: "draw_self()", create: "x = 1", alarm_1: "x = 2" } } }));
    expect(r.dsda).toContain(
      "    .event create obj_a__create\n    .event alarm_1 obj_a__alarm_1\n    .event draw obj_a__draw\n",
    );
  });

  it("returns an empty DSDB and no module on errors", () => {
    const r = compileProject(makeProject({ obj_a: { events: { step: "x = (" } } }), MANIFEST);
    expect(r.dsdb.length).toBe(0);
    expect(r.diagnostics.map((d) => d.code)).toEqual(["E112"]);
  });
});

describe("compileProject: room asset sets (PLAN.md 3.2)", () => {
  it("follows instance_create transitively, per screen, with sounds", () => {
    const p = makeProject(
      {
        obj_spawner: { events: { step: "instance_create(0, 0, obj_shot)" } },
        obj_shot: {
          sprite: "spr_shot",
          screen: "bottom",
          events: { create: "audio_play_sound(snd_pew)\ninstance_create(0, 0, obj_spark)" },
        },
        obj_spark: { sprite: "spr_spark", screen: "bottom" },
        obj_unused: { sprite: "spr_unused" },
      },
      { place: ["obj_spawner"], sprites: ["spr_shot", "spr_spark", "spr_unused"], sounds: ["snd_pew"] },
    );
    const r = compileProject(p, MANIFEST);
    expect(r.diagnostics).toEqual([]);
    expect(r.roomSets).toEqual([
      {
        room: "rm_a",
        screens: {
          top: { sprites: [], backgrounds: [] },
          bottom: { sprites: ["spr_shot", "spr_spark"], backgrounds: [] },
        },
        sounds: ["snd_pew"],
      },
    ]);
  });

  it("puts sprites of objects that call draw_set_screen on both screens", () => {
    const p = makeProject(
      { obj_hud: { events: { draw: "draw_set_screen(SCREEN_BOTTOM)\ndraw_sprite(spr_icon, 0, 0, 0)" } } },
      { sprites: ["spr_icon"] },
    );
    const r = compileProject(p, MANIFEST);
    expect(r.roomSets[0]?.screens.top.sprites).toEqual(["spr_icon"]);
    expect(r.roomSets[0]?.screens.bottom.sprites).toEqual(["spr_icon"]);
  });
});
