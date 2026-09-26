// The C12 mock host in headless Chromium (no Electron): an EditorPanel mounted with the host services, the Learn
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
// panel rendering (and sanitising) markdown, and the whole shell over the mock bridge. WS6b and WS7 test the same way.
import { page } from "vitest/browser";
import type { EditorPanel, EditorPanelFactory, ResourceRef } from "../panels/api.ts";
import { updateWithUndo } from "../panels/kit.ts";
import { createMockHost, type MockHost, sampleNames } from "./index.ts";

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

/** A tiny editor built only on the C12 API: shows a sprite's frames, edits them with undo, saves a PNG. */
const frameEditor: EditorPanelFactory = {
  kind: "test-frames",
  canOpen: (r) => r.kind === "sprite",
  create({ element, host: h }): EditorPanel {
    const dirtyListeners = new Set<(d: boolean) => void>();
    let resource: ResourceRef = { kind: "sprite", name: "" };
    let sheet: Uint8Array | null = null;
    const root = createRoot(element);
    const frames = () => h.project.get()?.sprites.find((s) => s.name === resource.name)?.frames ?? 0;
    const draw = () =>
      root.render(
        <div>
          <span data-testid="frames">{frames()}</span>
          <button
            type="button"
            data-testid="add-frame"
            onClick={() => {
              updateWithUndo(h, resource, "Add Frame", (d) => {
                const s = d.sprites.find((x) => x.name === resource.name);
                if (s) s.frames += 1;
              });
              for (const l of dirtyListeners) l(true);
            }}
          >
            +
          </button>
        </div>,
      );
    const off = h.project.subscribe(draw);
    return {
      id: `sprite:${resource.name}`,
      kind: "test-frames",
      async open(r) {
        resource = r;
        sheet = await h.files.read(`sprites/${r.name}/sheet.png`);
        draw();
      },
      async save() {
        if (sheet) await h.files.write(`sprites/${resource.name}/sheet.png`, sheet);
        for (const l of dirtyListeners) l(false);
      },
      dispose() {
        off();
        root.unmount();
      },
      onDirty(l) {
        dirtyListeners.add(l);
        return () => dirtyListeners.delete(l);
      },
    };
  },
};

describe("mock host", () => {
  it("loads samples/flappy through C1 in the browser", async () => {
    expect(sampleNames()).toContain("flappy");
    host = await createMockHost();
    const p = host.ide.store.getState().project;
    expect(host.dir).toBe("/samples/flappy");
    expect(p?.objects.map((o) => o.name)).toContain("obj_bird");
    expect(p?.sprites.map((s) => s.name)).toContain("spr_bird");
  });

  it("mounts an EditorPanel with project store, files, undo and save", async () => {
    host = await createMockHost();
    const m = await host.mountEditor(frameEditor, { kind: "sprite", name: "spr_bird" });
    const shown = () => Number(m.element.querySelector("[data-testid=frames]")?.textContent);
    await until(() => !Number.isNaN(shown()) && shown() > 0);
    const before = shown();
    (m.element.querySelector("[data-testid=add-frame]") as HTMLButtonElement).click();
    await until(() => shown() === before + 1);
    expect(m.host.project.isDirty({ kind: "sprite", name: "spr_bird" })).toBe(true);
    expect(m.dirty()).toBe(true);
    expect(m.host.undo.peek().undo).toBe("Add Frame");
    m.host.undo.undo();
    await until(() => shown() === before);
    m.host.undo.redo();
    await until(() => shown() === before + 1);

    // Save: the panel writes its PNG (project.writeFile), then the store saves the JSON (project.save).
    expect(await host.ide.actions.save()).toBe(true);
    expect(host.files.get("sprites/spr_bird/sheet.png")?.slice(0, 4)).toEqual(new Uint8Array([137, 80, 78, 71]));
    expect(host.saved.at(-1)?.sprites.find((s) => s.name === "spr_bird")?.frames).toBe(before + 1);
    expect(m.dirty()).toBe(false);
    expect(host.calls.map((c) => c.channel)).toEqual(
      expect.arrayContaining(["project.readFile", "project.writeFile", "project.save"]),
    );
  });

  it("refuses unsafe paths through the same C5 validation as the IDE", async () => {
    host = await createMockHost();
    const h = host.createHost();
    await expect(h.files.read("../../etc/passwd.png")).rejects.toThrow("[bad-request]");
    await expect(h.files.write("objects/obj_bird/step.dss", new Uint8Array(1))).rejects.toThrow("[bad-request]");
  });

  it("renders Learn markdown sanitised, with heading anchors, copy buttons and local images only", async () => {
    const PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    host = await createMockHost({
      docs: {
        "docs/manual/test.md": [
          "# Test page",
          "",
          "## E101",
          "",
          "```dss",
          "x += 1;",
          "```",
          "",
          `![inline](${PNG})`,
          "![remote](https://example.com/x.png)",
          '<img src="https://example.com/y.png" onerror="alert(1)">',
          "<script>window.__pwned = true</script>",
          "[bad](javascript:alert(1)) [learn](dsdude-learn:/docs/reference/errors.md#e101) [web](https://example.com)",
        ].join("\n"),
      },
    });
    const view = await host.mountLearn({ path: "docs/manual/test.md", anchor: "e101" });
    await until(() => !!view.element.querySelector("[data-testid=learn-doc] h1"));
    const doc = view.element.querySelector("[data-testid=learn-doc]") as HTMLElement;
    expect(doc.querySelector("h1")?.id).toBe("test-page");
    expect(doc.querySelector("#e101")?.textContent).toBe("E101");
    expect(doc.querySelector("script")).toBeNull();
    expect((window as { __pwned?: boolean }).__pwned).toBeUndefined();
    const imgs = [...doc.querySelectorAll("img")];
    expect(imgs.map((i) => i.getAttribute("src")?.slice(0, 15))).toEqual(["data:image/png;"]);
    expect(doc.innerHTML).not.toContain("example.com/x.png");
    expect(doc.innerHTML).not.toContain("onerror");
    expect(doc.querySelector('a[href^="javascript"]')).toBeNull();
    expect(doc.querySelector("pre .learn-copy")?.textContent).toBe("Copy");

    // A Learn link opens its target in the store; a web link only toasts.
    (doc.querySelector('a[href^="dsdude-learn"]') as HTMLAnchorElement).click();
    expect(host.ide.store.getState().learn.target).toEqual({ path: "docs/reference/errors.md", anchor: "e101" });
    (doc.querySelector('a[href^="https"]') as HTMLAnchorElement).click();
    expect(host.ide.store.getState().toast?.message).toContain("https://example.com");
  });

  it("lists the repo's Learn documents", async () => {
    host = await createMockHost();
    const view = await host.mountLearn();
    await until(() => view.element.querySelectorAll("[data-testid^='learn-doc:']").length > 0);
    expect(view.element.textContent).toContain("Manual");
    (view.element.querySelector("[data-testid^='learn-doc:']") as HTMLButtonElement).click();
    await until(() => !!view.element.querySelector("[data-testid=learn-doc] h1"));
    await page.screenshot({ path: "../../../test-results/browser/learn.png" });
  });

  it("runs the whole shell: tree, a document, Play and Stop against the fake build", async () => {
    host = await createMockHost();
    const view = await host.mountShell();
    await until(() => !!view.element.querySelector("[data-testid=project-tree]"));
    (view.element.querySelector("[data-testid='tree:object:obj_bird']") as HTMLButtonElement).click();
    await until(() => !!view.element.querySelector("[data-testid='tree:objects/obj_bird/step.dss']"));
    (view.element.querySelector("[data-testid='tree:objects/obj_bird/step.dss']") as HTMLButtonElement).click();
    await until(() => !!view.element.querySelector(".monaco-editor"));
    // dockview laid the panels out side by side (its stylesheet is loaded with the shell).
    const tree = view.element.querySelector("[data-testid=project-tree]")?.getBoundingClientRect();
    const editor = view.element.querySelector(".monaco-editor")?.getBoundingClientRect();
    expect(tree && editor && editor.left >= tree.right - 1 && editor.height > 100).toBe(true);
    (view.element.querySelector("[data-testid=play]") as HTMLButtonElement).click();
    await until(() => view.element.querySelector("[data-testid=output]")?.textContent?.includes("hello") ?? false);
    await page.screenshot({ path: "../../../test-results/browser/mock-host-shell.png" });
    (view.element.querySelector("[data-testid=stop]") as HTMLButtonElement).click();
    await until(() => view.element.querySelector("[data-testid=output]")?.textContent?.includes("Game ended") ?? false);
  });
});
