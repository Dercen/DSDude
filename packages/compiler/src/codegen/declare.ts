/**
 * Function declarations shared by the program-form and project compilers: turning a FunctionDecl into the
 * UserFunction the code generator calls, and checking that default values can be computed by the caller.
 */
import type { Reporter } from "../diagnostics/report.ts";
import type { Expr, FunctionDecl } from "../syntax/ast.ts";
import { builtinConstants, builtinFunctions } from "./builtins.ts";
import type { UserFunction } from "./env.ts";

/**
 * Is `e` computable without the callee's frame (the caller fills defaults, contracts/dsdb.md section 6)?
 * Literals, constants, asset names, `global.x`, pure builtin calls and operators over those qualify.
 */
export function isContextFree(e: Expr, isAsset: (name: string) => boolean): boolean {
  const ok = (x: Expr): boolean => isContextFree(x, isAsset);
  switch (e.kind) {
    case "number":
    case "string":
    case "bool":
    case "undefined":
    case "global":
      return true;
    case "special":
      return e.which === "noone";
    case "name":
      return builtinConstants.has(e.name) || isAsset(e.name);
    case "unary":
      return ok(e.operand);
    case "binary":
      return ok(e.left) && ok(e.right);
    case "ternary":
      return ok(e.cond) && ok(e.then) && ok(e.otherwise);
    case "array":
      return e.items.every(ok);
    case "call":
      return e.callee.kind === "name" && builtinFunctions.get(e.callee.name)?.pure === true && e.args.every(ok);
    default:
      return false;
  }
}

/**
 * Builds the UserFunction for a declaration, reporting E307 for defaults that need the callee's frame (those
 * parameters then count as required, so no call can pass an unusable default).
 */
export function declareFunction(
  fn: FunctionDecl,
  funcName: string,
  reporter: Reporter,
  isAsset: (name: string) => boolean,
): UserFunction {
  const defaults = fn.params.map((p) => {
    if (p.init === null) return null;
    if (isContextFree(p.init, isAsset)) return p.init;
    reporter.report("E307", { param: p.name }, p.init.start, p.init.end);
    return null;
  });
  return { funcName, params: fn.params.length, defaults };
}
