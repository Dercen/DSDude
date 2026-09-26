/**
 * Name lookups over the generated builtins table (src/gen/builtins.ts, from contracts/builtins.json by
 * tools/gen-builtins.ts). Kept separate so the generated file stays a plain data module.
 */
import {
  BUILTIN_ALIASES,
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  BUILTIN_UNSUPPORTED,
  BUILTIN_VARIABLES,
  type BuiltinAlias,
  type BuiltinConstant,
  type BuiltinFunction,
  type BuiltinUnsupported,
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

/** GameMaker names compiled as a DSDude builtin, by name (builtins.json `alias` entries; W060). */
export const builtinAliases: ReadonlyMap<string, BuiltinAlias> = new Map(BUILTIN_ALIASES.map((a) => [a.name, a]));

/** The `*` that ends a prefix entry's name in builtins.json (`ds_list_*`). */
const PREFIX_WILDCARD = "*";
/** Exact unsupported names (builtins.json `unsupported` entries with match "exact"). */
const unsupportedExact: ReadonlyMap<string, BuiltinUnsupported> = new Map(
  BUILTIN_UNSUPPORTED.filter((u) => u.match === "exact").map((u) => [u.name, u]),
);
/** Prefix entries with the wildcard removed: every name starting with `prefix` matches. */
const unsupportedPrefixes: readonly { prefix: string; entry: BuiltinUnsupported }[] = BUILTIN_UNSUPPORTED.filter(
  (u) => u.match === "prefix",
).map((entry) => ({
  prefix: entry.name.endsWith(PREFIX_WILDCARD) ? entry.name.slice(0, -PREFIX_WILDCARD.length) : entry.name,
  entry,
}));

/**
 * The unsupported GameMaker entry `name` matches (E207), or undefined. Prefix entries name function families
 * (`ds_list_*`), so they match only a called name: a variable such as `file_name` stays the user's own.
 */
export function unsupportedBuiltin(name: string, called: boolean): BuiltinUnsupported | undefined {
  const exact = unsupportedExact.get(name);
  if (exact !== undefined || !called) return exact;
  return unsupportedPrefixes.find((p) => name.startsWith(p.prefix))?.entry;
}
