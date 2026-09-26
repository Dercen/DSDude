import { LearnPathSchema } from "@dsdude/ipc-contract";
import { produce } from "immer";
import { describe, expect, it } from "vitest";
import {
  headingSlug,
  learnTargetForBuiltin,
  learnTargetForCode,
  learnUri,
  PANEL_API_VERSION,
  type PanelHost,
  parseLearnUri,
  type ResourceKind,
  resourceFile,
  resourceId,
} from "./api.ts";
import { createUndoStack, updateWithUndo } from "./kit.ts";

describe("C12 panel API helpers", () => {
  it("names resources and their C1 files", () => {
    expect(PANEL_API_VERSION).toBe("0.1.0");
    expect(resourceId({ kind: "sprite", name: "spr_bird" })).toBe("sprite:spr_bird");
    const files: Record<ResourceKind, string> = {
      sprite: "sprites/x/sprite.json",
      background: "backgrounds/x/background.json",
      sound: "sounds/x/sound.json",
      object: "objects/x/object.json",
      room: "rooms/x/room.json",
      script: "scripts/x.dss",
      settings: "project.json",
    };
    for (const [kind, file] of Object.entries(files))
      expect(resourceFile({ kind: kind as ResourceKind, name: kind === "settings" ? "" : "x" })).toBe(file);
  });

  it("round-trips Learn URIs and builds the Problems and F1 targets", () => {
    const t = learnTargetForCode("E101");
    expect(t).toEqual({ path: "docs/reference/errors.md", anchor: "e101" });
    expect(learnUri(t)).toBe("dsdude-learn:/docs/reference/errors.md#e101");
    expect(parseLearnUri(learnUri(t))).toEqual(t);
    expect(parseLearnUri("dsdude-learn:docs/manual/sprites.md")).toEqual({ path: "docs/manual/sprites.md" });
    expect(parseLearnUri("https://example.com/a.md")).toBeNull();
    expect(learnTargetForBuiltin("draw_sprite")).toEqual({
      path: "docs/reference/functions.md",
      anchor: "draw_sprite",
    });
    expect(learnTargetForBuiltin("x", "variable").path).toBe("docs/reference/variables.md");
    // Every built target is a valid C5 learn.read path.
    expect(LearnPathSchema.safeParse(learnTargetForBuiltin("x").path).success).toBe(true);
  });

  it("slugs headings GitHub-style", () => {
    expect(headingSlug("E101")).toBe("e101");
    expect(headingSlug(" Two screens and touch ")).toBe("two-screens-and-touch");
    expect(headingSlug("draw_sprite(sprite, x, y)")).toBe("draw_spritesprite-x-y");
    expect(headingSlug("`image_index`")).toBe("image_index");
  });
});

describe("undo kit", () => {
  it("keeps a linear history with a limit and drops the redo branch on push", () => {
    const log: string[] = [];
    const u = createUndoStack(2);
    let changes = 0;
    u.onChange(() => changes++);
    const entry = (n: string) => ({ label: n, undo: () => log.push(`-${n}`), redo: () => log.push(`+${n}`) });
    u.push(entry("a"));
    u.push(entry("b"));
    u.push(entry("c"));
    expect(u.peek()).toEqual({ undo: "c", redo: null });
    expect(u.undo()).toBe(true);
    expect(u.undo()).toBe(true);
    expect(u.undo()).toBe(false); // "a" fell off the limit
    expect(u.redo()).toBe(true);
    u.push(entry("d"));
    expect(u.canRedo()).toBe(false);
    expect(log).toEqual(["-c", "-b", "+b"]);
    expect(changes).toBe(7); // 3 pushes, 2 undos, 1 redo, 1 push; the failed undo notifies nobody
  });

  it("updateWithUndo replays only its own change through the project store", () => {
    type P = { sprites: { name: string; frames: number }[]; rooms: { name: string; width: number }[] };
    let project: P = { sprites: [{ name: "spr_a", frames: 1 }], rooms: [{ name: "rm", width: 256 }] };
    const touched: string[] = [];
    const host = {
      undo: createUndoStack(),
      project: {
        get: () => project,
        update: (r: { kind: string; name: string }, recipe: (d: P) => void) => {
          touched.push(`${r.kind}:${r.name}`);
          project = produce(project, recipe);
          return project;
        },
      },
    } as unknown as Pick<PanelHost, "project" | "undo">;
    updateWithUndo(host, { kind: "sprite", name: "spr_a" }, "Frames", (d) => {
      (d as unknown as P).sprites[0].frames = 3;
    });
    // A later, unrelated edit survives the undo.
    project = produce(project, (d) => {
      d.rooms[0].width = 512;
    });
    expect(host.undo.peek().undo).toBe("Frames");
    host.undo.undo();
    expect(project.sprites[0].frames).toBe(1);
    expect(project.rooms[0].width).toBe(512);
    host.undo.redo();
    expect(project.sprites[0].frames).toBe(3);
    expect(touched).toEqual(["sprite:spr_a", "sprite:spr_a", "sprite:spr_a"]);
    // A no-op records nothing.
    updateWithUndo(host, { kind: "sprite", name: "spr_a" }, "Nothing", () => {});
    expect(host.undo.peek().undo).toBe("Frames");
  });
});
