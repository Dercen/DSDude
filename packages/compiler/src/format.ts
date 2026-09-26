/**
 * The DSS formatter (PLAN.md 6 WS4; C7 `format`). It keeps the author's line breaks and changes only:
 * - indentation: INDENT per open `{`, one more inside a `switch` for the code under each `case`, one more for the
 *   single statement after an `if (...)`/`else`/loop header that has no braces, and one more on lines that
 *   continue an open `(` or `[`;
 * - spacing inside a line: one space around binary operators and after commas, none inside brackets, before
 *   `.`/`,`/`;`, after unary `-`/`!`, or between a name and its `(`/`[`; spaces before an assignment operator
 *   and before a body on its header's line are kept as written, so aligned columns stay aligned;
 * - semicolons: every simple statement (assignment, call, `var`, `++`/`--`, `break`, `continue`, `exit`,
 *   `return`, `do ... until`) ends with `;`;
 * - blank lines: runs collapse to one; trailing spaces and trailing blank lines go; the file ends with one LF.
 * Comments stay where they are (a trailing `//` comment keeps the spaces before it). Code with syntax errors is
 * returned unchanged, so formatting never makes broken code worse. format(format(x)) === format(x).
 */
import type { Stmt } from "./syntax/ast.ts";
import type { Comment, Token } from "./syntax/lexer.ts";
import { type FileKind, parse } from "./syntax/parser.ts";
import { walk } from "./syntax/walk.ts";

/** One indentation level: four spaces, as in the samples and the tutorial. */
export const INDENT = "    ";

/** Keywords after which `(` opens a header, not a call: a space goes between them. */
const HEADER_KEYWORDS: ReadonlySet<string> = new Set(["if", "while", "for", "switch", "with", "repeat", "until"]);
/** Header keywords whose `)` is followed by a body statement (not `switch`, whose body is always a block). */
const BODY_HEADERS: ReadonlySet<string> = new Set(["if", "while", "for", "with", "repeat"]);
/** Keywords that stand for a value (so a following `-` is binary). */
const VALUE_KEYWORDS: ReadonlySet<string> = new Set(["true", "false", "undefined", "self", "other", "all", "noone"]);
/** Assignment operators: spaces before them are kept, so aligned columns stay aligned. */
const ASSIGN_OPS: ReadonlySet<string> = new Set(["=", "+=", "-=", "*=", "/="]);
/** Punctuation that never has a space before it. */
const NO_SPACE_BEFORE: ReadonlySet<string> = new Set([",", ";", ")", "]", "."]);
/** Punctuation that never has a space after it. */
const NO_SPACE_AFTER: ReadonlySet<string> = new Set(["(", "[", "."]);

/** One piece of a line: a token or a comment. */
interface Piece {
  start: number;
  end: number;
  text: string;
  token: Token | null;
}

/** Formats DSS source. `kind` is "functions" for functions.dss and scripts, "code" otherwise. */
export function formatSource(text: string, kind: FileKind): string {
  const clean = text.replace(/\r/g, "");
  const parsed = parse(clean, { file: null, kind });
  if (parsed.diagnostics.some((d) => d.severity === "error")) return text;
  const semicolons = semicolonPoints(
    parsed.ast.items.filter((i): i is Stmt => i.kind !== "function"),
    parsed.tokens,
  );
  for (const item of parsed.ast.items)
    if (item.kind === "function") for (const p of semicolonPoints(item.body.body, parsed.tokens)) semicolons.add(p);
  return layout(clean, parsed.tokens, parsed.comments, semicolons);
}

/** End offsets of the last token of every simple statement that has no `;` yet. */
function semicolonPoints(body: readonly Stmt[], tokens: Token[]): Set<number> {
  const ends = new Set<number>();
  const mark = (end: number) => {
    const i = tokens.findIndex((t) => t.end === end && t.kind !== "eof");
    const next = tokens[i + 1];
    if (i >= 0 && !(next?.kind === "punct" && next.text === ";")) ends.add(end);
  };
  walk(body, {
    stmt: (s) => {
      switch (s.kind) {
        case "var":
        case "assign":
        case "incdec":
        case "call":
        case "break":
        case "continue":
        case "exit":
        case "return":
        case "do":
          mark(s.end);
          return true;
        case "for":
          // The init and step of a for header are not statements of their own: no semicolons there.
          for (const p of semicolonPoints([s.body], tokens)) ends.add(p);
          return false;
        default:
          return true;
      }
    },
  });
  return ends;
}

/** Re-emits the pieces line by line with the indentation and spacing rules above. */
function layout(text: string, tokens: Token[], comments: Comment[], semicolons: Set<number>): string {
  const pieces: Piece[] = [
    ...tokens
      .filter((t) => t.kind !== "eof")
      .map((t) => ({ start: t.start, end: t.end, text: text.slice(t.start, t.end), token: t })),
    ...comments.map((c) => ({ start: c.start, end: c.end, text: c.text, token: null })),
  ].sort((a, b) => a.start - b.start);

  const lineOf = lineNumbers(text);
  const out: string[] = [];
  /** Open braces, innermost last; true for a switch's brace. */
  const braces: boolean[] = [];
  let parens = 0;
  /** Header parens still open: the paren depth at which each header's `(` opened, and its keyword. */
  const headers: { depth: number; keyword: string }[] = [];
  let pendingSwitch = false;
  /** Extra indentation carried to the next line by a brace-less body. */
  let carry = 0;
  /** Open `?` waiting for their `:` on this line (other colons end a case label). */
  let ternaries = 0;
  let lastLine = -1;

  for (let i = 0; i < pieces.length; ) {
    const line = lineOf(pieces[i]?.start ?? 0);
    const group: Piece[] = [];
    while (i < pieces.length && lineOf((pieces[i] as Piece).start) === line) group.push(pieces[i++] as Piece);
    if (lastLine >= 0 && line - lastLine > 1 && out.length > 0) out.push("");
    // A block comment spanning lines owns them: the next group starts after it.
    lastLine = lineOf(Math.max((group.at(-1) as Piece).start, (group.at(-1) as Piece).end - 1));

    const first = group[0] as Piece;
    const firstTok = first.token;
    // Indentation from the structure open before this line.
    let depth = 0;
    const closing = firstTok?.kind === "punct" && firstTok.text === "}" ? 1 : 0;
    const open = braces.slice(0, braces.length - closing);
    const startsCase = firstTok?.kind === "keyword" && (firstTok.text === "case" || firstTok.text === "default");
    open.forEach((isSwitch, k) => {
      depth++;
      if (isSwitch && !(k === open.length - 1 && startsCase)) depth++;
    });
    if (parens > 0 && !(firstTok?.kind === "punct" && (firstTok.text === ")" || firstTok.text === "]"))) depth++;
    const startsBlock = firstTok?.kind === "punct" && firstTok.text === "{";
    const extra = startsBlock ? 0 : carry;
    depth += extra;

    let lineText = "";
    let prev: Piece | null = null;
    let endsWithHeader = false;
    /** True right after the `)` of an if/while/for/with/repeat header: a body on the same line may be aligned. */
    let afterHeader = false;
    for (const p of group) {
      const t = p.token;
      if (prev !== null) lineText += separator(text, prev, p, ternaries, afterHeader);
      afterHeader = false;
      lineText += p.text;
      if (t !== null) {
        endsWithHeader = false;
        if (t.kind === "keyword" && HEADER_KEYWORDS.has(t.text)) headers.push({ depth: parens, keyword: t.text });
        if (t.kind === "keyword" && t.text === "switch") pendingSwitch = true;
        if (t.kind === "keyword" && (t.text === "else" || t.text === "do")) endsWithHeader = true;
        if (t.kind === "punct") {
          if (t.text === "(" || t.text === "[") parens++;
          else if (t.text === ")" || t.text === "]") {
            parens = Math.max(0, parens - 1);
            const h = headers.at(-1);
            if (t.text === ")" && h !== undefined && h.depth === parens) {
              headers.pop();
              endsWithHeader = BODY_HEADERS.has(h.keyword);
              afterHeader = endsWithHeader;
            }
          } else if (t.text === "{") {
            braces.push(pendingSwitch);
            pendingSwitch = false;
          } else if (t.text === "}") braces.pop();
          else if (t.text === "?") ternaries++;
          else if (t.text === ":" && ternaries > 0) ternaries--;
        }
        if (semicolons.has(t.end)) lineText += ";";
      }
      prev = p;
    }
    carry = endsWithHeader ? extra + 1 : 0;
    ternaries = 0;
    out.push(`${INDENT.repeat(depth)}${lineText}`.trimEnd());
  }
  while (out.length > 0 && out.at(-1) === "") out.pop();
  return out.length === 0 ? "" : `${out.join("\n")}\n`;
}

/** The text between two pieces on one line. */
function separator(text: string, a: Piece, b: Piece, ternaries: number, afterHeader: boolean): string {
  // A trailing line comment keeps the author's spacing (at least one space); comments get one space otherwise.
  if (b.token === null) {
    const gap = text.slice(a.end, b.start);
    return b.text.startsWith("//") && /^[ \t]+$/.test(gap) ? gap : " ";
  }
  if (a.token === null) return " ";
  const x = a.token;
  const y = b.token;
  // Column alignment is kept: before an assignment (`image_speed  = 0.2;` under `gravity      = 0.25;`) and
  // before a body that follows its header on the same line (`if (a)  x -= 2;`).
  if ((y.kind === "punct" && ASSIGN_OPS.has(y.text)) || afterHeader) {
    const gap = text.slice(a.end, b.start);
    return /^ +$/.test(gap) ? gap : " ";
  }
  if (y.kind === "punct") {
    if (NO_SPACE_BEFORE.has(y.text)) return "";
    if ((y.text === "++" || y.text === "--") && isValueEnd(x)) return "";
    if (
      (y.text === "(" || y.text === "[") &&
      (x.kind === "name" || (x.kind === "punct" && (x.text === ")" || x.text === "]")))
    )
      return "";
    if (y.text === ":" && ternaries === 0) return "";
  }
  if (x.kind === "punct") {
    if (NO_SPACE_AFTER.has(x.text)) return "";
    if ((x.text === "-" || x.text === "!") && isUnary(a, text)) return "";
  }
  return " ";
}

/** Does `t` end a value (so `-` after it is binary, and `++` after it is postfix)? */
function isValueEnd(t: Token): boolean {
  if (t.kind === "name" || t.kind === "int" || t.kind === "fixed" || t.kind === "string") return true;
  if (t.kind === "keyword") return VALUE_KEYWORDS.has(t.text);
  return t.kind === "punct" && (t.text === ")" || t.text === "]");
}

/**
 * Is the `-` or `!` piece `p` unary? `!` always is; `-` is unary unless a value ends right before it. The token
 * before is found through the piece's own token list position, recorded on the token by the lexer's order.
 */
function isUnary(p: Piece, text: string): boolean {
  if (p.token?.text === "!") return true;
  // Look back over spaces and comments for the previous non-space character's token class.
  let i = p.start - 1;
  while (i >= 0 && /\s/.test(text[i] as string)) i--;
  if (i < 0) return true;
  const c = text[i] as string;
  if (/[A-Za-z0-9_"]/.test(c)) {
    // A word: a value unless it is an operator keyword or a statement keyword.
    let j = i;
    while (j >= 0 && /[A-Za-z0-9_]/.test(text[j] as string)) j--;
    const word = text.slice(j + 1, i + 1);
    return ["div", "mod", "return", "case", "until", "if", "while", "repeat", "with", "switch"].includes(word);
  }
  return !(c === ")" || c === "]");
}

/** A function mapping offsets to 0-based line numbers. */
function lineNumbers(text: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] as number) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
}
