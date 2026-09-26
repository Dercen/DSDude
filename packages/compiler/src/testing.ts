/**
 * Test helpers shared by the compiler's test files (Node only; never imported by the compiler itself).
 */
import type { ObjectResource, Project, RoomResource } from "@dsdude/project-format";

/** One object of an in-memory test project. */
export interface ObjSpec {
  events?: Record<string, string>;
  functions?: string;
  parent?: string;
  sprite?: string;
  screen?: "top" | "bottom";
  /** Defaults to true when the object has a sprite, false otherwise (so W051 stays quiet). */
  visible?: boolean;
}

/** Builds an in-memory project: objects by name, one room `rm_a` placing `place` (default: every object once). */
export function makeProject(
  objects: Record<string, ObjSpec>,
  extra: { scripts?: Record<string, string>; place?: string[]; sprites?: string[]; sounds?: string[] } = {},
): Project {
  const objs = Object.entries(objects)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(
      ([name, o]): ObjectResource => ({
        name,
        sprite: o.sprite ?? null,
        parent: o.parent ?? null,
        visible: o.visible ?? o.sprite !== undefined,
        depth: 0,
        screen: o.screen ?? "top",
        events: o.events ?? {},
        functions: o.functions ?? null,
      }),
    );
  const room: RoomResource = {
    name: "rm_a",
    width: 256,
    height: 192,
    layout: "separate",
    screens: { top: { background: null, viewX: 0, viewY: 0 }, bottom: { background: null, viewX: 0, viewY: 0 } },
    instances: (extra.place ?? Object.keys(objects)).map((object) => ({ object, x: 0, y: 0 })),
  };
  return {
    dir: "/p",
    project: {
      formatVersion: 0,
      name: "p",
      title: "p",
      subtitle: "",
      author: "",
      gamecode: "####",
      icon: "icon.png",
      firstRoom: "rm_a",
      rooms: ["rm_a"],
    },
    sprites: (extra.sprites ?? []).map(
      (name) =>
        ({
          name,
          frames: 1,
          frameWidth: 16,
          frameHeight: 16,
          origin: { x: 0, y: 0 },
          bbox: { left: 0, top: 0, right: 15, bottom: 15 },
          colorMode: "auto",
          transparent: "alpha",
        }) as Project["sprites"][number],
    ),
    backgrounds: [],
    sounds: (extra.sounds ?? []).map(
      (name) => ({ name, kind: "effect", file: `${name}.wav` }) as Project["sounds"][number],
    ),
    objects: objs,
    rooms: [room],
    scripts: Object.entries(extra.scripts ?? {}).map(([name, source]) => ({ name, source })),
  };
}
