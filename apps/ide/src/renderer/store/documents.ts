/**
 * Documents over the C1 Project. A document id is the project-relative file path with "/" separators, the same
 * string C9 diagnostics carry in `file`, so Problems and Monaco markers map to documents directly:
 * - `objects/<obj>/<event>.dss`, `objects/<obj>/functions.dss`, `scripts/<name>.dss`: DSS code (editable text);
 * - `project.json`, `<kind>/<name>/<kind>.json`: resource JSON (read-only text until the forms and visual editors).
 * Pure functions; the store and the tests use them.
 */
import type { Project } from "@dsdude/project-format";
import { produce } from "immer";

export type DocKind = "event" | "functions" | "script" | "json";

export interface DocRef {
  id: string;
  kind: DocKind;
  /** The object for event/functions documents. */
  object?: string;
  /** The event file stem for event documents. */
  event?: string;
}

const JSON_FILES = {
  sprites: "sprite.json",
  backgrounds: "background.json",
  sounds: "sound.json",
  objects: "object.json",
  rooms: "room.json",
} as const;
type ResourceKind = keyof typeof JSON_FILES;

export const eventDocId = (object: string, event: string) => `objects/${object}/${event}.dss`;
export const functionsDocId = (object: string) => `objects/${object}/functions.dss`;
export const scriptDocId = (name: string) => `scripts/${name}.dss`;
export const resourceDocId = (kind: ResourceKind, name: string) => `${kind}/${name}/${JSON_FILES[kind]}`;

export function parseDocId(id: string): DocRef | null {
  if (id === "project.json") return { id, kind: "json" };
  let m = /^objects\/([^/]+)\/functions\.dss$/.exec(id);
  if (m) return { id, kind: "functions", object: m[1] };
  m = /^objects\/([^/]+)\/([^/]+)\.dss$/.exec(id);
  if (m) return { id, kind: "event", object: m[1], event: m[2] };
  m = /^scripts\/([^/]+)\.dss$/.exec(id);
  if (m) return { id, kind: "script" };
  m = /^(sprites|backgrounds|sounds|objects|rooms)\/([^/]+)\/(\w+)\.json$/.exec(id);
  if (m && JSON_FILES[m[1] as ResourceKind] === `${m[3]}.json`) return { id, kind: "json" };
  return null;
}

const serialise = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The document's text, or null when the project has no such document. */
export function getDocText(project: Project, id: string): string | null {
  const ref = parseDocId(id);
  if (!ref) return null;
  if (ref.kind === "event") return project.objects.find((o) => o.name === ref.object)?.events[ref.event ?? ""] ?? null;
  if (ref.kind === "functions") return project.objects.find((o) => o.name === ref.object)?.functions ?? null;
  if (ref.kind === "script") return project.scripts.find((s) => scriptDocId(s.name) === id)?.source ?? null;
  if (id === "project.json") return serialise(project.project);
  const [kind, name] = id.split("/") as [ResourceKind, string];
  const res = (project[kind] as { name: string }[]).find((r) => r.name === name);
  if (!res) return null;
  if (kind === "objects") {
    const { name: _n, events: _e, functions: _f, ...json } = res as Project["objects"][number];
    return serialise(json);
  }
  const { name: _n, ...json } = res;
  return serialise(json);
}

/** A new Project with the DSS document's text replaced (creating an event or functions file if missing). */
export function setDocText(project: Project, id: string, text: string): Project {
  const ref = parseDocId(id);
  if (!ref || ref.kind === "json") throw new Error(`${id} is not an editable code document`);
  return produce(project, (p) => {
    if (ref.kind === "script") {
      const s = p.scripts.find((x) => scriptDocId(x.name) === id);
      if (!s) throw new Error(`no script ${id}`);
      s.source = text;
      return;
    }
    const obj = p.objects.find((o) => o.name === ref.object);
    if (!obj) throw new Error(`no object ${ref.object}`);
    if (ref.kind === "functions") obj.functions = text;
    else obj.events[ref.event ?? ""] = text;
  });
}

const BUTTON = (b: string) => b.charAt(0).toUpperCase() + b.slice(1);

/** Plain-language event names (C6 contracts/events.md), e.g. "collision_obj_pipe" -> "Collision with obj_pipe". */
export function eventLabel(stem: string): string {
  const fixed: Record<string, string> = {
    create: "Create",
    destroy: "Destroy",
    begin_step: "Begin Step",
    step: "Step",
    end_step: "End Step",
    draw: "Draw",
    touch_pressed: "Touch Pressed",
    touch_released: "Touch Released",
    touch_held: "Touch Held",
    global_touch_pressed: "Global Touch Pressed",
    global_touch_released: "Global Touch Released",
    global_touch_held: "Global Touch Held",
    game_start: "Game Start",
    game_end: "Game End",
    room_start: "Room Start",
    room_end: "Room End",
    animation_end: "Animation End",
    outside_room: "Outside Room",
    functions: "Functions",
  };
  if (fixed[stem]) return fixed[stem];
  let m = /^alarm_([0-7])$/.exec(stem);
  if (m) return `Alarm ${m[1]}`;
  m = /^user_([0-7])$/.exec(stem);
  if (m) return `User Event ${m[1]}`;
  m = /^collision_(.+)$/.exec(stem);
  if (m) return `Collision with ${m[1]}`;
  m = /^button_(pressed|released|held)_(.+)$/.exec(stem);
  if (m) return `Button ${BUTTON(m[2] ?? "")} ${BUTTON(m[1] ?? "")}`;
  return stem;
}

/** Tab title of a document. */
export function docTitle(id: string): string {
  const ref = parseDocId(id);
  if (ref?.kind === "event") return `${ref.object}: ${eventLabel(ref.event ?? "")}`;
  if (ref?.kind === "functions") return `${ref.object}: Functions`;
  if (ref?.kind === "script") return id.slice("scripts/".length, -".dss".length);
  const parts = id.split("/");
  return parts.length === 3 ? `${parts[1]} (${parts[2]})` : id;
}

/** Event order in the tree and the object editor: C6 kind order, then alphabetical. */
const ORDER = [
  "create",
  "destroy",
  "begin_step",
  "step",
  "end_step",
  "alarm_",
  "draw",
  "collision_",
  "button_",
  "touch_",
  "global_touch_",
  "game_start",
  "game_end",
  "room_start",
  "room_end",
  "animation_end",
  "outside_room",
  "user_",
];
function rank(stem: string): number {
  const i = ORDER.findIndex((p) => (p.endsWith("_") ? stem.startsWith(p) : stem === p));
  return i < 0 ? ORDER.length : i;
}
export function sortEvents(stems: string[]): string[] {
  return [...stems].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}
