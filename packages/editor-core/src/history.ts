/**
 * Undo through immer patches: `edit` runs a recipe and returns the new state plus undo/redo functions that replay
 * only this change (inverse patches / patches), so later unrelated changes survive an undo.
 */
import { applyPatches, type Draft, enablePatches, type Patch, produceWithPatches } from "immer";

enablePatches();

export interface Edit<T extends object> {
  next: T;
  /** False when the recipe changed nothing (record no history then). */
  changed: boolean;
  undo: (state: T) => T;
  redo: (state: T) => T;
}

export function edit<T extends object>(base: T, recipe: (draft: Draft<T>) => void): Edit<T> {
  const [next, patches, inverse] = produceWithPatches(base, recipe) as [T, Patch[], Patch[]];
  return {
    next,
    changed: patches.length > 0,
    undo: (state) => applyPatches(state, inverse) as T,
    redo: (state) => applyPatches(state, patches) as T,
  };
}
