/**
 * Name lookups over the generated builtins table (src/gen/builtins.ts, from contracts/builtins.json by
 * tools/gen-builtins.ts). Kept separate so the generated file stays a plain data module.
 */
import {
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  BUILTIN_VARIABLES,
  type BuiltinConstant,
  type BuiltinFunction,
  type BuiltinVariable,
} from "../gen/builtins.ts";

/** Builtin functions by name (CALLN targets). */
export const builtinFunctions: ReadonlyMap<string, BuiltinFunction> = new Map(
  BUILTIN_FUNCTIONS.map((f) => [f.name, f]),
);
/** Builtin variables by name (GETBI/SETBI and friends). */
export const builtinVariables: ReadonlyMap<string, BuiltinVariable> = new Map(
  BUILTIN_VARIABLES.map((v) => [v.name, v]),
);
/** Builtin constants by name (btn_*, SCREEN_*, ...). `self`/`other`/`all`/`noone` are keywords, handled by the parser. */
export const builtinConstants: ReadonlyMap<string, BuiltinConstant> = new Map(
  BUILTIN_CONSTANTS.map((c) => [c.name, c]),
);

/** Every builtin name, for did-you-mean suggestions. */
export const allBuiltinNames: readonly string[] = [
  ...BUILTIN_FUNCTIONS.map((f) => f.name),
  ...BUILTIN_VARIABLES.map((v) => v.name),
  ...BUILTIN_CONSTANTS.map((c) => c.name),
];
