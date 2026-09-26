// The sound panel in the mock host (headless Chromium): loop points on the looped WAV fixture (drag, type, the
// DS loop and the 16-sample rule, undo, save into the smpl chunk, remove), Listen/Stop, and a music module.
import { readLoop } from "@dsdude/editor-core";
import { afterEach, describe, expect, it } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { createMockHost, type MockHost } from "../../mock-host/index.ts";
import soundPanel from "./index.tsx";

let host: MockHost | null = null;
afterEach(() => {
  host?.dispose();
  host = null;
});

const until = async (check: () => boolean, what = "", ms = 5000) => {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

/** Paths are relative to apps/ide (the Vitest root). */
async function asset(name: string): Promise<Uint8Array> {
  const b64 = await commands.readFile(`../../fixtures/assets/${name}`, "base64");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function mountSound(h: MockHost, name: string, file: string, kind: "effect" | "music") {
  h.files.set(`sounds/${name}/${file}`, await asset(file));
  h.ide.actions.updateResource({ kind: "sound", name }, (d) => {
    d.sounds.push({ name, kind, file });
  });
  const m = await h.mountEditor(soundPanel, { kind: "sound", name });
  const q = <T extends HTMLElement>(id: string) => m.element.querySelector(`[data-testid='${id}']`) as T;
  return { m, q };
}

function drag(canvas: HTMLCanvasElement, from: number, to: number) {
  const r = canvas.getBoundingClientRect();
  const at = (f: number) => ({ clientX: r.left + f * r.width, clientY: r.top + r.height / 2 });
  canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, ...at(from) }));
  canvas.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, ...at(to) }));
  canvas.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, ...at(to) }));
}

function setNumber(input: HTMLInputElement, value: number) {
  input.value = String(value);
  input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
}

describe("sound panel", () => {
  it("edits the loop of a WAV effect and saves it where the pipeline reads it", async () => {
    host = await createMockHost();
    const h = host;
    const { m, q } = await mountSound(h, "snd_loop", "loop-stereo-44k.wav", "effect");
    await until(() => !!q("sound-play") && !q<HTMLButtonElement>("sound-play").disabled, "decoded");
    expect(q("sound-info").textContent).toContain("WAV, 44100 Hz, stereo");
    expect(q<HTMLInputElement>("loop-start").value).toBe("1000");
    expect(q<HTMLInputElement>("loop-end").value).toBe("9000");
    expect(q("loop-ds").textContent).toBe("On the DS: loops samples 500..4500 at 22050 Hz (4000 samples).");

    // Drag a new loop across the middle of the wave: one undo step.
    drag(q<HTMLCanvasElement>("sound-wave"), 0.25, 0.5);
    await until(() => m.dirty(), "dirty after the drag");
    expect(m.host.undo.peek().undo).toBe("Set Loop");
    const dragged = Number(q<HTMLInputElement>("loop-start").value);
    expect(dragged).toBeGreaterThan(1000);
    await page.screenshot({ path: "../../../../test-results/browser/sound-panel.png" });

    // A 20-sample loop is 10 samples at 22050 Hz: red, and it says what happens.
    setNumber(q<HTMLInputElement>("loop-end"), dragged + 20);
    await until(() => q("loop-ds").className.includes("meter-over"), "too-short warning");
    expect(q("loop-ds").textContent).toContain("Too short to loop on the DS: 10 samples");
    m.host.undo.undo();
    await until(() => !q("loop-ds").className.includes("meter-over"), "undo");

    await m.panel.save();
    await until(() => !m.dirty(), "clean after save");
    const saved = h.files.get("sounds/snd_loop/loop-stereo-44k.wav");
    if (!saved) throw new Error("not saved");
    expect(readLoop(saved)?.start).toBe(dragged);

    // Listen plays (a real click, so the audio context may start), Stop stops.
    await userEvent.click(q("sound-play"));
    await until(() => q("sound-play").textContent === "■ Stop", "playing");
    await userEvent.click(q("sound-play"));
    await until(() => q("sound-play").textContent === "▶ Listen", "stopped");

    // No loop: saved without a smpl chunk.
    q<HTMLInputElement>("loop-on").click();
    await until(() => m.dirty(), "dirty after removing the loop");
    await m.panel.save();
    expect(readLoop(h.files.get("sounds/snd_loop/loop-stereo-44k.wav") as Uint8Array)).toBeNull();
  });

  it("shows a music module's kind and a plain note instead of loop points", async () => {
    host = await createMockHost();
    const { m, q } = await mountSound(host, "snd_tune", "tune.xm", "music");
    await until(() => !!q("sound-kind"), "mounted");
    expect(q<HTMLSelectElement>("sound-kind").value).toBe("music");
    expect(m.element.textContent).toContain("Music modules (.xm, .mod, .it, .s3m) play in the game");
    expect(q("sound-wave")).toBeNull();
    expect(q("loop-on")).toBeNull();
  });
});
