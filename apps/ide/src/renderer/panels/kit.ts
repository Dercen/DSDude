/**
 * Implementations that go with the C12 API (not part of the frozen types): the undo stack every host gives its panels,
 * and `updateWithUndo`, which records an immer-patch undo entry for one `project.update`.
 */
import type { Project } from "@dsdude/project-format";
import { applyPatches, type Draft, enablePatches, produceWithPatches } from "immer";
import type { PanelHost, ResourceRef, UndoEntry, UndoStack } from "./api.ts";

enablePatches();

export const UNDO_LIMIT = 200;

export function createUndoStack(limit = UNDO_LIMIT): UndoStack {
  const done: UndoEntry[] = [];
  const undone: UndoEntry[] = [];
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const l of listeners) l();
  };
  return {
    push(entry) {
      done.push(entry);
      if (done.length > limit) done.splice(0, done.length - limit);
      undone.length = 0;
      changed();
    },
    undo() {
      const e = done.pop();
      if (!e) return false;
      e.undo();
      undone.push(e);
      changed();
      return true;
    },
    redo() {
      const e = undone.pop();
      if (!e) return false;
      e.redo();
      done.push(e);
      changed();
      return true;
    },
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    peek: () => ({ undo: done.at(-1)?.label ?? null, redo: undone.at(-1)?.label ?? null }),
    clear() {
      done.length = 0;
      undone.length = 0;
      changed();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * `host.project.update` plus an undo entry built from immer patches, so undo/redo replays only this change even after
 * later edits elsewhere in the project. Returns the new snapshot; does nothing (and records nothing) for a no-op.
 */
export function updateWithUndo(
  host: Pick<PanelHost, "project" | "undo">,
  resource: ResourceRef,
  label: string,
  recipe: (draft: Draft<Project>) => void,
): Project {
  const before = host.project.get();
  if (!before) throw new Error("no project is open");
  const [, patches, inverse] = produceWithPatches(before, recipe);
  if (patches.length === 0) return before;
  const next = host.project.update(resource, (d) => {
    applyPatches(d, patches);
  });
  host.undo.push({
    label,
    undo: () => {
      host.project.update(resource, (d) => {
        applyPatches(d, inverse);
      });
    },
    redo: () => {
      host.project.update(resource, (d) => {
        applyPatches(d, patches);
      });
    },
  });
  return next;
}
