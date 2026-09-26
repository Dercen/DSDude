/**
 * The dockview layout behind the store's `Workbench`: project tree on the left, documents in the centre, Output and
 * Problems below. Document panels have the id `doc:<docId>` and component "code". Opening a panel here never
 * activates Output: new log lines must not steal focus (PLAN.md 6 WS6).
 */
import type { DockviewApi, IDockviewPanel } from "dockview-react";
import type { StoreApi } from "zustand";
import { type ResourceRef, resourceFile, resourceId } from "./panels/api.ts";
import { resourceTitle } from "./panels/EditorHostPanel.tsx";
import { editorFor } from "./panels/registry.ts";
import { docTitle } from "./store/documents.ts";
import type { IdeState, Workbench } from "./store/ide.ts";

export const DOC_PREFIX = "doc:";
/** Editor tabs: `res:<resourceId>` (component "editor"). */
export const RES_PREFIX = "res:";
const isEditorArea = (id: string) =>
  id.startsWith(DOC_PREFIX) || id.startsWith(RES_PREFIX) || id === "welcome" || id === "learn";

export class DockWorkbench implements Workbench {
  #api: DockviewApi | null = null;
  #pending: (() => void)[] = [];

  attach(api: DockviewApi): void {
    this.#api = api;
    api.addPanel({ id: "project", component: "project", title: "Project" });
    const welcome = api.addPanel({
      id: "welcome",
      component: "welcome",
      title: "Welcome",
      position: { referencePanel: "project", direction: "right" },
    });
    api.addPanel({
      id: "output",
      component: "output",
      title: "Output",
      position: { referencePanel: welcome, direction: "below" },
    });
    api.addPanel({ id: "problems", component: "problems", title: "Problems", position: { referencePanel: "output" } });
    api.getPanel("output")?.api.setActive();
    welcome.api.setActive();
    api.getPanel("project")?.group.api.setSize({ width: 260 });
    api.getPanel("output")?.group.api.setSize({ height: 220 });
    for (const run of this.#pending.splice(0)) run();
  }

  openDocument(docId: string): void {
    const api = this.#api;
    if (!api) {
      this.#pending.push(() => this.openDocument(docId));
      return;
    }
    const id = `${DOC_PREFIX}${docId}`;
    const existing = api.getPanel(id);
    if (existing) {
      existing.api.setActive();
      return;
    }
    const anchor = this.#editorAnchor(api);
    api.addPanel({
      id,
      component: "code",
      title: docTitle(docId),
      params: { docId },
      position: anchor ? { referenceGroup: anchor.group } : { referencePanel: "project", direction: "right" },
    });
    api.getPanel("welcome")?.api.close();
  }

  openResource(resource: ResourceRef): void {
    const api = this.#api;
    if (!api) {
      this.#pending.push(() => this.openResource(resource));
      return;
    }
    if (!editorFor(resource)) {
      this.openDocument(resourceFile(resource));
      return;
    }
    const id = `${RES_PREFIX}${resourceId(resource)}`;
    const existing = api.getPanel(id);
    if (existing) {
      existing.api.setActive();
      return;
    }
    const anchor = this.#editorAnchor(api);
    api.addPanel({
      id,
      component: "editor",
      title: resourceTitle(resource),
      params: { resource },
      position: anchor ? { referenceGroup: anchor.group } : { referencePanel: "project", direction: "right" },
    });
    api.getPanel("welcome")?.api.close();
  }

  showLearn(): void {
    const api = this.#api;
    if (!api) {
      this.#pending.push(() => this.showLearn());
      return;
    }
    const existing = api.getPanel("learn");
    if (existing) {
      existing.api.setActive();
      return;
    }
    const anchor = this.#editorAnchor(api);
    api.addPanel({
      id: "learn",
      component: "learn",
      title: "Learn",
      position: anchor ? { referenceGroup: anchor.group } : { referencePanel: "project", direction: "right" },
    });
  }

  focusPanel(id: "problems" | "output" | "project"): void {
    this.#api?.getPanel(id)?.api.setActive();
  }

  /** Marks dirty documents with a dot in their tab title. */
  syncTitles(state: Pick<IdeState, "dirty">): void {
    for (const panel of this.#api?.panels ?? []) {
      if (!panel.id.startsWith(DOC_PREFIX)) continue;
      const docId = panel.id.slice(DOC_PREFIX.length);
      const title = `${docTitle(docId)}${state.dirty[docId] ? " ●" : ""}`;
      if (panel.title !== title) panel.api.setTitle(title);
    }
  }

  /** Closes every document and editor tab (another project was opened). */
  closeDocuments(): void {
    for (const panel of [...(this.#api?.panels ?? [])])
      if (panel.id.startsWith(DOC_PREFIX) || panel.id.startsWith(RES_PREFIX)) panel.api.close();
  }

  bindStore(store: StoreApi<IdeState>): () => void {
    return store.subscribe((s, prev) => {
      if (s.projectDir !== prev.projectDir) this.closeDocuments();
      if (s.dirty !== prev.dirty) this.syncTitles(s);
    });
  }

  #editorAnchor(api: DockviewApi): IDockviewPanel | undefined {
    const active = api.activePanel;
    if (active && isEditorArea(active.id)) return active;
    return api.panels.find((p) => isEditorArea(p.id));
  }
}
