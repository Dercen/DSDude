/**
 * GameMaker names (codegen/gamemaker.ts; builtins.json 0.3.0 alias and unsupported entries): an alias compiles
 * exactly like its DSDude target with one W060, an unsupported name is one E207 with the manual link, and the
 * project's own names always win.
 */

import { disassemble } from "@dsdude/dsdb";
import type { AssetManifest } from "@dsdude/toolchain";
import { describe, expect, it } from "vitest";
import { compileProjectModule } from "./project.ts";
import { makeProject } from "./testing.ts";

const MANIFEST: AssetManifest = { provisional: true, sprites: {}, backgrounds: {}, sounds: {} };

/** Compiles obj_player's Step event (plus optional scripts) next to obj_enemy. */
function compileStep(step: string, scripts: Record<string, string> = {}) {
  const project = makeProject(
    { obj_player: { sprite: "spr_player", events: { step } }, obj_enemy: { sprite: "spr_player" } },
    { sprites: ["spr_player"], scripts },
  );
  const r = compileProjectModule(project, MANIFEST);
  const step_ = r.module?.functions.find((f) => f.name === "obj_player__step");
  const code = r.module === null ? "" : disassemble({ ...r.module, functions: step_ ? [step_] : [] });
  return { diagnostics: r.diagnostics, codes: r.diagnostics.map((d) => d.code), code };
}

/** The instruction lines of a disassembly, without locations. */
const body = (dsda: string): string[] => dsda.split("\n").filter((l) => /^ {4}[A-Z]/.test(l));

describe("GameMaker aliases (W060)", () => {
  it("compiles keyboard_check(vk_left) exactly like button_check(btn_left), with one W060 per name", () => {
    const alias = compileStep("if (keyboard_check(vk_left)) x -= 2;\n");
    const native = compileStep("if (button_check(btn_left)) x -= 2;\n");
    expect(alias.codes).toEqual(["W060", "W060"]);
    expect(body(alias.code)).toEqual(body(native.code));
    const [first] = alias.diagnostics;
    expect(first?.message).toBe("keyboard_check is a GameMaker name, so DSDude reads it as button_check.");
    expect(first?.hint).toBe("The DS has no keyboard: use button_check with a btn_ button.");
  });

  it("passes only the arguments argMap keeps (instance_create_layer drops the layer)", () => {
    const alias = compileStep('instance_create_layer(10, 20, "Instances", obj_enemy);\n');
    const native = compileStep("instance_create(10, 20, obj_enemy);\n");
    expect(alias.codes).toEqual(["W060"]);
    expect(body(alias.code)).toEqual(body(native.code));
  });

  it("leaves the project's own names alone", () => {
    expect(compileStep("var vk_left = 3;\nx = vk_left;\n").codes).toEqual([]);
    expect(
      compileStep("keyboard_check(1);\n", { scr_keys: "function keyboard_check(k) {\n    return k;\n}\n" }).codes,
    ).toEqual([]);
  });
});

describe("unsupported GameMaker names (E207)", () => {
  it("reports one E207 with the message and the manual link, instead of a did-you-mean", () => {
    const r = compileStep("draw_line(0, 0, 10, 10);\n");
    expect(r.codes).toEqual(["E207"]);
    expect(r.diagnostics[0]?.message).toBe(
      "draw_line isn't available on the DS in DSDude 0.1. Try draw_rectangle, or a thin sprite.",
    );
    expect(r.diagnostics[0]?.hint).toContain("docs/manual/differences-from-gamemaker.md#draw-line");
  });

  it("matches prefix families only when called, so a variable like file_name stays legal", () => {
    expect(compileStep("ds_map_add(m, 1, 2);\n").codes).toEqual(["E207"]);
    expect(compileStep('file_name = "save";\n').codes).toEqual([]);
  });

  it("reports unsupported variables when read, written or reached through an instance", () => {
    expect(compileStep("image_alpha = 0.5;\n").codes).toEqual(["E207"]);
    expect(compileStep("x = mouse_x;\n").codes).toEqual(["E207"]);
    expect(compileStep("other.solid = true;\n").codes).toEqual(["E207"]);
  });

  it("lets a local keep an unsupported name", () => {
    expect(compileStep("var solid = 1;\nx = solid;\n").codes).toEqual([]);
  });
});
