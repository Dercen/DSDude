/**
 * The events an object can have (C6 contracts/events.md), in plain language: what the object editor lists, what
 * "+ Add Event" offers, and the one-line comment a new event file starts with. Pure.
 */
import { eventLabel, sortEvents } from "../store/documents.ts";

/** C6 button order (btn_a .. btn_right). */
export const BUTTONS = ["a", "b", "x", "y", "l", "r", "start", "select", "up", "down", "left", "right"] as const;
const buttonName = (b: string) => (b.length === 1 ? b.toUpperCase() : b.charAt(0).toUpperCase() + b.slice(1));

/** When an event runs, completing "<Label> - runs ...". */
export function eventWhen(stem: string): string {
  const fixed: Record<string, string> = {
    create: "once, when the instance is created",
    destroy: "once, when instance_destroy removes the instance",
    begin_step: "every frame, before Step",
    step: "every frame (60 per second)",
    end_step: "every frame, after Step",
    draw: "every frame to draw the instance (instead of draw_self())",
    touch_pressed: "the frame the stylus touches this instance",
    touch_released: "the frame the stylus lifts after touching this instance",
    touch_held: "every frame the stylus is on this instance",
    global_touch_pressed: "the frame the stylus touches the screen anywhere",
    global_touch_released: "the frame the stylus lifts",
    global_touch_held: "every frame the stylus is down",
    game_start: "once, when the game starts (after the first room's Create events)",
    game_end: "when game_end() is called, before the game stops",
    room_start: "when a room starts, after its instances are created",
    room_end: "when the room is left",
    animation_end: "when the sprite's animation reaches its last frame",
    outside_room: "once, when the instance leaves the room completely",
    functions: "never on its own: the events of this object call these functions",
  };
  if (fixed[stem]) return fixed[stem];
  let m = /^alarm_([0-7])$/.exec(stem);
  if (m) return `when alarm[${m[1]}] counts down to 0`;
  m = /^user_([0-7])$/.exec(stem);
  if (m) return `only when event_user(${m[1]}) is called`;
  m = /^collision_(.+)$/.exec(stem);
  if (m) return `every frame this instance touches an ${m[1]} on the same screen`;
  m = /^button_(pressed|released|held)_(.+)$/.exec(stem);
  if (m) {
    const b = buttonName(m[2] ?? "");
    return m[1] === "pressed"
      ? `the frame ${b} is pressed`
      : m[1] === "released"
        ? `the frame ${b} is let go`
        : `every frame ${b} is held down`;
  }
  return "(unknown event)";
}

/** "Step - runs every frame (60 per second)" */
export function eventHeading(stem: string): string {
  return `${eventLabel(stem)} - runs ${eventWhen(stem)}`;
}

/** The first line of a new event file. */
export function newEventSource(stem: string): string {
  return `// ${eventHeading(stem)}\n`;
}

export interface EventGroup {
  label: string;
  stems: string[];
}

/** Every event "+ Add Event" can offer for an object, grouped, minus the ones it already has. */
export function addableEvents(existing: readonly string[], objects: readonly string[]): EventGroup[] {
  const have = new Set(existing);
  const groups: EventGroup[] = [
    { label: "Common", stems: ["create", "step", "draw", "destroy"] },
    { label: "Step", stems: ["begin_step", "end_step"] },
    { label: "Alarms", stems: Array.from({ length: 8 }, (_, i) => `alarm_${i}`) },
    { label: "Collisions", stems: objects.map((o) => `collision_${o}`) },
    { label: "Buttons: pressed", stems: BUTTONS.map((b) => `button_pressed_${b}`) },
    { label: "Buttons: held", stems: BUTTONS.map((b) => `button_held_${b}`) },
    { label: "Buttons: released", stems: BUTTONS.map((b) => `button_released_${b}`) },
    {
      label: "Touch",
      stems: [
        "touch_pressed",
        "touch_held",
        "touch_released",
        "global_touch_pressed",
        "global_touch_held",
        "global_touch_released",
      ],
    },
    { label: "Game and room", stems: ["game_start", "game_end", "room_start", "room_end"] },
    { label: "Other", stems: ["animation_end", "outside_room"] },
    { label: "User events", stems: Array.from({ length: 8 }, (_, i) => `user_${i}`) },
  ];
  return groups.map((g) => ({ ...g, stems: g.stems.filter((s) => !have.has(s)) })).filter((g) => g.stems.length > 0);
}

/** The object's events in C6 order (Functions is separate: always last). */
export function orderedEvents(events: Readonly<Record<string, string>>): string[] {
  return sortEvents(Object.keys(events));
}
