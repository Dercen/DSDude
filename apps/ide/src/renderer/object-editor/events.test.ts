import { describe, expect, it } from "vitest";
import { addableEvents, BUTTONS, eventHeading, eventWhen, newEventSource, orderedEvents } from "./events.ts";

describe("object events", () => {
  it("says when each event runs, in plain words", () => {
    expect(eventHeading("step")).toBe("Step - runs every frame (60 per second)");
    expect(eventHeading("alarm_3")).toBe("Alarm 3 - runs when alarm[3] counts down to 0");
    expect(eventHeading("collision_obj_pipe")).toBe(
      "Collision with obj_pipe - runs every frame this instance touches an obj_pipe on the same screen",
    );
    expect(eventWhen("button_pressed_a")).toBe("the frame A is pressed");
    expect(eventWhen("button_held_start")).toBe("every frame Start is held down");
    expect(eventWhen("user_2")).toBe("only when event_user(2) is called");
    expect(newEventSource("create")).toBe("// Create - runs once, when the instance is created\n");
  });

  it("offers every C6 event the object does not have yet", () => {
    const groups = addableEvents(["create", "step", "collision_obj_pipe"], ["obj_bird", "obj_pipe"]);
    const all = groups.flatMap((g) => g.stems);
    expect(all).not.toContain("create");
    expect(all).not.toContain("collision_obj_pipe");
    expect(all).toContain("collision_obj_bird");
    expect(all).toContain("alarm_7");
    expect(all.filter((s) => s.startsWith("button_"))).toHaveLength(3 * BUTTONS.length);
    for (const s of all) expect(eventWhen(s)).not.toBe("(unknown event)");
    expect(groups.find((g) => g.label === "Common")?.stems).toEqual(["draw", "destroy"]);
  });

  it("orders events like C6", () => {
    expect(orderedEvents({ draw: "", create: "", alarm_0: "", step: "" })).toEqual([
      "create",
      "step",
      "alarm_0",
      "draw",
    ]);
  });
});
