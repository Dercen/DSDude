/**
 * Emulator key rebinding (ADR-0007, C4 0.6.0): LaunchOptions.keys holds KeyboardEvent.key values per DS button;
 * melonDS.toml wants Qt key codes and desmume.ini Windows virtual-key codes. Pure, so it runs on Linux too.
 */
import type { Diagnostic } from "@dsdude/project-format";
import { type DsButton, SUPPORTED_KEYS } from "./api.ts";
import { toolchainDiagnostic } from "./diagnostics/catalog.ts";

/** Every DS button, in C6 order. */
export const DS_BUTTONS: readonly DsButton[] = [
  "a",
  "b",
  "x",
  "y",
  "l",
  "r",
  "start",
  "select",
  "up",
  "down",
  "left",
  "right",
];

/** The default mapping (PLAN.md 6 WS1/WS6; the same as C5 `ControlsSchema`'s defaults). */
export const DEFAULT_KEYS: Readonly<Record<DsButton, string>> = {
  a: "x",
  b: "z",
  x: "s",
  y: "a",
  l: "q",
  r: "w",
  start: "Enter",
  select: "Shift",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

/** The key name both emulators use for a button in their config files. */
export function configKeyName(button: DsButton): string {
  return button.length === 1 ? button.toUpperCase() : button[0].toUpperCase() + button.slice(1);
}

/** Qt key codes (Qt::Key) and Windows virtual-key codes of the named (non-character) keys. */
const NAMED: Readonly<Record<string, [qt: number, vk: number]>> = {
  " ": [0x20, 0x20],
  Enter: [0x01000004, 0x0d], // Qt::Key_Return, VK_RETURN
  Shift: [0x01000020, 0x10],
  Control: [0x01000021, 0x11],
  Tab: [0x01000001, 0x09],
  Backspace: [0x01000003, 0x08],
  ArrowUp: [0x01000013, 0x26],
  ArrowDown: [0x01000015, 0x28],
  ArrowLeft: [0x01000012, 0x25],
  ArrowRight: [0x01000014, 0x27],
  Insert: [0x01000006, 0x2d],
  Delete: [0x01000007, 0x2e],
  Home: [0x01000010, 0x24],
  End: [0x01000011, 0x23],
  PageUp: [0x01000016, 0x21],
  PageDown: [0x01000017, 0x22],
};

/** US-layout punctuation: the Qt code is the ASCII code, the virtual key a VK_OEM_* code. */
const PUNCTUATION_VK: Readonly<Record<string, number>> = {
  "-": 0xbd,
  "=": 0xbb,
  "[": 0xdb,
  "]": 0xdd,
  "\\": 0xdc,
  ";": 0xba,
  "'": 0xde,
  ",": 0xbc,
  ".": 0xbe,
  "/": 0xbf,
  "`": 0xc0,
};

/** `[qt, vk]` for a KeyboardEvent.key value, or null when it is not in SUPPORTED_KEYS. */
export function translateKey(key: string): [qt: number, vk: number] | null {
  const k = /^[A-Z]$/.test(key) ? key.toLowerCase() : key;
  if (!SUPPORTED_KEYS.includes(k)) return null;
  const named = NAMED[k];
  if (named) return named;
  if (/^[a-z0-9]$/.test(k)) {
    const code = k.toUpperCase().charCodeAt(0);
    return [code, code];
  }
  const vk = PUNCTUATION_VK[k];
  return vk === undefined ? null : [k.charCodeAt(0), vk];
}

export interface ResolvedKeys {
  /** The key of every button: the requested one where it translates, else the default. */
  keys: Record<DsButton, string>;
  qt: Record<DsButton, number>;
  vk: Record<DsButton, number>;
  /** One E625 warning per requested key that could not be translated. */
  diagnostics: Diagnostic[];
}

/** Merges `keys` over DEFAULT_KEYS and translates them for both emulators. */
export function resolveKeys(keys: Partial<Record<DsButton, string>> = {}): ResolvedKeys {
  const keysOut = { ...DEFAULT_KEYS };
  const qt = {} as Record<DsButton, number>;
  const vk = {} as Record<DsButton, number>;
  const diagnostics: Diagnostic[] = [];
  for (const button of DS_BUTTONS) {
    const fallback = DEFAULT_KEYS[button];
    const wanted = keys[button];
    let codes = wanted === undefined ? null : translateKey(wanted);
    if (wanted !== undefined && codes === null) {
      diagnostics.push(
        toolchainDiagnostic("E625", {
          key: wanted,
          button: configKeyName(button),
          fallback: fallback === " " ? "Space" : fallback,
        }),
      );
    }
    if (codes === null) codes = translateKey(fallback) as [number, number];
    else keysOut[button] = wanted as string;
    qt[button] = codes[0];
    vk[button] = codes[1];
  }
  return { keys: keysOut, qt, vk, diagnostics };
}
