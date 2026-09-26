/**
 * The dockview tab that hosts one C12 EditorPanel: creates it through its factory in a div, opens the resource, shows
 * the panel's dirty state in the tab title, routes Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z to its undo stack, and disposes
 * it when the tab closes.
 */
import type { IDockviewPanelProps } from "dockview-react";
import { useEffect, useRef } from "react";
import { useIdeInstance } from "../ide-context.tsx";
import { ipc } from "../ipc.ts";
import { type ResourceRef, resourceId } from "./api.ts";
import { createPanelHost } from "./host.ts";
import { createUndoStack } from "./kit.ts";
import { editorFor, trackPanel } from "./registry.ts";

export function resourceTitle(r: ResourceRef): string {
  return r.kind === "settings" ? "Game Settings" : r.name;
}

/** Undo/redo keys for an editor (Monaco keeps its own). Returns true when the key was handled. */
export function handleUndoKey(e: KeyboardEvent, undo: { undo(): boolean; redo(): boolean }): boolean {
  if (!e.ctrlKey || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (k === "z" && !e.shiftKey) return undo.undo() || true;
  if (k === "y" || (k === "z" && e.shiftKey)) return undo.redo() || true;
  return false;
}

export function EditorHostPanel({ params, api }: IDockviewPanelProps<{ resource: ResourceRef }>) {
  const ide = useIdeInstance();
  const box = useRef<HTMLDivElement>(null);
  const { kind, name } = params.resource;

  useEffect(() => {
    const resource = { kind, name };
    const factory = editorFor(resource);
    const outer = box.current;
    if (!factory || !outer) return;
    const element = document.createElement("div");
    element.className = "editor-root";
    element.tabIndex = -1;
    outer.appendChild(element);
    const undo = createUndoStack();
    const panel = factory.create({ element, host: createPanelHost(ide, ipc, undo) });
    const entry = { panel, undo, dirty: false };
    const untrack = trackPanel(entry);
    const title = resourceTitle(resource);
    const offDirty = panel.onDirty((dirty) => {
      entry.dirty = dirty;
      api.setTitle(`${title}${dirty ? " ●" : ""}`);
    });
    const onKey = (e: KeyboardEvent) => {
      if (handleUndoKey(e, undo)) e.preventDefault();
    };
    element.addEventListener("keydown", onKey);
    Promise.resolve(panel.open(resource)).catch((err: unknown) =>
      ide.actions.showToast(`Could not open ${title}: ${err instanceof Error ? err.message : String(err)}`, "error"),
    );
    return () => {
      element.removeEventListener("keydown", onKey);
      offDirty();
      untrack();
      panel.dispose();
      element.remove();
    };
  }, [kind, name, ide, api]);

  return <div ref={box} className="editor-host" data-testid={`editor:${resourceId({ kind, name })}`} />;
}
