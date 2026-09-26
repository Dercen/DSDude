/**
 * Editor factories and open editor panels. `loadEditorModules` registers the default export of every
 * `apps/ide/src/renderer/editors/<name>/index.ts(x)` (C12 convention); the shell calls it once at startup.
 */
import type { EditorPanel, EditorPanelFactory, ResourceRef, UndoStack } from "./api.ts";

const factories: EditorPanelFactory[] = [];

export function registerEditor(factory: EditorPanelFactory): void {
  const i = factories.findIndex((f) => f.kind === factory.kind);
  if (i >= 0) factories[i] = factory;
  else factories.push(factory);
}

export function editorFor(resource: ResourceRef): EditorPanelFactory | null {
  return factories.find((f) => f.canOpen(resource)) ?? null;
}

export function registeredEditors(): readonly EditorPanelFactory[] {
  return factories;
}

export function clearEditors(): void {
  factories.length = 0;
}

let loaded = false;

export function loadEditorModules(): void {
  if (loaded) return;
  loaded = true;
  const modules = import.meta.glob<{ default?: EditorPanelFactory }>("../editors/*/index.{ts,tsx}", { eager: true });
  for (const [path, mod] of Object.entries(modules)) {
    if (mod.default && typeof mod.default.create === "function") registerEditor(mod.default);
    else console.warn(`editor module ${path} has no EditorPanelFactory default export`);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Open panels (for Save, Play and undo routing)

export interface MountedPanel {
  panel: EditorPanel;
  undo: UndoStack;
  dirty: boolean;
}

const mounted = new Map<string, MountedPanel>();

/** Tracks an open panel under `key` (its resource id; the panel's own id may only be known after open). */
export function trackPanel(key: string, entry: MountedPanel): () => void {
  mounted.set(key, entry);
  return () => {
    if (mounted.get(key) === entry) mounted.delete(key);
  };
}

export function mountedPanels(): MountedPanel[] {
  return [...mounted.values()];
}

/** Saves every dirty panel; reports the first failure through `onError` and returns false. */
export async function saveDirtyPanels(onError: (message: string) => void): Promise<boolean> {
  for (const m of mounted.values()) {
    if (!m.dirty) continue;
    try {
      await m.panel.save();
    } catch (err) {
      onError(`Could not save ${m.panel.id}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
  return true;
}
