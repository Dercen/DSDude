/**
 * The DSS lexer (contracts/language.md section 2). Hand-written, single pass, never throws: every problem is
 * reported through the Reporter and the lexer carries on with the most useful token it can make, so the parser
 * sees one mistake as one diagnostic.
 *
 * Recovery choices:
 * - GameMaker operators DSS lacks (`&`, `|`, `^`, `~`, `<<`, `>>`, `??`, `%=`, ...) are reported once (E122) and
 *   turned into the nearest DSS operator, so the rest of the line still parses.
 * - Single-quoted text is reported (E128) and read as a normal string.
 * - Unknown characters are reported (E110) and skipped like spaces.
 */
import type { Reporter } from "../diagnostics/report.ts";

/** What a token is. Keywords keep their own text in `text`; punctuation too. */
export type TokenKind = "name" | "keyword" | "int" | "fixed" | "string" | "punct" | "eof";

export interface Token {
  kind: TokenKind;
  /** Source text for names, keywords and numbers; the (possibly substituted) operator for punctuation. */
  text: string;
  /** Offset of the first character. */
  start: number;
  /** Offset just past the last character. */
  end: number;
  /** True when a line break (outside comments' own text) separates this token from the previous one. */
  nl: boolean;
  /**
   * For "int": the value as written, which may be 2147483648 (only valid right after a unary minus; the parser
   * checks). For "fixed": the Q20.12 raw value (value * 4096, rounded half away from zero).
   */
  num: number;
  /** For "string": the text with escapes decoded. */
  str: string;
}

/** A comment kept for the formatter (it re-emits comments where they were). */
export interface Comment {
  start: number;
  end: number;
  text: string;
  /** True for `/* ... *\/`, false for `// ...`. */
  block: boolean;
}

/** Everything the lexer produces for one file. */
export interface LexResult {
  tokens: Token[];
  comments: Comment[];
}

/** Every DSS keyword (contracts/language.md section 2). Keywords can never be used as names. */
export const KEYWORDS: ReadonlySet<string> = new Set([
  "var",
  "if",
  "else",
  "while",
  "for",
  "repeat",
  "do",
  "until",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "return",
  "exit",
  "with",
  "function",
  "true",
  "false",
  "undefined",
  "div",
  "mod",
  "global",
  "self",
  "other",
  "all",
  "noone",
]);

/** DSS operators and punctuation, longest first so the lexer always takes the longest match. */
const PUNCTUATION: readonly string[] = [
  "+=",
  "-=",
  "*=",
  "/=",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "++",
  "--",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "=",
  "<",
  ">",
  "?",
  ":",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  ";",
  ".",
];

/**
 * GameMaker operators that DSS 0.1 leaves out (language.md section 8), longest first. Each maps to the DSS
 * operator the lexer substitutes after reporting E122, plus the advice shown in the hint.
 */
const FOREIGN_OPERATORS: readonly { op: string; as: string; advice: string }[] = [
  { op: "<<=", as: "+=", advice: "DSS has no bit operators. Use * 2 to double a number." },
  { op: ">>=", as: "+=", advice: "DSS has no bit operators. Use div 2 to halve a whole number." },
  { op: "??=", as: "+=", advice: "Check the value with an if and == undefined instead." },
  { op: "%=", as: "+=", advice: "Write x = x mod n instead." },
  { op: "&=", as: "+=", advice: "DSS has no bit operators." },
  { op: "|=", as: "+=", advice: "DSS has no bit operators." },
  { op: "^=", as: "+=", advice: "DSS has no bit operators." },
  { op: "<<", as: "*", advice: "DSS has no bit operators. Use * 2 to double a number." },
  { op: ">>", as: "*", advice: "DSS has no bit operators. Use div 2 to halve a whole number." },
  { op: "??", as: "||", advice: "Check the value with an if and == undefined instead." },
  { op: "^^", as: "!=", advice: "For 'one or the other but not both', compare two bools with !=." },
  { op: "&", as: "&&", advice: "Write && for 'and'. DSS has no bit operators." },
  { op: "|", as: "||", advice: "Write || for 'or'. DSS has no bit operators." },
  { op: "^", as: "!=", advice: "DSS has no bit operators." },
  { op: "~", as: "!", advice: "Write ! for 'not'. DSS has no bit operators." },
];

/** Largest whole number a DSS int holds (int32). */
const INT32_MAX = 2147483647;
/** The one int literal allowed above INT32_MAX: 2147483648, legal only as `-2147483648`. */
const INT32_MIN_MAGNITUDE = 2147483648;
/** Q20.12 fixed point: 12 fraction bits, so one unit is 1/4096 (PLAN.md 2.8). */
export const FIXED_ONE = 4096;
/** Largest Q20.12 raw value: (524288 * 4096) - 1, i.e. just under 524,288. */
const FIXED_RAW_MAX = 2147483647;

/** Char codes the lexer switches on. */
const CH = {
  tab: 9,
  newline: 10,
  cr: 13,
  space: 32,
  quote: 34,
  apostrophe: 39,
  star: 42,
  dot: 46,
  slash: 47,
  zero: 48,
  nine: 57,
  backslash: 92,
  underscore: 95,
  x: 120,
  X: 88,
  n: 110,
} as const;

/** Printable ASCII range; characters outside it are reported by code point when unknown. */
const ASCII_PRINTABLE_FIRST = 33;
const ASCII_PRINTABLE_LAST = 126;

const isDigit = (c: number): boolean => c >= CH.zero && c <= CH.nine;
const isHexDigit = (c: number): boolean => isDigit(c) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
const isNameStart = (c: number): boolean => (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === CH.underscore;
const isNamePart = (c: number): boolean => isNameStart(c) || isDigit(c);

/**
 * Converts a decimal literal's digits into a Q20.12 raw value, exactly: value * 4096 rounded half away from
 * zero (language.md section 2). BigInt keeps the arithmetic exact for any number of fraction digits.
 * @param whole the digits before the point
 * @param fraction the digits after the point
 * @returns the raw value, or null when it does not fit Q20.12
 */
export function decimalToFixedRaw(whole: string, fraction: string): number | null {
  const scaled = BigInt(whole + fraction) * BigInt(FIXED_ONE);
  const divisor = 10n ** BigInt(fraction.length);
  let raw = scaled / divisor;
  // Literals are never negative (the minus is a separate operator), so "away from zero" means rounding up.
  if ((scaled % divisor) * 2n >= divisor) raw += 1n;
  return raw > BigInt(FIXED_RAW_MAX) ? null : Number(raw);
}

/** Lexes a whole file. Never throws; problems go to `reporter`. */
export function lex(text: string, reporter: Reporter): LexResult {
  const tokens: Token[] = [];
  const comments: Comment[] = [];
  let pos = 0;
  /** Set when a newline was crossed since the last token. */
  let nl = false;

  /** Appends a token that starts at `start` and ends at the current position. */
  const push = (kind: TokenKind, start: number, fields: Partial<Pick<Token, "text" | "num" | "str">> = {}): void => {
    tokens.push({
      kind,
      text: fields.text ?? text.slice(start, pos),
      start,
      end: pos,
      nl,
      num: fields.num ?? 0,
      str: fields.str ?? "",
    });
    nl = false;
  };

  while (pos < text.length) {
    const c = text.charCodeAt(pos);
    const start = pos;

    // Whitespace and line breaks.
    if (c === CH.newline) {
      nl = true;
      pos++;
      continue;
    }
    if (c === CH.space || c === CH.tab || c === CH.cr) {
      pos++;
      continue;
    }

    // Comments.
    if (c === CH.slash && text.charCodeAt(pos + 1) === CH.slash) {
      while (pos < text.length && text.charCodeAt(pos) !== CH.newline) pos++;
      comments.push({ start, end: pos, text: text.slice(start, pos), block: false });
      continue;
    }
    if (c === CH.slash && text.charCodeAt(pos + 1) === CH.star) {
      const close = text.indexOf("*/", pos + 2);
      pos = close < 0 ? text.length : close + 2;
      if (close < 0) reporter.report("E111", {}, start, start + 2);
      const body = text.slice(start, pos);
      if (body.includes("\n")) nl = true;
      comments.push({ start, end: pos, text: body, block: true });
      continue;
    }

    // Names and keywords.
    if (isNameStart(c)) {
      while (pos < text.length && isNamePart(text.charCodeAt(pos))) pos++;
      const word = text.slice(start, pos);
      push(KEYWORDS.has(word) ? "keyword" : "name", start);
      continue;
    }

    // Numbers.
    if (isDigit(c) || (c === CH.dot && isDigit(text.charCodeAt(pos + 1)))) {
      lexNumber(start);
      continue;
    }

    // Strings (double-quoted; single-quoted ones are reported and read the same way).
    if (c === CH.quote || c === CH.apostrophe) {
      lexString(start, c);
      continue;
    }

    // Operators and punctuation. A GameMaker operator DSS leaves out wins only when it is longer than the DSS
    // match at the same place (so "&&" stays "&&" but "&" alone, "<<" and "%=" are foreign).
    const punct = PUNCTUATION.find((p) => text.startsWith(p, pos));
    const foreign = FOREIGN_OPERATORS.find((f) => text.startsWith(f.op, pos));
    if (foreign !== undefined && foreign.op.length > (punct?.length ?? 0)) {
      // Report, then substitute the nearest DSS operator so the rest of the line still parses.
      pos += foreign.op.length;
      reporter.report("E122", { op: foreign.op, advice: foreign.advice }, start, pos);
      push("punct", start, { text: foreign.as });
      continue;
    }
    if (punct !== undefined) {
      pos += punct.length;
      push("punct", start);
      continue;
    }

    // Anything else is an unknown character: report it and skip it like a space.
    const cp = text.codePointAt(pos) as number;
    pos += cp > 0xffff ? 2 : 1;
    const shown =
      cp >= ASCII_PRINTABLE_FIRST && cp <= ASCII_PRINTABLE_LAST
        ? text.slice(start, pos)
        : `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
    reporter.report("E110", { char: shown }, start, pos);
  }

  tokens.push({ kind: "eof", text: "", start: text.length, end: text.length, nl, num: 0, str: "" });
  return { tokens, comments };

  /** Lexes a hex, decimal or whole-number literal starting at `start`. */
  function lexNumber(start: number): void {
    // Hex: 0x2A. Must fit int32 like any whole number.
    if (
      text.charCodeAt(pos) === CH.zero &&
      (text.charCodeAt(pos + 1) === CH.x || text.charCodeAt(pos + 1) === CH.X) &&
      isHexDigit(text.charCodeAt(pos + 2))
    ) {
      pos += 2;
      while (pos < text.length && isHexDigit(text.charCodeAt(pos))) pos++;
      const value = Number.parseInt(text.slice(start + 2, pos), 16);
      if (value > INT32_MAX) reporter.report("E107", { text: text.slice(start, pos) }, start, pos);
      push("int", start, { num: value > INT32_MAX ? 0 : value });
      return;
    }
    while (pos < text.length && isDigit(text.charCodeAt(pos))) pos++;
    const whole = text.slice(start, pos);
    if (text.charCodeAt(pos) === CH.dot) {
      pos++;
      const fracStart = pos;
      while (pos < text.length && isDigit(text.charCodeAt(pos))) pos++;
      const fraction = text.slice(fracStart, pos);
      if (whole === "" || fraction === "") {
        // "1." or ".5": DSS wants a digit on both sides of the point.
        const fixed = `${whole === "" ? "0" : whole}.${fraction === "" ? "0" : fraction}`;
        reporter.report("E109", { text: text.slice(start, pos), fixed }, start, pos);
      }
      const raw = decimalToFixedRaw(whole === "" ? "0" : whole, fraction);
      if (raw === null) reporter.report("E108", { text: text.slice(start, pos) }, start, pos);
      push("fixed", start, { num: raw ?? 0 });
      return;
    }
    // Whole number. 2147483648 passes here; the parser accepts it only after a unary minus.
    const value = Number(whole);
    if (value > INT32_MIN_MAGNITUDE) reporter.report("E107", { text: whole }, start, pos);
    push("int", start, { num: value > INT32_MIN_MAGNITUDE ? 0 : value });
  }

  /** Lexes a string literal opened by `quote` at `start`. The line must close it. */
  function lexString(start: number, quote: number): void {
    if (quote === CH.apostrophe) reporter.report("E128", {}, start, start + 1);
    pos++;
    let value = "";
    let closed = false;
    while (pos < text.length) {
      const c = text.charCodeAt(pos);
      if (c === quote) {
        pos++;
        closed = true;
        break;
      }
      if (c === CH.newline || c === CH.cr) break;
      if (c === CH.backslash) {
        const next = text.charCodeAt(pos + 1);
        if (next === CH.n) value += "\n";
        else if (next === CH.quote) value += '"';
        else if (next === CH.backslash) value += "\\";
        else if (next === CH.apostrophe && quote === CH.apostrophe) value += "'";
        else if (Number.isNaN(next) || next === CH.newline || next === CH.cr) {
          pos++;
          continue;
        } else reporter.report("E106", { char: text[pos + 1] as string }, pos, pos + 2);
        pos += 2;
        continue;
      }
      value += text[pos];
      pos++;
    }
    if (!closed) reporter.report("E105", {}, start, pos);
    push("string", start, { str: value });
  }
}
