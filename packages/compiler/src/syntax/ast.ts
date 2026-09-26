/**
 * The DSS syntax tree. Internal to WS4 (PLAN.md 5.2 C7): only packages/lang/src/host.ts is public, so this shape
 * can change without an ADR. Every node records its half-open source range [start, end) as UTF-16 offsets.
 */

/** Source range shared by every node. */
export interface Span {
  start: number;
  end: number;
}

// ---- Expressions -------------------------------------------------------------------------------------------------

/** A number literal. `repr` says which hidden representation it has (language.md section 4). */
export interface NumberLit extends Span {
  kind: "number";
  repr: "int" | "fixed";
  /** The int value, or the Q20.12 raw value (value * 4096) for "fixed". */
  value: number;
}
export interface StringLit extends Span {
  kind: "string";
  value: string;
}
export interface BoolLit extends Span {
  kind: "bool";
  value: boolean;
}
export interface UndefinedLit extends Span {
  kind: "undefined";
}
/** `self`, `other`, `all` or `noone`. */
export interface SpecialInstance extends Span {
  kind: "special";
  which: "self" | "other" | "all" | "noone";
}
/** A bare name: local, instance variable, builtin, function, constant or asset. The binder decides which. */
export interface NameRef extends Span {
  kind: "name";
  name: string;
}
/** `global.name`. */
export interface GlobalRef extends Span {
  kind: "global";
  name: string;
  /** Start of `name` (after the dot). */
  nameStart: number;
}
/** `object.name`: a variable of an instance or object. */
export interface MemberRef extends Span {
  kind: "member";
  object: Expr;
  name: string;
  nameStart: number;
}
/** `object[index]`. */
export interface IndexRef extends Span {
  kind: "index";
  object: Expr;
  index: Expr;
}
export interface Call extends Span {
  kind: "call";
  callee: Expr;
  args: Expr[];
}
export interface Unary extends Span {
  kind: "unary";
  op: "-" | "!";
  operand: Expr;
}

/** Binary operators, including the short-circuit `&&` and `||`. `%` is kept as written; it means `mod`. */
export type BinaryOp =
  | "||"
  | "&&"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/"
  | "div"
  | "mod"
  | "%";

export interface Binary extends Span {
  kind: "binary";
  op: BinaryOp;
  left: Expr;
  right: Expr;
  /** Start of the operator, for diagnostics that point at it. */
  opStart: number;
  /** True when the source wrote `=` and the parser read it as `==` (W030). */
  fromAssign: boolean;
}
export interface Ternary extends Span {
  kind: "ternary";
  cond: Expr;
  then: Expr;
  otherwise: Expr;
}
export interface ArrayLit extends Span {
  kind: "array";
  items: Expr[];
}
/** Placeholder the parser leaves where a value was missing; a diagnostic was already reported. */
export interface ErrorExpr extends Span {
  kind: "error";
}

export type Expr =
  | NumberLit
  | StringLit
  | BoolLit
  | UndefinedLit
  | SpecialInstance
  | NameRef
  | GlobalRef
  | MemberRef
  | IndexRef
  | Call
  | Unary
  | Binary
  | Ternary
  | ArrayLit
  | ErrorExpr;

/** The expressions that can stand before `=`, `+=`, `++` and friends (language.md `lvalue`). */
export type LValue = NameRef | GlobalRef | MemberRef | IndexRef;

// ---- Statements --------------------------------------------------------------------------------------------------

export interface Block extends Span {
  kind: "block";
  body: Stmt[];
}
export interface VarDecl extends Span {
  name: string;
  init: Expr | null;
}
export interface VarStmt extends Span {
  kind: "var";
  decls: VarDecl[];
}
export interface IfStmt extends Span {
  kind: "if";
  cond: Expr;
  then: Stmt;
  otherwise: Stmt | null;
}
export interface WhileStmt extends Span {
  kind: "while";
  cond: Expr;
  body: Stmt;
}
export interface DoUntilStmt extends Span {
  kind: "do";
  body: Stmt;
  cond: Expr;
}
export interface ForStmt extends Span {
  kind: "for";
  /** `var` declarations or a simple statement, or null. */
  init: VarStmt | AssignStmt | IncDecStmt | CallStmt | null;
  cond: Expr | null;
  step: AssignStmt | IncDecStmt | CallStmt | null;
  body: Stmt;
}
export interface RepeatStmt extends Span {
  kind: "repeat";
  count: Expr;
  body: Stmt;
}
/** One `case value:` or `default:` arm and the statements after it (until the next arm). */
export interface SwitchClause extends Span {
  /** null for `default`. */
  test: Expr | null;
  body: Stmt[];
}
export interface SwitchStmt extends Span {
  kind: "switch";
  value: Expr;
  clauses: SwitchClause[];
}
export interface WithStmt extends Span {
  kind: "with";
  target: Expr;
  body: Stmt;
}
export interface JumpStmt extends Span {
  kind: "break" | "continue" | "exit";
}
export interface ReturnStmt extends Span {
  kind: "return";
  value: Expr | null;
}
export type AssignOp = "=" | "+=" | "-=" | "*=" | "/=";
export interface AssignStmt extends Span {
  kind: "assign";
  target: LValue;
  op: AssignOp;
  value: Expr;
}
export interface IncDecStmt extends Span {
  kind: "incdec";
  target: LValue;
  op: "++" | "--";
}
export interface CallStmt extends Span {
  kind: "call";
  call: Call;
}
/** A lone `;`. */
export interface EmptyStmt extends Span {
  kind: "empty";
}

export type Stmt =
  | Block
  | VarStmt
  | IfStmt
  | WhileStmt
  | DoUntilStmt
  | ForStmt
  | RepeatStmt
  | SwitchStmt
  | WithStmt
  | JumpStmt
  | ReturnStmt
  | AssignStmt
  | IncDecStmt
  | CallStmt
  | EmptyStmt;

// ---- Functions and files -----------------------------------------------------------------------------------------

export interface Param extends Span {
  name: string;
  /** The default value, or null when the parameter is required. */
  init: Expr | null;
}
export interface FunctionDecl extends Span {
  kind: "function";
  name: string;
  nameStart: number;
  params: Param[];
  body: Block;
}

/** A parsed file: top-level statements and functions, in source order. */
export interface SourceFile extends Span {
  kind: "file";
  items: (Stmt | FunctionDecl)[];
}
