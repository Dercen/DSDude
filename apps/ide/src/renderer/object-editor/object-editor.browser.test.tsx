// The object editor (a C12 EditorPanel) in the mock host: stacked event editors, the jump bar, + Add Event,
// Functions, undoable properties, and edits flowing into the store's documents.
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { createMockHost, type MockHost } from "../mock-host/index.ts";
import { getDocText } from "../store/documents.ts";
import { createObjectEditorFactory } from "./ObjectEditor.tsx";

let host: MockHost | null = null;
afterEach(() => {
  host?.dispose();
  host = null;
});

const until = async (check: () => boolean, ms = 5000) => {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
};

function choose(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("object editor", () => {
  it("stacks every event of obj_bird with its plain-language heading, Functions last", async () => {
    host = await createMockHost();
    const m = await host.mountEditor(createObjectEditorFactory(host.ide), { kind: "object", name: "obj_bird" });
    await until(() => m.element.querySelectorAll(".oe-section .monaco-editor").length >= 5);
    const headings = [...m.element.querySelectorAll(".oe-heading")].map((h) => h.textContent?.slice(2));
    expect(headings[0]).toBe("Create - runs once, when the instance is created");
    expect(headings).toContain("Step - runs every frame (60 per second)");
    expect(headings.at(-1)?.startsWith("Functions - runs never on its own")).toBe(true);
    expect(m.panel.id).toBe("object:obj_bird");
    await page.screenshot({ path: "../../../test-results/browser/object-editor.png" });
  });

  it("adds an event with its comment, and creates functions.dss on first click", async () => {
    host = await createMockHost();
    const ide = host.ide;
    const m = await host.mountEditor(createObjectEditorFactory(ide), { kind: "object", name: "obj_ctrl" });
    await until(() => !!m.element.querySelector("[data-testid=add-event]"));
    choose(m.element.querySelector("[data-testid=add-event]") as HTMLSelectElement, "button_pressed_start");
    await until(() => !!m.element.querySelector("[data-testid='event:button_pressed_start'] .monaco-editor"));
    const project = () => ide.store.getState().project;
    const p = project();
    if (!p) throw new Error("no project");
    expect(getDocText(p, "objects/obj_ctrl/button_pressed_start.dss")).toBe(
      "// Button Start Pressed - runs the frame Start is pressed\n",
    );
    expect(ide.store.getState().dirty["objects/obj_ctrl/button_pressed_start.dss"]).toBe(true);
    expect(p.objects.find((o) => o.name === "obj_ctrl")?.functions).toBeNull();
    (m.element.querySelector("[data-testid='jump:functions']") as HTMLButtonElement).click();
    await until(() => project()?.objects.find((o) => o.name === "obj_ctrl")?.functions != null);
    await until(() => !!m.element.querySelector("[data-testid='event:functions'] .monaco-editor"));
    await ide.actions.save();
    const saved = host.saved.at(-1)?.objects.find((o) => o.name === "obj_ctrl");
    expect(saved?.events.button_pressed_start).toContain("Start is pressed");
    expect(saved?.functions).toContain("Functions");
  });

  it("changes properties with undo and keeps parents free of cycles", async () => {
    host = await createMockHost();
    const ide = host.ide;
    const m = await host.mountEditor(createObjectEditorFactory(ide), { kind: "object", name: "obj_pipe" });
    await until(() => !!m.element.querySelector("[data-testid=prop-screen]"));
    const obj = () => ide.store.getState().project?.objects.find((o) => o.name === "obj_pipe");
    choose(m.element.querySelector("[data-testid=prop-screen]") as HTMLSelectElement, "bottom");
    await until(() => obj()?.screen === "bottom");
    expect(ide.store.getState().dirty["objects/obj_pipe/object.json"]).toBe(true);
    m.host.undo.undo();
    await until(() => obj()?.screen === "top");
    m.host.undo.redo();
    await until(() => obj()?.screen === "bottom");

    // obj_gap -> parent obj_pipe; then obj_pipe must not offer obj_gap as its parent.
    ide.actions.updateResource({ kind: "object", name: "obj_gap" }, (d) => {
      const g = d.objects.find((o) => o.name === "obj_gap");
      if (g) g.parent = "obj_pipe";
    });
    await until(() => {
      const opts = [...(m.element.querySelector("[data-testid=prop-parent]") as HTMLSelectElement).options];
      return !opts.some((o) => o.value === "obj_gap") && opts.some((o) => o.value === "obj_bird");
    });
  });

  it("puts typed text into the store document the code tabs share", async () => {
    host = await createMockHost();
    const ide = host.ide;
    const m = await host.mountEditor(createObjectEditorFactory(ide), { kind: "object", name: "obj_hud" });
    await until(() => !!m.element.querySelector("[data-testid='event:draw'] .monaco-editor"));
    const { monaco } = await import("../monaco/setup.ts");
    const model = monaco.editor.getModel(monaco.Uri.from({ scheme: "dsdude", path: "/objects/obj_hud/draw.dss" }));
    if (!model) throw new Error("no model");
    model.setValue('draw_text(8, 8, "hi");\n');
    const p = ide.store.getState().project;
    expect(p && getDocText(p, "objects/obj_hud/draw.dss")).toBe('draw_text(8, 8, "hi");\n');
    expect(ide.store.getState().dirty["objects/obj_hud/draw.dss"]).toBe(true);
  });
});
