import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "@dsdude/project-format";
import { loadProject } from "@dsdude/project-format/node";
import { beforeAll, describe, expect, it } from "vitest";
import { createLanguageServiceHost, LANGUAGE_HOST_VERSION, type LanguageServiceHost } from "./index.ts";

/** The repository root, three levels above packages/lang/src. */
const ROOT = join(import.meta.dirname, "..", "..", "..");

let flappy: Project;
beforeAll(async () => {
  flappy = (await loadProject(join(ROOT, "samples", "flappy"))).project as Project;
});

/** A host with Flappy loaded. */
function flappyHost(): LanguageServiceHost {
  const host = createLanguageServiceHost();
  host.setProject(flappy);
  return host;
}

/** The offset of the `nth` occurrence of `needle` in `file`, plus `delta`. */
function offsetOf(host: LanguageServiceHost, file: string, needle: string, delta = 0, nth = 0): number {
  const text = host.getFile(file) ?? "";
  let at = -1;
  for (let i = 0; i <= nth; i++) at = text.indexOf(needle, at + 1);
  if (at < 0) throw new Error(`${needle} not in ${file}`);
  return at + delta;
}

const STEP = "objects/obj_bird/step.dss";
const FUNCTIONS = "objects/obj_bird/functions.dss";
const GAP = "objects/obj_bird/collision_obj_gap.dss";

describe("C7 LanguageServiceHost over samples/flappy", () => {
  it("reports its version", () => {
    expect(flappyHost().version).toBe(LANGUAGE_HOST_VERSION);
  });

  it("classifies every name in parse spans", () => {
    const host = flappyHost();
    const text = host.getFile(STEP) as string;
    const { diagnostics, spans } = host.parse(text, STEP);
    expect(diagnostics).toEqual([]);
    const kindOf = (name: string) => spans.find((s) => text.slice(s.start, s.end) === name)?.symbol;
    expect(kindOf("alive")).toBe("instanceVariable");
    expect(kindOf("vspeed")).toBe("builtinVariable");
    expect(kindOf("die")).toBe("objectFunction");
    expect(kindOf("btn_a")).toBe("constant");
    expect(kindOf("snd_flap")).toBe("sound");
    expect(kindOf("button_pressed")).toBe("builtinFunction");
    expect(spans.some((s) => s.kind === "comment")).toBe(true);
  });

  it("checks one file within the project", () => {
    const host = flappyHost();
    expect(host.check(STEP)).toEqual([]);
    host.setFile(STEP, "if (!alivee) exit;\n");
    expect(host.check(STEP).map((d) => d.code)).toEqual(["E202"]);
    expect(host.check(FUNCTIONS)).toEqual([]);
  });

  it("finds definitions: functions, instance variables, other's variables", () => {
    const host = flappyHost();
    expect(host.definitionAt(STEP, offsetOf(host, STEP, "die()", 1))).toMatchObject({ file: FUNCTIONS });
    const alive = host.definitionAt(STEP, offsetOf(host, STEP, "alive", 2));
    expect(alive?.file).toBe("objects/obj_bird/create.dss");
    expect(host.getFile("objects/obj_bird/create.dss")?.slice(alive?.start, alive?.end)).toBe("alive");
    expect(host.definitionAt(GAP, offsetOf(host, GAP, "scored", 1))?.file).toBe("objects/obj_gap/create.dss");
    expect(host.definitionAt(STEP, offsetOf(host, STEP, "vspeed", 1))).toBeNull();
  });

  it("finds every reference to a function, declaration included", () => {
    const host = flappyHost();
    const refs = host.referencesAt(FUNCTIONS, offsetOf(host, FUNCTIONS, "die", 1));
    expect(refs.map((r) => r.file).sort()).toEqual(["objects/obj_bird/collision_obj_pipe.dss", FUNCTIONS, STEP].sort());
  });

  it("completes members after other. and globals after global.", () => {
    const host = flappyHost();
    const other = host.completionsAt(GAP, offsetOf(host, GAP, "other.scored", 6));
    expect(other.map((c) => c.label)).toContain("scored");
    expect(other.map((c) => c.label)).toContain("x");
    expect(other.map((c) => c.label)).not.toContain("alive");
    const globals = host.completionsAt(GAP, offsetOf(host, GAP, "global.score", 7));
    expect(globals.map((c) => c.label)).toEqual(["score"]);
  });

  it("completes names in scope, with keywords", () => {
    const host = flappyHost();
    const labels = host.completionsAt(STEP, offsetOf(host, STEP, "vspeed = flap_power")).map((c) => c.label);
    for (const name of ["alive", "flap_power", "die", "vspeed", "floor", "btn_a", "spr_bird", "if", "while"])
      expect(labels).toContain(name);
    expect(host.completionsAt(STEP, offsetOf(host, STEP, "// A button", 5))).toEqual([]);
  });

  it("gives signature help with the active argument", () => {
    const host = flappyHost();
    const help = host.signatureAt(STEP, offsetOf(host, STEP, "-30"));
    expect(help).toEqual({
      name: "clamp",
      params: [
        { name: "x", optional: false },
        { name: "lo", optional: false },
        { name: "hi", optional: false },
      ],
      variadic: false,
      activeParameter: 1,
    });
  });

  it("hovers builtins, user functions (with their comment) and locals", () => {
    const host = flappyHost();
    expect(host.hover("floor")).toMatchObject({ kind: "builtinFunction", detail: "floor(x: number): int" });
    const die = host.hover("die", STEP, offsetOf(host, STEP, "die()", 1));
    expect(die).toMatchObject({ kind: "objectFunction", detail: "function die() of obj_bird" });
    expect(die?.doc).toBe("objects/obj_bird/functions.dss  -- helpers visible to this object's events");
    expect(host.hover("obj_pipe")).toMatchObject({ kind: "object" });
    expect(host.hover("nothing_here")).toBeNull();
  });

  it("outlines functions and folds blocks", () => {
    const host = flappyHost();
    expect(host.documentSymbols(FUNCTIONS).map((s) => [s.name, s.kind])).toEqual([["die", "objectFunction"]]);
    const text = host.getFile(FUNCTIONS) as string;
    const folds = host.foldingRanges(FUNCTIONS);
    expect(folds.some((f) => text[f.start] === "{" && text[f.end - 1] === "}")).toBe(true);
  });

  it("formats: semicolons, indentation, idempotent, and leaves broken code alone", () => {
    const host = createLanguageServiceHost();
    const messy = "if(x>1){\ny=2\n}\nfoo( 1,2 )\n";
    const once = host.format(messy);
    expect(once).toBe("if (x > 1) {\n    y = 2;\n}\nfoo(1, 2);\n");
    expect(host.format(once)).toBe(once);
    expect(host.format("x = (1 +\n")).toBe("x = (1 +\n");
    const create = readFileSync(join(ROOT, "samples/flappy/objects/obj_bird/create.dss"), "utf8");
    expect(host.format(create)).toBe(create);
  });
});

describe("C7 LanguageServiceHost: stand-alone program files", () => {
  const FILE = "v0/05-functions.dss";
  const text = readFileSync(join(ROOT, "fixtures/conformance/v0/05-functions.dss"), "utf8");

  it("resolves locals, parameters and global functions without a project", () => {
    const host = createLanguageServiceHost();
    host.setFile(FILE, text);
    expect(host.check(FILE)).toEqual([]);
    const at = text.indexOf("a + b") + 1;
    expect(host.symbolsAt(FILE, at)[0]).toMatchObject({ name: "a", kind: "parameter" });
    expect(host.hover("a", FILE, at)).toMatchObject({ kind: "parameter", detail: "parameter of add()" });
    expect(host.definitionAt(FILE, text.indexOf("fact(6)"))).toMatchObject({
      file: FILE,
      start: text.indexOf("fact(n)"),
    });
    expect(host.completionsAt(FILE, text.indexOf("global.count", 200) + 7).map((c) => c.label)).toEqual(["count"]);
    host.setFile(FILE, "show_debug_mesage(1)\n");
    expect(host.check(FILE).map((d) => d.code)).toEqual(["E201"]);
  });
});
