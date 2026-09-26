/**
 * GameMaker names (contracts/builtins.json 0.3.0 `alias` and `unsupported` entries; contracts/diagnostics.md).
 *
 * Runs over a function body before code generation and returns a rewritten copy (the parsed tree, which the
 * language service shares, is never changed):
 * - an alias (`vk_left`, `keyboard_check(...)`, `instance_create_layer(...)`) becomes its DSDude target, passing only
 *   the arguments its `argMap` lists, with a W060 lint whose hint is the entry's `note`;
 * - an unsupported name (`image_alpha`, `draw_line(...)`, `ds_list_add(...)`) is E207 with the entry's message and
 *   manual link, and becomes an error placeholder so nothing else reports it again (one mistake, one diagnostic).
 * The user's own names always win: a local, a parameter or a user function of the same name is left alone, and an
 * alias is not applied to an instance variable the project assigns.
 */
import type { CompilerCode } from "../diagnostics/catalog.ts";
import type { DiagArgs } from "../diagnostics/report.ts";
import type { Call, Expr, LValue, Span, Stmt } from "../syntax/ast.ts";
import { localsOf } from "../syntax/walk.ts";
import { builtinAliases, builtinConstants, builtinFunctions, unsupportedBuiltin } from "./builtins.ts";

/** What the rewrite needs to know about the names around the function. */
export interface GameMakerScope {
  /** True when `name` is one of the project's own functions (it shadows any GameMaker name). */
  isUserFunction(name: string): boolean;
  /** True when the project assigns `name` as an instance variable somewhere. */
  isInstanceVariable(name: string): boolean;
  report(code: CompilerCode, args: DiagArgs, at: Span): void;
}

/** Rewrites GameMaker names in a function body (see the file comment). */
export function resolveGameMakerNames(params: readonly string[], body: readonly Stmt[], scope: GameMakerScope): Stmt[] {
  return new Resolver(localsOf(params, body), scope).stmts(body);
}

/**
 * Rewrites GameMaker names in one value outside any function body: a parameter's default value, which the caller
 * computes (so no locals apply).
 */
export function resolveGameMakerValue(e: Expr, scope: GameMakerScope): Expr {
  return new Resolver(new Set(), scope).value(e);
}

class Resolver {
  private readonly locals: ReadonlySet<string>;
  private readonly scope: GameMakerScope;

  constructor(locals: ReadonlySet<string>, scope: GameMakerScope) {
    this.locals = locals;
    this.scope = scope;
  }

  stmts(list: readonly Stmt[]): Stmt[] {
    return list.map((s) => this.stmt(s));
  }

  private stmt(s: Stmt): Stmt {
    const e = (x: Expr): Expr => this.expr(x);
    const opt = (x: Expr | null): Expr | null => (x === null ? null : this.expr(x));
    switch (s.kind) {
      case "block":
        return { ...s, body: this.stmts(s.body) };
      case "var":
        return { ...s, decls: s.decls.map((d) => ({ ...d, init: opt(d.init) })) };
      case "if":
        // biome-ignore lint/suspicious/noThenProperty: the syntax tree's field for an if's first branch.
        return { ...s, cond: e(s.cond), then: this.stmt(s.then), otherwise: s.otherwise && this.stmt(s.otherwise) };
      case "while":
      case "do":
        return { ...s, cond: e(s.cond), body: this.stmt(s.body) };
      case "for":
        return {
          ...s,
          init: s.init && (this.stmt(s.init) as typeof s.init),
          cond: opt(s.cond),
          step: s.step && (this.stmt(s.step) as typeof s.step),
          body: this.stmt(s.body),
        };
      case "repeat":
        return { ...s, count: e(s.count), body: this.stmt(s.body) };
      case "switch":
        return {
          ...s,
          value: e(s.value),
          clauses: s.clauses.map((c) => ({ ...c, test: opt(c.test), body: this.stmts(c.body) })),
        };
      case "with":
        return { ...s, target: e(s.target), body: this.stmt(s.body) };
      case "return":
        return { ...s, value: opt(s.value) };
      case "assign": {
        const target = this.target(s.target);
        // An unsupported variable can't be assigned: the statement is dropped after E207.
        return target === null ? { kind: "empty", start: s.start, end: s.end } : { ...s, target, value: e(s.value) };
      }
      case "incdec": {
        const target = this.target(s.target);
        return target === null ? { kind: "empty", start: s.start, end: s.end } : { ...s, target };
      }
      case "call": {
        const call = this.expr(s.call);
        // An unsupported function call becomes an error placeholder; as a statement it does nothing.
        return call.kind === "call" ? { ...s, call } : { kind: "empty", start: s.start, end: s.end };
      }
      default:
        return s;
    }
  }

  /** An assignment target, or null when it names an unsupported variable (E207 reported). */
  private target(lv: LValue): LValue | null {
    switch (lv.kind) {
      case "name":
        return this.unsupportedName(lv.name, lv, false) ? null : lv;
      case "member":
        return this.unsupportedMember(lv.name, lv) ? null : { ...lv, object: this.expr(lv.object) };
      case "index": {
        // `a[i] = v` assigns into `a`: its base follows the target rules, the index is an ordinary value.
        const base = lv.object;
        const object =
          base.kind === "name" || base.kind === "member" || base.kind === "index" ? this.target(base) : this.expr(base);
        return object === null ? null : { ...lv, object, index: this.expr(lv.index) };
      }
      default:
        return lv;
    }
  }

  /** Rewrites one value (see resolveGameMakerValue). */
  value(e: Expr): Expr {
    return this.expr(e);
  }

  private expr(e: Expr): Expr {
    switch (e.kind) {
      case "name":
        return this.name(e.name, e);
      case "member":
        return this.unsupportedMember(e.name, e) ? error(e) : { ...e, object: this.expr(e.object) };
      case "index":
        return { ...e, object: this.expr(e.object), index: this.expr(e.index) };
      case "call":
        return this.call(e);
      case "unary":
        return { ...e, operand: this.expr(e.operand) };
      case "binary":
        return { ...e, left: this.expr(e.left), right: this.expr(e.right) };
      case "ternary":
        // biome-ignore lint/suspicious/noThenProperty: the syntax tree's field for the value when true.
        return { ...e, cond: this.expr(e.cond), then: this.expr(e.then), otherwise: this.expr(e.otherwise) };
      case "array":
        return { ...e, items: e.items.map((i) => this.expr(i)) };
      default:
        return e;
    }
  }

  /** A bare name read: an aliased constant (`vk_left`), an unsupported variable, or the name unchanged. */
  private name(name: string, at: Expr & { kind: "name" }): Expr {
    if (this.locals.has(name)) return at;
    if (this.unsupportedName(name, at, false)) return error(at);
    const alias = builtinAliases.get(name);
    if (alias === undefined || !builtinConstants.has(alias.aliasOf) || this.scope.isInstanceVariable(name)) return at;
    this.reportAlias(name, alias.aliasOf, alias.note, at);
    return { ...at, name: alias.aliasOf };
  }

  /** A call: an aliased function (`keyboard_check(k)`), an unsupported function, or the call with its parts rewritten. */
  private call(e: Call): Expr {
    const args = (list: readonly Expr[]): Expr[] => list.map((a) => this.expr(a));
    const callee = e.callee;
    if (callee.kind !== "name" || this.isOwnOrBuiltinFunction(callee.name))
      return { ...e, callee: callee.kind === "name" ? callee : this.expr(callee), args: args(e.args) };
    if (this.unsupportedName(callee.name, callee, true)) return error(e);
    const alias = builtinAliases.get(callee.name);
    if (alias === undefined || !builtinFunctions.has(alias.aliasOf)) return { ...e, args: args(e.args) };
    this.reportAlias(callee.name, alias.aliasOf, alias.note, callee);
    // Pass on only the arguments argMap lists (the others, such as a layer name, mean nothing here).
    const kept = alias.argMap === undefined ? e.args : alias.argMap.flatMap((i) => e.args[i] ?? []);
    return { ...e, callee: { ...callee, name: alias.aliasOf }, args: args(kept) };
  }

  /** A local, a user function or a real builtin function: never a GameMaker name. */
  private isOwnOrBuiltinFunction(name: string): boolean {
    return this.locals.has(name) || this.scope.isUserFunction(name) || builtinFunctions.has(name);
  }

  /** Reports E207 when `name` is an unsupported GameMaker name (and not a local); returns whether it did. */
  private unsupportedName(name: string, at: Span, called: boolean): boolean {
    if (this.locals.has(name)) return false;
    const entry = unsupportedBuiltin(name, called);
    if (entry === undefined) return false;
    this.scope.report("E207", { message: entry.message, manual: entry.manual }, at);
    return true;
  }

  /** `obj.image_alpha` and friends: the same exact names, reported at the member name. */
  private unsupportedMember(name: string, e: Span & { nameStart: number }): boolean {
    const entry = unsupportedBuiltin(name, false);
    if (entry === undefined) return false;
    this.scope.report("E207", { message: entry.message, manual: entry.manual }, { start: e.nameStart, end: e.end });
    return true;
  }

  private reportAlias(name: string, target: string, note: string, at: Span): void {
    this.scope.report("W060", { name, target, note }, at);
  }
}

/** The placeholder for a value that was already reported. */
function error(at: Span): Expr {
  return { kind: "error", start: at.start, end: at.end };
}
