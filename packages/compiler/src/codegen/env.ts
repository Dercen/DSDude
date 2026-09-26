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
   * True when `name` may be an instance variable of an instance whose object is unknown here (a script, or a
   * `with (all)` body): some object assigns it, so the code reads or writes it by name (GETDYN/SETDYN).
   */
  isInstanceVariableName(name: string): boolean;
}
