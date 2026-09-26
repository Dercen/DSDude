/**
 * The beginner mistakes (PLAN.md 6 WS4 definition of done): each one yields exactly one friendly diagnostic.
 * The full messages are snapshotted in fixtures/compiler/mistakes.json, so wording changes show up in review
 * (regenerate with DSDUDE_UPDATE_GOLDENS=1).
 */
import type { AssetManifest } from "@dsdude/toolchain";
import { describe, expect, it } from "vitest";
import { BANNED_WORDS } from "./diagnostics/catalog.ts";
import { goldenText } from "./golden.ts";
import { compileProjectModule } from "./project.ts";
import { makeProject } from "./testing.ts";

const MANIFEST: AssetManifest = { provisional: true, sprites: {}, backgrounds: {}, sounds: {} };

interface Mistake {
  title: string;
  /** The event file of obj_player that holds `code`. */
  stem: string;
  code: string;
  /** The one diagnostic code it must produce. */
  expected: string;
  /** obj_player's screen (default top). */
  screen?: "top" | "bottom";
}

const MISTAKES: Mistake[] = [
  { title: "missing closing parenthesis", stem: "step", code: "if (x > 3 {\n    x = 0;\n}\n", expected: "E101" },
  { title: "= in an if", stem: "step", code: "if (x = 3) y = 1;\n", expected: "W030" },
  { title: "undefined variable", stem: "step", code: "x = speeed * 2;\n", expected: "E202" },
  { title: "misspelt builtin", stem: "step", code: "instance_destory();\n", expected: "E201" },
  { title: "text + number", stem: "step", code: 'show_debug_message("x is " + x);\n', expected: "E310" },
  { title: "wrong number of values", stem: "step", code: "instance_create(10, 20);\n", expected: "E301" },
  { title: "draw_sprite in Step", stem: "step", code: "draw_sprite(spr_player, 0, x, y);\n", expected: "E313" },
  { title: "unknown sprite name", stem: "create", code: "sprite_index = spr_playr;\n", expected: "E206" },
  { title: "missing closing brace", stem: "step", code: "if (x > 3) {\n    x = 0;\n", expected: "E103" },
  { title: "assignment to a constant", stem: "step", code: "btn_a = 3;\n", expected: "E302" },
  { title: "== used to assign", stem: "step", code: "x == 5;\n", expected: "E115" },
  { title: "condition without brackets", stem: "step", code: "if x > 3 x = 0;\n", expected: "E117" },
  { title: "text in single quotes", stem: "step", code: "show_debug_message('hi');\n", expected: "E128" },
  { title: "text never closed", stem: "step", code: 'show_debug_message("hi);\n', expected: "E105" },
  { title: "++ inside a line", stem: "step", code: "y = x++;\n", expected: "E121" },
  { title: "break outside a loop", stem: "step", code: "break;\n", expected: "E304" },
  { title: "another object's helper", stem: "step", code: "jump();\n", expected: "E205" },
  { title: "wrong kind of value", stem: "step", code: 'instance_create(10, 20, "obj_enemy");\n', expected: "E311" },
  {
    title: "using a call that gives nothing back",
    stem: "step",
    code: "var n = instance_destroy();\n",
    expected: "E312",
  },
  { title: "dividing by zero", stem: "step", code: "x = x / 0;\n", expected: "E314" },
  { title: "extra closing brace", stem: "step", code: "x = 1;\n}\n", expected: "E104" },
  { title: "changing a read-only variable", stem: "step", code: "room_width = 512;\n", expected: "E302" },
  { title: "touch event on the top screen", stem: "touch_pressed", code: "x = 0;\n", expected: "W031" },
  { title: "misspelt event file", stem: "stepp", code: "x = 0;\n", expected: "E308" },
  { title: "a word DSS uses as a name", stem: "step", code: "var if = 3;\n", expected: "E126" },
];

/** Compiles one mistake inside a small project: obj_player (spr_player) and obj_enemy with a helper. */
function compileMistake(m: Mistake) {
  const project = makeProject(
    {
      obj_player: { sprite: "spr_player", screen: m.screen ?? "top", events: { [m.stem]: m.code } },
      obj_enemy: { sprite: "spr_player", functions: "function jump() {\n    vspeed = -4;\n}\n" },
    },
    { sprites: ["spr_player"] },
  );
  return compileProjectModule(project, MANIFEST).diagnostics;
}

describe("the beginner mistakes", () => {
  it("covers at least 20 mistakes with 20 different codes or more", () => {
    expect(MISTAKES.length).toBeGreaterThanOrEqual(20);
  });

  for (const m of MISTAKES)
    it(`${m.title}: exactly one ${m.expected}`, () => {
      const ds = compileMistake(m);
      expect(ds.map((d) => d.code)).toEqual([m.expected]);
      const d = ds[0];
      for (const word of BANNED_WORDS)
        expect(`${d?.message} ${d?.hint ?? ""}`.toLowerCase()).not.toMatch(new RegExp(`\\b${word}`));
    });

  it("matches the reviewed messages in fixtures/compiler/mistakes.json", () => {
    const snapshot = MISTAKES.map((m) => {
      const [d] = compileMistake(m);
      return {
        mistake: m.title,
        file: d?.file ?? null,
        code: m.code,
        diagnostic:
          d === undefined
            ? null
            : { code: d.code, severity: d.severity, message: d.message, hint: d.hint, line: d.line, col: d.col },
      };
    });
    const text = `${JSON.stringify(snapshot, null, 2)}\n`;
    expect(text).toBe(goldenText("fixtures/compiler/mistakes.json", text));
  });
});

describe("lints", () => {
  /** Diagnostic codes of a one-object project with `code` in obj_player's `stem`. */
  const codes = (
    code: string,
    stem = "step",
    opts: { screen?: "top" | "bottom"; extra?: Parameters<typeof makeProject>[1] } = {},
  ) =>
    compileProjectModule(
      makeProject(
        { obj_player: { sprite: "spr_player", screen: opts.screen ?? "top", events: { [stem]: code } } },
        opts.extra ?? { sprites: ["spr_player"] },
      ),
      MANIFEST,
    ).diagnostics.map((d) => d.code);

  it("W040 squaring a position", () => expect(codes("var d = x * x;\n")).toEqual(["W040"]));
  it("W041 a fraction in an array index", () => expect(codes("var a = [1, 2];\nvar b = a[0.5];\n")).toEqual(["W041"]));
  it("W042 div with a fraction", () => expect(codes("var d = 7.5 div 2;\n")).toEqual(["W042"]));
  it("W043 letters the DS font lacks", () => expect(codes('draw_text(0, 0, "héllo");\n', "draw")).toEqual(["W043"]));
  it("W031 touch_in_instance(self) on the top screen", () => {
    expect(codes("if (touch_in_instance()) x = 0;\n")).toEqual(["W031"]);
    expect(codes("if (touch_in_instance()) x = 0;\n", "step", { screen: "bottom" })).toEqual([]);
    expect(codes("if (touch_pressed()) x = 0;\n")).toEqual([]);
  });
  it("W050 an empty room, W052 an unused sprite", () => {
    const p = makeProject(
      { obj_player: { sprite: "spr_player" } },
      { place: [], sprites: ["spr_player", "spr_spare"] },
    );
    expect(compileProjectModule(p, MANIFEST).diagnostics.map((d) => d.code)).toEqual(["W050", "W052"]);
  });
  it("W051 a placed object nobody can see (Visible-off and Draw objects are exempt)", () => {
    const see = (visible: boolean, events: Record<string, string>) =>
      compileProjectModule(makeProject({ obj_ghost: { visible, events } }), MANIFEST).diagnostics.map((d) => d.code);
    expect(see(true, {})).toEqual(["W051"]);
    expect(see(false, {})).toEqual([]);
    expect(see(true, { draw: "draw_text(0, 0, 1);\n" })).toEqual([]);
  });
});
