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
import { finishModule } from "./codegen/module.ts";
import { Reporter } from "./diagnostics/report.ts";
import type { FunctionDecl, Stmt } from "./syntax/ast.ts";
import { parse } from "./syntax/parser.ts";

/** Name of the program's entry function (contracts/dsdb.md section 6, "Program form"). */
export const MAIN_FUNCTION = "__main";

export interface ProgramOptions {
  /** Path used in diagnostics and DBG locations, e.g. "v0/01-arith.dss". */
  file: string;
  /** DSDB header RNG seed; 0 lets the runtime choose (contracts/dsdb.md section 2). */
  seed?: number;
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

  const env: CodegenEnv = {
    file: options.file,
    reporter,
    hasInstance: false,
    self: null,
    other: null,
    lookupFunction: (name) => functions.get(name) ?? null,
    functionNames: () => functions.keys(),
    assetKind: () => null,
    assetNames: () => [],
    objectInfo: () => null,
    isInstanceVariableName: () => false,
  };
  const module = emptyModule();
  module.seed = options.seed ?? 0;
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
