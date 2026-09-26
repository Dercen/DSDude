/**
 * The shared view of a project after parsing, function declaration and slot layout (passes 1-3 of
 * src/project.ts). compileProject generates code from it; the language service (src/analysis.ts, C7) answers
 * questions from it. Internal to WS4.
 */
import type { Diagnostic, ObjectResource } from "@dsdude/project-format";
import type { AssetNameKind, ObjectInfo, UserFunction } from "./codegen/env.ts";
import type { Reporter } from "./diagnostics/report.ts";
import type { FunctionDecl, Span, Stmt } from "./syntax/ast.ts";
import type { ParseResult } from "./syntax/parser.ts";

/** A place in a source file: project-relative path and a half-open UTF-16 range. */
export interface SourceLocation {
  file: string;
  start: number;
  end: number;
}

/** A parsed source text and the reporter that turns its offsets into lines. */
export interface SourceText {
  file: string;
  /** The text as parsed ("\r" removed). */
  text: string;
  parsed: ParseResult;
  reporter: Reporter;
}

/** One unit of code: an event, an object function, a script function, creation code, or a program's `__main`. */
export interface CodeUnit {
  kind: "event" | "function" | "script" | "creation" | "main";
  /** FUNC name in the DSDB. */
  funcName: string;
  /** The object whose instance runs it (events, object functions, creation code); null otherwise. */
  owner: string | null;
  /** Event stem (events only). */
  stem: string | null;
  params: string[];
  body: Stmt[];
  /** The declaration, for functions; null for events, creation code and `__main`. */
  decl: FunctionDecl | null;
  /** The code's extent in its file: the declaration, or the whole file. */
  span: Span;
  source: SourceText;
}

/** An object's compile-time view: its resource, parent and slot layout. */
export interface ObjectEntry {
  res: ObjectResource;
  parent: ObjectEntry | null;
  info: ObjectInfo;
  /** Instance-variable names assigned in its own code. */
  assigned: Set<string>;
  /** Where each of its own instance variables is first given a value (its Create event preferred). */
  assignSites: Map<string, SourceLocation>;
  /** Its functions (functions.dss and functions in its event files) by DSS name. */
  functions: Map<string, DeclaredFunction>;
}

/** A user function with the place it is declared. */
export interface DeclaredFunction extends UserFunction {
  file: string;
  decl: FunctionDecl;
}

export interface ProjectIndex {
  /** False for a program-form file (no instance). */
  hasInstance: boolean;
  sources: SourceText[];
  units: CodeUnit[];
  objects: Map<string, ObjectEntry>;
  /** Global functions: scripts, or a program's functions. */
  scripts: Map<string, DeclaredFunction>;
  assetKinds: Map<string, AssetNameKind>;
  /** Every slot name of every object, plus names written by name (GETDYN/SETDYN). */
  instanceNames: Set<string>;
  /** Every `global.x` name, with the first place it is given a value (or used, when never assigned). */
  globals: Map<string, SourceLocation>;
  /** Diagnostics from parsing, declarations and layouts. */
  diagnostics: Diagnostic[];
  /** `o` and its ancestors, nearest first. */
  ancestors(o: ObjectEntry): ObjectEntry[];
  /** A function callable by name from code run by `owner`'s instances (null: scripts only). */
  lookupFunction(owner: string | null, name: string): DeclaredFunction | null;
}
