/**
 * Code generation for one DSS function, event or program body: AST -> DSDB instructions (contracts/dsdb.md
 * sections 5-6) in the symbolic model of @dsdude/dsdb.
 *
 * Registers (a frame holds at most 64, C13 `registersPerFrame`):
 * - Parameters take r0..r(params-1); then every `var` of the function gets one register for the whole function
 *   (DSS locals are function-scoped, language.md section 5), in order of first declaration.
 * - Temporaries are allocated like a stack above the locals and released after each statement, so a value's
 *   registers are reused as soon as it has been consumed. Calls put their arguments in consecutive registers at the
 *   top of that stack (CALLN/CALL/NEWARR convention: arguments in rA.., result in rA).
 *
 * This single-pass stack allocation keeps every frame far below 64 registers for the samples and the conformance
 * corpus; the three-address IR with linear scan named in PLAN.md 6 WS4 would only matter for frames that do not fit,
 * which report E492 instead.
 *
 * Instances (slots, builtin variables of other instances, `with`) use provisional opcodes whose operands are
 * set by docs/adr/0005-provisional-opcode-operands.md (accepted; still provisional until WS2 implements them).
 */
import type { Const, Func, Instr, Loc, Operand } from "@dsdude/dsdb";
import type { CompilerCode } from "../diagnostics/catalog.ts";
import type { DiagArgs } from "../diagnostics/report.ts";
import { suggest, suggestionText } from "../diagnostics/suggest.ts";
import type { BuiltinVariable } from "../gen/builtins.ts";
import type {
  AssignStmt,
  BinaryOp,
  Call,
  Expr,
  IncDecStmt,
  LValue,
  MemberRef,
  NameRef,
  Span,
  Stmt,
  SwitchStmt,
  WithStmt,
} from "../syntax/ast.ts";
import { FIXED_ONE } from "../syntax/lexer.ts";
import { builtinConstants, builtinFunctions, builtinVariables } from "./builtins.ts";
import type { CodegenEnv, FunctionOverride, ObjectInfo, UserFunction } from "./env.ts";
import { type Folded, fold } from "./fold.ts";
import { resolveGameMakerNames } from "./gamemaker.ts";
import { IntProof } from "./intproof.ts";
import { accepts, category, describeParam, describeType, fromBuiltinType, ordinal, type ValueType } from "./types.ts";

/** Registers in one frame (contracts/runtime-limits.json `registersPerFrame`, dsdb.md section 6). */
export const MAX_REGISTERS = 64;
/** LOADI's immediate is a signed 16-bit field. */
const LOADI_MIN = -32768;
const LOADI_MAX = 32767;
/** NEWARR's element count is an 8-bit field. */
const NEWARR_MAX = 255;
/** Where an instance is expected, `self`/`other`/`all`/`noone` are these ints (language.md section 5). */
const INSTANCE_CONSTANT = { self: -1, other: -2, all: -3, noone: -4 } as const;

/** Opcode for each arithmetic and comparison operator (`%` is `mod`, language.md section 4). */
const BINARY_OPCODE: Readonly<Partial<Record<BinaryOp, string>>> = {
  "+": "ADD",
  "-": "SUB",
  "*": "MUL",
  "/": "DIV",
  div: "IDIV",
  mod: "MOD",
  "%": "MOD",
  "==": "EQ",
  "!=": "NE",
  "<": "LT",
  "<=": "LE",
  ">": "GT",
  ">=": "GE",
};

/** CMPJ's relation operand for each comparison (contracts/dsdb.md section 5): 0 ==, 1 !=, 2 <, 3 <=, 4 >, 5 >=. */
const RELATION: Readonly<Partial<Record<string, number>>> = { "==": 0, "!=": 1, "<": 2, "<=": 3, ">": 4, ">=": 5 };
/** The relation that holds exactly when relation i does not (== and !=, < and >=, <= and >). */
const NEGATED_RELATION: readonly number[] = [1, 0, 5, 4, 3, 2];
/** The immediate form of each arithmetic opcode (C = signed 8-bit int). */
const IMMEDIATE_OPCODE: Readonly<Partial<Record<string, string>>> = { ADD: "ADDI", SUB: "SUBI", MUL: "MULI" };
/** The int-specialised form of each arithmetic opcode (contracts/opcodes.json 51-53; codegen/intproof.ts). */
const INT_OPCODE: Readonly<Partial<Record<string, string>>> = { ADD: "ADDII", SUB: "SUBII", MUL: "MULII" };
/** Expression kinds constant folding can replace with a literal (literals and names already load directly). */
const FOLDABLE_KINDS: ReadonlySet<string> = new Set(["unary", "binary", "ternary"]);
/** No builtin constants: with folding off, names never count as constants. */
const NO_CONSTANTS = (): undefined => undefined;
/** The range of ADDI/SUBI/MULI's signed 8-bit operand. */
const IMMEDIATE_MIN = -128;
const IMMEDIATE_MAX = 127;

/** Opcode for each compound assignment. */
const COMPOUND_OPCODE: Readonly<Record<string, string>> = { "+=": "ADD", "-=": "SUB", "*=": "MUL", "/=": "DIV" };

/** A body to compile: a function's parameters and statements, or an event/program body (no parameters). */
export interface FunctionSource {
  /** FUNC name in the DSDB. */
  name: string;
  params: readonly string[];
  body: readonly Stmt[];
}

/** A jump target inside the function; `at` is the instruction index once placed. */
interface Label {
  at: number;
}

/** A loop or switch that `break`/`continue` can leave. */
interface JumpContext {
  kind: "loop" | "switch";
  breakLabel: Label;
  /** null for switch (continue passes through to the enclosing loop). */
  continueLabel: Label | null;
  /** Number of `with` loops open outside this context: break/continue close the ones opened inside it. */
  withDepth: number;
  /** For a `with` loop: the depth `continue` keeps (the with itself stays open). */
  continueWithDepth: number;
}

/**
 * A place a value can be stored to and loaded from, with its sub-values (object, index) already evaluated
 * into registers, so compound assignments evaluate them once.
 */
interface Ref {
  load(dst: number): void;
  store(src: number): void;
  /** The register holding the variable itself when it is a local (stores go straight there). */
  localReg: number | null;
}

/** Which instance a variable access is about. */
type Target = { kind: "self" } | { kind: "other" } | { kind: "reg"; reg: number };

/** Compiles one function. Diagnostics go to env.reporter; the result is valid even after errors. */
export function compileFunction(env: CodegenEnv, source: FunctionSource): Func {
  // GameMaker aliases and unsupported names are settled first (codegen/gamemaker.ts), on a copy of the body.
  const body = resolveGameMakerNames(source.params, source.body, {
    isUserFunction: (name) => env.lookupFunction(name) !== null,
    isInstanceVariable: (name) => env.isInstanceVariableName(name),
    report: (code, args, at) => void env.reporter.report(code, args, at.start, at.end),
  });
  return new FunctionCompiler(env, { ...source, body }).compile();
}

class FunctionCompiler {
  private readonly env: CodegenEnv;
  private readonly source: FunctionSource;
  private readonly code: Instr[] = [];
  private readonly locs: Loc[] = [];
  /** Jump operands to patch once labels are placed: [instruction, operand index, label]. */
  private readonly fixups: [Instr, number, Label][] = [];
  private readonly locals = new Map<string, number>();
  /** Next free register (the top of the temporary stack). */
  private top = 0;
  /** Highest register count used. */
  private maxTop = 0;
  private reportedRegisterLimit = false;
  private readonly jumps: JumpContext[] = [];
  /** Registers of the open `with` loops, outermost first. */
  private readonly withRegs: number[] = [];
  /** What `self` and `other` are known to be; `with` changes both. */
  private self: ObjectInfo | null;
  private other: ObjectInfo | null;
  /** Labels placed at the current end of the code (an epilogue RET is then needed). */
  private labelsAtEnd = 0;
  /** Which values are proved int (codegen/intproof.ts), or null when the int-specialised opcodes are off. */
  private ints: IntProof | null = null;

  constructor(env: CodegenEnv, source: FunctionSource) {
    this.env = env;
    this.source = source;
    this.self = env.self;
    this.other = env.other;
  }

  compile(): Func {
    for (const p of this.source.params) this.declareLocal(p);
    for (const s of this.source.body) this.collectLocals(s);
    if (this.env.intOps === true)
      this.ints = new IntProof(this.source.params, this.source.body, new Set(this.locals.keys()), {
        isUserFunction: (name) => this.env.lookupFunction(name) !== null,
        isIntVariable: (kind, name) => this.env.isIntVariable?.(kind, name) ?? false,
      });
    this.top = this.locals.size;
    this.maxTop = this.top;
    for (const s of this.source.body) this.statement(s);
    this.epilogue();
    for (const [ins, i, label] of this.fixups) ins.args[i] = label.at;
    return {
      name: this.source.name,
      params: this.source.params.length,
      regs: Math.max(1, Math.min(this.maxTop, MAX_REGISTERS)),
      code: this.code,
      locs: this.locs,
    };
  }

  // ---- Diagnostics -----------------------------------------------------------------------------------------------

  private report(code: CompilerCode, args: DiagArgs, span: Span): void {
    this.env.reporter.report(code, args, span.start, span.end);
  }

  // ---- Registers -------------------------------------------------------------------------------------------------

  private declareLocal(name: string): void {
    if (!this.locals.has(name)) this.locals.set(name, this.locals.size);
  }

  /** Finds every `var` in the function (any depth) so locals get fixed registers before code is emitted. */
  private collectLocals(s: Stmt): void {
    switch (s.kind) {
      case "var":
        for (const d of s.decls) this.declareLocal(d.name);
        return;
      case "block":
        for (const b of s.body) this.collectLocals(b);
        return;
      case "if":
        this.collectLocals(s.then);
        if (s.otherwise !== null) this.collectLocals(s.otherwise);
        return;
      case "while":
      case "do":
      case "repeat":
      case "with":
        this.collectLocals(s.body);
        return;
      case "for":
        if (s.init !== null) this.collectLocals(s.init);
        this.collectLocals(s.body);
        return;
      case "switch":
        for (const c of s.clauses) for (const b of c.body) this.collectLocals(b);
        return;
      default:
        return;
    }
  }

  private alloc(): number {
    const r = this.top++;
    if (this.top > this.maxTop) this.maxTop = this.top;
    if (this.top > MAX_REGISTERS && !this.reportedRegisterLimit) {
      this.reportedRegisterLimit = true;
      this.env.reporter.report("E492", { func: this.source.name }, 0, 0);
    }
    // Keep emitting valid register numbers after the limit; the build fails on the error anyway.
    return Math.min(r, MAX_REGISTERS - 1);
  }

  /** Releases every temporary allocated since `mark`. */
  private release(mark: number): void {
    this.top = mark;
  }

  // ---- Emission --------------------------------------------------------------------------------------------------

  private emit(op: string, ...args: Operand[]): Instr {
    const ins: Instr = { op, args };
    this.code.push(ins);
    this.labelsAtEnd = 0;
    return ins;
  }

  private newLabel(): Label {
    return { at: -1 };
  }

  private place(label: Label): void {
    label.at = this.code.length;
    this.labelsAtEnd++;
  }

  /** Emits a jump to `label`; the registers come first and the label is the last operand. */
  private jump(op: string, label: Label, ...regs: number[]): void {
    const ins = this.emit(op, ...regs, 0);
    this.fixups.push([ins, regs.length, label]);
  }

  /** Records a DBG location for the code emitted from here on (one entry per new line). */
  private loc(span: Span): void {
    const line = this.env.reporter.at(span.start).line;
    const last = this.locs.at(-1);
    if (last !== undefined && last.line === line && last.file === this.env.file) return;
    if (last !== undefined && last.index === this.code.length) {
      last.line = line;
      last.file = this.env.file;
      // A replaced entry may now repeat the one before it.
      const before = this.locs.at(-2);
      if (before !== undefined && before.line === line && before.file === last.file) this.locs.pop();
      return;
    }
    this.locs.push({ index: this.code.length, file: this.env.file, line });
  }

  private epilogue(): void {
    const last = this.code.at(-1);
    if (last?.op === "RET" && this.labelsAtEnd === 0) return;
    this.emit("RET", 0, 0);
  }

  // ---- Statements ------------------------------------------------------------------------------------------------

  private statement(s: Stmt): void {
    const mark = this.top;
    if (s.kind !== "block" && s.kind !== "empty") this.loc(s);
    switch (s.kind) {
      case "block":
        for (const b of s.body) this.statement(b);
        break;
      case "empty":
        break;
      case "var":
        for (const d of s.decls) {
          const r = this.locals.get(d.name) as number;
          if (d.init === null) this.emit("LOADUNDEF", r);
          else this.assignLocal(r, d.name, d.init);
        }
        break;
      case "assign":
        this.assign(s);
        break;
      case "incdec":
        this.incdec(s);
        break;
      case "call":
        this.call(s.call, null);
        break;
      case "if": {
        const otherwise = this.newLabel();
        this.jumpIf(s.cond, false, otherwise);
        this.statement(s.then);
        if (s.otherwise === null) this.place(otherwise);
        else {
          const end = this.newLabel();
          this.jump("JMP", end);
          this.place(otherwise);
          this.statement(s.otherwise);
          this.place(end);
        }
        break;
      }
      case "while": {
        const top = this.newLabel();
        const end = this.newLabel();
        this.place(top);
        this.jumpIf(s.cond, false, end);
        this.loop(s.body, end, top);
        this.jump("JMP", top);
        this.place(end);
        break;
      }
      case "do": {
        const top = this.newLabel();
        const next = this.newLabel();
        const end = this.newLabel();
        this.place(top);
        this.loop(s.body, end, next);
        this.place(next);
        // do ... until (c): repeat while c is false.
        this.jumpIf(s.cond, false, top);
        this.place(end);
        break;
      }
      case "for": {
        if (s.init !== null) this.statement(s.init);
        const top = this.newLabel();
        const next = this.newLabel();
        const end = this.newLabel();
        this.place(top);
        if (s.cond !== null) this.jumpIf(s.cond, false, end);
        this.loop(s.body, end, next);
        this.place(next);
        if (s.step !== null) this.statement(s.step);
        this.jump("JMP", top);
        this.place(end);
        break;
      }
      case "repeat":
        this.repeat(s.count, s.body);
        break;
      case "switch":
        this.switchStatement(s);
        break;
      case "with":
        this.withStatement(s);
        break;
      case "break":
      case "continue":
        this.breakOrContinue(s.kind, s);
        break;
      case "exit":
        this.closeWiths(0);
        this.emit("RET", 0, 0);
        break;
      case "return":
        if (s.value === null) {
          this.closeWiths(0);
          this.emit("RET", 0, 0);
        } else {
          const r = this.valueAny(s.value);
          this.closeWiths(0);
          this.emit("RET", r, 1);
        }
        break;
    }
    this.release(mark);
  }

  /** Compiles a loop body with break/continue targets. */
  private loop(body: Stmt, breakLabel: Label, continueLabel: Label): void {
    const depth = this.withRegs.length;
    this.jumps.push({ kind: "loop", breakLabel, continueLabel, withDepth: depth, continueWithDepth: depth });
    this.statement(body);
    this.jumps.pop();
  }

  /** `repeat (n)`: n is evaluated once and floored; the body runs while the counter is above 0. */
  private repeat(count: Expr, body: Stmt): void {
    const counter = this.alloc();
    this.valueTo(count, counter);
    this.emit("CALLN", counter, 1, "floor");
    const zero = this.alloc();
    this.emit("LOADI", zero, 0);
    const top = this.newLabel();
    const next = this.newLabel();
    const end = this.newLabel();
    this.place(top);
    // Run the body while counter > 0: CMPJ skips the JMP out when the relation holds. floor() made the counter an
    // int and SUBI keeps it one, so with the int-specialised opcodes on this is CMPJII.
    this.emit(this.ints === null ? "CMPJ" : "CMPJII", counter, zero, RELATION[">"] as number);
    this.jump("JMP", end);
    this.loop(body, end, next);
    this.place(next);
    this.emit("SUBI", counter, counter, 1);
    this.jump("JMP", top);
    this.place(end);
  }

  /** `switch`: compare the value with each case in order, jump to the first match, fall through between arms. */
  private switchStatement(s: SwitchStmt): void {
    const value = this.valueAny(s.value);
    const armLabels = s.clauses.map(() => this.newLabel());
    const end = this.newLabel();
    let defaultLabel: Label | null = null;
    s.clauses.forEach((c, i) => {
      if (c.test === null) {
        defaultLabel = armLabels[i] as Label;
        return;
      }
      const mark = this.top;
      const test = this.valueAny(c.test);
      const eq = this.alloc();
      this.emit("EQ", eq, value, test);
      this.jump("JMPT", armLabels[i] as Label, eq);
      this.release(mark);
    });
    this.jump("JMP", defaultLabel ?? end);
    const depth = this.withRegs.length;
    this.jumps.push({
      kind: "switch",
      breakLabel: end,
      continueLabel: null,
      withDepth: depth,
      continueWithDepth: depth,
    });
    s.clauses.forEach((c, i) => {
      this.place(armLabels[i] as Label);
      for (const b of c.body) this.statement(b);
    });
    this.jumps.pop();
    this.place(end);
  }

  /**
   * `with (target) body` (language.md rule 3, ADR-0005): WITHBEGIN snapshots the targets and enters the body
   * with the first one as `self` (jumping past the loop when there is none), WITHNEXT moves on and jumps back,
   * WITHEND restores `self` and `other`.
   */
  private withStatement(s: WithStmt): void {
    if (!this.env.hasInstance) {
      this.report("E303", { what: "with" }, s);
      return;
    }
    const reg = this.alloc();
    this.valueTo(s.target, reg);
    const outerSelf = this.self;
    const outerOther = this.other;
    this.self = this.targetObject(s.target);
    this.other = outerSelf;
    const body = this.newLabel();
    const next = this.newLabel();
    const end = this.newLabel();
    // ADR-0005: WITHBEGIN/WITHNEXT/WITHEND operands and loop shape.
    this.jump("WITHBEGIN", end, reg);
    this.place(body);
    const depth = this.withRegs.length;
    this.withRegs.push(reg);
    this.jumps.push({
      kind: "loop",
      breakLabel: end,
      continueLabel: next,
      withDepth: depth,
      continueWithDepth: depth + 1,
    });
    this.statement(s.body);
    this.jumps.pop();
    this.withRegs.pop();
    this.place(next);
    this.jump("WITHNEXT", body, reg);
    this.emit("WITHEND", reg);
    this.place(end);
    this.self = outerSelf;
    this.other = outerOther;
  }

  /** The object a `with` target makes `self`, when the compiler can tell. */
  private targetObject(target: Expr): ObjectInfo | null {
    if (target.kind === "special") {
      if (target.which === "self") return this.self;
      if (target.which === "other") return this.other;
      return null;
    }
    if (target.kind === "name" && !this.locals.has(target.name)) return this.env.objectInfo(target.name);
    return null;
  }

  /** Emits WITHEND for the open `with` loops above `depth`, innermost first. */
  private closeWiths(depth: number): void {
    for (let i = this.withRegs.length - 1; i >= depth; i--) this.emit("WITHEND", this.withRegs[i] as number);
  }

  private breakOrContinue(kind: "break" | "continue", s: Span): void {
    for (let i = this.jumps.length - 1; i >= 0; i--) {
      const ctx = this.jumps[i] as JumpContext;
      if (kind === "break") {
        this.closeWiths(ctx.withDepth);
        this.jump("JMP", ctx.breakLabel);
        return;
      }
      if (ctx.continueLabel !== null) {
        this.closeWiths(ctx.continueWithDepth);
        this.jump("JMP", ctx.continueLabel);
        return;
      }
    }
    this.report("E304", { keyword: kind, place: kind === "break" ? "a loop or a switch" : "a loop" }, s);
  }

  // ---- Assignments -----------------------------------------------------------------------------------------------

  /** Computes `value` into the local register `reg`, going through a temporary when the value reads `name`. */
  private assignLocal(reg: number, name: string, value: Expr): void {
    // `a = a <op> x` can target a's register directly: a binary operator reads its left operand in place and
    // evaluates its right one into temporaries, and writes its destination only with its last instruction.
    const selfLeft =
      value.kind === "binary" &&
      value.op !== "&&" &&
      value.op !== "||" &&
      value.left.kind === "name" &&
      value.left.name === name;
    if (selfLeft || !readsName(value, name)) {
      this.valueTo(value, reg);
      return;
    }
    const t = this.alloc();
    this.valueTo(value, t);
    this.emit("MOV", reg, t);
  }

  private assign(s: AssignStmt): void {
    if (s.op === "=") {
      if (s.target.kind === "name" && this.locals.has(s.target.name)) {
        this.assignLocal(this.locals.get(s.target.name) as number, s.target.name, s.value);
        return;
      }
      const ref = this.ref(s.target, true);
      if (ref === null) return;
      ref.store(this.valueAny(s.value));
      return;
    }
    const op = COMPOUND_OPCODE[s.op] as string;
    const ref = this.ref(s.target, true);
    if (ref === null) return;
    if (ref.localReg !== null) {
      this.arith(op, ref.localReg, ref.localReg, s.value, s.target);
      return;
    }
    const t = this.alloc();
    ref.load(t);
    this.arith(op, t, t, s.value, s.target);
    ref.store(t);
  }

  private incdec(s: IncDecStmt): void {
    const op = s.op === "++" ? "ADDI" : "SUBI";
    const ref = this.ref(s.target, true);
    if (ref === null) return;
    if (ref.localReg !== null) {
      this.emit(op, ref.localReg, ref.localReg, 1);
      return;
    }
    const t = this.alloc();
    ref.load(t);
    this.emit(op, t, t, 1);
    ref.store(t);
  }

  // ---- References (places to read and write) ---------------------------------------------------------------------

  /**
   * Resolves an lvalue into a Ref, evaluating its object and index once. `forWrite` reports read-only targets.
   * Returns null after reporting a diagnostic.
   */
  private ref(lv: LValue, forWrite: boolean): Ref | null {
    switch (lv.kind) {
      case "name":
        return this.nameRef(lv, forWrite);
      case "global": {
        const name = lv.name;
        return {
          load: (dst) => void this.emit("GETGLOB", dst, name),
          store: (src) => void this.emit("SETGLOB", src, name),
          localReg: null,
        };
      }
      case "member":
        return this.memberRef(lv, forWrite);
      case "index":
        return this.indexRef(lv.object, lv.index, forWrite);
    }
  }

  private nameRef(lv: NameRef, forWrite: boolean): Ref | null {
    const local = this.locals.get(lv.name);
    if (local !== undefined)
      return {
        load: (dst) => void (dst !== local && this.emit("MOV", dst, local)),
        store: (src) => void (src !== local && this.emit("MOV", local, src)),
        localReg: local,
      };
    return this.instanceRef({ kind: "self" }, lv.name, lv, forWrite, true);
  }

  private memberRef(lv: MemberRef, forWrite: boolean): Ref | null {
    if (!this.env.hasInstance) {
      const owner =
        lv.object.kind === "special" ? lv.object.which : lv.object.kind === "name" ? lv.object.name : "(...)";
      this.report("E303", { what: `${owner}.${lv.name}` }, lv);
      return null;
    }
    const obj = lv.object;
    if (obj.kind === "special" && obj.which === "self")
      return this.instanceRef({ kind: "self" }, lv.name, lv, forWrite, false);
    if (obj.kind === "special" && obj.which === "other")
      return this.instanceRef({ kind: "other" }, lv.name, lv, forWrite, false);
    const reg = this.valueAny(obj);
    return this.instanceRef({ kind: "reg", reg }, lv.name, lv, forWrite, false);
  }

  /**
   * A variable of an instance: a builtin variable, a slot of a known object, or a named variable of an unknown
   * one. `bare` is true for a bare name (which may also be a constant, an asset or a program-form mistake).
   */
  private instanceRef(target: Target, name: string, at: Span, forWrite: boolean, bare: boolean): Ref | null {
    const bv = builtinVariables.get(name);
    if (bv !== undefined) return this.builtinVarRef(target, bv, at, forWrite);
    if (bare) {
      const problem = this.bareNameProblem(name, forWrite);
      if (problem !== null) {
        if (problem.code === "E202") this.unknownName(name, at, null);
        else this.report(problem.code, problem.args, at);
        return null;
      }
    }
    const known = target.kind === "self" ? this.self : target.kind === "other" ? this.other : null;
    const slot = known?.slots.get(name);
    if (slot !== undefined && target.kind !== "reg") {
      const [get, set] = target.kind === "self" ? ["GETSLOT", "SETSLOT"] : ["GETSLOTO", "SETSLOTO"];
      return {
        load: (dst) => void this.emit(get, dst, slot),
        store: (src) => void this.emit(set, src, slot),
        localReg: null,
      };
    }
    // Not a slot of a known object: the name must be an instance variable somewhere (a descendant's slot, or a
    // variable some code writes by name), or reading it could only fail at run time (rule 1).
    const writesByName = forWrite && known === null;
    if (target.kind !== "reg" && !writesByName && !this.env.isInstanceVariableName(name)) {
      this.unknownName(name, at, known);
      return null;
    }
    // ADR-0005: GETDYN/SETDYN take the symbol by name (operand kind `sym`).
    const reg = this.targetReg(target);
    return {
      load: (dst) => void this.emit("GETDYN", dst, reg, name),
      store: (src) => void this.emit("SETDYN", src, reg, name),
      localReg: null,
    };
  }

  /** A register holding the instance `target` names (self and other as their instance constants). */
  private targetReg(target: Target): number {
    if (target.kind === "reg") return target.reg;
    const r = this.alloc();
    this.emit("LOADI", r, INSTANCE_CONSTANT[target.kind]);
    return r;
  }

  private builtinVarRef(target: Target, bv: BuiltinVariable, at: Span, forWrite: boolean): Ref | null {
    if (forWrite && bv.readonly) {
      this.report("E302", { name: bv.name }, at);
      return null;
    }
    if (bv.arrayLength > 0) {
      this.report("E305", { name: bv.name }, at);
      return null;
    }
    if (bv.scope === "instance" && !this.env.hasInstance) {
      this.report("E303", { what: `The variable ${bv.name}` }, at);
      return null;
    }
    if (target.kind === "self" || bv.scope === "global")
      return {
        load: (dst) => void this.emit("GETBI", dst, bv.name),
        store: (src) => void this.emit("SETBI", src, bv.name),
        localReg: null,
      };
    // ADR-0005: GETBIO/SETBIO, a builtin variable of another instance.
    const reg = this.targetReg(target);
    return {
      load: (dst) => void this.emit("GETBIO", dst, reg, bv.name),
      store: (src) => void this.emit("SETBIO", src, reg, bv.name),
      localReg: null,
    };
  }

  /** `object[index]`: a builtin array variable (alarm, view_x) or an element of an array value. */
  private indexRef(object: Expr, index: Expr, forWrite: boolean): Ref | null {
    if (object.kind === "name" && !this.locals.has(object.name)) {
      const bv = builtinVariables.get(object.name);
      if (bv !== undefined && bv.arrayLength > 0) {
        if (forWrite && bv.readonly) {
          this.report("E302", { name: bv.name }, object);
          return null;
        }
        if (bv.scope === "instance" && !this.env.hasInstance) {
          this.report("E303", { what: `The variable ${bv.name}` }, object);
          return null;
        }
        const i = this.valueAny(index);
        // ADR-0005: GETBIX/SETBIX, an element of a builtin array variable of self.
        return {
          load: (dst) => void this.emit("GETBIX", dst, bv.name, i),
          store: (src) => void this.emit("SETBIX", src, bv.name, i),
          localReg: null,
        };
      }
    }
    // The array itself: a local register, or a variable loaded into a temporary and written back after a store
    // (SETIDX may have created the array, ADR-0005).
    let arr: number;
    let parent: Ref | null = null;
    if (object.kind === "name" && this.locals.has(object.name)) arr = this.locals.get(object.name) as number;
    else if (forWrite && isLValueExpr(object)) {
      parent = this.ref(object, true);
      if (parent === null) return null;
      arr = this.alloc();
      parent.load(arr);
    } else arr = this.valueAny(object);
    if (fractionalLiteral(index)) this.env.reporter.report("W041", {}, index.start, index.end);
    const i = this.valueAny(index);
    const writeBack = parent;
    return {
      load: (dst) => void this.emit("GETIDX", dst, arr, i),
      store: (src) => {
        this.emit("SETIDX", arr, i, src);
        writeBack?.store(arr);
      },
      localReg: null,
    };
  }

  /** Why a bare, non-local, non-builtin name can't be an instance variable here, or null when it can. */
  private bareNameProblem(name: string, forWrite: boolean): { code: CompilerCode; args: DiagArgs } | null {
    if (builtinConstants.has(name) || this.env.assetKind(name) !== null)
      return forWrite ? { code: "E302", args: { name } } : null;
    if (this.env.lookupFunction(name) !== null || builtinFunctions.has(name))
      return { code: forWrite ? "E302" : "E204", args: { name } };
    if (!this.env.hasInstance)
      return forWrite
        ? { code: "E203", args: { name } }
        : { code: "E202", args: { name, suggestion: suggestionText(this.suggestName(name, null)) } };
    return null;
  }

  private unknownName(name: string, at: Span, known: ObjectInfo | null): void {
    // A misspelt asset (spr_playr) gets its own message: the kind comes from the closest asset, else the prefix.
    const asset = suggest(name, this.env.assetNames());
    const kind =
      (asset === null ? null : this.env.assetKind(asset)) ?? ASSET_PREFIXES.find(([p]) => name.startsWith(p))?.[1];
    if (kind !== undefined && kind !== null) {
      const list = `${kind === "music" ? "Sound" : kind[0]?.toUpperCase() + kind.slice(1)}s`;
      this.report(
        "E206",
        { name, kind: kind === "music" ? "sound" : kind, list, suggestion: suggestionText(asset) },
        at,
      );
      return;
    }
    this.report("E202", { name, suggestion: suggestionText(this.suggestName(name, known)) }, at);
  }

  private suggestName(name: string, known: ObjectInfo | null): string | null {
    return suggest(name, [
      ...this.locals.keys(),
      ...(known?.slots.keys() ?? this.self?.slots.keys() ?? []),
      ...builtinVariables.keys(),
      ...builtinConstants.keys(),
      ...this.env.assetNames(),
    ]);
  }

  // ---- Values ----------------------------------------------------------------------------------------------------

  /** Evaluates `e` into any register: a local's own register, or a new temporary. */
  private valueAny(e: Expr): number {
    if (e.kind === "name") {
      const local = this.locals.get(e.name);
      if (local !== undefined) return local;
    }
    const t = this.alloc();
    this.valueTo(e, t);
    return t;
  }

  /** Evaluates `e` into `dst` unless it is a local, whose register is returned instead. */
  private valuePrefer(e: Expr, dst: number): number {
    if (e.kind === "name") {
      const local = this.locals.get(e.name);
      if (local !== undefined) return local;
    }
    this.valueTo(e, dst);
    return dst;
  }

  /** Evaluates `e` into exactly `dst`. */
  private valueTo(e: Expr, dst: number): void {
    if (this.env.fold === true && FOLDABLE_KINDS.has(e.kind)) {
      const k = fold(e, this.constantLookup);
      if (k !== null) {
        this.loadFolded(k, dst);
        return;
      }
    }
    const mark = this.top;
    switch (e.kind) {
      case "number":
        this.loadNumber(dst, e.repr, e.value);
        break;
      case "string":
        this.emit("LOADK", dst, { kind: "string", value: e.value } satisfies Const);
        break;
      case "bool":
        this.emit("LOADB", dst, e.value ? 1 : 0);
        break;
      case "undefined":
        this.emit("LOADUNDEF", dst);
        break;
      case "special":
        if (!this.env.hasInstance && e.which !== "noone") this.report("E303", { what: e.which }, e);
        this.emit("LOADI", dst, INSTANCE_CONSTANT[e.which]);
        break;
      case "name":
        this.loadName(e, dst);
        break;
      case "global":
      case "member":
      case "index": {
        const ref = this.ref(e, false);
        ref?.load(dst);
        break;
      }
      case "call":
        this.call(e, dst);
        break;
      case "unary":
        if (e.op === "-" && e.operand.kind === "number") {
          this.loadNumber(dst, e.operand.repr, -e.operand.value);
          break;
        }
        this.emit(e.op === "-" ? "NEG" : "NOT", dst, this.valuePrefer(e.operand, dst));
        break;
      case "binary":
        if (e.op === "&&" || e.op === "||") this.logical(e, dst);
        else {
          this.checkBinary(e);
          const left = this.valuePrefer(e.left, dst);
          const op = e.op === "+" && isString(e.left) && isString(e.right) ? "CONCAT" : (BINARY_OPCODE[e.op] as string);
          this.arith(op, dst, left, e.right, e.left);
        }
        break;
      case "ternary": {
        const otherwise = this.newLabel();
        const end = this.newLabel();
        this.jumpIf(e.cond, false, otherwise);
        this.valueTo(e.then, dst);
        this.jump("JMP", end);
        this.place(otherwise);
        this.valueTo(e.otherwise, dst);
        this.place(end);
        break;
      }
      case "array": {
        if (e.items.length > NEWARR_MAX) this.report("E493", {}, e);
        const base = this.argBase(dst);
        for (const [i, item] of e.items.slice(0, NEWARR_MAX).entries())
          this.valueTo(item, i === 0 ? base : this.alloc());
        this.emit("NEWARR", base, Math.min(e.items.length, NEWARR_MAX));
        if (base !== dst) this.emit("MOV", dst, base);
        break;
      }
      case "error":
        this.emit("LOADUNDEF", dst);
        break;
    }
    this.release(mark);
  }

  private loadNumber(dst: number, repr: "int" | "fixed", value: number): void {
    if (repr === "fixed") this.emit("LOADK", dst, { kind: "real", raw: value } satisfies Const);
    else if (value >= LOADI_MIN && value <= LOADI_MAX) this.emit("LOADI", dst, value);
    else this.emit("LOADK", dst, { kind: "int", value } satisfies Const);
  }

  /** A bare name read: local, instance variable, builtin variable, constant or asset. */
  private loadName(e: NameRef, dst: number): void {
    const local = this.locals.get(e.name);
    if (local !== undefined) {
      if (local !== dst) this.emit("MOV", dst, local);
      return;
    }
    const constant = builtinConstants.get(e.name);
    if (constant !== undefined) {
      this.loadNumber(dst, "int", constant.value);
      return;
    }
    if (!builtinVariables.has(e.name) && this.env.assetKind(e.name) !== null) {
      this.emit("LOADK", dst, { kind: "asset", name: e.name } satisfies Const);
      return;
    }
    this.instanceRef({ kind: "self" }, e.name, e, false, true)?.load(dst);
  }

  /** `a && b`, `a || b` as a value: always a bool (language.md section 3). */
  private logical(e: Expr, dst: number): void {
    const no = this.newLabel();
    const end = this.newLabel();
    this.jumpIf(e, false, no);
    this.emit("LOADB", dst, 1);
    this.jump("JMP", end);
    this.place(no);
    this.emit("LOADB", dst, 0);
    this.place(end);
  }

  /** Jumps to `label` when `e` is truthy (`when` = true) or falsy (`when` = false). */
  private jumpIf(e: Expr, when: boolean, label: Label): void {
    if (e.kind === "unary" && e.op === "!") {
      this.jumpIf(e.operand, !when, label);
      return;
    }
    const constant = this.env.fold === true ? fold(e, this.constantLookup) : e.kind === "bool" ? e : null;
    if (constant !== null && constant.kind === "bool") {
      // A condition known at compile time: an unconditional jump, or none.
      if (constant.value === when) this.jump("JMP", label);
      return;
    }
    if (e.kind === "binary" && (e.op === "&&" || e.op === "||")) {
      // For &&, jumping on "false" is direct; for ||, jumping on "true" is.
      const direct = e.op === "&&" ? !when : when;
      if (direct) {
        this.jumpIf(e.left, when, label);
        this.jumpIf(e.right, when, label);
        return;
      }
      const skip = this.newLabel();
      this.jumpIf(e.left, !when, skip);
      this.jumpIf(e.right, when, label);
      this.place(skip);
      return;
    }
    const mark = this.top;
    if (e.kind === "binary" && RELATION[e.op] !== undefined) {
      // CMPJ skips the following JMP when its relation holds (contracts/dsdb.md section 5). To jump when the
      // comparison is false, test the relation itself; to jump when it is true, test its negation.
      this.checkBinary(e);
      const left = this.valueAny(e.left);
      const right = this.valueAny(e.right);
      const relation = RELATION[e.op] as number;
      const op = this.bothInt(e.left, e.right) ? "CMPJII" : "CMPJ";
      this.emit(op, left, right, when ? (NEGATED_RELATION[relation] as number) : relation);
      this.jump("JMP", label);
      this.release(mark);
      return;
    }
    const r = this.valueAny(e);
    this.jump(when ? "JMPT" : "JMPF", label, r);
    this.release(mark);
  }

  /**
   * `dst = left <op> right` for an arithmetic opcode, using ADDI/SUBI/MULI when `right` is a small int literal
   * (the same meaning as ADD/SUB/MUL with that int, one register and one instruction fewer).
   */
  private arith(op: string, dst: number, left: number, right: Expr, leftValue: Expr): void {
    const k = this.constantOf(right);
    const immediate = IMMEDIATE_OPCODE[op];
    if (
      immediate !== undefined &&
      k !== null &&
      k.kind === "number" &&
      k.repr === "int" &&
      k.value >= IMMEDIATE_MIN &&
      k.value <= IMMEDIATE_MAX
    ) {
      this.emit(immediate, dst, left, k.value);
      return;
    }
    // Both operands proved int: the int-specialised form skips the VM's tag checks (same result, same overflow).
    const specialised = INT_OPCODE[op];
    this.emit(
      specialised !== undefined && this.bothInt(leftValue, right) ? specialised : op,
      dst,
      left,
      this.valueAny(right),
    );
  }

  /** True when the int-specialised opcodes are on and both values are proved int. */
  private bothInt(a: Expr, b: Expr): boolean {
    return (this.ints?.isInt(a) ?? false) && (this.ints?.isInt(b) ?? false);
  }

  /**
   * The literal `e` stands for: with folding on, any constant expression; with it off, only a literal or a negated
   * number literal (what the source spells out, so the conformance goldens still run every operation on the VM).
   */
  private constantOf(e: Expr): Folded | null {
    if (this.env.fold === true) return fold(e, this.constantLookup);
    const literal = e.kind === "unary" && e.op === "-" ? e.operand : e;
    return literal.kind === "number" || literal.kind === "string" || literal.kind === "bool"
      ? fold(e, NO_CONSTANTS)
      : null;
  }

  /** Builtin constants by name for folding, unless a local of the same name shadows one. */
  private readonly constantLookup = (name: string): number | undefined =>
    this.locals.has(name) ? undefined : builtinConstants.get(name)?.value;

  /** Loads a folded value into `dst`, as its literal would. */
  private loadFolded(k: Folded, dst: number): void {
    if (k.kind === "number") this.loadNumber(dst, k.repr, k.value);
    else if (k.kind === "string") this.emit("LOADK", dst, { kind: "string", value: k.value } satisfies Const);
    else this.emit("LOADB", dst, k.value ? 1 : 0);
  }

  // ---- Checks (the beginner-mistake checker, PLAN.md 6 WS4) ------------------------------------------------------

  /** What the checker can prove about a value's type; "unknown" whenever it can't. */
  private typeOf(e: Expr): ValueType {
    switch (e.kind) {
      case "number":
        return e.repr === "fixed" ? "fixed" : "number";
      case "string":
      case "bool":
      case "undefined":
      case "array":
        return e.kind;
      case "special":
        return "instance";
      case "name": {
        if (this.locals.has(e.name)) return "unknown";
        const c = builtinConstants.get(e.name);
        if (c !== undefined) return fromBuiltinType(c.type);
        const v = builtinVariables.get(e.name);
        if (v !== undefined) return v.arrayLength > 0 ? "unknown" : fromBuiltinType(v.type);
        return this.env.assetKind(e.name) ?? "unknown";
      }
      case "member": {
        const v = builtinVariables.get(e.name);
        return v === undefined || v.arrayLength > 0 ? "unknown" : fromBuiltinType(v.type);
      }
      case "call": {
        if (
          e.callee.kind !== "name" ||
          this.locals.has(e.callee.name) ||
          this.env.lookupFunction(e.callee.name) !== null
        )
          return "unknown";
        const f = builtinFunctions.get(e.callee.name);
        return f === undefined ? "unknown" : fromBuiltinType(f.returns);
      }
      case "unary":
        return e.op === "!" ? "bool" : this.typeOf(e.operand) === "fixed" ? "fixed" : "number";
      case "binary": {
        if (["==", "!=", "<", "<=", ">", ">=", "&&", "||"].includes(e.op)) return "bool";
        const l = category(this.typeOf(e.left));
        const r = category(this.typeOf(e.right));
        if (e.op === "+" && (l === "string" || r === "string"))
          return l === "string" && r === "string" ? "string" : "unknown";
        return l === "unknown" || r === "unknown" ? "unknown" : "number";
      }
      case "ternary": {
        const a = this.typeOf(e.then);
        return a === this.typeOf(e.otherwise) ? a : "unknown";
      }
      default:
        return "unknown";
    }
  }

  /** Checks an arithmetic or comparison operator: E310 text + number, E314 division by 0, W040, W042. */
  private checkBinary(e: Expr & { kind: "binary" }): void {
    const report = (code: CompilerCode, args: DiagArgs, at: Span) =>
      this.env.reporter.report(code, args, at.start, at.end);
    if (e.op === "+") {
      const l = category(this.typeOf(e.left));
      const r = category(this.typeOf(e.right));
      if ((l === "string" && r === "number") || (l === "number" && r === "string")) report("E310", {}, e);
    }
    if ((e.op === "/" || e.op === "div" || e.op === "mod" || e.op === "%") && isZeroLiteral(e.right))
      report("E314", { op: e.op }, e.right);
    if (e.op === "*" && sameVariable(e.left, e.right)) {
      const name = e.left.kind === "name" || e.left.kind === "member" ? e.left.name : "";
      if (builtinVariables.get(name)?.type === "number") report("W040", { name }, e);
    }
    if (e.op === "div")
      for (const side of [e.left, e.right])
        if (fractionalLiteral(side)) report("W042", { value: this.sourceOf(side) }, side);
  }

  /** The source text of a node (for messages that quote it). */
  private sourceOf(e: Span): string {
    return this.env.reporter.text.slice(e.start, e.end);
  }

  /**
   * Checks a builtin call: E311 a provably wrong kind of argument (the first one only), E312 a void result used as
   * a value, E313 a Draw-only builtin outside Draw, W031 touch_in_instance(self) on the top screen, W043 letters the
   * DS font lacks in draw_text.
   */
  private checkBuiltinCall(e: Call, name: string, valueUsed: boolean): void {
    const f = builtinFunctions.get(name);
    if (f === undefined) return;
    const report = (code: CompilerCode, args: DiagArgs, at: Span) =>
      this.env.reporter.report(code, args, at.start, at.end);
    if (valueUsed && f.returns === "void") report("E312", { name }, e);
    if (f.allowedEvents !== "*" && this.env.event !== null && !f.allowedEvents.includes(this.env.event))
      report("E313", { name }, e.callee);
    for (const [i, arg] of e.args.entries()) {
      const param = f.params[Math.min(i, f.params.length - 1)];
      if (param === undefined) break;
      const t = this.typeOf(arg);
      if (!accepts(param.type, t)) {
        report(
          "E311",
          { name, expected: describeParam(param.type), position: ordinal(i + 1), actual: describeType(t) },
          arg,
        );
        break;
      }
    }
    if (name === "touch_in_instance" && this.env.objectScreen === "top") {
      const first = e.args[0];
      if (first === undefined || (first.kind === "special" && first.which === "self"))
        report("W031", { what: "touch_in_instance(self)", object: this.env.self?.name ?? "this object" }, e);
    }
    if (name === "draw_text") {
      const text = e.args[2];
      if (text?.kind === "string" && !DS_FONT.test(text.value)) {
        const char = [...text.value].find((c) => !DS_FONT.test(c)) as string;
        report("W043", { char }, text);
      }
    }
  }

  // ---- Calls -----------------------------------------------------------------------------------------------------

  /**
   * The first register of a call's argument block: `dst` itself when it is the topmost temporary (so the
   * result lands in place), otherwise a new temporary.
   */
  private argBase(dst: number | null): number {
    if (dst !== null && dst === this.top - 1 && dst >= this.locals.size) return dst;
    return this.alloc();
  }

  /** Compiles a call; the result goes to `dst`, or is dropped when `dst` is null. */
  private call(e: Call, dst: number | null): void {
    if (e.callee.kind !== "name" || this.locals.has(e.callee.name)) {
      this.report("E306", {}, e.callee);
      if (dst !== null) this.emit("LOADUNDEF", dst);
      return;
    }
    const name = e.callee.name;
    const user = this.env.lookupFunction(name);
    const builtin = builtinFunctions.get(name);
    if (user === null && builtin === undefined) {
      const owner = this.env.helperOwner?.(name) ?? null;
      if (owner !== null) {
        this.report("E205", { name, owner, here: this.env.self?.name ?? "a script" }, e.callee);
        if (dst !== null) this.emit("LOADUNDEF", dst);
        return;
      }
      const best = suggest(name, [...this.env.functionNames(), ...builtinFunctions.keys()]);
      this.report("E201", { name, suggestion: suggestionText(best, true) }, e.callee);
      if (dst !== null) this.emit("LOADUNDEF", dst);
      return;
    }
    const base = this.argBase(dst);
    if (user !== null) {
      const required = user.defaults.filter((d) => d === null).length;
      if (e.args.length < required || e.args.length > user.params)
        this.report("E301", { name, expected: countText(required, user.params), count: givenText(e.args.length) }, e);
      this.userCall(e, base, user, this.env.overridesOf?.(name) ?? []);
    } else if (builtin !== undefined) {
      if (e.args.length < builtin.minArgs || e.args.length > builtin.maxArgs)
        this.report(
          "E301",
          { name, expected: countText(builtin.minArgs, builtin.maxArgs), count: givenText(e.args.length) },
          e,
        );
      this.checkBuiltinCall(e, name, dst !== null);
      for (const [i, arg] of e.args.entries()) this.valueTo(arg, i === 0 ? base : this.alloc());
      this.emit("CALLN", base, e.args.length, name);
    }
    if (dst !== null && dst !== base) this.emit("MOV", dst, base);
  }

  /**
   * Calls a user function with the given arguments in `base`, `base+1`, ... When descendants of self's object
   * override it (events.md section 3: "a child function with the same name overrides it"), the call dispatches on
   * `object_index`: each overriding object (and its own descendants) gets its version, everyone else `user`. The
   * objects are known at compile time, so the dispatch is a few compares, and only where an override exists.
   */
  private userCall(e: Call, base: number, user: UserFunction, overrides: readonly FunctionOverride[]): void {
    const variants = [user, ...overrides.map((o) => o.fn)];
    const width = Math.max(e.args.length, ...variants.map((v) => v.params));
    const regs = Array.from({ length: width }, (_, i) => (i === 0 ? base : this.alloc()));
    // The arguments are evaluated once, in order, whatever version ends up being called.
    for (const [i, arg] of e.args.entries()) this.valueTo(arg, regs[i] as number);
    /** Fills `fn`'s missing parameters with its defaults (or undefined) and calls it. */
    const call = (fn: UserFunction): void => {
      for (let i = e.args.length; i < fn.params; i++) {
        const init = fn.defaults[i] ?? null;
        if (init === null) this.emit("LOADUNDEF", regs[i] as number);
        else this.valueTo(init, regs[i] as number);
      }
      this.emit("CALL", base, fn.funcName);
    };
    if (overrides.length === 0) {
      call(user);
      return;
    }
    const end = this.newLabel();
    const labels = overrides.map(() => this.newLabel());
    const mark = this.top;
    const kind = this.alloc();
    const candidate = this.alloc();
    const same = this.alloc();
    this.emit("GETBI", kind, "object_index");
    overrides.forEach((o, i) => {
      for (const object of o.objects) {
        this.emit("LOADK", candidate, { kind: "asset", name: object } satisfies Const);
        this.emit("EQ", same, kind, candidate);
        this.jump("JMPT", labels[i] as Label, same);
      }
    });
    this.release(mark);
    call(user);
    this.jump("JMP", end);
    overrides.forEach((o, i) => {
      this.place(labels[i] as Label);
      call(o.fn);
      if (i < overrides.length - 1) this.jump("JMP", end);
    });
    this.place(end);
  }
}

/** A number literal with a fraction (possibly negated), e.g. `1.5` or `-0.25`. */
function fractionalLiteral(e: Expr): boolean {
  const n = e.kind === "unary" && e.op === "-" ? e.operand : e;
  return n.kind === "number" && n.repr === "fixed" && n.value % FIXED_ONE !== 0;
}

/** Is `e` the number literal 0 (possibly negated)? */
function isZeroLiteral(e: Expr): boolean {
  const n = e.kind === "unary" && e.op === "-" ? e.operand : e;
  return n.kind === "number" && n.value === 0;
}

/** Are two values the same variable, written the same way (`x` and `x`, `other.y` and `other.y`)? */
function sameVariable(a: Expr, b: Expr): boolean {
  if (a.kind === "name" && b.kind === "name") return a.name === b.name;
  if (a.kind === "member" && b.kind === "member") return a.name === b.name && sameVariable(a.object, b.object);
  if (a.kind === "special" && b.kind === "special") return a.which === b.which;
  return false;
}

/** Name prefixes that say which kind of asset a misspelt name meant (the usual GameMaker naming). */
const ASSET_PREFIXES: readonly [string, "sprite" | "sound" | "object" | "room" | "background"][] = [
  ["spr_", "sprite"],
  ["snd_", "sound"],
  ["mus_", "sound"],
  ["obj_", "object"],
  ["rm_", "room"],
  ["bg_", "background"],
];

/** Characters the DS font can show (contracts/language.md section 7): printable ASCII. */
const DS_FONT = /^[\x20-\x7e]*$/;

/** "2 values", "no values", "1 to 16 values" for E301. */
function countText(min: number, max: number): string {
  const n = (k: number) => (k === 0 ? "no values" : k === 1 ? "1 value" : `${k} values`);
  return min === max ? n(min) : `${min} to ${n(max)}`;
}

/** "3 were", "1 was", "none were" for E301. */
function givenText(count: number): string {
  return count === 0 ? "none were" : count === 1 ? "1 was" : `${count} were`;
}

/** Can `e` be written to (and so written back after an array store)? */
function isLValueExpr(e: Expr): e is LValue {
  return e.kind === "name" || e.kind === "global" || e.kind === "member" || e.kind === "index";
}

/** Is `e` provably a string (so `+` can be CONCAT)? */
function isString(e: Expr): boolean {
  switch (e.kind) {
    case "string":
      return true;
    case "call":
      return e.callee.kind === "name" && builtinFunctions.get(e.callee.name)?.returns === "string";
    case "binary":
      return e.op === "+" && isString(e.left) && isString(e.right);
    case "ternary":
      return isString(e.then) && isString(e.otherwise);
    default:
      return false;
  }
}

/** Does `e` read the bare name `name` anywhere? */
function readsName(e: Expr, name: string): boolean {
  switch (e.kind) {
    case "name":
      return e.name === name;
    case "member":
      return readsName(e.object, name);
    case "index":
      return readsName(e.object, name) || readsName(e.index, name);
    case "call":
      return readsName(e.callee, name) || e.args.some((a) => readsName(a, name));
    case "unary":
      return readsName(e.operand, name);
    case "binary":
      return readsName(e.left, name) || readsName(e.right, name);
    case "ternary":
      return readsName(e.cond, name) || readsName(e.then, name) || readsName(e.otherwise, name);
    case "array":
      return e.items.some((i) => readsName(i, name));
    default:
      return false;
  }
}
