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

/**
 * The keys the emulators use at launch, which the Controls card and the first Output line show.
 * ADR-pending ADR-0007: C4's EmulatorManager writes the default map on every launch, so the user's
 * settings.controls cannot apply yet; return them here once LaunchOptions.keys exists.
 */
export function effectiveControls(_settings?: Pick<Settings, "controls"> | null): Settings["controls"] {
  return DEFAULT_CONTROLS;
}
