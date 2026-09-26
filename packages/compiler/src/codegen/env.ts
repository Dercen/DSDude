/**
 * What the function code generator needs to know about the code around a function: which object `self` and
 * `other` are, which user functions and assets exist, and where diagnostics go. The program-form compiler and
 * the project compiler each build one of these per function.
 */
import type { Reporter } from "../diagnostics/report.ts";
import type { Expr } from "../syntax/ast.ts";

/** An object as the code generator sees it: its name and its instance-variable slot layout. */
export interface ObjectInfo {
  name: string;
  /** Instance variable name -> slot index (parent layout first; contracts/language.md section 5). */
  slots: ReadonlyMap<string, number>;
}

/** A user function the code can call with CALL. */
export interface UserFunction {
  /** The function's name in the DSDB FUNC table (object functions are prefixed with their object). */
  funcName: string;
  /** Parameter count; CALL always passes exactly this many (the caller fills defaults). */
  params: number;
  /** Default value per parameter, or null for a required one. Only context-free values (checked at declaration). */
  defaults: readonly (Expr | null)[];
}

/** Kinds of names that stand for assets, objects and rooms (DSDB ASSET cells, contracts/dsdb.md section 3). */
export type AssetNameKind = "sprite" | "background" | "sound" | "music" | "object" | "room";

export interface CodegenEnv {
  /** Project-relative file of the code, for DBG locations and diagnostics. */
  file: string;
  reporter: Reporter;
  /** False in program form: no instance, so no `self`, `other`, `with` or instance variables. */
  hasInstance: boolean;
  /** The object `self` is known to be (or descend from), or null when unknown (scripts). */
  self: ObjectInfo | null;
  /** The object `other` is known to be (collision events), or null. */
  other: ObjectInfo | null;
  /** The event stem when the code is an event (for `allowedEvents`, E313); null for functions and programs. */
  event: string | null;
  /** The screen of the object whose code this is (W031); null when not tied to an object. */
  objectScreen: "top" | "bottom" | null;
  /** Resolves a callable user function by name (the object's own and inherited ones, then scripts). */
  lookupFunction(name: string): UserFunction | null;
  /** Names of every user function reachable from here, for did-you-mean. */
  functionNames(): Iterable<string>;
  /** The kind of asset, object or room `name` names, or null. */
  assetKind(name: string): AssetNameKind | null;
  /** Every asset, object and room name, for did-you-mean. */
  assetNames(): Iterable<string>;
  /** The slot layout of the object `name`, or null when it is not an object. */
  objectInfo(name: string): ObjectInfo | null;
  /**
   * True when `name` is an instance variable somewhere (a slot of some object, or a variable written by name), so
   * code that can't use a slot of a known object reads or writes it by name (GETDYN/SETDYN): scripts, `with (all)`
   * bodies, and a parent's code reading a variable only its children assign.
   */
  isInstanceVariableName(name: string): boolean;
  /**
   * Evaluate constant expressions at compile time (codegen/fold.ts). On for games; off for the conformance goldens,
   * which exist to test the VM's own arithmetic. Absent means off.
   */
  fold?: boolean;
  /**
   * Emit the int-specialised ADDII/SUBII/MULII/CMPJII where both operands are proved int (codegen/intproof.ts).
   * Absent means off.
   */
  intOps?: boolean;
  /** The project's int variables (codegen/intproof.ts intVariables); absent means none. */
  isIntVariable?(kind: "instance" | "global", name: string): boolean;
  /** The object whose functions.dss defines `name` when this code can't call it (E205), or null. */
  helperOwner?(name: string): string | null;
  /**
   * The versions of object function `name` that descendants of self's object use instead of the one
   * `lookupFunction` finds (they override it), each with the objects that use it. Empty when nothing overrides it.
   */
  overridesOf?(name: string): FunctionOverride[];
}

/** One overriding version of an object function, and the objects whose instances call it. */
export interface FunctionOverride {
  fn: UserFunction;
  /** Object names, sorted: an instance whose object_index is one of these calls `fn`. */
  objects: string[];
}
