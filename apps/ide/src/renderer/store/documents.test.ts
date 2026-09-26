import { resolve } from "node:path";
import { loadProject } from "@dsdude/project-format/node";
import { describe, expect, it } from "vitest";
import {
  docTitle,
  eventDocId,
  eventLabel,
  functionsDocId,
  getDocText,
  parseDocId,
  resourceDocId,
  setDocText,
  sortEvents,
} from "./documents.ts";

const flappyDir = resolve(import.meta.dirname, "../../../../../samples/flappy");

describe("documents", () => {
  it("parses document ids", () => {
    expect(parseDocId("objects/obj_bird/step.dss")).toEqual({
      id: "objects/obj_bird/step.dss",
      kind: "event",
      object: "obj_bird",
      event: "step",
    });
    expect(parseDocId("objects/obj_bird/functions.dss")?.kind).toBe("functions");
    expect(parseDocId("scripts/util.dss")?.kind).toBe("script");
    expect(parseDocId("sprites/spr_bird/sprite.json")?.kind).toBe("json");
    expect(parseDocId("sprites/spr_bird/room.json")).toBeNull();
    expect(parseDocId("../x.dss")).toBeNull();
  });

  it("reads and replaces flappy's texts without touching the original", async () => {
    const { project } = await loadProject(flappyDir);
    if (!project) throw new Error("flappy");
    const step = eventDocId("obj_bird", "step");
    const before = getDocText(project, step);
    expect(before).toBeTruthy();
    const edited = setDocText(project, step, "// new\n");
    expect(getDocText(edited, step)).toBe("// new\n");
    expect(getDocText(project, step)).toBe(before);
    expect(getDocText(project, functionsDocId("obj_bird"))).toBeTruthy();
    expect(getDocText(project, "project.json")).toContain('"firstRoom"');
    expect(JSON.parse(getDocText(project, resourceDocId("objects", "obj_bird")) ?? "")).not.toHaveProperty("events");
    // A new event file appears in the object.
    expect(
      getDocText(setDocText(project, eventDocId("obj_bird", "draw"), "draw_self();\n"), eventDocId("obj_bird", "draw")),
    ).toBe("draw_self();\n");
    expect(() => setDocText(project, "project.json", "{}")).toThrow();
  });

  it("names events in plain language and sorts them in C6 order", () => {
    expect(eventLabel("collision_obj_pipe")).toBe("Collision with obj_pipe");
    expect(eventLabel("alarm_0")).toBe("Alarm 0");
    expect(eventLabel("button_pressed_a")).toBe("Button A Pressed");
    expect(eventLabel("outside_room")).toBe("Outside Room");
    expect(docTitle("objects/obj_bird/step.dss")).toBe("obj_bird: Step");
    expect(sortEvents(["step", "outside_room", "alarm_0", "create", "collision_obj_pipe", "draw"])).toEqual([
      "create",
      "step",
      "alarm_0",
      "draw",
      "collision_obj_pipe",
      "outside_room",
    ]);
  });
});
