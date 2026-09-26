/**
 * The Help menu (PLAN.md 6 WS6): Flappy Bird tutorial, Differences from GameMaker, Controls, Tutorial assets, plus
 * the Learn contents. WS7 writes the documents; they are found by their title, so file names can change.
 */
import { useEffect, useRef, useState } from "react";
import { useActions } from "../ide-context.tsx";
import { ipc } from "../ipc.ts";

/** Opens the first Learn document whose title matches, else the Learn contents. */
async function openByTitle(openLearn: (t: { path: string } | null) => void, pattern: RegExp): Promise<void> {
  try {
    const { docs } = await ipc.invoke("learn.list", {});
    const doc = docs.find((d) => pattern.test(d.title));
    openLearn(doc ? { path: doc.path } : null);
  } catch {
    openLearn(null);
  }
}

export function HelpMenu() {
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  const item = (label: string, testId: string, run: () => void) => (
    <button
      type="button"
      className="menu-item"
      role="menuitem"
      data-testid={testId}
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="menu" ref={box}>
      <button
        type="button"
        data-testid="help-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Help
      </button>
      {open ? (
        <div className="menu-list" role="menu">
          {item("Flappy Bird tutorial", "help-tutorial", () => void openByTitle(actions.openLearn, /flappy/i))}
          {item(
            "Differences from GameMaker",
            "help-differences",
            () => void openByTitle(actions.openLearn, /differences.*gamemaker/i),
          )}
          {item("Controls", "help-controls", () => actions.showControls())}
          {item("Settings…", "help-settings", () => actions.showSettings())}
          {item("Tutorial assets", "help-assets", () => void actions.openTutorialAssets())}
          {item("Learn (F1)", "help-learn", () => actions.openLearn(null))}
        </div>
      ) : null}
    </div>
  );
}
