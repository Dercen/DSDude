/** The C12 PanelHost the shell (and the mock host) gives each editor panel, over the IDE store and the C5 bridge. */
import type { DsdudeBridge } from "@dsdude/ipc-contract";
import type { Ide } from "../store/ide.ts";
import { type PanelHost, resourceFile, type UndoStack } from "./api.ts";
import { createUndoStack } from "./kit.ts";

export function createPanelHost(ide: Ide, ipc: DsdudeBridge, undo: UndoStack = createUndoStack()): PanelHost {
  const { store, actions } = ide;
  const dir = () => {
    const d = store.getState().projectDir;
    if (!d) throw new Error("no project is open");
    return d;
  };
  return {
    project: {
      get: () => store.getState().project,
      dir: () => store.getState().projectDir,
      subscribe: (listener) =>
        store.subscribe((s, prev) => {
          if (s.project !== prev.project) listener(s.project, prev.project);
        }),
      update: (resource, recipe) => actions.updateResource(resource, recipe),
      isDirty: (resource) => !!store.getState().dirty[resourceFile(resource)],
      save: () => actions.save(),
    },
    files: {
      read: async (path) => (await ipc.invoke("project.readFile", { dir: dir(), path })).bytes,
      write: async (path, bytes) => {
        await ipc.invoke("project.writeFile", { dir: dir(), path, bytes });
      },
    },
    ipc,
    undo,
    toast: (message, kind) => actions.showToast(message, kind),
    openLearn: (target) => actions.openLearn(target),
    openResource: (resource) => actions.openResource(resource),
  };
}
