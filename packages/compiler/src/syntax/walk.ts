/** Generic traversal of the DSS syntax tree, shared by the binder passes that only need to look at nodes. */
import type { Expr, Stmt } from "./ast.ts";

export interface Visitor {
  /** Called for every statement before its children; return false to skip the children. */
  stmt?(s: Stmt): boolean | undefined;
  /** Called for every value before its children. */
  expr?(e: Expr): void;
}

/** Visits every statement and value in `stmts`, depth first, in source order. */
export function walk(stmts: readonly Stmt[], v: Visitor): void {
  for (const s of stmts) walkStmt(s, v);
}

/** Visits one value and everything inside it. */
export function walkExpr(e: Expr, v: Visitor): void {
  v.expr?.(e);
  switch (e.kind) {
    case "member":
      walkExpr(e.object, v);
      return;
    case "index":
      walkExpr(e.object, v);
      walkExpr(e.index, v);
      return;
    case "call":
      walkExpr(e.callee, v);
      for (const a of e.args) walkExpr(a, v);
      return;
    case "unary":
      walkExpr(e.operand, v);
      return;
    case "binary":
      walkExpr(e.left, v);
      walkExpr(e.right, v);
      return;
    case "ternary":
      walkExpr(e.cond, v);
      walkExpr(e.then, v);
      walkExpr(e.otherwise, v);
      return;
    case "array":
      for (const i of e.items) walkExpr(i, v);
      return;
    default:
      return;
  }
}

function walkStmt(s: Stmt, v: Visitor): void {
  if (v.stmt?.(s) === false) return;
  const e = (x: Expr | null) => {
    if (x !== null) walkExpr(x, v);
  };
  switch (s.kind) {
    case "block":
      walk(s.body, v);
      return;
    case "var":
      for (const d of s.decls) e(d.init);
      return;
    case "if":
      e(s.cond);
      walkStmt(s.then, v);
      if (s.otherwise !== null) walkStmt(s.otherwise, v);
      return;
    case "while":
    case "do":
      e(s.cond);
      walkStmt(s.body, v);
      return;
    case "for":
      if (s.init !== null) walkStmt(s.init, v);
      e(s.cond);
      if (s.step !== null) walkStmt(s.step, v);
      walkStmt(s.body, v);
      return;
    case "repeat":
      e(s.count);
      walkStmt(s.body, v);
      return;
    case "switch":
      e(s.value);
      for (const c of s.clauses) {
        e(c.test);
        walk(c.body, v);
      }
      return;
    case "with":
      e(s.target);
      walkStmt(s.body, v);
      return;
    case "return":
      e(s.value);
      return;
    case "assign":
      e(s.target);
      e(s.value);
      return;
    case "incdec":
      e(s.target);
      return;
    case "call":
      e(s.call);
      return;
    default:
      return;
  }
}

/** Every local of a function body: its parameters, then each `var` name in order of first declaration. */
export function localsOf(params: readonly string[], body: readonly Stmt[]): Set<string> {
  const locals = new Set(params);
  walk(body, {
    stmt(s) {
      if (s.kind === "var") for (const d of s.decls) locals.add(d.name);
      return true;
    },
  });
  return locals;
}
