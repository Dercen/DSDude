/**
 * The int proof behind the int-specialised opcodes ADDII/SUBII/MULII/CMPJII (contracts/opcodes.json 51-54; PLAN.md
 * 8, the M1 fallback). Those opcodes skip the VM's tag checks, so the compiler may use one only when it has proved
 * that both operands hold an int when the instruction runs. The proof is deliberately simple and sound: when in
 * doubt, a value is not int and the ordinary tag-checked opcode is used.
 *
 * A value is proved int when it is (checked against the runtime's C, runtime/core/src, 2026-09-26):
 * - an int literal, or a builtin constant (every constant is loaded as an int);
 * - a read-only builtin variable of type int (`room_width`, `room_height`, `room_speed`, `image_number`), bare or
 *   through an instance: user code can't store a fraction in one;
 * - a call of a builtin whose builtins.json return type is int (`floor`, `irandom`, `array_length`, ...), unless a
 *   local or user function of that name shadows it;
 * - `-x`, `x + y`, `x - y`, `x * y`, `x mod y` of proved ints (int op int stays int; on overflow a release build
 *   wraps to an int and a debug build stops with R52x, so the result is never anything but an int);
 * - `x div y` of anything (div always yields an int or stops with an error);
 * - `c ? x : y` with both branches proved int;
 * - an int local (below).
 *
 * An int local is a `var` whose every assignment stores a proved int, and which is certainly assigned before any
 * read: its first declaration has a value and is a top-level statement of the function (or the `var` of a top-level
 * `for`), and every mention of it comes after that declaration. Top-level statements run in order and only loops
 * jump back, so a later mention always runs after the declaration. Parameters are never int locals (callers pass
 * anything), and neither is a local ever written by `/=` or declared without a value (that stores undefined).
 * The set is found by optimistic iteration: assume every candidate is int, drop any with an assignment that is not
 * int under the current assumption, and repeat until nothing changes.
 *
 * Int variables (intVariables below) extend the same idea to the whole project: a user instance variable (by name,
 * whichever object holds it) or a global is int when every store into it, in every function, event and creation
 * code, stores a proved int. No definite-assignment rule is needed there: reading one that was never assigned stops
 * with R500/R501. Builtin variables are never int variables: the engine itself writes `x`, `y` and friends
 * (`x += hspeed` each step), so only the read-only int ones above count.
 */
import type { AssignOp, BinaryOp, Expr, LValue, Stmt } from "../syntax/ast.ts";
import { localsOf, walk } from "../syntax/walk.ts";
import { builtinConstants, builtinFunctions, builtinVariables } from "./builtins.ts";

/** The two kinds of variables that outlive a function: instance variables (by name) and globals. */
export type VariableKind = "instance" | "global";

/** What the proof needs to know about names outside the function. */
export interface IntProofScope {
  /** True when `name` is one of the project's own functions (it shadows a builtin of the same name). */
  isUserFunction(name: string): boolean;
  /** True when the project-wide proof (intVariables) found `name` to be an int variable of that kind. */
  isIntVariable?(kind: VariableKind, name: string): boolean;
}

/** The builtins.json type name of int values. */
const INT_TYPE = "int";
/** Operators whose result is an int when both operands are. */
const INT_PRESERVING = new Set(["+", "-", "*", "mod", "%"]);
/** Compound assignments whose result is an int when both sides are, with their operator (`/=` can store a fraction). */
const INT_COMPOUND: Readonly<Partial<Record<AssignOp, BinaryOp>>> = { "+=": "+", "-=": "-", "*=": "*" };

/** One store into a local: the value it stores, or null for a store that is never int. */
type Store = Expr | null;

/** Decides, for one function body, which values are proved int. */
export class IntProof {
  private readonly scope: IntProofScope;
  private readonly params: ReadonlySet<string>;
  /** Every local (parameters included), so a local shadows builtins of the same name. */
  private readonly locals: ReadonlySet<string>;
  /** The locals proved int. */
  readonly intLocals: ReadonlySet<string>;

  constructor(params: readonly string[], body: readonly Stmt[], locals: ReadonlySet<string>, scope: IntProofScope) {
    this.scope = scope;
    this.params = new Set(params);
    this.locals = locals;
    this.intLocals = this.findIntLocals(body);
  }

  /** Is `e` proved to hold an int when it has been evaluated (without error)? */
  isInt(e: Expr): boolean {
    return this.proves(e, this.intLocals);
  }

  private proves(e: Expr, intLocals: ReadonlySet<string>): boolean {
    const is = (x: Expr): boolean => this.proves(x, intLocals);
    switch (e.kind) {
      case "number":
        return e.repr === "int";
      case "name":
        if (this.locals.has(e.name)) return intLocals.has(e.name);
        if (builtinConstants.has(e.name)) return true;
        return this.variableIsInt("instance", e.name);
      case "member":
        return this.variableIsInt("instance", e.name);
      case "global":
        return this.variableIsInt("global", e.name);
      case "call":
        return (
          e.callee.kind === "name" &&
          !this.locals.has(e.callee.name) &&
          !this.scope.isUserFunction(e.callee.name) &&
          builtinFunctions.get(e.callee.name)?.returns === INT_TYPE
        );
      case "unary":
        return e.op === "-" && is(e.operand);
      case "binary":
        if (e.op === "div") return true;
        return INT_PRESERVING.has(e.op) && is(e.left) && is(e.right);
      case "ternary":
        return is(e.then) && is(e.otherwise);
      default:
        return false;
    }
  }

  /** A builtin variable is int only when read-only and of type int; a user one when the project proof says so. */
  private variableIsInt(kind: VariableKind, name: string): boolean {
    if (kind === "instance" && builtinVariables.has(name)) return isReadOnlyIntVariable(name);
    return this.scope.isIntVariable?.(kind, name) ?? false;
  }

  /** The int locals of `body` (see the file comment). */
  private findIntLocals(body: readonly Stmt[]): Set<string> {
    const stores = new Map<string, Store[]>();
    const store = (name: string, value: Store): void => {
      if (!this.locals.has(name) || this.params.has(name)) return;
      const list = stores.get(name);
      if (list === undefined) stores.set(name, [value]);
      else list.push(value);
    };
    // Every store into a local, and the first mention of each name.
    const firstMention = new Map<string, number>();
    const mention = (name: string, at: number): void => {
      const seen = firstMention.get(name);
      if (seen === undefined || at < seen) firstMention.set(name, at);
    };
    walk(body, {
      stmt: (s) => {
        if (s.kind === "var") for (const d of s.decls) store(d.name, d.init);
        else if ((s.kind === "assign" || s.kind === "incdec") && s.target.kind === "name") {
          const name = s.target.name;
          if (s.kind === "incdec")
            store(name, s.target); // x++ keeps an int an int
          else if (s.op === "=") store(name, s.value);
          else {
            const op = INT_COMPOUND[s.op];
            store(name, op === undefined ? null : compound(op, s.target, s.value));
          }
        }
        return true;
      },
      expr: (e) => {
        if (e.kind === "name") mention(e.name, e.start);
      },
    });

    // Candidates: certainly assigned by a top-level declaration before any mention.
    const candidates = new Set<string>();
    for (const [name, at] of topLevelDeclarations(body))
      if ((firstMention.get(name) ?? Number.POSITIVE_INFINITY) >= at && stores.has(name)) candidates.add(name);

    // Optimistic iteration down to the largest consistent set.
    const ints = new Set(candidates);
    let changed = true;
    while (changed) {
      changed = false;
      for (const name of [...ints]) {
        const ok = (stores.get(name) ?? []).every((v) => v !== null && this.proves(v, ints));
        if (!ok) {
          ints.delete(name);
          changed = true;
        }
      }
    }
    return ints;
  }
}

/** `x op= v` as the value it stores, `x op v` (only for the int-preserving compound operators). */
function compound(op: BinaryOp, target: Expr, value: Expr): Expr {
  const at = { start: target.start, end: value.end, opStart: value.start };
  return { kind: "binary", op, left: target, right: value, fromAssign: false, ...at };
}

/**
 * Locals whose first `var` declaration has a value and is a top-level statement (or a top-level `for`'s `var`), with
 * the offset where that declaration ends: from there on the local certainly holds its value. A name declared
 * anywhere without a value, or first declared deeper, is left out.
 */
function topLevelDeclarations(body: readonly Stmt[]): Map<string, number> {
  const decls = new Map<string, number>();
  const unusable = new Set<string>();
  for (const s of body) {
    const v = s.kind === "var" ? s : s.kind === "for" && s.init?.kind === "var" ? s.init : null;
    if (v === null) continue;
    for (const d of v.decls) if (!decls.has(d.name) && d.init !== null) decls.set(d.name, d.end);
  }
  // A declaration without a value stores undefined, wherever it is.
  walk(body, {
    stmt: (s) => {
      if (s.kind === "var") for (const d of s.decls) if (d.init === null) unusable.add(d.name);
      return true;
    },
  });
  for (const name of unusable) decls.delete(name);
  return decls;
}

/** A read-only builtin variable of type int, not an array (`room_width`, `image_number`, ...). */
function isReadOnlyIntVariable(name: string): boolean {
  const v = builtinVariables.get(name);
  return v?.readonly === true && v.arrayLength === 0 && v.type === INT_TYPE;
}

/** One store into an instance variable or a global: the value stored, or null for a store that is never int. */
export interface VariableStore {
  kind: VariableKind;
  name: string;
  value: Expr | null;
}

/** Every store a function body makes into instance variables and globals (locals are the IntProof's business). */
export function variableStores(body: readonly Stmt[], locals: ReadonlySet<string>): VariableStore[] {
  const stores: VariableStore[] = [];
  const target = (t: LValue, value: Expr | null): void => {
    switch (t.kind) {
      case "name":
        if (!locals.has(t.name)) stores.push({ kind: "instance", name: t.name, value });
        return;
      case "member":
        stores.push({ kind: "instance", name: t.name, value });
        return;
      case "global":
        stores.push({ kind: "global", name: t.name, value });
        return;
      case "index": {
        // An element write stores the array back into its variable (creating it if needed): never an int.
        let base: Expr = t.object;
        while (base.kind === "index") base = base.object;
        if (base.kind === "name" || base.kind === "member" || base.kind === "global") target(base, null);
        return;
      }
    }
  };
  walk(body, {
    stmt: (s) => {
      if (s.kind === "incdec") target(s.target, s.target);
      else if (s.kind === "assign") {
        if (s.op === "=") target(s.target, s.value);
        else {
          const op = INT_COMPOUND[s.op];
          target(s.target, op === undefined ? null : compound(op, s.target, s.value));
        }
      }
      return true;
    },
  });
  return stores;
}

/** One function body as the project-wide proof sees it. */
export interface ProofUnit {
  params: readonly string[];
  body: readonly Stmt[];
  /** True when `name` is one of the project's functions this code can call. */
  isUserFunction(name: string): boolean;
}

/** The int variables of a project, by kind. */
export interface IntVariables {
  instance: ReadonlySet<string>;
  global: ReadonlySet<string>;
}

/**
 * The project's int variables (see the file comment): every instance variable and global whose every store is a
 * proved int, found by optimistic iteration together with each unit's int locals. `excluded` names instance
 * variables that a bare read would not reach (asset and function names: code reading those gets the asset or the
 * function); builtin variables are always excluded.
 */
export function intVariables(units: readonly ProofUnit[], excluded: (name: string) => boolean): IntVariables {
  const prepared = units.map((u) => {
    const locals = localsOf(u.params, u.body);
    return { unit: u, locals, stores: variableStores(u.body, locals) };
  });
  const sets: Record<VariableKind, Set<string>> = { instance: new Set(), global: new Set() };
  for (const p of prepared)
    for (const st of p.stores)
      if (st.kind === "global" || !(builtinVariables.has(st.name) || excluded(st.name))) sets[st.kind].add(st.name);

  let changed = true;
  while (changed) {
    changed = false;
    for (const p of prepared) {
      const proof = new IntProof(p.unit.params, p.unit.body, p.locals, {
        isUserFunction: (name) => p.unit.isUserFunction(name),
        isIntVariable: (kind, name) => sets[kind].has(name),
      });
      for (const st of p.stores)
        if (sets[st.kind].has(st.name) && (st.value === null || !proof.isInt(st.value))) {
          sets[st.kind].delete(st.name);
          changed = true;
        }
    }
  }
  return sets;
}
