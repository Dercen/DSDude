// The fallback property forms in the mock host: every resource kind edits through C1 with plain-language checks.
import { afterEach, describe, expect, it } from "vitest";
import { createMockHost, type MockHost } from "../mock-host/index.ts";
import { propertiesEditorFactory } from "./PropertiesEditor.tsx";

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

function commit(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

describe("property forms", () => {
  it("edit a sprite, refuse bad values in plain words, and undo", async () => {
    host = await createMockHost();
    const ide = host.ide;
    const m = await host.mountEditor(propertiesEditorFactory, { kind: "sprite", name: "spr_bird" });
    const frames = () => m.element.querySelector("[data-testid=pf-frames]") as HTMLInputElement;
    await until(() => !!frames());
    const sprite = () => ide.store.getState().project?.sprites.find((s) => s.name === "spr_bird");
    commit(frames(), "4");
    await until(() => sprite()?.frames === 4);
    expect(ide.store.getState().dirty["sprites/spr_bird/sprite.json"]).toBe(true);
    commit(frames(), "0");
    await until(() => m.element.textContent?.includes("Use 1 or more.") ?? false);
    expect(sprite()?.frames).toBe(4);
    m.host.undo.undo();
    await until(() => sprite()?.frames === 3);
  });

  it("edit Game Settings: title, first room", async () => {
    host = await createMockHost();
    const ide = host.ide;
    const m = await host.mountEditor(propertiesEditorFactory, { kind: "settings", name: "" });
    const title = () => m.element.querySelector("[data-testid=pf-title]") as HTMLInputElement;
    await until(() => !!title());
    commit(title(), "Flappy DS");
    await until(() => ide.store.getState().project?.project.title === "Flappy DS");
    commit(title(), "x".repeat(200));
    await until(() => m.element.textContent?.includes("Use 127 characters or fewer.") ?? false);
    await ide.actions.save();
    expect(host.saved.at(-1)?.project.title).toBe("Flappy DS");
  });

  it("edit a room's size and a screen's view, and a sound's kind", async () => {
    host = await createMockHost();
    const ide = host.ide;
    const room = ide.store.getState().project?.rooms[0]?.name ?? "";
    const m = await host.mountEditor(propertiesEditorFactory, { kind: "room", name: room });
    await until(() => !!m.element.querySelector("[data-testid=pf-room-width]"));
    commit(m.element.querySelector("[data-testid=pf-room-width]") as HTMLInputElement, "512");
    commit(m.element.querySelector("[data-testid=pf-bottom-view-x]") as HTMLInputElement, "64");
    await until(() => {
      const r = ide.store.getState().project?.rooms[0];
      return r?.width === 512 && r.screens.bottom.viewX === 64;
    });
    const snd = await host.mountEditor(propertiesEditorFactory, { kind: "sound", name: "snd_flap" });
    const select = () => snd.element.querySelector("[data-testid=pf-sound-kind]") as HTMLSelectElement;
    await until(() => !!select());
    select().value = "music";
    select().dispatchEvent(new Event("change", { bubbles: true }));
    await until(() => ide.store.getState().project?.sounds.find((s) => s.name === "snd_flap")?.kind === "music");
  });
});
