/**
 * Settings (PLAN.md 6 WS6): the emulator, and Controls rebinding. The keys reach the emulators at every launch as C4
 * LaunchOptions.keys (ADR-0007), which writes both melonDS.toml and desmume.ini. Only C4 SUPPORTED_KEYS are
 * offered; two buttons on one key get a warning.
 */
import { ControlsSchema, type Settings } from "@dsdude/ipc-contract";
import { useEffect, useState } from "react";
import { DEFAULT_CONTROLS, keyLabel, normalizeKey, sharedKeys } from "../../shared/controls.ts";
import { useActions, useIde } from "../ide-context.tsx";

type Controls = Settings["controls"];
type Button = keyof Controls;

const BUTTONS: [Button, string][] = [
  ["up", "Up"],
  ["down", "Down"],
  ["left", "Left"],
  ["right", "Right"],
  ["a", "A"],
  ["b", "B"],
  ["x", "X"],
  ["y", "Y"],
  ["l", "L"],
  ["r", "R"],
  ["start", "Start"],
  ["select", "Select"],
];

export function SettingsDialog() {
  const open = useIde((s) => s.settingsDialog);
  const settings = useIde((s) => s.settings);
  const supported = useIde((s) => s.appInfo?.supportedKeys ?? null);
  const actions = useActions();
  const [listening, setListening] = useState<Button | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const controls: Controls = settings?.controls ?? DEFAULT_CONTROLS;

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setListening(null);
        return;
      }
      const key = normalizeKey(e.key);
      if (supported && !supported.includes(key)) {
        setProblem(`${keyLabel(e.key)} can't be used for a DS button. Try a letter, a digit or an arrow key.`);
        return;
      }
      setProblem(null);
      setListening(null);
      void actions.setControls(ControlsSchema.parse({ ...controls, [listening]: key }));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, supported, controls, actions]);

  if (!open) return null;
  const shared = sharedKeys(controls);
  return (
    <div className="overlay">
      <div
        className="dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        data-testid="settings"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !listening) actions.hideSettings();
        }}
      >
        <h2 id="settings-title">Settings</h2>
        <label className="field">
          Emulator
          <select
            data-testid="settings-emulator"
            value={settings?.emulator ?? "melonds"}
            onChange={(e) => void actions.setEmulator(e.target.value as "melonds" | "desmume")}
          >
            <option value="melonds">melonDS (recommended)</option>
            <option value="desmume">DeSmuME</option>
          </select>
        </label>
        <h3>Controls</h3>
        <p className="field-hint">Click Change, then press the key to use for that DS button.</p>
        <table className="controls-table">
          <tbody>
            {BUTTONS.map(([button, label]) => (
              <tr key={button} className={shared.has(normalizeKey(controls[button])) ? "controls-shared" : ""}>
                <td>{label}</td>
                <td className="controls-key" data-testid={`key:${button}`}>
                  {listening === button ? "Press a key…" : keyLabel(controls[button])}
                </td>
                <td>
                  <button
                    type="button"
                    data-testid={`rebind:${button}`}
                    onClick={() => {
                      setProblem(null);
                      setListening(button);
                    }}
                  >
                    Change
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {problem ? <p className="field-error">{problem}</p> : null}
        {shared.size > 0 ? (
          <p className="field-warning" data-testid="settings-shared">
            {[...shared]
              .map(
                ([key, buttons]) => `${keyLabel(key)} is used by ${buttons.map((b) => b.toUpperCase()).join(" and ")}`,
              )
              .join("; ")}
            : one key presses all of them.
          </p>
        ) : null}
        <p className="field-hint">The new keys apply the next time you press Play.</p>
        <div className="dialog-buttons">
          <button type="button" data-testid="settings-reset" onClick={() => void actions.setControls(DEFAULT_CONTROLS)}>
            Reset to defaults
          </button>
          <button type="button" className="primary" data-testid="settings-close" onClick={() => actions.hideSettings()}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
