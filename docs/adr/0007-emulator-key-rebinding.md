# ADR-0007: Emulator key rebinding goes through C4 (`LaunchOptions.keys`)

- Status: **proposed** by WS6 (2026-09-26). Needs WS1 (C4 owner; WS8 after `start-ws8`). Tier: T1 for C4 (one
  optional field). No other contract changes.
- Affected streams: WS1/WS8 (`packages/toolchain`: EmulatorManager, the melonDS/DeSmuME config writers), WS6 (the
  IDE's Settings page, the Controls card, the first Output line of every launch).
- Sources: PLAN.md 6 WS6 "Controls card" ("A Settings page lets the user rebind. It writes both `melonDS.toml` and
  `desmume.ini` through WS1's EmulatorManager."), docs/kickoff/ws6.md section 9, `packages/toolchain/src/emulator.ts`
  (`MELONDS_KEYS`, `melonDsOverrides`, `DESMUME_KEYS`, `desmumeOverrides`), C5 `SettingsSchema.controls`.

## Context

The IDE keeps the user's key mapping in `settings.json` (C5 0.2.0 `controls`: one `KeyboardEvent.key` value per DS
button, defaulting to the PLAN mapping). The emulators read their keys from their own config files, which C4's
`LocalEmulatorManager` rewrites on every launch with the fixed default map (`melonDsOverrides()` writes
`[Instance0.Keyboard]` from `MELONDS_KEYS`; `desmumeOverrides()` writes `[Controls]` from `DESMUME_KEYS`). The IDE
has no way to pass other keys, and any file the IDE wrote itself would be overwritten at the next launch. So a
rebinding page could store the keys but never apply them, and the Controls card would show keys the emulator ignores.

## Decision (proposed)

C4 T1 (additive):

```ts
/** A DS button, in C6 order. */
export type DsButton = "a" | "b" | "x" | "y" | "l" | "r" | "start" | "select" | "up" | "down" | "left" | "right";

export interface LaunchOptions {
  // ...
  /** Keys per DS button as KeyboardEvent.key values ("x", "Enter", "ArrowUp", "Shift", ...); a missing button keeps
   *  the default mapping. The manager translates them to Qt key codes (melonDS.toml) and Windows virtual-key codes
   *  (desmume.ini). */
  keys?: Partial<Record<DsButton, string>>;
}

/** The keys `keys` can name (for the Settings page to offer); anything else is refused with an E6xx at launch. */
export const SUPPORTED_KEYS: readonly string[];
```

- `LocalEmulatorManager.launch` merges `keys` over the defaults before `melonDsOverrides` / `desmumeOverrides`.
  Keys it cannot translate produce one new E6xx ("The key 'X' can't be used for the Y button"), and the launch uses
  the default key for that button. They never fail the launch.
- The fake managers (`createFakeToolchain`, the IDE's mock mode) accept and ignore `keys`.
- The IDE passes `settings.controls` on every launch. It shows those keys on the Controls card, Help > Controls and
  the first Output line. The Settings page offers only `SUPPORTED_KEYS`, and warns when two buttons share a key.

## Consequences and interim

- Until this lands, WS6 builds the Controls card and Help > Controls with the default mapping, which is what the
  emulators actually use, and holds the rebinding page back. The code that will pass the keys carries
  `// ADR-pending ADR-0007` (`effectiveControls` in `apps/ide/src/shared/controls.ts`).
- No change to C5: `settings.controls` already exists.
