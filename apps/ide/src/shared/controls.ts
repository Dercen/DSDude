/**
 * The Controls mapping in plain words (PLAN.md 6 WS6 "Controls card"): the Controls card, Help > Controls and the
 * first Output line of every launch all use this text. Pure; shared by main and the renderer.
 */
import { ControlsSchema, type Settings } from "@dsdude/ipc-contract";

type Controls = Settings["controls"];

const NAMES: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
};

/** How a KeyboardEvent.key value is shown: letters upper-case, arrows by direction. */
export function keyLabel(key: string): string {
  return NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

/** `[DS button, key label]` pairs in the order the card shows them. */
export function controlsRows(c: Controls): [string, string][] {
  const arrows = c.up === "ArrowUp" && c.down === "ArrowDown" && c.left === "ArrowLeft" && c.right === "ArrowRight";
  const pad: [string, string][] = arrows
    ? [["D-pad", "Arrows"]]
    : [
        ["Up", keyLabel(c.up)],
        ["Down", keyLabel(c.down)],
        ["Left", keyLabel(c.left)],
        ["Right", keyLabel(c.right)],
      ];
  return [
    ...pad,
    ["A", keyLabel(c.a)],
    ["B", keyLabel(c.b)],
    ["X", keyLabel(c.x)],
    ["Y", keyLabel(c.y)],
    ["L", keyLabel(c.l)],
    ["R", keyLabel(c.r)],
    ["Start", keyLabel(c.start)],
    ["Select", keyLabel(c.select)],
  ];
}

/** "Controls: Arrows = D-pad, X = A, ..., click the bottom screen to touch" */
export function controlsLine(c: Controls): string {
  const parts = controlsRows(c).map(([button, key]) => `${key} = ${button}`);
  return `Controls: ${parts.join(", ")}, click the bottom screen to touch`;
}

/** The PLAN.md mapping (Arrows = D-pad, X = A, Z = B, ...). */
export const DEFAULT_CONTROLS: Settings["controls"] = ControlsSchema.parse({});

/** Normalises a key as the emulator manager does: a single letter in either case is that letter. */
export function normalizeKey(key: string): string {
  return /^[A-Z]$/.test(key) ? key.toLowerCase() : key;
}

/**
 * The keys the emulators use at launch (C4 LaunchOptions.keys, ADR-0007), which the Controls card and the first
 * Output line show: the user's keys, except that a key outside `supported` keeps the button's default (C4 E625).
 * Without a `supported` list every key is taken as given.
 */
export function effectiveControls(
  settings?: Pick<Settings, "controls"> | null,
  supported?: readonly string[] | null,
): Settings["controls"] {
  const user = settings?.controls ?? DEFAULT_CONTROLS;
  const ok = supported ? new Set(supported) : null;
  const out = { ...DEFAULT_CONTROLS };
  for (const button of Object.keys(DEFAULT_CONTROLS) as (keyof Settings["controls"])[]) {
    const key = normalizeKey(user[button]);
    if (!ok || ok.has(key)) out[button] = key;
  }
  return out;
}

/** Buttons that share a key with another button (the Settings page warns about them). */
export function sharedKeys(controls: Settings["controls"]): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const [button, key] of Object.entries(controls)) {
    const k = normalizeKey(key);
    byKey.set(k, [...(byKey.get(k) ?? []), button]);
  }
  return new Map([...byKey].filter(([, buttons]) => buttons.length > 1));
}
