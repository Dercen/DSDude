/**
 * The checker's small type lattice (PLAN.md 6 WS4: unknown, number, int, fixed, string, bool, array, instance,
 * undefined), plus asset kinds and `void`. It only ever proves mistakes: anything it cannot tell is "unknown",
 * and "unknown" is accepted everywhere, so a correct program never gets a type error.
 */
import type { AssetNameKind } from "./env.ts";

export type ValueType =
  | "unknown"
  | "number"
  | "fixed"
  | "string"
  | "bool"
  | "array"
  | "instance"
  | "undefined"
  | "void"
  | AssetNameKind;

/** The broad kind a type belongs to when checking arguments: bools, instance ids and fixed values are numbers. */
type Category = "unknown" | "number" | "string" | "array" | "undefined" | "void" | AssetNameKind;

export function category(t: ValueType): Category {
  if (t === "number" || t === "fixed" || t === "bool" || t === "instance") return "number";
  return t;
}

/** The ValueType of a builtins.json type name (a variable's type or a function's return type). */
export function fromBuiltinType(type: string): ValueType {
  switch (type) {
    case "number":
    case "int":
    case "button":
    case "screen":
    case "color":
      return "number";
    case "string":
    case "bool":
    case "array":
    case "instance":
    case "void":
    case "object":
    case "sprite":
    case "sound":
    case "room":
    case "background":
      return type;
    default:
      return "unknown";
  }
}

/** Asset kinds a parameter of builtins.json type `param` accepts ("sound" also takes music). */
const ASSET_PARAMS: Readonly<Record<string, readonly AssetNameKind[]>> = {
  object: ["object"],
  sprite: ["sprite"],
  sound: ["sound", "music"],
  room: ["room"],
  background: ["background"],
};

/** Can a value of type `t` be passed where builtins.json declares `param`? Unknown always can. */
export function accepts(param: string, t: ValueType): boolean {
  const c = category(t);
  if (c === "unknown" || param === "any") return true;
  const assets = ASSET_PARAMS[param];
  // An asset parameter also takes a plain number (an asset id kept in a variable, like sprite_index).
  if (assets !== undefined) return c === "number" || assets.includes(c as AssetNameKind);
  if (param === "instance") return c === "number" || c === "object";
  if (param === "string") return c === "string";
  if (param === "array") return c === "array";
  return c === "number";
}

/** How a message names a value of type `t`: "text", "a number", "a sprite", ... */
export function describeType(t: ValueType): string {
  switch (category(t)) {
    case "number":
      return "a number";
    case "string":
      return "text";
    case "array":
      return "an array";
    case "undefined":
      return "undefined";
    case "void":
      return "nothing";
    case "object":
      return "an object";
    case "unknown":
      return "a value";
    default:
      return `a ${category(t)}`;
  }
}

/** How a message names what a builtins.json parameter type wants. */
export function describeParam(param: string): string {
  switch (param) {
    case "string":
      return "text";
    case "array":
      return "an array";
    case "object":
    case "instance":
      return `an ${param}`;
    case "sprite":
    case "sound":
    case "room":
    case "background":
      return `a ${param}`;
    case "button":
      return "a button (such as btn_a)";
    case "screen":
      return "a screen (SCREEN_TOP or SCREEN_BOTTOM)";
    default:
      return "a number";
  }
}

/** "1st", "2nd", "3rd", "4th", ... */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
