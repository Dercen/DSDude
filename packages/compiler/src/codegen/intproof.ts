/**
 * The int proof behind the int-specialised opcodes ADDII/SUBII/MULII/CMPJII (contracts/opcodes.json 51-54; PLAN.md
 * 8, the M1 fallback). Those opcodes skip the VM's tag checks, so the compiler may use one only when it has proved
 * that both operands hold an int when the instruction runs. The proof is deliberately simple and sound: when in
 * doubt, a value is not int and the ordinary tag-checked opcode is used.
 *
 * A value is proved int when it is (checked against the runtime's C, runtime/core/src, 2026-09-26):
 * - an int literal, or a builtin constant (every constant is loaded as an int);
 * - a builtin variable of type int (`room_width`, `room_speed`, `image_number`, `depth`, ...), bare or through an
 *   instance, and an element of the int array `alarm`: the runtime keeps them as int32 (a store is floored to an
 *   int, bivars.c `to_int`) and reads them back as ints;
 * - a call of a builtin whose builtins.json return type is int (`floor`, `irandom`, `array_length`, ...), unless a
 *   local or user function of that name shadows it;
 * - `-x`, `x + y`, `x - y`, `x * y`, `x mod y` of proved ints (int op int stays int; on overflow a release build
 *   wraps to an int and a debug build stops with R52x, so the result is never anything but an int);
 * - `x div y` of anything (div always yields an int or stops with an error);
 * - `c ? x : y` with both branches proved int;
 * - an int local (below).
 *
 * An int local is a `var` whose every assignment stores a proved int, and which is certainly assigned before any
 * read: every mention of it lies in the *region* of one of its declarations with a value. A declaration's region
 * runs from the end of that declaration to the end of the statement list holding it (the function body, a `{ }`
 * block or a `case` body; a `for`'s `var` also covers the `for` itself). A statement list is only ever entered at its
 * start (a loop re-runs its body from the start, a `case` label is the start of its body) and runs in order, so a
 * mention later in the same list always runs after that declaration. Two loops that each declare `var i = 0` both
 * qualify. Parameters are never int locals (callers pass anything), and neither is a local ever written by `/=` or
 * declared anywhere without a value (that stores undefined).
 * The set is found by optimistic iteration: assume every candidate is int, drop any with an assignment that is not
 * int under the current assumption, and repeat until nothing changes.
 *
 * Int variables (intVariables below) extend the same idea to the whole project: a user instance variable (by name,
 * whichever object holds it) or a global is int when every store into it, in every function, event and creation
 * code, stores a proved int. No definite-assignment rule is needed there: reading one that was never assigned stops
 * with R500/R501. Builtin variables are never int variables: the engine itself writes `x`, `y` and friends
 * (`x += hspeed` each step) and most are typed "number", so only the int-typed ones above count.
 */
import type { AssignOp, BinaryOp, Expr, LValue, Stmt, VarStmt } from "../syntax/ast.ts";
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
      case "index":
        // An element of a builtin int array (`alarm[0]`); user arrays can hold anything.
        return e.object.kind === "name" && !this.locals.has(e.object.name) && isIntBuiltinArray(e.object.name);
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

  /** A builtin variable is int when its type is int; a user one when the project proof says so. */
  private variableIsInt(kind: VariableKind, name: string): boolean {
    if (kind === "instance" && builtinVariables.has(name)) return isIntBuiltinVariable(name);
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
    // Every store into a local, and every mention of each name.
    const mentions = new Map<string, number[]>();
    const mention = (name: string, at: number): void => {
      const list = mentions.get(name);
      if (list === undefined) mentions.set(name, [at]);
      else list.push(at);
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

    // Candidates: certainly assigned before every mention (each mention inside a declaration's region).
    const candidates = new Set<string>();
    const regions = declarationRegions(body);
    for (const [name, spans] of regions) {
      const covered = (at: number): boolean => spans.some(([from, to]) => at >= from && at <= to);
      if (stores.has(name) && (mentions.get(name) ?? []).every(covered)) candidates.add(name);
    }

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
 * The regions (see the file comment) of every local declared with a value: name -> [from, to] offset ranges. A name
 * declared anywhere without a value is left out (that declaration stores undefined).
 */
function declarationRegions(body: readonly Stmt[]): Map<string, [number, number][]> {
  const regions = new Map<string, [number, number][]>();
  const unusable = new Set<string>();
  const add = (v: VarStmt, to: number): void => {
    for (const d of v.decls) {
      if (d.init === null) {
        unusable.add(d.name);
        continue;
      }
      const list = regions.get(d.name);
      if (list === undefined) regions.set(d.name, [[d.end, to]]);
      else list.push([d.end, to]);
    }
  };
  /** A statement list that runs from its start, in order, ending at offset `end`. */
  const list = (stmts: readonly Stmt[], end: number): void => {
    for (const s of stmts) {
      if (s.kind === "var") add(s, end);
      else if (s.kind === "for" && s.init?.kind === "var") add(s.init, end);
      stmt(s);
    }
  };
  /** Finds the statement lists (and `for` declarations) nested in one statement. */
  const stmt = (s: Stmt): void => {
    switch (s.kind) {
      case "block":
        list(s.body, s.end);
        return;
      case "var":
        add(s, s.end); // a lone `var` as an if/loop body: its region is itself
        return;
      case "if":
        stmt(s.then);
        if (s.otherwise !== null) stmt(s.otherwise);
        return;
      case "for":
        if (s.init?.kind === "var") add(s.init, s.end);
        stmt(s.body);
        return;
      case "while":
      case "do":
      case "repeat":
      case "with":
        stmt(s.body);
        return;
      case "switch":
        for (const c of s.clauses) list(c.body, c.end);
        return;
      default:
        return;
    }
  };
  list(body, Number.POSITIVE_INFINITY);
  for (const name of unusable) regions.delete(name);
  return regions;
}

/** A builtin array variable of type int (`alarm`). */
function isIntBuiltinArray(name: string): boolean {
  const v = builtinVariables.get(name);
  return v !== undefined && v.arrayLength > 0 && v.type === INT_TYPE;
}

/** A builtin variable of type int, not an array (`room_width`, `image_number`, `depth`, ...). */
function isIntBuiltinVariable(name: string): boolean {
  const v = builtinVariables.get(name);
  return v !== undefined && v.arrayLength === 0 && v.type === INT_TYPE;
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
