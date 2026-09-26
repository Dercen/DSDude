/**
 * The Controls card (PLAN.md 6 WS6): an overlay on the first Play of each session, also Help > Controls. It shows the
 * keys the emulator uses (the same text is the first Output line of every launch).
 */
import { useEffect } from "react";
import { controlsRows, effectiveControls } from "../../shared/controls.ts";
import { useActions, useIde } from "../ide-context.tsx";

export function ControlsCard() {
  const open = useIde((s) => s.controlsCard);
  const settings = useIde((s) => s.settings);
  const supported = useIde((s) => s.appInfo?.supportedKeys ?? null);
  const actions = useActions();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") actions.hideControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, actions]);
  if (!open) return null;
  const rows = controlsRows(effectiveControls(settings, supported));
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: clicking the backdrop closes the card; Escape is handled on window.
    <div className="overlay" onClick={() => actions.hideControls()}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes the card (handled on window). */}
      <div
        className="controls-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="controls-title"
        data-testid="controls-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="controls-title">Controls</h2>
        <p>Your keyboard plays the DS. Click the emulator window first so it gets the keys.</p>
        <table>
          <tbody>
            {rows.map(([button, key]) => (
              <tr key={button}>
                <td className="controls-key">{key}</td>
                <td>{button}</td>
              </tr>
            ))}
            <tr>
              <td className="controls-key">Mouse click</td>
              <td>Touch the bottom screen</td>
            </tr>
          </tbody>
        </table>
        <button type="button" className="primary" data-testid="controls-ok" onClick={() => actions.hideControls()}>
          Got it
        </button>
      </div>
    </div>
  );
}
