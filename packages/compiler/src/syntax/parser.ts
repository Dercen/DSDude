/**
 * The DSS parser (contracts/language.md section 3): recursive descent for statements, precedence climbing (Pratt)
 * for values. Semicolons are optional: a statement ends where the next token cannot continue it.
 *
 * Error recovery follows contracts/diagnostics.md, "one mistake yields one diagnostic":
 * - Every reported error switches the Reporter to `suppressed` until the parser reaches a sync point: the start
 *   of a statement after a `;`, `{` or `}`, on a new line, or at a statement keyword.
 * - Missing closers (`)`, `]`, `:`) are reported once and treated as present when the next thing is plainly not
 *   more of the bracketed part (a new line, `{`, `;`, another closer, the end of the file), so the code after
 *   them still gets checked.
 * - Anything worse throws `Bail`, which unwinds to the enclosing statement list; `sync()` then skips to the next
 *   sync point, keeping brackets balanced so a skipped `{` never leaves a stray `}` behind.
 * - A `function` keyword inside a block means a `}` is missing above it (functions live only at the top level):
 *   E103 points at the innermost open `{` and the function is parsed at the top level.
 */
import type { Diagnostic } from "@dsdude/project-format";
import type { CompilerCode } from "../diagnostics/catalog.ts";
import { type DiagArgs, Reporter } from "../diagnostics/report.ts";
import type {
  AssignOp,
  AssignStmt,
  BinaryOp,
  Block,
  Call,
  CallStmt,
  Expr,
  FunctionDecl,
  IncDecStmt,
  LValue,
  Param,
  SourceFile,
  Stmt,
  SwitchClause,
  SwitchStmt,
  VarDecl,
  VarStmt,
} from "./ast.ts";
import { type Comment, lex, type Token } from "./lexer.ts";

/**
 * Which grammar a file follows (language.md section 1): "code" for event files, room creation code and
 * program-form files (statements and functions); "functions" for functions.dss and scripts/*.dss (functions only).
 */
export type FileKind = "code" | "functions";

export interface ParseOptions {
  /** Project-relative path with "/" separators, used in diagnostics; null when the text has no file. */
  file: string | null;
  kind: FileKind;
}

export interface ParseResult {
  ast: SourceFile;
  /** Lexer and parser diagnostics (E1xx, W030, W032), in source order. */
  diagnostics: Diagnostic[];
  tokens: Token[];
  comments: Comment[];
}

/** Parses one DSS file. Never throws. */
export function parse(text: string, options: ParseOptions): ParseResult {
  const reporter = new Reporter(options.file, text);
  const { tokens, comments } = lex(text, reporter);
  // Lexer errors must not mute the parser's first report on a later line; each keeps its own diagnostic. On a line
  // that already has a lexer error, though, a parser error is its echo (an unclosed text swallows the `)` after
  // it), so it is dropped: one mistake, one diagnostic.
  const lexed = reporter.diagnostics.length;
  const lexerErrorLines = new Set(reporter.diagnostics.filter((d) => d.severity === "error").map((d) => d.line));
  reporter.suppressed = false;
  const parser = new Parser(text, tokens, reporter, options.kind);
  const ast = parser.parseFile();
  const echoes = reporter.diagnostics.slice(lexed).filter((d) => d.severity === "error" && lexerErrorLines.has(d.line));
  const diagnostics = reporter.diagnostics
    .filter((d) => !echoes.includes(d))
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.col ?? 0) - (b.col ?? 0));
  return { ast, diagnostics, tokens, comments };
}

/** Thrown to abandon the current statement after an error has been reported. */
class Bail extends Error {}

/** Binding strength of each binary operator (language.md section 3), weakest first. `?:` sits below all of them. */
const BINARY_PRECEDENCE: Readonly<Record<BinaryOp, number>> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  div: 6,
  mod: 6,
  "%": 6,
};

/** The precedence of `==`, which a comparing `=` takes in condition-like places (W030). */
const EQUALITY_PRECEDENCE = BINARY_PRECEDENCE["=="];

const ASSIGN_OPS: ReadonlySet<string> = new Set(["=", "+=", "-=", "*=", "/="]);

/** Keywords that can begin a value (everything else that begins a value is a name, number, string or bracket). */
const VALUE_KEYWORDS: ReadonlySet<string> = new Set([
  "true",
  "false",
  "undefined",
  "self",
  "other",
  "all",
  "noone",
  "global",
]);

/** Punctuation that can begin a value. */
const VALUE_PUNCT: ReadonlySet<string> = new Set(["(", "[", "-", "!"]);

/** Punctuation after which a new line never continues an unfinished value: closers, openers and `;`. */
const VALUE_ENDERS_AND_OPENERS: ReadonlySet<string> = new Set([";", "{", "}", "(", ")", "[", "]"]);

/** Keywords that begin a statement; the parser resynchronises on them. */
const STATEMENT_KEYWORDS: ReadonlySet<string> = new Set([
  "var",
  "if",
  "while",
  "do",
  "for",
  "repeat",
  "switch",
  "with",
  "break",
  "continue",
  "exit",
  "return",
  "function",
  "case",
  "default",
  "else",
  "until",
]);

/** Opening bracket for each closing bracket (for E104 and bracket balancing while skipping). */
const OPENER_OF: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

/** Largest int32 magnitude a literal may have after a unary minus (-2147483648). */
const INT32_MIN_MAGNITUDE = 2147483648;

/** What E117 says for each keyword that needs brackets: the part's name and a sample line. */
const BRACKETED_PART: Readonly<Record<string, { part: string; example: string }>> = {
  if: { part: "condition", example: "if (x > 0)" },
  while: { part: "condition", example: "while (x > 0)" },
  until: { part: "condition", example: "until (x > 0)" },
  repeat: { part: "count", example: "repeat (3)" },
  switch: { part: "value", example: "switch (x)" },
  with: { part: "target", example: "with (obj_enemy)" },
  for: { part: "three parts", example: "for (var i = 0; i < 10; i++)" },
};

class Parser {
  private pos = 0;
  /** Index of the token the current simple statement starts at (a name there is never a "missing value"). */
  private simpleStart = -1;
  private readonly text: string;
  private readonly tokens: Token[];
  private readonly reporter: Reporter;
  private readonly kind: FileKind;

  constructor(text: string, tokens: Token[], reporter: Reporter, kind: FileKind) {
    this.text = text;
    this.tokens = tokens;
    this.reporter = reporter;
    this.kind = kind;
  }

  // ---- Token helpers ---------------------------------------------------------------------------------------------

  private peek(ahead = 0): Token {
    return this.tokens[Math.min(this.pos + ahead, this.tokens.length - 1)] as Token;
  }

  private prev(): Token | undefined {
    return this.tokens[this.pos - 1];
  }

  private next(): Token {
    const t = this.peek();
    if (t.kind !== "eof") this.pos++;
    return t;
  }

  private isPunct(t: Token, text: string): boolean {
    return t.kind === "punct" && t.text === text;
  }

  private isKeyword(t: Token, text: string): boolean {
    return t.kind === "keyword" && t.text === text;
  }

  /** Consumes the punctuation `text` if it is next. */
  private eat(text: string): Token | null {
    return this.isPunct(this.peek(), text) ? this.next() : null;
  }

  /** End offset of the last consumed token (or 0 at the start). */
  private lastEnd(): number {
    return this.prev()?.end ?? 0;
  }

  /** Can `t` begin a value? */
  private startsValue(t: Token): boolean {
    if (t.kind === "name" || t.kind === "int" || t.kind === "fixed" || t.kind === "string") return true;
    if (t.kind === "keyword") return VALUE_KEYWORDS.has(t.text);
    return t.kind === "punct" && VALUE_PUNCT.has(t.text);
  }

  /** Can `t` begin a statement (for resynchronisation)? */
  private startsStatement(t: Token): boolean {
    if (t.kind === "name") return true;
    if (t.kind === "keyword") return STATEMENT_KEYWORDS.has(t.text) || VALUE_KEYWORDS.has(t.text);
    return t.kind === "punct" && (t.text === "{" || t.text === "++" || t.text === "--");
  }

  /** Is the next token a sync point, where reporting resumes after an error? */
  private atSyncPoint(): boolean {
    const t = this.peek();
    const before = this.prev();
    if (before === undefined || t.nl) return true;
    if (before.kind === "punct" && (before.text === ";" || before.text === "{" || before.text === "}")) return true;
    return t.kind === "keyword" && STATEMENT_KEYWORDS.has(t.text);
  }

  // ---- Reporting -------------------------------------------------------------------------------------------------

  /** Reports an error and mutes further reports until the next sync point. */
  private error(code: CompilerCode, args: DiagArgs, start: number, end?: number): void {
    this.reporter.report(code, args, start, end);
    this.reporter.suppressed = true;
  }

  /** Reports an error and abandons the current statement. */
  private fail(code: CompilerCode, args: DiagArgs, start: number, end?: number): never {
    this.error(code, args, start, end);
    throw new Bail();
  }

  /** Reports a warning; warnings never mute later reports. */
  private warn(code: CompilerCode, args: DiagArgs, start: number, end?: number): void {
    this.reporter.report(code, args, start, end);
  }

  /** Describes where a missing value should have been, for E112. */
  private missingValueWhere(): string {
    const before = this.prev();
    if (
      before !== undefined &&
      (before.kind === "punct" || (before.kind === "keyword" && (before.text === "div" || before.text === "mod")))
    )
      return `after the ${before.text}`;
    return this.peek().kind === "eof" ? "at the end of the file" : "here";
  }

  /**
   * Consumes the closer `close` for the bracket `open`. When it is missing and the next token is plainly not more
   * of the bracketed part, reports `code` (E101/E102) once and carries on as if the closer were there; otherwise
   * reports what was expected and abandons the statement.
   */
  private expectClose(close: string, open: Token, code: CompilerCode, expected: string): number {
    const t = this.peek();
    if (this.isPunct(t, close)) return this.next().end;
    const plainlyOver = t.kind === "eof" || t.nl || (t.kind === "punct" && ["{", "}", ";", ")", "]"].includes(t.text));
    if (plainlyOver) {
      this.error(code, { line: this.reporter.at(open.start).line }, open.start, open.end);
      return this.lastEnd();
    }
    return this.fail("E123", { expected }, t.start, t.end);
  }

  /** Consumes the punctuation `text`, or reports E123 and carries on as if it were there. */
  private expectSoft(text: string, expected: string): void {
    if (this.eat(text) !== null) return;
    const t = this.peek();
    this.error("E123", { expected }, t.start, t.end);
  }

  /** Reads a name for a declaration; a keyword is E126, anything else E119 (both abandon the statement). */
  private expectName(after: string): Token {
    const t = this.peek();
    if (t.kind === "name") return this.next();
    if (t.kind === "keyword") return this.fail("E126", { word: t.text }, t.start, t.end);
    // Point at what the name should follow (`var`, `function`, `,`), which is where the reader looks.
    const before = this.prev();
    return this.fail("E119", { after }, before?.start ?? t.start, before?.end ?? t.end);
  }

  // ---- Recovery --------------------------------------------------------------------------------------------------

  /**
   * Skips to the next sync point: past a `;`, before a `}`, or before a statement-starting token on a new line.
   * Brackets opened while skipping are skipped to their closer, so a skipped `{` never leaves a stray `}`.
   */
  private sync(): void {
    let depth = 0;
    for (;;) {
      const t = this.peek();
      if (t.kind === "eof") return;
      if (depth === 0) {
        if (this.isPunct(t, ";")) {
          this.next();
          return;
        }
        if (this.isPunct(t, "}")) return;
        if (t.nl && this.startsStatement(t)) return;
      }
      if (t.kind === "punct" && (t.text === "(" || t.text === "[" || t.text === "{")) depth++;
      else if (t.kind === "punct" && t.text in OPENER_OF && depth > 0) depth--;
      this.next();
    }
  }

  /** Skips to the `)` that closes the current bracket (not consuming it), stopping early at `{` or a new statement. */
  private skipToClose(): void {
    let depth = 0;
    for (;;) {
      const t = this.peek();
      if (t.kind === "eof") return;
      if (depth === 0 && (this.isPunct(t, ")") || this.isPunct(t, "{") || this.isPunct(t, "}"))) return;
      if (depth === 0 && t.nl && this.startsStatement(t)) return;
      if (t.kind === "punct" && (t.text === "(" || t.text === "[")) depth++;
      else if (t.kind === "punct" && (t.text === ")" || t.text === "]") && depth > 0) depth--;
      this.next();
    }
  }

  /** Parses one statement, recovering from errors. Returns null when the statement was abandoned. */
  private statementSafe(): Stmt | null {
    const before = this.pos;
    try {
      return this.statement();
    } catch (e) {
      if (!(e instanceof Bail)) throw e;
      this.sync();
      // Always make progress, even when the failing token is itself a sync point.
      if (this.pos === before) this.next();
      return null;
    }
  }

  // ---- Files and functions ---------------------------------------------------------------------------------------

  parseFile(): SourceFile {
    const items: (Stmt | FunctionDecl)[] = [];
    /** True while consecutive stray statements in a functions-only file share one E118. */
    let inStrayRun = false;
    while (this.peek().kind !== "eof") {
      if (this.atSyncPoint()) this.reporter.suppressed = false;
      const t = this.peek();
      if (this.isKeyword(t, "function")) {
        inStrayRun = false;
        const fn = this.functionSafe();
        if (fn !== null) items.push(fn);
        continue;
      }
      if (this.isPunct(t, "}")) {
        this.error("E104", { bracket: "}", open: "{" }, t.start, t.end);
        this.next();
        continue;
      }
      if (this.kind === "functions" && !inStrayRun) {
        this.error("E118", {}, t.start, t.end);
        inStrayRun = true;
      }
      const stmt = this.statementSafe();
      if (stmt !== null && this.kind === "code") items.push(stmt);
    }
    return { kind: "file", items, start: 0, end: this.text.length };
  }

  private functionSafe(): FunctionDecl | null {
    const before = this.pos;
    try {
      return this.functionDecl();
    } catch (e) {
      if (!(e instanceof Bail)) throw e;
      this.sync();
      if (this.pos === before) this.next();
      return null;
    }
  }

  /** `function name(a, b = 1) { ... }` */
  private functionDecl(): FunctionDecl {
    const kw = this.next();
    const name = this.expectName("function");
    const open = this.eat("(");
    if (open === null) {
      const t = this.peek();
      return this.fail("E123", { expected: "a ( after the function's name" }, t.start, t.end);
    }
    const params: Param[] = [];
    let sawDefault = false;
    if (!this.isPunct(this.peek(), ")")) {
      for (;;) {
        const p = this.expectName(params.length === 0 ? "(" : ",");
        let init: Expr | null = null;
        if (this.eat("=") !== null) init = this.expr(true);
        if (init !== null) sawDefault = true;
        else if (sawDefault) this.error("E124", { name: p.text }, p.start, p.end);
        params.push({ name: p.text, init, start: p.start, end: this.lastEnd() });
        if (this.eat(",") === null) break;
      }
    }
    this.expectClose(")", open, "E101", "a , or a )");
    if (!this.isPunct(this.peek(), "{")) {
      const t = this.peek();
      return this.fail("E123", { expected: "a { to start the function's code" }, t.start, t.end);
    }
    const body = this.block();
    return { kind: "function", name: name.text, nameStart: name.start, params, body, start: kw.start, end: body.end };
  }

  // ---- Statements ------------------------------------------------------------------------------------------------

  /** `{ statements }`. A `function` inside means a `}` is missing above it: E103 at this `{`. */
  private block(): Block {
    const open = this.next();
    const body: Stmt[] = [];
    for (;;) {
      const t = this.peek();
      if (this.isPunct(t, "}")) {
        this.next();
        break;
      }
      if (t.kind === "eof" || this.isKeyword(t, "function")) {
        this.error("E103", { line: this.reporter.at(open.start).line }, open.start, open.end);
        break;
      }
      if (this.atSyncPoint()) this.reporter.suppressed = false;
      const stmt = this.statementSafe();
      if (stmt !== null) body.push(stmt);
    }
    return { kind: "block", body, start: open.start, end: this.lastEnd() };
  }

  /** Consumes an optional `;` after a statement. */
  private endStatement(): void {
    this.eat(";");
  }

  private statement(): Stmt {
    const t = this.peek();
    if (t.kind === "punct") {
      if (t.text === "{") return this.block();
      if (t.text === ";") {
        this.next();
        return { kind: "empty", start: t.start, end: t.end };
      }
      if (t.text in OPENER_OF)
        return this.fail("E104", { bracket: t.text, open: OPENER_OF[t.text] as string }, t.start, t.end);
    }
    if (t.kind === "keyword") {
      switch (t.text) {
        case "var": {
          const v = this.varStatement();
          this.endStatement();
          return v;
        }
        case "if":
          return this.ifStatement();
        case "while": {
          this.next();
          const cond = this.bracketed("while");
          const body = this.body();
          return { kind: "while", cond, body, start: t.start, end: body.end };
        }
        case "do":
          return this.doStatement();
        case "for":
          return this.forStatement();
        case "repeat": {
          this.next();
          const count = this.bracketed("repeat");
          const body = this.body();
          return { kind: "repeat", count, body, start: t.start, end: body.end };
        }
        case "switch":
          return this.switchStatement();
        case "with": {
          this.next();
          const target = this.bracketed("with");
          const body = this.body();
          return { kind: "with", target, body, start: t.start, end: body.end };
        }
        case "break":
        case "continue":
        case "exit": {
          this.next();
          this.endStatement();
          return { kind: t.text as "break" | "continue" | "exit", start: t.start, end: t.end };
        }
        case "return": {
          this.next();
          // The value must start on the same line: a bare `return` on its own line never swallows the next line.
          const value = !this.peek().nl && this.startsValue(this.peek()) ? this.expr(true) : null;
          const end = this.lastEnd();
          this.endStatement();
          return { kind: "return", value, start: t.start, end };
        }
        case "function": {
          // Only reachable as the body of if/while/...: a block catches `function` itself (E103).
          const fn = this.functionDecl();
          this.error("E127", { name: fn.name }, t.start, t.end);
          return { kind: "empty", start: fn.start, end: fn.end };
        }
        case "case":
        case "default":
          return this.fail("E120", { keyword: t.text }, t.start, t.end);
        case "else":
          return this.fail("E125", {}, t.start, t.end);
        case "until":
        case "div":
        case "mod":
          return this.fail("E113", { what: t.text }, t.start, t.end);
      }
    }
    const s = this.simple();
    this.endStatement();
    return s;
  }

  /** The statement after if/while/for/repeat/with/else/do. */
  private body(): Stmt {
    return this.statement();
  }

  /** `var a = 1, b` (without the optional `;`). */
  private varStatement(): VarStmt {
    const kw = this.next();
    const decls: VarDecl[] = [];
    do {
      const name = this.expectName(decls.length === 0 ? "var" : ",");
      const init = this.eat("=") !== null ? this.expr(true) : null;
      decls.push({ name: name.text, init, start: name.start, end: this.lastEnd() });
    } while (this.eat(",") !== null);
    return { kind: "var", decls, start: kw.start, end: this.lastEnd() };
  }

  private ifStatement(): Stmt {
    const kw = this.next();
    const cond = this.bracketed("if");
    const then = this.body();
    let otherwise: Stmt | null = null;
    if (this.isKeyword(this.peek(), "else")) {
      this.next();
      otherwise = this.body();
    }
    return { kind: "if", cond, then, otherwise, start: kw.start, end: this.lastEnd() };
  }

  /** `do statement until (condition)` */
  private doStatement(): Stmt {
    const kw = this.next();
    const body = this.body();
    if (!this.isKeyword(this.peek(), "until")) {
      const t = this.peek();
      return this.fail("E123", { expected: "until (condition) after the do part" }, t.start, t.end);
    }
    this.next();
    const cond = this.bracketed("until");
    const end = this.lastEnd();
    this.endStatement();
    return { kind: "do", body, cond, start: kw.start, end };
  }

  /** `for (init; condition; step) statement` */
  private forStatement(): Stmt {
    const kw = this.next();
    const open = this.eat("(");
    if (open === null) {
      const t = this.peek();
      const { part, example } = BRACKETED_PART.for as { part: string; example: string };
      return this.fail("E117", { keyword: "for", part, example }, t.start, t.end);
    }
    let init: VarStmt | AssignStmt | IncDecStmt | CallStmt | null = null;
    if (!this.isPunct(this.peek(), ";"))
      init = this.isKeyword(this.peek(), "var") ? this.varStatement() : this.simple();
    this.expectSoft(";", "a ; after the first part of the for");
    const cond = this.isPunct(this.peek(), ";") ? null : this.expr(true);
    this.expectSoft(";", "a ; after the condition of the for");
    const step = this.isPunct(this.peek(), ")") ? null : this.simple();
    this.expectClose(")", open, "E101", "a )");
    const body = this.body();
    return { kind: "for", init, cond, step, body, start: kw.start, end: body.end };
  }

  /** `switch (value) { case v: ... default: ... }` */
  private switchStatement(): SwitchStmt {
    const kw = this.next();
    const value = this.bracketed("switch");
    const open = this.peek();
    if (!this.isPunct(open, "{"))
      return this.fail("E123", { expected: "a { after switch (...)" }, open.start, open.end);
    this.next();
    const clauses: SwitchClause[] = [];
    let current: SwitchClause | null = null;
    for (;;) {
      const t = this.peek();
      if (this.isPunct(t, "}")) {
        this.next();
        break;
      }
      if (t.kind === "eof" || this.isKeyword(t, "function")) {
        this.error("E103", { line: this.reporter.at(open.start).line }, open.start, open.end);
        break;
      }
      if (this.atSyncPoint()) this.reporter.suppressed = false;
      if (this.isKeyword(t, "case") || this.isKeyword(t, "default")) {
        if (current !== null) current.end = this.lastEnd();
        this.next();
        const test = t.text === "case" ? this.caseValue() : null;
        this.expectSoft(":", `a : after ${t.text === "case" ? "the case value" : "default"}`);
        current = { test, body: [], start: t.start, end: this.lastEnd() };
        clauses.push(current);
        continue;
      }
      if (current === null) this.error("E129", {}, t.start, t.end);
      const stmt = this.statementSafe();
      if (stmt !== null && current !== null) current.body.push(stmt);
    }
    if (current !== null) current.end = Math.max(current.end, current.body.at(-1)?.end ?? 0);
    return { kind: "switch", value, clauses, start: kw.start, end: this.lastEnd() };
  }

  /** The value after `case`; a failure here abandons only the value, not the whole switch. */
  private caseValue(): Expr {
    const start = this.peek().start;
    try {
      return this.expr(true);
    } catch (e) {
      if (!(e instanceof Bail)) throw e;
      while (!this.isPunct(this.peek(), ":") && !this.peek().nl && this.peek().kind !== "eof") this.next();
      return { kind: "error", start, end: this.lastEnd() };
    }
  }

  /**
   * The bracketed part after if/while/until/repeat/switch/with. `=` compares here (W030). Without brackets:
   * E117, then the part is read without them so the statement after it still parses.
   */
  private bracketed(keyword: string): Expr {
    const open = this.peek();
    if (!this.isPunct(open, "(")) {
      const { part, example } = BRACKETED_PART[keyword] as { part: string; example: string };
      this.error("E117", { keyword, part, example }, open.start, open.end);
      return this.expr(true);
    }
    this.next();
    let value: Expr;
    try {
      value = this.expr(true);
    } catch (e) {
      if (!(e instanceof Bail)) throw e;
      this.skipToClose();
      value = { kind: "error", start: open.end, end: this.peek().start };
      if (!this.isPunct(this.peek(), ")")) return value;
    }
    this.expectClose(")", open, "E101", "a )");
    return value;
  }

  /**
   * A simple statement: `lvalue op= value`, `lvalue++`/`lvalue--`, or a call. Anything else that parses as a
   * value is reported as unused (E114, or E115 for `a == b`, the usual slip for `a = b`).
   */
  private simple(): AssignStmt | IncDecStmt | CallStmt {
    const first = this.peek();
    if (this.isPunct(first, "++") || this.isPunct(first, "--")) {
      // `++x` is not DSS: report, then read it as `x++`.
      this.next();
      const target = this.postfix(false);
      this.error("E121", { op: first.text, example: `x${first.text}` }, first.start, first.end);
      if (!isLValue(target)) throw new Bail();
      return { kind: "incdec", target, op: first.text as "++" | "--", start: first.start, end: this.lastEnd() };
    }
    this.simpleStart = this.pos;
    const target = this.expr(false);
    const t = this.peek();
    if (t.kind === "punct" && ASSIGN_OPS.has(t.text)) {
      if (!isLValue(target)) this.error("E116", { op: t.text }, target.start, target.end);
      this.next();
      const value = this.expr(true);
      if (!isLValue(target)) throw new Bail();
      return { kind: "assign", target, op: t.text as AssignOp, value, start: target.start, end: value.end };
    }
    if (this.isPunct(t, "++") || this.isPunct(t, "--")) {
      if (!isLValue(target)) this.fail("E116", { op: t.text }, target.start, target.end);
      this.next();
      return { kind: "incdec", target, op: t.text as "++" | "--", start: target.start, end: t.end };
    }
    if (target.kind === "call") return { kind: "call", call: target, start: target.start, end: target.end };
    if (target.kind === "error") throw new Bail();
    if (target.kind === "binary" && target.op === "==" && !target.fromAssign) {
      const name = this.text.slice(target.left.start, target.left.end);
      return this.fail("E115", { name }, target.start, target.end);
    }
    return this.fail("E114", {}, target.start, target.end);
  }

  // ---- Values (expressions) --------------------------------------------------------------------------------------

  /**
   * Parses a value. `compareEq` says whether a bare `=` may be read as `==` (with W030): true everywhere a value
   * is nested (conditions, brackets, call arguments, right-hand sides); false only at the start of a statement,
   * where `=` is the assignment.
   */
  private expr(compareEq: boolean): Expr {
    const cond = this.binary(1, compareEq);
    if (!this.isPunct(this.peek(), "?")) return cond;
    this.next();
    const then = this.expr(true);
    this.expectSoft(":", "a : between the two choices of ?");
    const otherwise = this.expr(true);
    return { kind: "ternary", cond, then, otherwise, start: cond.start, end: otherwise.end };
  }

  /** The binary operator at `t`, if any. A bare `=` counts as `==` when `compareEq` is set. */
  private binaryOp(t: Token, compareEq: boolean): { op: BinaryOp; fromAssign: boolean } | null {
    if (t.kind === "keyword" && (t.text === "div" || t.text === "mod"))
      return { op: t.text as BinaryOp, fromAssign: false };
    if (t.kind !== "punct") return null;
    if (t.text === "=" && compareEq) return { op: "==", fromAssign: true };
    return t.text in BINARY_PRECEDENCE ? { op: t.text as BinaryOp, fromAssign: false } : null;
  }

  /** Precedence climbing over the binary operators, all left-associative. */
  private binary(minPrec: number, compareEq: boolean): Expr {
    let left = this.unary(compareEq);
    for (;;) {
      const t = this.peek();
      const found = this.binaryOp(t, compareEq);
      if (found === null) break;
      const prec = found.fromAssign ? EQUALITY_PRECEDENCE : BINARY_PRECEDENCE[found.op];
      if (prec < minPrec) break;
      this.next();
      const right = this.binary(prec + 1, compareEq);
      if (found.fromAssign) this.warn("W030", {}, t.start, t.end);
      left = {
        kind: "binary",
        op: found.op,
        left,
        right,
        opStart: t.start,
        fromAssign: found.fromAssign,
        start: left.start,
        end: right.end,
      };
    }
    return left;
  }

  private unary(compareEq: boolean): Expr {
    const t = this.peek();
    if (this.isPunct(t, "-") || this.isPunct(t, "!")) {
      this.next();
      const lit = this.peek();
      // -2147483648 is the one int literal whose magnitude does not fit int32 on its own.
      if (t.text === "-" && lit.kind === "int" && lit.num === INT32_MIN_MAGNITUDE) {
        this.next();
        return { kind: "number", repr: "int", value: -INT32_MIN_MAGNITUDE, start: t.start, end: lit.end };
      }
      const operand = this.unary(compareEq);
      return { kind: "unary", op: t.text as "-" | "!", operand, start: t.start, end: operand.end };
    }
    if (this.isPunct(t, "++") || this.isPunct(t, "--")) {
      // `++x` inside a line: report once, then read on as if it were not there.
      this.next();
      this.error("E121", { op: t.text, example: t.text === "++" ? "x += 1" : "x -= 1" }, t.start, t.end);
      return this.unary(compareEq);
    }
    return this.postfix(compareEq);
  }

  /** A primary followed by any number of `.name`, `[index]` and `(arguments)`. */
  private postfix(compareEq: boolean): Expr {
    let e = this.primary();
    for (;;) {
      const t = this.peek();
      if (this.isPunct(t, ".")) {
        this.next();
        const name = this.peek();
        if (name.kind !== "name") {
          if (name.kind === "keyword") return this.fail("E126", { word: name.text }, name.start, name.end);
          return this.fail("E119", { after: "the ." }, t.start, t.end);
        }
        this.next();
        e = { kind: "member", object: e, name: name.text, nameStart: name.start, start: e.start, end: name.end };
      } else if (this.isPunct(t, "[")) {
        if (t.nl) this.warn("W032", { bracket: "[" }, t.start, t.end);
        this.next();
        const index = this.expr(true);
        const end = this.expectClose("]", t, "E102", "a ]");
        e = { kind: "index", object: e, index, start: e.start, end };
      } else if (this.isPunct(t, "(")) {
        if (t.nl) this.warn("W032", { bracket: "(" }, t.start, t.end);
        this.next();
        const args = this.args();
        const end = this.expectClose(")", t, "E101", "a , or a )");
        e = { kind: "call", callee: e, args, start: e.start, end } satisfies Call;
      } else if ((this.isPunct(t, "++") || this.isPunct(t, "--")) && compareEq) {
        // `x++` inside a line: report once, then read on as if it were not there.
        this.next();
        this.error("E121", { op: t.text, example: t.text === "++" ? "x += 1" : "x -= 1" }, t.start, t.end);
      } else break;
    }
    return e;
  }

  /** Call arguments up to (not including) the `)`. */
  private args(): Expr[] {
    const args: Expr[] = [];
    if (this.isPunct(this.peek(), ")")) return args;
    for (;;) {
      args.push(this.expr(true));
      if (this.eat(",") === null) return args;
    }
  }

  private primary(): Expr {
    const t = this.peek();
    switch (t.kind) {
      case "int":
        this.next();
        if (t.num === INT32_MIN_MAGNITUDE) this.error("E107", { text: t.text }, t.start, t.end);
        return { kind: "number", repr: "int", value: t.num, start: t.start, end: t.end };
      case "fixed":
        this.next();
        return { kind: "number", repr: "fixed", value: t.num, start: t.start, end: t.end };
      case "string":
        this.next();
        return { kind: "string", value: t.str, start: t.start, end: t.end };
      case "name":
        // A name on a new line followed by `=` is the next statement, not the missing value of this one.
        if (t.nl && this.pos !== this.simpleStart && this.afterOperator() && this.nextIsAssignment()) break;
        this.next();
        return { kind: "name", name: t.text, start: t.start, end: t.end };
      case "keyword":
        switch (t.text) {
          case "true":
          case "false":
            this.next();
            return { kind: "bool", value: t.text === "true", start: t.start, end: t.end };
          case "undefined":
            this.next();
            return { kind: "undefined", start: t.start, end: t.end };
          case "self":
          case "other":
          case "all":
          case "noone":
            this.next();
            return { kind: "special", which: t.text as "self" | "other" | "all" | "noone", start: t.start, end: t.end };
          case "global": {
            this.next();
            if (!this.isPunct(this.peek(), ".")) {
              const at = this.peek();
              return this.fail(
                "E123",
                { expected: "a . and a name after global (as in global.score)" },
                at.start,
                at.end,
              );
            }
            this.next();
            const name = this.peek();
            if (name.kind !== "name") {
              if (name.kind === "keyword") return this.fail("E126", { word: name.text }, name.start, name.end);
              return this.fail("E119", { after: "global." }, t.start, this.lastEnd());
            }
            this.next();
            return { kind: "global", name: name.text, nameStart: name.start, start: t.start, end: name.end };
          }
        }
        break;
      case "punct":
        if (t.text === "(") {
          this.next();
          const inner = this.expr(true);
          this.expectClose(")", t, "E101", "a )");
          return inner;
        }
        if (t.text === "[") {
          this.next();
          const items: Expr[] = [];
          if (!this.isPunct(this.peek(), "]")) {
            do items.push(this.expr(true));
            while (this.eat(",") !== null);
          }
          const end = this.expectClose("]", t, "E102", "a , or a ]");
          return { kind: "array", items, start: t.start, end };
        }
        break;
    }
    // Nothing here can be a value. Point at the operator before the gap when the gap is at a line end.
    const before = this.prev();
    const where = this.missingValueWhere();
    if ((t.nl || t.kind === "eof") && before !== undefined)
      return this.fail("E112", { where }, before.start, before.end);
    return this.fail("E112", { where }, t.start, t.end);
  }

  /** Did the last consumed token leave a value unfinished (an operator, `,` or `?`/`:`), rather than end one? */
  private afterOperator(): boolean {
    const before = this.prev();
    if (before === undefined) return false;
    if (before.kind === "keyword") return before.text === "div" || before.text === "mod";
    return before.kind === "punct" && !VALUE_ENDERS_AND_OPENERS.has(before.text);
  }

  /** Is the token after the next one an assignment operator (`=`, `+=`, ..., `++`, `--`)? */
  private nextIsAssignment(): boolean {
    const after = this.peek(1);
    return after.kind === "punct" && (ASSIGN_OPS.has(after.text) || after.text === "++" || after.text === "--");
  }
}

/** Can `e` stand before `=`, `+=`, `++` and friends? */
export function isLValue(e: Expr): e is LValue {
  return e.kind === "name" || e.kind === "global" || e.kind === "member" || e.kind === "index";
}
