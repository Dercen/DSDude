/**
 * The program form (contracts/language.md section 1, conformance tiers v0-v1): one file whose top-level
 * statements run once as FUNC 0 `__main`, whose functions are global, and which has no instance.
 */
import { type DsdbModule, emptyModule, encode } from "@dsdude/dsdb";
import type { Diagnostic } from "@dsdude/project-format";
import { COMPILER_BUILTINS_ENV } from "./codegen/abi.ts";
import { declareFunction } from "./codegen/declare.ts";
import type { CodegenEnv, UserFunction } from "./codegen/env.ts";
import { compileFunction } from "./codegen/function.ts";
import { intVariables } from "./codegen/intproof.ts";
import { finishModule } from "./codegen/module.ts";
import { Reporter } from "./diagnostics/report.ts";
import type { CodeUnit, DeclaredFunction, ProjectIndex, SourceLocation, SourceText } from "./project-index.ts";
import type { FunctionDecl, Stmt } from "./syntax/ast.ts";
import { parse } from "./syntax/parser.ts";
import { walk } from "./syntax/walk.ts";

/** Name of the program's entry function (contracts/dsdb.md section 6, "Program form"). */
export const MAIN_FUNCTION = "__main";

export interface ProgramOptions {
  /** Path used in diagnostics and DBG locations, e.g. "v0/01-arith.dss". */
  file: string;
  /** DSDB header RNG seed; 0 lets the runtime choose (contracts/dsdb.md section 2). */
  seed?: number;
  /**
   * Evaluate constant expressions at compile time (codegen/fold.ts). Default off: the program form is for the
   * conformance corpus, whose programs test the VM's arithmetic.
   */
  fold?: boolean;
  /** Emit the int-specialised opcodes where both operands are proved int (codegen/intproof.ts). Default off. */
  intOps?: boolean;
  /**
   * A release build (ADR-0008): the DSDB header's release flag is set, so the runtime wraps int32 and Q20.12
   * overflow instead of raising R520/R521, and constant folding wraps an overflow too. Absent means debug (Play
   * and the IDE's Run always build debug).
   */
  release?: boolean;
}

export interface ProgramResult {
  /** The compiled module, or null when there are errors. */
  module: DsdbModule | null;
  /** The encoded DSDB, or null when there are errors. */
  dsdb: Uint8Array | null;
  diagnostics: Diagnostic[];
}

/** Compiles a program-form file. Never throws on bad source; problems come back as diagnostics. */
export function compileProgram(text: string, options: ProgramOptions): ProgramResult {
  const parsed = parse(text, { file: options.file, kind: "code" });
  if (parsed.diagnostics.some((d) => d.severity === "error"))
    return { module: null, dsdb: null, diagnostics: parsed.diagnostics };

  const reporter = new Reporter(options.file, text);
  const noAssets = (): boolean => false;
  const decls = parsed.ast.items.filter((i): i is FunctionDecl => i.kind === "function");
  const statements = parsed.ast.items.filter((i): i is Stmt => i.kind !== "function");
  const functions = new Map<string, UserFunction>();
  for (const fn of decls) functions.set(fn.name, declareFunction(fn, fn.name, reporter, noAssets));

  // Globals whose every store is a proved int (the program form has no instances).
  const ints = options.intOps
    ? intVariables(
        [
          { params: [], body: statements, isUserFunction: (n: string) => functions.has(n) },
          ...decls.map((fn) => ({
            params: fn.params.map((p) => p.name),
            body: fn.body.body,
            isUserFunction: (n: string) => functions.has(n),
          })),
        ],
        () => true,
      )
    : null;
  const env: CodegenEnv = {
    file: options.file,
    reporter,
    hasInstance: false,
    self: null,
    other: null,
    event: null,
    objectScreen: null,
    lookupFunction: (name) => functions.get(name) ?? null,
    functionNames: () => functions.keys(),
    assetKind: () => null,
    assetNames: () => [],
    objectInfo: () => null,
    isInstanceVariableName: () => false,
    fold: options.fold === true,
    intOps: options.intOps === true,
    release: options.release === true,
    isIntVariable: (kind, name) => ints?.[kind].has(name) ?? false,
  };
  const module = emptyModule();
  module.seed = options.seed ?? 0;
  if (options.release === true) module.release = true;
  module.functions.push(compileFunction(env, { name: MAIN_FUNCTION, params: [], body: statements }));
  for (const fn of decls)
    module.functions.push(
      compileFunction(env, { name: fn.name, params: fn.params.map((p) => p.name), body: fn.body.body }),
    );

  const diagnostics = [...parsed.diagnostics, ...reporter.diagnostics];
  if (diagnostics.some((d) => d.severity === "error")) return { module: null, dsdb: null, diagnostics };
  finishModule(module);
  return { module, dsdb: encode(module, COMPILER_BUILTINS_ENV), diagnostics };
}

/**
 * The shared project view (src/project-index.ts) of one program-form file, for the language service: `__main`
 * plus the file's functions as global functions, no instance, no objects or assets.
 */
export function indexProgram(text: string, file: string): ProjectIndex {
  const clean = text.replace(/\r/g, "");
  const parsed = parse(clean, { file, kind: "code" });
  const reporter = new Reporter(file, clean);
  const source: SourceText = { file, text: clean, parsed, reporter };
  const scripts = new Map<string, DeclaredFunction>();
  const units: CodeUnit[] = [];
  const statements = parsed.ast.items.filter((i): i is Stmt => i.kind !== "function");
  units.push({
    kind: "main",
    funcName: MAIN_FUNCTION,
    owner: null,
    stem: null,
    params: [],
    body: statements,
    decl: null,
    span: parsed.ast,
    source,
  });
  for (const fn of parsed.ast.items.filter((i): i is FunctionDecl => i.kind === "function")) {
    if (!scripts.has(fn.name))
      scripts.set(fn.name, { ...declareFunction(fn, fn.name, reporter, () => false), file, decl: fn });
    units.push({
      kind: "script",
      funcName: fn.name,
      owner: null,
      stem: null,
      params: fn.params.map((p) => p.name),
      body: fn.body.body,
      decl: fn,
      span: fn,
      source,
    });
  }
  const globals = new Map<string, SourceLocation>();
  for (const u of units)
    walk(u.body, {
      expr: (e) => {
        if (e.kind === "global" && !globals.has(e.name)) globals.set(e.name, { file, start: e.start, end: e.end });
      },
    });
  return {
    hasInstance: false,
    sources: [source],
    units,
    objects: new Map(),
    scripts,
    assetKinds: new Map(),
    instanceNames: new Set(),
    globals,
    diagnostics: parsed.diagnostics,
    ancestors: (o) => [o],
    lookupFunction: (_owner, name) => scripts.get(name) ?? null,
  };
}
